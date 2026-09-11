import { clamp, type Track } from './simulation/track';
import type { Controls, Race } from './simulation/race';

const STEP = 1 / 60;
type VehicleMotion = Pick<Race, 'position' | 'heading' | 'travelHeading' | 'driftAngle' | 'steerVisual' | 'speed' | 'elapsed' | 'distance'>;
export type VehiclePose = VehicleMotion & { roadHeading: number };
const scalarKeys = ['driftAngle', 'steerVisual', 'speed', 'elapsed', 'distance'] as const;
const angleKeys = ['heading', 'travelHeading'] as const;

/** The viewing direction spans several road samples to avoid polyline corner snaps. */
export function roadViewHeading(track: Track, distance: number) {
  const behind = track.sample(distance - 10); const ahead = track.sample(distance + 24);
  return Math.atan2(-(ahead.x - behind.x), -(ahead.z - behind.z));
}
export function capturePose(race: Race): VehiclePose {
  return { position: { ...race.position }, heading: race.heading, travelHeading: race.travelHeading,
    driftAngle: race.driftAngle, steerVisual: race.steerVisual, speed: race.speed, elapsed: race.elapsed,
    distance: race.distance, roadHeading: roadViewHeading(race.track, race.distance) };
}
function copy(target: VehiclePose, source: VehicleMotion) {
  Object.assign(target.position, source.position);
  for (const key of [...scalarKeys, ...angleKeys]) target[key] = source[key];
}

/** One shared, interpolated pose for the car, camera, and tyre effects. */
export class RaceTimeline {
  readonly pose: VehiclePose;
  private previous: VehiclePose;
  private current: VehiclePose;
  private accumulator = 0;

  constructor(private readonly race: Race) {
    this.pose = capturePose(race); this.previous = capturePose(race); this.current = capturePose(race);
  }
  reset() {
    this.accumulator = 0;
    const heading = roadViewHeading(this.race.track, this.race.distance);
    for (const pose of [this.previous, this.current, this.pose]) { copy(pose, this.race); pose.roadHeading = heading; }
  }
  advance(dt: number, controls: Controls) {
    // Preserve the exact displayed pose and fractional tick while paused.
    if (this.race.phase !== 'racing' && this.race.phase !== 'countdown') return;
    this.accumulator += clamp(dt, 0, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      copy(this.previous, this.current);
      this.previous.roadHeading = this.current.roadHeading;
      this.race.update(STEP, controls);
      copy(this.current, this.race);
      // Camera yaw is presentation-only. Its fixed-step damping never changes
      // the player's heading or movement and stays identical across paint rates.
      const desired = roadViewHeading(this.race.track, this.race.distance);
      const error = Math.atan2(Math.sin(desired - this.current.roadHeading), Math.cos(desired - this.current.roadHeading));
      this.current.roadHeading += clamp(error * (1 - Math.exp(-STEP * 7)), -STEP * 1.4, STEP * 1.4);
      this.accumulator = Math.max(0, this.accumulator - STEP);
      if ((this.race.phase as string) === 'finished') {
        const roadHeading = this.current.roadHeading;
        this.reset();
        for (const pose of [this.previous, this.current, this.pose]) pose.roadHeading = roadHeading;
        return;
      }
    }
    const alpha = this.accumulator / STEP;
    for (const axis of ['x', 'y', 'z'] as const) {
      this.pose.position[axis] = this.previous.position[axis] + (this.current.position[axis] - this.previous.position[axis]) * alpha;
    }
    for (const key of scalarKeys) this.pose[key] = this.previous[key] + (this.current[key] - this.previous[key]) * alpha;
    for (const key of [...angleKeys, 'roadHeading'] as const) {
      const difference = this.current[key] - this.previous[key];
      this.pose[key] = this.previous[key] + Math.atan2(Math.sin(difference), Math.cos(difference)) * alpha;
    }
  }
}

/** Preserve the paint deadline remainder instead of drifting down to 48/45 fps. */
export class PaintClock {
  private next = 0;
  private interval = 0;
  ready(now: number, interval: number, force = false) {
    if (force || this.interval !== interval) {
      this.interval = interval; this.next = now + interval; return true;
    }
    if (now + 1e-6 < this.next) return false;
    this.next += (Math.floor((now - this.next + 1e-6) / interval) + 1) * interval;
    return true;
  }
}
