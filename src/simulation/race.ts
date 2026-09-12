import { clamp, SECTORS, Track, type TrackPoint } from './track';
import { getVehicle, type VehicleDefinition } from '../content/vehicles';
import { Opponents } from './opponents';

export const MAX_SPEED_KMH = 250;
const NITRO_CAPACITY = 100;
const NITRO_DRAIN_PER_SECOND = 25;
const NITRO_CHARGE_PER_SECOND = 45;
const NITRO_ACCELERATION = 24;

const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export type Phase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type Difficulty = 'club' | 'pro';
export interface Controls { throttle: boolean; brake: boolean; steering: number; drift: boolean; nitro: boolean }
export const idleControls = (): Controls => ({ throttle: false, brake: false, steering: 0, drift: false, nitro: false });
export interface Split { time: number; total: number; delta: number }

export class Race {
  phase: Phase = 'menu';
  previousPhase: 'racing' | 'countdown' = 'racing';
  distance = 0;
  lane = 0;
  position: TrackPoint = { x: 0, y: 0, z: 0 };
  heading = 0;
  travelHeading = 0;
  speed = 0;
  elapsed = 0;
  countdown = 3.6;
  handbrake = false;
  handbrakeHeldTime = 0;
  drifting = false;
  driftAngle = 0;
  nitro = 0;
  boosting = false;
  private driftDirection = 0;
  private driftEntrySpeed = 0;
  private releaseGripRate = 4.8;
  steerVisual = 0;
  lateralVelocity = 0;
  integrity = 100;
  splits: Split[] = [];
  peakSpeed = 0;
  driftTime = 0;
  penalty = 0;
  difficulty: Difficulty = 'club';
  autoThrottle = false;
  readonly targetTime: number;
  readonly opponents: Opponents;

  constructor(readonly track: Track, readonly vehicle: VehicleDefinition = getVehicle('falcon')) {
    this.targetTime = track.length / track.definition.goldSpeed; this.opponents = new Opponents(track); this.reset();
  }
  get standings() { return this.opponents.standings(this); }
  get rank() { return this.standings.findIndex(row => row.player) + 1; }
  get stageId() { return this.track.definition.id; }
  get vehicleId() { return this.vehicle.id; }
  get gearSpeed() { return this.vehicle.topSpeed / 6; }
  get progress() { return clamp(this.distance / this.track.length, 0, 1); }
  get totalTime() { return this.elapsed + this.penalty; }
  get gear() { return this.speed < 0.5 ? 0 : Math.min(6, 1 + Math.floor(this.speed * 3.6 / this.gearSpeed)); }
  get engineRevs() { return this.gear === 0 ? 0 : clamp((this.speed * 3.6 - (this.gear - 1) * this.gearSpeed) / this.gearSpeed, 0, 1); }
  get sector() { return Math.min(SECTORS, this.splits.length + 1); }
  get nextCheckpointDistance() { return this.sector / SECTORS * this.track.length; }
  get missedCheckpoint() { return this.splits.length < SECTORS && this.distance > this.nextCheckpointDistance + 10; }
  get wrongWay() { return this.speed > 2 && Math.cos(this.travelHeading - this.track.sample(this.distance).heading) < -0.2; }
  get medal() { return this.totalTime <= this.targetTime ? 'gold' : this.totalTime <= this.targetTime * 1.15 ? 'silver' : 'bronze'; }
  get nextNote() { return this.track.notes.find(note => note.distance > this.distance - 15); }
  get driftIntensity() { return clamp(Math.abs(this.driftAngle) / 0.65, 0, 1) * clamp(this.speed / 12, 0, 1); }
  get rearWheelSlip() { return Math.max(this.driftIntensity, this.handbrake ? clamp(this.speed / 30, 0, 0.65) : 0); }
  get nitroCharging() { return this.phase === 'racing' && this.drifting && this.speed > 6 && this.driftIntensity > 0.08 && this.nitro < NITRO_CAPACITY; }

  /** Explicit placement for the starting grid and player-requested rescue only. */
  placeOnTrack(distance: number, lane = 0, heading = this.track.sample(distance).heading) {
    this.distance = distance; this.lane = lane;
    this.position = this.track.position(distance, lane);
    this.position.y = this.track.surfaceHeight(this.position.x, this.position.z);
    this.heading = heading; this.travelHeading = heading; this.lateralVelocity = 0;
  }

  reset() {
    this.distance = 0; this.lane = 0; this.speed = 0; this.elapsed = 0;
    this.countdown = 3.6; this.drifting = false; this.driftAngle = 0; this.steerVisual = 0;
    this.handbrake = false; this.handbrakeHeldTime = 0;
    this.nitro = 0; this.boosting = false;
    this.driftDirection = 0; this.driftEntrySpeed = 0; this.releaseGripRate = 4.8;
    this.lateralVelocity = 0; this.integrity = 100;
    this.splits = []; this.peakSpeed = 0; this.driftTime = 0; this.penalty = 0;
    this.placeOnTrack(0);
    this.opponents.reset();
  }
  start() { this.reset(); this.phase = 'countdown'; }
  pause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.previousPhase = this.phase;
      this.phase = 'paused';
      this.drifting = false;
      this.boosting = false;
      this.handbrake = false; this.handbrakeHeldTime = 0; this.driftDirection = 0;
    }
  }
  resume() { if (this.phase === 'paused') this.phase = this.previousPhase; }
  recover() {
    if (this.phase !== 'racing') return;
    // If a gate was missed, rescue puts the car before that gate, never beyond it.
    this.placeOnTrack(clamp(Math.min(this.distance, this.nextCheckpointDistance - 8), 0, this.track.length));
    this.speed = Math.min(this.speed, 8);
    this.boosting = false;
    this.drifting = false; this.driftAngle = 0; this.steerVisual = 0;
    this.handbrake = false; this.handbrakeHeldTime = 0;
    this.driftDirection = 0; this.driftEntrySpeed = 0; this.releaseGripRate = 4.8;
    this.penalty += 5;
  }

  /** Fixed-step arcade rally handling. All state is independent of WebGL. */
  update(dt: number, controls: Controls) {
    if (dt <= 0) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 'racing';
      return;
    }
    if (this.phase !== 'racing') return;
    const startTime = this.elapsed;
    this.elapsed += dt;
    // Keyboard and touch inputs share a progressive steering rack. Centre it
    // promptly on release, and pass through neutral when the player countersteers.
    const requestedSteering = clamp(controls.steering, -1, 1);
    const steeringResponse = requestedSteering === 0 ? 14 : requestedSteering * this.steerVisual < 0 ? 11 : 8;
    this.steerVisual += (requestedSteering - this.steerVisual) * (1 - Math.exp(-dt * steeringResponse));
    if (requestedSteering === 0 && Math.abs(this.steerVisual) < 0.001) this.steerVisual = 0;
    this.handbrake = controls.drift;
    this.handbrakeHeldTime = this.handbrake ? this.handbrakeHeldTime + dt : 0;
    if (!this.handbrake) this.driftDirection = 0;
    else if (this.driftDirection === 0 && this.speed > 4) {
      // Initiate a slide from steering or existing momentum, then retain its direction
      // while the handbrake remains held, even when the steering keys are released.
      this.driftDirection = Math.abs(controls.steering) > 0.1 ? Math.sign(controls.steering)
        : Math.abs(this.driftAngle) > 0.04 ? -Math.sign(this.driftAngle) : 0;
      if (this.driftDirection !== 0) this.driftEntrySpeed = this.speed;
    }
    const maximumSpeed = Math.min(MAX_SPEED_KMH, this.vehicle.topSpeed) / 3.6 * (0.75 + this.integrity * 0.0025);
    // Use only the boost time the tank can fund, including a partial final tick.
    const boostTime = controls.nitro && !controls.brake && !this.handbrake ? Math.min(dt, this.nitro / NITRO_DRAIN_PER_SECOND) : 0;
    this.boosting = boostTime > 0;
    this.nitro = clamp(this.nitro - boostTime * NITRO_DRAIN_PER_SECOND, 0, NITRO_CAPACITY);
    const throttle = controls.throttle || this.autoThrottle || this.boosting;
    // A held handbrake always brakes, including against W or automatic throttle.
    const acceleration = controls.brake ? -this.vehicle.braking * Math.sqrt(this.track.definition.grip) : this.handbrake ? -18 : throttle ? this.vehicle.acceleration * (1 - this.speed / (this.vehicle.topSpeed / 3.6 * 1.0656)) : -5;
    this.speed = clamp(this.speed + acceleration * dt + NITRO_ACCELERATION * boostTime, 0, maximumSpeed);
    this.drifting = this.handbrake && this.driftDirection !== 0 && this.speed > 0.5;
    if (this.drifting) this.driftTime += dt;

    if (this.handbrake) {
      if (this.drifting) {
        const duration = clamp(this.handbrakeHeldTime / 1.5, 0, 1);
        const entryMomentum = clamp(this.driftEntrySpeed / 36, 0, 1);
        const countersteering = Math.max(0, -controls.steering * this.driftDirection);
        const amplitude = (0.22 + duration * 0.82) * entryMomentum * (1 - countersteering * 0.4) * this.vehicle.drift;
        const targetAngle = -this.driftDirection * amplitude;
        this.driftAngle += (targetAngle - this.driftAngle) * (1 - Math.exp(-dt * 6.8 * Math.min(1, this.speed / 8)));
        this.releaseGripRate = 4.8 - duration * 2;
      }
      // Once stopped, locked wheels retain their orientation; there is no parked spin.
    } else {
      const gripRate = this.speed < 4 ? 9 : this.releaseGripRate;
      this.driftAngle *= Math.exp(-dt * gripRate);
      if (Math.abs(this.driftAngle) < 0.001) this.driftAngle = 0;
    }
    // Steering into a moving slide earns charge; straight handbraking and parked
    // wheel lock do not. Braking and boosting cannot consume nitro together.
    if (this.nitroCharging) this.nitro = Math.min(NITRO_CAPACITY, this.nitro + NITRO_CHARGE_PER_SECOND * this.driftIntensity * dt);

    // Player steering changes a world-space heading. Road curvature never feeds steering.
    const turnRate = Math.min(this.speed / 8, 1) * 0.95 * this.vehicle.steering / (1 + this.speed * 0.026);
    this.heading = angleDifference(this.heading - this.steerVisual * turnRate * (this.handbrake ? 1.08 : 1) * dt, 0);
    const grip = (this.handbrake ? 1.6 : (this.difficulty === 'pro' ? 4 : 6.5) - this.driftIntensity * 1.8) * this.vehicle.grip * this.track.definition.grip;
    if (this.speed > 0) this.travelHeading += angleDifference(this.heading, this.travelHeading) * (1 - Math.exp(-dt * grip));
    const vx = -Math.sin(this.travelHeading) * this.speed;
    const vz = -Math.cos(this.travelHeading) * this.speed;
    const before = { ...this.position };
    const previousLane = this.lane;
    this.position.x += vx * dt; this.position.z += vz * dt;
    const clearance = Math.hypot(1.25 * this.vehicle.scale[0], 2.35 * this.vehicle.scale[2]);
    if (this.track.confine(this.position, clearance)) this.speed *= Math.exp(-dt * 18);
    const road = this.track.project(this.position.x, this.position.z);
    this.distance = road.distance; this.lane = road.lane;
    this.position.y = this.track.surfaceHeight(this.position.x, this.position.z, road);
    this.lateralVelocity = vx * road.rx + vz * road.rz;

    const speedRatio = Math.min(1, this.speed / 18);
    const shoulder = this.track.roadWidth / 2 - 0.95;
    if (Math.abs(this.lane) > shoulder) {
      // Rough ground slows the car but never snaps it back to the road or rotates it.
      // Multiplicative drag leaves enough low-speed traction to steer back manually.
      this.speed *= Math.exp(-dt * (Math.abs(this.lane) > this.track.shoulderEdge ? 1.1 : 0.45) * this.vehicle.offroadDrag);
      this.integrity = Math.max(0, this.integrity - dt * 0.8 * speedRatio / this.vehicle.durability);
    }
    if (Math.abs(this.lane) > this.track.roadWidth / 2 + 1.4 && Math.abs(previousLane) <= this.track.roadWidth / 2 + 1.4) {
      this.speed *= 0.8;
      this.integrity = Math.max(0, this.integrity - 1.5 * speedRatio / this.vehicle.durability);
    }

    this.peakSpeed = Math.max(this.peakSpeed, this.speed * 3.6);
    this.recordSplits(before, dt);
    // Stop the shared race clock at the player's interpolated finish crossing.
    this.opponents.update(this.elapsed - startTime, this, startTime);
  }

  private recordSplits(before: TrackPoint, dt: number) {
    // A split requires crossing its physical gate in the forward direction and on
    // the road. Merely projecting past a bend, driving backwards, or cutting across
    // the forest cannot award a checkpoint or finish the stage.
    while (this.splits.length < SECTORS) {
      const gate = this.track.sample(this.nextCheckpointDistance);
      const from = (before.x - gate.x) * gate.tx + (before.z - gate.z) * gate.tz;
      const to = (this.position.x - gate.x) * gate.tx + (this.position.z - gate.z) * gate.tz;
      if (from >= 0 || to < 0) break;
      const fraction = -from / (to - from);
      const x = before.x + (this.position.x - before.x) * fraction;
      const z = before.z + (this.position.z - before.z) * fraction;
      const lane = (x - gate.x) * gate.rx + (z - gate.z) * gate.rz;
      if (Math.abs(lane) > this.track.roadWidth / 2 + 1.4) break;
      const crossing = this.elapsed - dt + fraction * dt + this.penalty;
      const last = this.splits[this.splits.length - 1]?.total ?? 0;
      this.splits.push({ time: crossing - last, total: crossing, delta: crossing - this.targetTime * (this.splits.length + 1) / SECTORS });
      if (this.splits.length === SECTORS) {
        this.position.x = x; this.position.z = z; this.position.y = gate.y;
        this.distance = this.track.length; this.lane = lane;
      }
    }
    if (this.splits.length === SECTORS) {
      this.phase = 'finished'; this.drifting = false;
      this.boosting = false;
      this.handbrake = false; this.handbrakeHeldTime = 0; this.driftDirection = 0;
      this.elapsed = this.splits[SECTORS - 1].total - this.penalty;
    }
  }
}
