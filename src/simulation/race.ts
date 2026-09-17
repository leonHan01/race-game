import { clamp, SECTORS, Track, type TrackPoint } from './track';
import { getVehicle, roadMargin, vehicleClearance, type VehicleDefinition } from '../content/vehicles';
import { Opponents } from './opponents';
import { difficultyProfile, type Difficulty } from '../content/difficulties';
import type { RaceMode } from '../content/modes';
import { longboardAcceleration } from './longboard';
import { LongboardMotion } from './longboard-motion';
import { VerticalMotion } from './vertical-motion';
import { moveWithinTrack } from './track-collision';
import { resolveVehicleCollisions, type CollisionResult } from './vehicle-collision';
import { RaceGhost } from './ghost';
import { NITRO_CAPACITY, NITRO_DRAIN_PER_SECOND, NITRO_CHARGE_PER_SECOND, NITRO_ACCELERATION, NITRO_SPEED_BONUS_KMH } from './nitro';

export const MAX_SPEED_KMH = 250;
export const MAX_REVERSE_SPEED_KMH = 30;
export { NITRO_SPEED_BONUS_KMH } from './nitro';
const HANDBRAKE_DECELERATION_SCALE = 0.4;
const COLLISION_SPEED_LOSS_SCALE = 0.4;

const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export type Phase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type { Difficulty } from '../content/difficulties';
export interface Controls { throttle: boolean; brake: boolean; steering: number; drift: boolean; nitro: boolean; standupSlide?: boolean }
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
  /** Signed metres per second along travelHeading; negative means reversing. */
  speed = 0;
  spectating = false;
  spectatorTarget = -1;
  elapsed = 0;
  countdown = 3.6;
  handbrake = false;
  handbrakeHeldTime = 0;
  drifting = false;
  driftAngle = 0;
  nitro = 0;
  boosting = false;
  tucking = false;
  pushing = false;
  footbraking = false;
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
  difficulty: Difficulty = 'medium';
  autoThrottle = false;
  mode: RaceMode = 'classic';
  readonly targetTime: number;
  readonly opponents: Opponents;
  readonly vertical = new VerticalMotion();
  readonly longboard = new LongboardMotion();
  readonly ghost = new RaceGhost();

  constructor(readonly track: Track, readonly vehicle: VehicleDefinition = getVehicle('falcon')) {
    if (vehicle.mode === 'longboard') this.mode = 'downhill';
    this.targetTime = track.length / track.definition.goldSpeed; this.opponents = new Opponents(track, vehicle.mode);
    this.reset();
  }
  get standings() { return this.opponents.standings(this); }
  get rank() { return this.standings.findIndex(row => row.player) + 1; }
  get stageId() { return this.track.definition.id; }
  get vehicleId() { return this.vehicle.id; }
  get vehicleMode() { return this.vehicle.mode; }
  get isLongboard() { return this.vehicle.mode === 'longboard'; }
  get longboardPose() { return this.longboard.pose; }
  get descent() { return Math.max(0, this.track.sample(0).y - this.position.y); }
  get gearSpeed() { return this.vehicle.topSpeed / 6; }
  get progress() { return clamp(this.distance / this.track.length, 0, 1); }
  get totalTime() { return this.elapsed + this.penalty; }
  get gear() { return this.speed < -0.5 ? -1 : this.speed < 0.5 ? 0 : Math.min(6, 1 + Math.floor(this.speed * 3.6 / this.gearSpeed)); }
  get engineRevs() { return this.gear === -1 ? clamp(-this.speed * 3.6 / MAX_REVERSE_SPEED_KMH, 0, 1) : this.gear === 0 ? 0 : clamp((this.speed * 3.6 - (this.gear - 1) * this.gearSpeed) / this.gearSpeed, 0, 1); }
  get sector() { return Math.min(SECTORS, this.splits.length + 1); }
  get nextCheckpointDistance() { return this.sector / SECTORS * this.track.length; }
  get missedCheckpoint() { return this.splits.length < SECTORS && this.distance > this.nextCheckpointDistance + 10; }
  get wrongWay() { return Math.abs(this.speed) > 2 && Math.sign(this.speed) * Math.cos(this.travelHeading - this.track.sample(this.distance).heading) < -0.2; }
  get medal() { return this.totalTime <= this.targetTime ? 'gold' : this.totalTime <= this.targetTime * 1.15 ? 'silver' : 'bronze'; }
  get nextNote() { return this.track.notes.find(note => note.distance > this.distance - 15); }
  get nextJump() { return this.track.definition.jumps?.find(crest => crest.distance > this.distance - 12); }
  get airborne() { return this.vertical.airborne; }
  get airHeight() { return this.vertical.clearance; }
  get pitch() { return this.vertical.pitch; }
  get driftIntensity() { return clamp(Math.max(Math.abs(this.driftAngle) / 0.65, this.isLongboard ? this.longboard.pose.switchWeight : 0), 0, 1) * clamp(this.speed / 12, 0, 1); }
  get rearWheelSlip() { return this.airborne ? 0 : Math.max(this.driftIntensity, this.handbrake ? clamp(Math.abs(this.speed) / 30, 0, 0.65) : 0); }
  get nitroCharging() { return !this.airborne && !this.isLongboard && this.phase === 'racing' && this.drifting && this.speed > 6 && this.driftIntensity > 0.08 && this.nitro < NITRO_CAPACITY; }

  /** Explicit placement for the starting grid and player-requested rescue only. */
  placeOnTrack(distance: number, lane = 0, heading = this.track.sample(distance).heading) {
    this.distance = distance; this.lane = lane;
    this.position = this.track.position(distance, lane);
    this.position.y = this.track.surfaceHeight(this.position.x, this.position.z);
    this.heading = heading; this.travelHeading = heading; this.lateralVelocity = 0;
    this.vertical.reset(this.position.y, this.track.hasJumps ? Math.atan(this.track.grade(distance) * Math.cos(heading - this.track.sample(distance).heading)) : 0);
  }

  reset() {
    this.longboard.reset();
    this.distance = 0; this.lane = 0; this.speed = 0; this.elapsed = 0;
    this.countdown = 3.6; this.drifting = false; this.driftAngle = 0; this.steerVisual = 0;
    this.handbrake = false; this.handbrakeHeldTime = 0;
    this.nitro = 0; this.boosting = false; this.tucking = false; this.pushing = false; this.footbraking = false;
    this.driftDirection = 0; this.driftEntrySpeed = 0; this.releaseGripRate = 4.8;
    this.lateralVelocity = 0; this.integrity = 100;
    this.splits = []; this.peakSpeed = 0; this.driftTime = 0; this.penalty = 0;
    this.placeOnTrack(0);
    this.opponents.reset(this.difficulty);
    this.ghost.reset(this);
  }
  start() { this.reset(); this.phase = 'countdown'; }
  pause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.previousPhase = this.phase;
      this.phase = 'paused';
      this.drifting = false;
      this.boosting = false; this.tucking = false; this.pushing = false; this.footbraking = false;
      this.handbrake = false; this.handbrakeHeldTime = 0; this.driftDirection = 0;
    }
  }
  resume() { if (this.phase === 'paused') this.phase = this.previousPhase; }
  switchLongboardStance() {
    return this.isLongboard && this.phase === 'racing' && !this.airborne
      && this.longboard.requestSwitch(this.speed, this.steerVisual);
  }

  recover() {
    if (this.phase !== 'racing') return;
    this.ghost.record(this, false, true);
    this.longboard.reset(true);
    // If a gate was missed, rescue puts the car before that gate, never beyond it.
    this.placeOnTrack(clamp(Math.min(this.distance, this.nextCheckpointDistance - 8), 0, this.track.length));
    this.speed = clamp(this.speed, 0, 8);
    this.boosting = false; this.tucking = false; this.pushing = false; this.footbraking = false;
    this.drifting = false; this.driftAngle = 0; this.steerVisual = 0;
    this.handbrake = false; this.handbrakeHeldTime = 0;
    this.driftDirection = 0; this.driftEntrySpeed = 0; this.releaseGripRate = 4.8;
    this.penalty += 5;
    this.ghost.record(this, false, true, true);
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
    if (this.spectating) {
      if (this.ghost.loading) return;
      this.opponents.update(dt, this, this.elapsed);
      this.elapsed += dt;
      if (this.opponents.cars.every(car => car.finishTime !== null)
        && this.ghost.replays.every(run => this.elapsed >= run.duration)) this.phase = 'finished';
      return;
    }
    const startTime = this.elapsed;
    this.elapsed += dt;
    // Keyboard and touch inputs share a progressive steering rack. Centre it
    // promptly on release, and pass through neutral when the player countersteers.
    const requestedSteering = clamp(controls.steering, -1, 1);
    const steeringResponse = requestedSteering === 0 ? 14 : requestedSteering * this.steerVisual < 0 ? 11 : 8;
    this.steerVisual += (requestedSteering - this.steerVisual) * (1 - Math.exp(-dt * steeringResponse));
    if (requestedSteering === 0 && Math.abs(this.steerVisual) < 0.001) this.steerVisual = 0;
    if (this.isLongboard) this.longboard.update(dt, {
      speed: this.speed, steering: controls.steering,
      slide: controls.drift || Boolean(controls.standupSlide), standup: Boolean(controls.standupSlide) && !controls.drift,
      brake: controls.brake, tuck: controls.nitro,
      push: (controls.throttle || this.autoThrottle) && !controls.nitro && this.speed < 9,
    });
    this.handbrake = controls.drift || (this.isLongboard && (Boolean(controls.standupSlide) || this.longboard.switching));
    this.handbrakeHeldTime = this.handbrake ? this.handbrakeHeldTime + dt : 0;
    if (!this.handbrake) this.driftDirection = 0;
    else if (!this.isLongboard && this.driftDirection === 0 && this.speed > 4) {
      // Initiate a slide from steering or existing momentum, then retain its direction
      // while the handbrake remains held, even when the steering keys are released.
      this.driftDirection = Math.abs(controls.steering) > 0.1 ? Math.sign(controls.steering)
        : Math.abs(this.driftAngle) > 0.04 ? -Math.sign(this.driftAngle) : 0;
      if (this.driftDirection !== 0) this.driftEntrySpeed = this.speed;
    }
    const condition = 0.75 + this.integrity * 0.0025;
    const speedCap = this.isLongboard ? this.vehicle.topSpeed : Math.min(MAX_SPEED_KMH, this.vehicle.topSpeed);
    const maximumSpeed = speedCap / 3.6 * condition;
    // Use only the boost time the tank can fund, including a partial final tick.
    const boostTime = !this.airborne && !this.isLongboard && this.speed >= 0 && controls.nitro && !controls.brake && !this.handbrake ? Math.min(dt, this.nitro / NITRO_DRAIN_PER_SECOND) : 0;
    this.boosting = boostTime > 0;
    this.nitro = clamp(this.nitro - boostTime * NITRO_DRAIN_PER_SECOND, 0, NITRO_CAPACITY);
    // Nitro temporarily raises the engine limit. After release, shed excess speed
    // progressively; an airborne car keeps its existing drag-only momentum.
    const speedLimit = boostTime > 0 ? maximumSpeed + NITRO_SPEED_BONUS_KMH / 3.6 * condition
      : this.isLongboard ? maximumSpeed : Math.max(maximumSpeed, this.speed - (this.airborne ? 0 : 12 * dt));
    const throttle = controls.throttle || this.autoThrottle || this.boosting;
    // A held handbrake always brakes, including against W or automatic throttle.
    this.footbraking = this.isLongboard && controls.brake;
    this.tucking = this.isLongboard && controls.nitro && !controls.brake && !this.handbrake;
    this.pushing = this.isLongboard && throttle && !this.tucking && !controls.brake && !this.handbrake && this.speed < 9;
    const grade = this.isLongboard ? this.track.grade(this.distance) * Math.cos(this.travelHeading - this.track.sample(this.distance).heading) : 0;
    const reversing = !this.airborne && !this.isLongboard && controls.brake && !this.handbrake && this.speed <= 0;
    const stopping = controls.brake || this.handbrake || (this.speed < 0 && throttle);
    const braking = this.vehicle.braking * Math.sqrt(this.track.definition.grip);
    const acceleration = this.isLongboard
      ? longboardAcceleration(this.speed, grade, this.pushing, this.tucking, controls.brake, this.handbrake, this.longboard.brakingStrength, this.vehicle)
      : reversing ? -this.vehicle.acceleration * 0.45
      : stopping ? -Math.sign(this.speed) * (controls.brake ? braking : this.handbrake ? (this.vehicleMode === 'motorcycle' ? 15 : 18) * HANDBRAKE_DECELERATION_SCALE : braking)
      : throttle ? this.vehicle.acceleration * (1 - this.speed / (this.vehicle.topSpeed / 3.6 * 1.0656)) : -Math.sign(this.speed) * 5;
    const handbrakeScale = this.isLongboard && this.handbrake && !controls.brake ? HANDBRAKE_DECELERATION_SCALE : 1;
    // Tyre inputs resume on contact; airborne momentum only loses a little to drag.
    // Brakes and coasting stop at zero; changing drive direction takes the next tick.
    const minimumSpeed = this.isLongboard ? 0 : reversing ? -MAX_REVERSE_SPEED_KMH / 3.6 * condition : Math.min(0, this.speed);
    const maximumSpeedThisStep = this.speed < 0 ? 0 : speedLimit;
    this.speed = clamp(this.speed + (this.airborne ? -this.speed * 0.035 : acceleration * handbrakeScale) * dt
      + NITRO_ACCELERATION * boostTime, minimumSpeed, maximumSpeedThisStep);
    this.drifting = !this.airborne && this.handbrake && (this.isLongboard ? this.longboard.style !== 'none' || this.longboard.switching : this.driftDirection !== 0) && this.speed > 0.5;
    if (this.drifting) this.driftTime += dt;

    if (this.isLongboard) this.driftAngle = this.longboard.angle;
    else if (this.handbrake) {
      if (this.drifting) {
        const duration = clamp(this.handbrakeHeldTime / 1.5, 0, 1);
        const entryMomentum = clamp(this.driftEntrySpeed / (this.isLongboard ? 18 : 36), 0, 1);
        const countersteering = Math.max(0, -controls.steering * this.driftDirection);
        const amplitude = (0.22 + duration * 0.82) * entryMomentum * (1 - countersteering * 0.4) * this.vehicle.drift;
        const targetAngle = -this.driftDirection * amplitude;
        this.driftAngle += (targetAngle - this.driftAngle) * (1 - Math.exp(-dt * 6.8 * Math.min(1, this.speed / 8)));
        this.releaseGripRate = 4.8 - duration * 2;
      }
      // Once stopped, locked wheels retain their orientation; there is no parked spin.
    } else if (!this.airborne) {
      const gripRate = this.speed < 4 ? 9 : this.releaseGripRate;
      this.driftAngle *= Math.exp(-dt * gripRate);
      if (Math.abs(this.driftAngle) < 0.001) this.driftAngle = 0;
    }
    // Steering into a moving slide earns charge; straight handbraking and parked
    // wheel lock do not. Braking and boosting cannot consume nitro together.
    if (this.nitroCharging) this.nitro = Math.min(NITRO_CAPACITY, this.nitro + NITRO_CHARGE_PER_SECOND * this.driftIntensity * dt);

    // Player steering changes a world-space heading. Road curvature never feeds steering.
    const turnRate = Math.sign(this.speed) * Math.min(Math.abs(this.speed) / 8, 1) * 0.95 * this.vehicle.steering / (1 + Math.abs(this.speed) * 0.026);
    if (!this.airborne) this.heading = angleDifference(this.heading - this.steerVisual * turnRate * (this.isLongboard && this.longboard.switching ? 0.55 : this.handbrake ? 1.08 : 1) * dt, 0);
    const grip = (this.handbrake ? 1.6 : difficultyProfile(this.difficulty).grip - this.driftIntensity * 1.8) * this.vehicle.grip * this.track.definition.grip;
    if (!this.airborne && this.speed !== 0) this.travelHeading += angleDifference(this.heading, this.travelHeading) * (1 - Math.exp(-dt * grip));
    let vx = -Math.sin(this.travelHeading) * this.speed;
    let vz = -Math.cos(this.travelHeading) * this.speed;
    const before = { ...this.position };
    const previousDistance = this.distance;
    const collision = moveWithinTrack(this.track, this.position, vx, vz, dt, vehicleClearance(this.vehicle), previousDistance);
    const road = collision.road;
    if (collision.blocked) {
      const impactRatio = collision.impactSpeed / Math.max(Math.abs(this.speed), 0.001);
      const speedLoss = 1 - Math.exp(-dt * (2 + 16 * impactRatio));
      this.speed *= 1 - speedLoss * COLLISION_SPEED_LOSS_SCALE;
      this.integrity = Math.max(0, this.integrity - dt * (0.8 + collision.impactSpeed * 0.2) / this.vehicle.durability);
      vx = collision.vx; vz = collision.vz;
    }
    this.distance = road.distance; this.lane = road.lane;
    const groundHeight = this.track.surfaceHeight(this.position.x, this.position.z, road);
    if (this.track.hasJumps) {
      const previousFrame = this.track.sample(previousDistance);
      this.vertical.update(dt, { height: groundHeight, speed: this.speed,
        launchVelocity: this.track.grade(previousDistance, 1.3) * (vx * previousFrame.tx + vz * previousFrame.tz),
        groundVelocity: this.track.grade(this.distance, 1.3) * (vx * road.tx + vz * road.tz),
        pitch: Math.atan(this.track.grade(this.distance, 1.3) * Math.cos(this.heading + this.driftAngle - road.heading)) });
      this.position.y = this.vertical.height;
      if (this.airborne) { this.drifting = false; this.boosting = false; }
    } else this.position.y = groundHeight;
    this.lateralVelocity = vx * road.rx + vz * road.rz;

    const speedRatio = Math.min(1, Math.abs(this.speed) / 18);
    // The full road width is drivable. Blend rough-ground penalties in only
    // after leaving the road, rather than abruptly slowing a car near its edge.
    const offroadAmount = clamp((Math.abs(this.lane) - this.track.roadWidth / 2) / roadMargin(this.vehicle), 0, 1);
    if (!this.airborne && offroadAmount > 0) {
      this.speed *= Math.exp(-dt * (Math.abs(this.lane) > this.track.shoulderEdge ? 1.1 : 0.45) * this.vehicle.offroadDrag * offroadAmount);
      this.integrity = Math.max(0, this.integrity - dt * 0.8 * speedRatio * offroadAmount / this.vehicle.durability);
    }
    this.peakSpeed = Math.max(this.peakSpeed, Math.abs(this.speed) * 3.6);
    this.resolveTraffic(before, dt, startTime, collision.correctedStart);
    this.ghost.record(this, controls.brake);
  }

  private resolveTraffic(before: TrackPoint, dt: number, startTime: number, correctedStart: boolean) {
    const rivals = this.opponents.cars.filter(car => car.finishTime === null).map(car => {
      // AI route coordinates are authoritative, including explicit test/grid placement.
      const position = this.track.position(car.distance, car.lane);
      if (car.airborne) position.y = car.position.y;
      return { car, position, distance: car.distance, speed: car.speed };
    });
    this.opponents.update(dt, this, startTime, true);
    const reference = new Map<string, { distance: number; vehicle: VehicleDefinition }>([
      ['player', { distance: this.distance, vehicle: this.vehicle }],
      ...rivals.map(({ car }) => [car.id, { distance: car.distance, vehicle: car.vehicle }] as const),
    ]);
    const constrain = (body: CollisionResult) => {
      const context = reference.get(body.id)!;
      const road = this.track.project(body.position.x, body.position.z, context.distance);
      const dx = body.position.x - road.x; const dz = body.position.z - road.z;
      const offset = Math.hypot(dx, dz); const limit = Math.max(0, this.track.boundaryEdge - vehicleClearance(context.vehicle));
      if (offset > limit) {
        const nx = dx / offset; const nz = dz / offset;
        body.position.x = road.x + nx * limit; body.position.z = road.z + nz * limit;
        const outward = Math.max(0, body.vx * nx + body.vz * nz);
        body.vx -= nx * outward; body.vz -= nz * outward;
      }
      context.distance = road.distance;
    };
    const result = resolveVehicleCollisions([
      { id: 'player', vehicle: this.vehicle, heading: this.heading + this.driftAngle,
        before: correctedStart ? { ...this.position } : before, after: { ...this.position },
        canFinish: !correctedStart && this.splits.length === SECTORS - 1, endsRace: true },
      ...rivals.map(({ car, position }) => ({ id: car.id, vehicle: car.vehicle, heading: car.heading + car.driftAngle,
        before: position, after: { ...car.position }, canFinish: car.distance >= this.track.length - 10 })),
    ], dt, constrain, { frame: this.track.sample(this.track.length), halfWidth: this.track.roadWidth / 2 + 1.4 });
    this.elapsed = startTime + result.elapsed;
    for (const body of result.bodies) {
      if (body.id === 'player') {
        if (body.collided || result.elapsed < dt || body.finishTime !== null) {
          Object.assign(this.position, body.position);
          const road = this.track.project(this.position.x, this.position.z, this.distance);
          this.distance = road.distance; this.lane = road.lane;
          this.vertical.height = this.position.y;
          this.vertical.rebaseGround(this.track.surfaceHeight(this.position.x, this.position.z, road));
          this.position.y = this.vertical.height;
          if (body.collided) {
            const direction = !this.isLongboard && body.vx * -Math.sin(this.heading) + body.vz * -Math.cos(this.heading) < 0 ? -1 : 1;
            this.speed = Math.hypot(body.vx, body.vz) * direction;
            if (Math.abs(this.speed) > 0.001) this.travelHeading = Math.atan2(-body.vx * direction, -body.vz * direction);
            this.lateralVelocity = body.vx * road.rx + body.vz * road.rz;
            this.integrity = Math.max(0, this.integrity - Math.min(30, Math.max(0, body.impact - 2.5) * 0.7 / this.vehicle.durability));
          }
        }
        continue;
      }
      const { car, distance, speed } = rivals.find(({ car }) => car.id === body.id)!;
      if (body.collided || result.elapsed < dt || body.finishTime !== null) {
        Object.assign(car.position, body.position);
        const road = this.track.project(car.position.x, car.position.z, car.distance);
        car.distance = road.distance; car.lane = road.lane;
        car.vertical.height = car.position.y;
        car.vertical.rebaseGround(this.track.surfaceHeight(car.position.x, car.position.z, road));
        car.position.y = car.vertical.height; car.airHeight = car.vertical.clearance; car.airborne = car.vertical.airborne;
        if (body.collided) {
          car.speed = clamp(body.vx * road.tx + body.vz * road.tz, 0,
            (car.vehicle.topSpeed + (this.difficulty === 'hard' && car.vehicle.mode !== 'longboard' ? NITRO_SPEED_BONUS_KMH : 0)) / 3.6);
          car.collisionVelocity.x = body.vx - road.tx * car.speed;
          car.collisionVelocity.z = body.vz - road.tz * car.speed;
          car.braking = car.speed < speed; car.planIn = 0;
          car.boosting = false; car.usingNitro = false; car.nitroCooldown = 0.8;
        }
      }
      if (body.finishTime !== null && distance < this.track.length) {
        car.finishTime = startTime + body.finishTime;
        car.distance = this.track.length; car.speed = 0; car.braking = true;
        car.boosting = false; car.usingNitro = false; car.drifting = false;
        car.collisionVelocity.x = car.collisionVelocity.z = 0;
      }
    }
    if (!correctedStart) this.recordSplits(before, result.elapsed);
  }

  private recordSplits(before: TrackPoint, dt: number) {
    // A split requires crossing its physical gate in the forward direction and on
    // the road. Merely projecting past a bend, driving backwards, or cutting across
    // the forest cannot award a checkpoint or finish the stage.
    while (this.splits.length < SECTORS) {
      const gate = this.track.sample(this.nextCheckpointDistance);
      const from = (before.x - gate.x) * gate.tx + (before.z - gate.z) * gate.tz;
      const to = (this.position.x - gate.x) * gate.tx + (this.position.z - gate.z) * gate.tz;
      if (from >= 0 || to < -1e-7) break;
      const fraction = clamp(-from / (to - from), 0, 1);
      const x = before.x + (this.position.x - before.x) * fraction;
      const z = before.z + (this.position.z - before.z) * fraction;
      const lane = (x - gate.x) * gate.rx + (z - gate.z) * gate.rz;
      if (Math.abs(lane) > this.track.roadWidth / 2 + 1.4) break;
      const crossing = this.elapsed - dt + fraction * dt + this.penalty;
      const last = this.splits[this.splits.length - 1]?.total ?? 0;
      this.splits.push({ time: crossing - last, total: crossing, delta: crossing - this.targetTime * (this.splits.length + 1) / SECTORS });
      if (this.splits.length === SECTORS) {
        this.position.x = x; this.position.z = z;
        this.position.y = this.airborne ? before.y + (this.position.y - before.y) * fraction : gate.y;
        this.vertical.height = this.position.y;
        this.distance = this.track.length; this.lane = lane;
      }
    }
    if (this.splits.length === SECTORS) {
      this.phase = 'finished'; this.drifting = false;
      this.boosting = false; this.tucking = false; this.pushing = false; this.footbraking = false;
      this.handbrake = false; this.handbrakeHeldTime = 0; this.driftDirection = 0;
      this.elapsed = this.splits[SECTORS - 1].total - this.penalty;
    }
  }
}
