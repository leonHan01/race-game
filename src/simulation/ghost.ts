import type { Race } from './race';
import type { Track, TrackPoint } from './track';
import { longboardPoseKeys, type LongboardPose } from './longboard-motion';
import { MAX_GHOSTS } from '../content/ghosts';

const SAMPLE_INTERVAL = 1 / 20;
export const MAX_GHOST_FRAMES = 12000;
const scalarKeys = ['time', 'speed', 'steering', 'driftAngle', 'pitch', 'airHeight', 'distance'] as const;

export interface GhostFrame {
  time: number; position: TrackPoint; yaw: number; speed: number; steering: number;
  driftAngle: number; pitch: number; airHeight: number; distance: number;
  airborne: boolean; braking: boolean; handbrake: boolean; cut: boolean;
  /** Version 1 trajectories predate boost recording. */
  boosting?: boolean;
  longboardPose?: LongboardPose;
}
export interface GhostRun {
  version: 1 | 2; id?: string; track: string; vehicleId: string;
  totalTime: number; duration: number; frames: GhostFrame[];
}

/** A changed layout must never replay a trajectory from the old road. */
export function ghostTrackSignature(track: Track) {
  return JSON.stringify([track.definition.id, track.length, track.roadWidth, track.closed,
    track.definition.points, track.definition.jumps ?? []]);
}

function capture(race: Race, braking: boolean, cut: boolean): GhostFrame {
  const stun = race.mode === 'items' ? race.items.player.stun : 0;
  return { time: race.elapsed, position: { ...race.position },
    yaw: race.heading + race.driftAngle + (race.isLongboard ? race.longboardPose.stanceYaw : 0)
      + (stun > 0 ? Math.sin(stun / 1.15 * Math.PI) * 0.6 : 0),
    speed: race.speed, steering: race.steerVisual, driftAngle: race.driftAngle,
    pitch: race.pitch, airHeight: race.airHeight, distance: race.distance,
    airborne: race.airborne, braking, handbrake: race.handbrake, cut, boosting: race.boosting,
    ...(race.isLongboard ? { longboardPose: { ...race.longboardPose } } : {}) };
}

/** Fixed-step recording and time-based playback, independent of opponents and WebGL. */
export class RaceGhost {
  replays: GhostRun[] = [];
  loading = false;
  private frames: GhostFrame[] = [];
  private interval = SAMPLE_INTERVAL;
  private valid = true;
  private poses: GhostFrame[] = [];
  private runId?: string;

  reset(race: Race) {
    this.replays = []; this.loading = false; this.poses = []; this.runId = undefined;
    this.frames = [capture(race, false, false)];
    this.interval = SAMPLE_INTERVAL; this.valid = true;
  }

  record(race: Race, braking = false, force = false, cut = false) {
    if (!this.valid) return;
    const last = this.frames.at(-1);
    if (!force && race.phase !== 'finished' && last && Boolean(last.boosting) === race.boosting
      && race.elapsed - last.time < this.interval - 1e-8) return;
    const frame = capture(race, braking, cut);
    if (last && last.time === frame.time && !cut) {
      frame.cut = last.cut; this.frames[this.frames.length - 1] = frame;
    } else this.frames.push(frame);
    // Long endurance runs retain their entire route at a lower sample rate.
    // Preserve both sides of rescue teleports so they never become swept motion.
    if (this.frames.length >= MAX_GHOST_FRAMES) {
      this.frames = this.frames.filter((frame, i, frames) => i % 2 === 0 || i === frames.length - 1 || frame.cut || frames[i + 1]?.cut
        || frame.boosting !== frames[i - 1]?.boosting || frame.boosting !== frames[i + 1]?.boosting);
      this.interval *= 2;
      if (this.frames.length >= MAX_GHOST_FRAMES) { this.valid = false; this.frames = []; }
    }
  }

  finish(race: Race): GhostRun | null {
    if (!this.valid || race.phase !== 'finished' || race.elapsed <= 0 || this.frames.length < 2) return null;
    this.runId ??= globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return { version: 2, id: this.runId, track: ghostTrackSignature(race.track), vehicleId: race.vehicleId,
      totalTime: race.totalTime, duration: race.elapsed, frames: this.frames.slice() };
  }

  setReplays(runs: readonly GhostRun[]) {
    this.replays = rankGhosts(runs); this.loading = false;
    this.poses = this.replays.map(run => {
      const first = run.frames[0];
      return { ...first, position: { ...first.position },
        ...(first.longboardPose ? { longboardPose: { ...first.longboardPose } } : {}) };
    });
  }

  /** Reuses one output pose; binary search also supports restart and delayed loads. */
  sample(time: number, index = 0): GhostFrame | null {
    const run = this.replays[index]; const pose = this.poses[index];
    if (!run || !pose || !Number.isFinite(time) || time < 0 || time > run.duration) return null;
    let low = 0; let high = run.frames.length;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (run.frames[mid].time <= time) low = mid; else high = mid;
    }
    const a = run.frames[low]; const b = run.frames[Math.min(high, run.frames.length - 1)];
    const alpha = b.time > a.time && !b.cut ? (time - a.time) / (b.time - a.time) : 0;
    for (const axis of ['x', 'y', 'z'] as const) pose.position[axis] = a.position[axis] + (b.position[axis] - a.position[axis]) * alpha;
    for (const key of scalarKeys) pose[key] = a[key] + (b[key] - a[key]) * alpha;
    const angle = b.yaw - a.yaw;
    pose.yaw = a.yaw + Math.atan2(Math.sin(angle), Math.cos(angle)) * alpha;
    pose.airborne = a.airborne || (alpha > 0 && b.airborne);
    pose.braking = a.braking; pose.handbrake = a.handbrake; pose.cut = a.cut;
    pose.boosting = a.boosting ?? false;
    if (pose.longboardPose && a.longboardPose && b.longboardPose) {
      for (const key of longboardPoseKeys) pose.longboardPose[key] = a.longboardPose[key] + (b.longboardPose[key] - a.longboardPose[key]) * alpha;
    }
    return pose;
  }
}

/** Browser records are optional and untrusted; reject partial or stale trajectories. */
export function validGhostRun(value: unknown): value is GhostRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<GhostRun>;
  if ((run.version !== 1 && run.version !== 2) || typeof run.track !== 'string' || typeof run.vehicleId !== 'string'
    || ((run.version === 2 || run.id !== undefined) && (typeof run.id !== 'string' || !run.id || run.id.length > 128))
    || !Number.isFinite(run.totalTime) || run.totalTime! <= 0
    || !Number.isFinite(run.duration) || run.duration! <= 0 || run.duration! > run.totalTime!
    || !Array.isArray(run.frames) || run.frames.length < 2 || run.frames.length > MAX_GHOST_FRAMES) return false;
  let previousTime = -1;
  for (const frame of run.frames) {
    if (!frame || !frame.position || !scalarKeys.every(key => Number.isFinite(frame[key])) || !Number.isFinite(frame.yaw)
      || !['x', 'y', 'z'].every(axis => Number.isFinite(frame.position[axis as keyof TrackPoint]))
      || !['airborne', 'braking', 'handbrake', 'cut'].every(key => typeof frame[key as keyof GhostFrame] === 'boolean')
      || ((run.version === 2 || frame.boosting !== undefined) && typeof frame.boosting !== 'boolean')
      || frame.time < previousTime || frame.time < 0 || frame.time > run.duration!) return false;
    if (run.frames[0].longboardPose && (!frame.longboardPose || !longboardPoseKeys.every(key => Number.isFinite(frame.longboardPose![key])))) return false;
    previousTime = frame.time;
  }
  return run.frames[0].time === 0 && run.frames.at(-1)!.time === run.duration;
}

export function validGhost(value: unknown, race: Pick<Race, 'track' | 'vehicleId' | 'isLongboard'>, time?: number): value is GhostRun {
  return validGhostRun(value) && value.track === ghostTrackSignature(race.track) && value.vehicleId === race.vehicleId
    && (time === undefined || value.totalTime === time) && (!race.isLongboard || Boolean(value.frames[0].longboardPose))
    && Math.abs(value.frames.at(-1)!.distance - race.track.length) < 0.01;
}

export const ghostRunId = (run: GhostRun) => run.id ?? `legacy:${run.totalTime}:${run.duration}`;

/** Different races with tied scores remain separate; saving the same finish is idempotent. */
export function rankGhosts(runs: readonly GhostRun[]): GhostRun[] {
  const unique = new Map(runs.map(run => [ghostRunId(run), run]));
  return [...unique.values()].sort((a, b) => a.totalTime - b.totalTime || a.duration - b.duration
    || ghostRunId(a).localeCompare(ghostRunId(b))).slice(0, MAX_GHOSTS);
}
