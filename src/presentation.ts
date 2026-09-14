import { clamp, type Track } from './simulation/track';
import type { Controls, Race } from './simulation/race';
import type { RivalPose } from './simulation/opponents';
import { longboardPoseKeys, type LongboardPose } from './simulation/longboard-motion';

const STEP = 1 / 60;
type VehicleMotion = Pick<Race, 'position' | 'heading' | 'travelHeading' | 'driftAngle' | 'steerVisual' | 'speed' | 'elapsed' | 'distance'>
  & { pitch: number; airHeight: number; airborne: boolean; longboardPose: LongboardPose };
export type VehiclePose = VehicleMotion & { roadHeading: number; cameraHeight: number; rivals: RivalPose[] };
const scalarKeys = ['driftAngle', 'steerVisual', 'speed', 'elapsed', 'distance', 'pitch', 'airHeight'] as const;
const angleKeys = ['heading', 'travelHeading'] as const;

/** The viewing direction spans several road samples to avoid polyline corner snaps. */
export function roadViewHeading(track: Track, distance: number) {
  const behind = track.sample(distance - 10); const ahead = track.sample(distance + 24);
  return Math.atan2(-(ahead.x - behind.x), -(ahead.z - behind.z));
}
export function capturePose(race: Race): VehiclePose {
  return { position: { ...race.position }, heading: race.heading, travelHeading: race.travelHeading,
    driftAngle: race.driftAngle, steerVisual: race.steerVisual, speed: race.speed, elapsed: race.elapsed,
    distance: race.distance, roadHeading: roadViewHeading(race.track, race.distance), cameraHeight: race.position.y,
    pitch: race.pitch, airHeight: race.airHeight, airborne: race.airborne, longboardPose: { ...race.longboardPose },
    rivals: race.opponents.cars.map(car => ({ position: { ...car.position }, heading: car.heading, speed: car.speed,
      steering: car.steering, pitch: car.pitch, airHeight: car.airHeight, airborne: car.airborne,
      driftAngle: car.driftAngle, drifting: car.drifting, boosting: car.boosting })) };
}
function copyRivals(target: RivalPose[], source: RivalPose[]) {
  source.forEach((car, i) => {
    Object.assign(target[i].position, car.position);
    for (const key of ['heading', 'speed', 'steering', 'pitch', 'airHeight', 'driftAngle'] as const) target[i][key] = car[key];
    for (const key of ['airborne', 'drifting', 'boosting'] as const) target[i][key] = car[key];
  });
}
function copy(target: VehiclePose, source: VehicleMotion) {
  Object.assign(target.position, source.position);
  for (const key of [...scalarKeys, ...angleKeys]) target[key] = source[key];
  target.airborne = source.airborne;
  Object.assign(target.longboardPose, source.longboardPose);
}

/** One shared, interpolated pose for the car, camera, and tyre effects. */
export class RaceTimeline {
  readonly pose: VehiclePose;
  private previous: VehiclePose;
  private current: VehiclePose;
  private accumulator = 0;
  private smoothHeight: number;
  private heightVelocity = 0;

  constructor(private readonly race: Race) {
    this.pose = capturePose(race); this.previous = capturePose(race); this.current = capturePose(race);
    this.smoothHeight = race.position.y;
  }
  reset() {
    this.accumulator = 0;
    this.smoothHeight = this.race.position.y; this.heightVelocity = 0;
    const heading = roadViewHeading(this.race.track, this.race.distance);
    for (const pose of [this.previous, this.current, this.pose]) {
      copy(pose, this.race); pose.roadHeading = heading; pose.cameraHeight = this.race.position.y; copyRivals(pose.rivals, this.race.opponents.cars);
    }
  }
  advance(dt: number, controls: Controls) {
    // Preserve the exact displayed pose and fractional tick while paused.
    if (this.race.phase !== 'racing' && this.race.phase !== 'countdown') return;
    this.accumulator += clamp(dt, 0, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      copy(this.previous, this.current);
      copyRivals(this.previous.rivals, this.current.rivals);
      this.previous.roadHeading = this.current.roadHeading;
      this.previous.cameraHeight = this.current.cameraHeight;
      this.race.update(STEP, controls);
      copy(this.current, this.race);
      copyRivals(this.current.rivals, this.race.opponents.cars);
      // Camera yaw is presentation-only. Its fixed-step damping never changes
      // the player's heading or movement and stays identical across paint rates.
      const desired = roadViewHeading(this.race.track, this.race.distance);
      const error = Math.atan2(Math.sin(desired - this.current.roadHeading), Math.cos(desired - this.current.roadHeading));
      this.current.roadHeading += clamp(error * (1 - Math.exp(-STEP * 7)), -STEP * 1.4, STEP * 1.4);
      if (this.race.track.hasJumps) {
        // A critically damped height anchor softens landing without adding a bounce.
        // Rise with the car so the low view cannot sink through the road or bonnet.
        const delta = this.smoothHeight - this.race.position.y;
        const spring = this.heightVelocity + 8 * delta;
        const decay = Math.exp(-8 * STEP);
        this.smoothHeight = this.race.position.y + (delta + spring * STEP) * decay;
        this.heightVelocity = (this.heightVelocity - 8 * spring * STEP) * decay;
        this.current.cameraHeight = Math.max(this.smoothHeight, this.race.position.y - 0.15);
      } else this.current.cameraHeight = this.race.position.y;
      this.accumulator = Math.max(0, this.accumulator - STEP);
      if ((this.race.phase as string) === 'finished') {
        const roadHeading = this.current.roadHeading;
        const cameraHeight = this.current.cameraHeight;
        this.reset();
        for (const pose of [this.previous, this.current, this.pose]) { pose.roadHeading = roadHeading; pose.cameraHeight = cameraHeight; }
        return;
      }
    }
    const alpha = this.accumulator / STEP;
    for (const axis of ['x', 'y', 'z'] as const) {
      this.pose.position[axis] = this.previous.position[axis] + (this.current.position[axis] - this.previous.position[axis]) * alpha;
    }
    for (const key of scalarKeys) this.pose[key] = this.previous[key] + (this.current[key] - this.previous[key]) * alpha;
    this.pose.cameraHeight = this.previous.cameraHeight + (this.current.cameraHeight - this.previous.cameraHeight) * alpha;
    this.pose.airborne = this.previous.airborne || this.current.airborne;
    for (const key of longboardPoseKeys) this.pose.longboardPose[key] = this.previous.longboardPose[key] + (this.current.longboardPose[key] - this.previous.longboardPose[key]) * alpha;
    for (const key of [...angleKeys, 'roadHeading'] as const) {
      const difference = this.current[key] - this.previous[key];
      this.pose[key] = this.previous[key] + Math.atan2(Math.sin(difference), Math.cos(difference)) * alpha;
    }
    this.pose.rivals.forEach((car, i) => {
      const before = this.previous.rivals[i]; const after = this.current.rivals[i];
      for (const axis of ['x', 'y', 'z'] as const) car.position[axis] = before.position[axis] + (after.position[axis] - before.position[axis]) * alpha;
      const angle = after.heading - before.heading;
      car.heading = before.heading + Math.atan2(Math.sin(angle), Math.cos(angle)) * alpha;
      car.speed = before.speed + (after.speed - before.speed) * alpha;
      car.steering = before.steering + (after.steering - before.steering) * alpha;
      car.pitch = before.pitch + (after.pitch - before.pitch) * alpha;
      car.airHeight = before.airHeight + (after.airHeight - before.airHeight) * alpha;
      car.driftAngle = before.driftAngle + (after.driftAngle - before.driftAngle) * alpha;
      car.drifting = after.drifting; car.boosting = after.boosting;
      car.airborne = before.airborne || after.airborne;
    });
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
