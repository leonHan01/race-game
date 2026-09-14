import { getVehicle, LONGBOARDS, vehicleClearance, type VehicleDefinition, type VehicleMode } from '../content/vehicles';
import { clamp, type Track, type TrackPoint } from './track';
import type { Race } from './race';
import { longboardAcceleration } from './longboard';
import { VerticalMotion } from './vertical-motion';
import { moveWithinTrack } from './track-collision';
import { difficultyProfile, type Difficulty, type DifficultyProfile } from '../content/difficulties';
import { NITRO_CAPACITY, NITRO_DRAIN_PER_SECOND, NITRO_CHARGE_PER_SECOND, NITRO_ACCELERATION, NITRO_SPEED_BONUS_KMH } from './nitro';

export const RIVAL_DRIVERS = [
  { id: 'rival-1', name: '林岳', vehicle: 'falcon', color: '#d77850', pace: 1.01 },
  { id: 'rival-2', name: '夏岚', vehicle: 'vortex', color: '#679ac7', pace: 0.98 },
  { id: 'rival-3', name: '陈墨', vehicle: 'swift', color: '#d5bb61', pace: 1.02 },
  { id: 'rival-4', name: '苏禾', vehicle: 'summit', color: '#80a17d', pace: 1.04 },
  { id: 'rival-5', name: '周野', vehicle: 'thunder', color: '#b592b7', pace: 1.02 },
] as const;
export const rivalDrivers = (mode: VehicleMode) => RIVAL_DRIVERS.map((driver, i) => ({
  ...driver, vehicle: mode === 'longboard' ? LONGBOARDS[i % LONGBOARDS.length] : getVehicle(mode === 'motorcycle' ? (i % 2 === 0 ? 'apex' : 'trail') : driver.vehicle),
}));
export interface RivalPose { position: TrackPoint; heading: number; speed: number; steering: number; pitch: number; airHeight: number; airborne: boolean; driftAngle: number; drifting: boolean; boosting: boolean }
export interface Rival extends RivalPose {
  id: string; name: string; color: string; vehicle: VehicleDefinition; pace: number;
  distance: number; lane: number; targetLane: number; planIn: number;
  acceleration: number; laneVelocity: number; laneHold: number;
  nitro: number; usingNitro: boolean; nitroCooldown: number;
  finishTime: number | null; braking: boolean;
  vertical: VerticalMotion;
  collisionVelocity: { x: number; z: number };
}
export interface Standing { id: string; name: string; color: string; vehicle: string; distance: number; finishTime: number | null; player: boolean }
interface Traffic { distance: number; lane: number; targetLane: number; speed: number; id: string }
export const startingGrid = (track: Track) => {
  const lane = Math.min(4.2, track.roadWidth * 0.28);
  return [{ distance: 0, lane: 0 }, { distance: 16, lane: -lane }, { distance: 16, lane },
    { distance: 8, lane: -lane }, { distance: 8, lane }, { distance: 0, lane }];
};

/** Deterministic, road-following opponents. Player controls are never changed here. */
export class Opponents {
  readonly cars: Rival[];
  private readonly laneSpacing: number;
  constructor(readonly track: Track, mode: VehicleMode = 'car') {
    this.laneSpacing = Math.min(4.2, track.roadWidth * 0.28);
    this.cars = rivalDrivers(mode).map(driver => ({ ...driver,
      position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, steering: 0, distance: 0, lane: 0,
      targetLane: 0, planIn: 0, acceleration: 0, laneVelocity: 0, laneHold: 0, finishTime: null, braking: false,
      driftAngle: 0, drifting: false, boosting: false, nitro: 0, usingNitro: false, nitroCooldown: 0,
      pitch: 0, airHeight: 0, airborne: false, vertical: new VerticalMotion(), collisionVelocity: { x: 0, z: 0 } }));
    this.reset();
  }
  reset(difficulty: Difficulty = 'medium') {
    const grid = startingGrid(this.track);
    this.cars.forEach((car, i) => {
      car.distance = grid[i + 1].distance; car.lane = grid[i + 1].lane;
      car.targetLane = car.lane; car.planIn = i * 0.06;
      car.speed = 0; car.steering = 0; car.braking = false; car.finishTime = null;
      car.acceleration = 0; car.laneVelocity = 0; car.laneHold = 0;
      car.driftAngle = 0; car.drifting = false; car.boosting = false; car.usingNitro = false; car.nitroCooldown = 0;
      car.nitro = difficulty === 'hard' && car.vehicle.mode !== 'longboard' ? 60 : 0;
      car.collisionVelocity.x = car.collisionVelocity.z = 0;
      Object.assign(car.position, this.track.position(car.distance, car.lane));
      car.heading = this.track.sample(car.distance).heading;
      car.pitch = this.track.hasJumps ? Math.atan(this.track.grade(car.distance)) : 0;
      car.airHeight = 0; car.airborne = false; car.vertical.reset(car.position.y, car.pitch);
    });
  }

  private targetSpeed(car: Rival, difficulty: DifficultyProfile, limit = car.vehicle.topSpeed / 3.6) {
    const pace = car.pace * difficulty.pace;
    let target = limit * pace;
    // Include braking build-up in the preview; fast cars need more than 100 m.
    const braking = car.vehicle.braking * this.track.definition.grip * (difficulty.id === 'hard' ? 0.6 : 0.45);
    const anticipation = car.speed * (difficulty.id === 'hard' ? 1.2 : 1);
    const horizon = clamp(car.speed ** 2 / (2 * braking) + anticipation + 30, 100, 500);
    for (let sample = 0; sample <= 12; sample++) {
      const ahead = horizon * (sample / 12) ** 2;
      const curvature = Math.abs(this.track.curvature(car.distance + ahead));
      const cornerGrip = difficulty.id === 'hard' ? 1.35 : 1;
      const cornerSpeed = Math.sqrt(8.4 * cornerGrip * this.track.definition.grip * car.vehicle.grip / Math.max(0.0005, curvature)) * pace;
      target = Math.min(target, Math.sqrt(cornerSpeed ** 2 + 2 * braking * Math.max(0, ahead - anticipation)));
    }
    return Math.min(limit, target);
  }

  /** Outside on entry, inside at the apex, then open the exit. Traffic still has priority. */
  private racingLine(car: Rival) {
    const span = clamp(car.speed, 25, 70);
    // Lead the body by the time needed to build lateral velocity.
    const distance = car.distance + span * 0.6;
    const behind = this.track.curvature(distance - span * 0.65);
    const current = this.track.curvature(distance);
    const near = this.track.curvature(distance + span * 0.6);
    const ahead = this.track.curvature(distance + span * 1.5);
    const width = Math.max(0, Math.min(this.laneSpacing * 0.8, this.track.roadWidth / 2 - vehicleClearance(car.vehicle) - 1.4));
    if (Math.abs(current) > 0.0015) {
      const peak = Math.max(Math.abs(current), Math.abs(near), Math.abs(ahead));
      const exiting = Math.sign(behind) === Math.sign(current) && Math.abs(behind) > Math.abs(current) * 1.25 && Math.abs(near) < Math.abs(current);
      return Math.sign(current) * width * (exiting ? 0.8 : 1 - 2 * Math.min(1, Math.abs(current) / peak * 1.8));
    }
    const upcoming = Math.abs(near) > Math.abs(ahead) ? near : ahead;
    if (Math.abs(upcoming) > 0.0015) return Math.sign(upcoming) * width;
    if (Math.abs(behind) > 0.0015) return Math.sign(behind) * width * 0.8;
    return 0;
  }

  private chooseLane(car: Rival, traffic: Traffic[], difficulty: DifficultyProfile) {
    const score = (lane: number) => {
      let ahead = 100;
      for (const other of traffic) {
        if (other.id === car.id || Math.min(Math.abs(other.lane - lane), Math.abs(other.targetLane - lane)) > 2.9) continue;
        const gap = other.distance - car.distance;
        const predictedGap = gap + (other.speed - car.speed) * 1.2;
        if (Math.min(gap, predictedGap) < 11 && Math.max(gap, predictedGap) > -9 && Math.abs(lane - car.lane) > 0.8) return -Infinity;
        if (gap > 0) ahead = Math.min(ahead, gap);
      }
      return ahead - Math.abs(lane - car.lane) * 2;
    };
    let best = car.targetLane; let bestScore = score(best);
    // Complete a safe lane change and settle before considering another one.
    if (bestScore !== -Infinity && (Math.abs(car.targetLane - car.lane) > 0.2 || car.laneHold > 0)) return;
    for (const lane of [-this.laneSpacing, 0, this.laneSpacing]) {
      // Change one lane at a time rather than cutting across a neighbouring car.
      if (Math.abs(lane - car.lane) > this.laneSpacing + 0.8) continue;
      const candidate = score(lane);
      if (candidate > bestScore + 7) { best = lane; bestScore = candidate; }
    }
    if (best !== car.targetLane) { car.targetLane = best; car.laneHold = difficulty.laneHold; }
  }

  update(dt: number, player: Race, startTime: number, deferFinish = false) {
    if (dt <= 0) return;
    const difficulty = difficultyProfile(player.difficulty);
    // Snapshot traffic first: the result does not depend on opponent iteration order.
    const traffic: Traffic[] = this.cars.filter(car => car.finishTime === null).map(car => ({ id: car.id, distance: car.distance, lane: car.lane, targetLane: car.targetLane, speed: car.speed }));
    if (Math.abs(player.lane) < this.track.roadWidth / 2 + 1.5) {
      const roadHeading = this.track.sample(player.distance).heading;
      traffic.push({ id: 'player', distance: player.distance, lane: player.lane, targetLane: player.lane,
        speed: Math.max(0, player.speed * Math.cos(player.travelHeading - roadHeading)) });
    }
    for (const car of this.cars) {
      if (car.finishTime !== null) continue;
      const expert = difficulty.id === 'hard';
      const powered = expert && car.vehicle.mode !== 'longboard';
      const itemState = player.mode === 'items' ? player.items.state(car.id) : null;
      const stunned = !!itemState && itemState.stun > 0;
      const itemBoost = !!itemState && itemState.boost > 0 && !stunned && !car.airborne;
      const clearLine = traffic.every(other => other.id === car.id
        || Math.abs(other.distance - car.distance) > Math.max(28, car.speed * 1.2, other.speed * 0.8));
      if (Math.abs(car.targetLane - car.lane) < 0.2) car.laneHold = Math.max(0, car.laneHold - dt);
      car.planIn -= dt;
      if (car.planIn <= 0) {
        if (expert && clearLine && car.speed > 8 && !car.airborne && !stunned) car.targetLane = this.racingLine(car);
        else this.chooseLane(car, traffic, difficulty);
        car.planIn = expert ? 0.2 : 0.45;
      }
      const normalLimit = car.vehicle.topSpeed / 3.6;
      const nitroLimit = normalLimit + (powered ? NITRO_SPEED_BONUS_KMH / 3.6 : 0);
      const roadTarget = this.targetSpeed(car, difficulty, nitroLimit);
      let target = Math.min(normalLimit, roadTarget);
      if (itemBoost) target = Math.min(normalLimit, target + 12);
      if (stunned) target = 3;
      let available = Infinity;
      let trafficTarget = Infinity;
      let emergencyBrake = false;
      for (const other of traffic) {
        if (other.id === car.id) continue;
        const gap = other.distance - car.distance;
        const inLane = Math.min(Math.abs(other.lane - car.lane), Math.abs(other.lane - car.targetLane),
          Math.abs(other.targetLane - car.lane), Math.abs(other.targetLane - car.targetLane)) < 2.9;
        if (gap > 0 && inLane) {
          const closingSpeed = Math.max(0, car.speed - other.speed);
          const braking = car.vehicle.braking * this.track.definition.grip;
          const passing = Math.min(Math.abs(other.lane - car.targetLane), Math.abs(other.targetLane - car.targetLane)) >= 2.9;
          const followingGap = (passing ? 6 : 7) + car.speed * difficulty.headway + closingSpeed ** 2 / (2 * braking * 0.45);
          trafficTarget = Math.min(trafficTarget, Math.max(0, other.speed + (gap - followingGap) * 0.75));
          emergencyBrake ||= gap - 5.5 < closingSpeed ** 2 / (2 * braking) + closingSpeed * 0.25;
          available = Math.min(available, Math.max(0, gap - 5.5));
        }
      }
      const curvature = this.track.curvature(car.distance + car.speed * 0.18);
      const roomToSlide = traffic.every(other => other.id === car.id || Math.abs(other.distance - car.distance) > 12);
      car.drifting = powered && roomToSlide && !car.airborne && !stunned && !emergencyBrake && car.speed > 14
        && Math.abs(curvature) > (car.drifting ? 0.0018 : 0.0032);
      const slide = car.drifting ? Math.sign(curvature) * clamp(Math.abs(curvature) * 22 + 0.14, 0.2, 0.6)
        * (car.vehicle.mode === 'motorcycle' ? 0.45 : 1) : 0;
      car.driftAngle += (slide - car.driftAngle) * (1 - Math.exp(-dt * (car.drifting ? 5 : 7)));
      if (Math.abs(car.driftAngle) < 0.001) car.driftAngle = 0;
      if (car.drifting) car.nitro = Math.min(NITRO_CAPACITY, car.nitro + NITRO_CHARGE_PER_SECOND * Math.min(1, Math.abs(car.driftAngle) / 0.65) * dt);
      car.nitroCooldown = Math.max(0, car.nitroCooldown - dt);
      const wasUsingNitro = car.usingNitro;
      const useNitro = powered && !car.airborne && !stunned && !emergencyBrake && !car.drifting && Math.abs(car.driftAngle) < 0.13
        && car.nitro > (wasUsingNitro ? 0 : 20) && car.nitroCooldown === 0 && car.speed > 18
        && Math.abs(curvature) < 0.002 && roadTarget > car.speed + (wasUsingNitro ? -1 : 5)
        && roadTarget >= nitroLimit - 0.5
        && trafficTarget > car.speed + 8 && Math.abs(this.track.grade(car.distance + car.speed * 0.5)) < 0.18;
      const boostTime = useNitro ? Math.min(dt, car.nitro / NITRO_DRAIN_PER_SECOND) : 0;
      car.usingNitro = boostTime > 0;
      car.boosting = car.usingNitro || itemBoost;
      car.nitro = clamp(car.nitro - boostTime * NITRO_DRAIN_PER_SECOND, 0, NITRO_CAPACITY);
      if (wasUsingNitro && !car.usingNitro) car.nitroCooldown = 0.8;
      if (car.usingNitro) target = roadTarget;
      target = Math.min(target, trafficTarget);
      const boostAcceleration = Math.max(NITRO_ACCELERATION * boostTime / dt, itemBoost ? 24 : 0);
      let acceleration = clamp((target - car.speed) * 1.4, -car.vehicle.braking * this.track.definition.grip,
        Math.max(0, car.vehicle.acceleration * difficulty.acceleration * (1 - car.speed / (normalLimit * 1.1))) + boostAcceleration);
      if (car.drifting) acceleration = Math.min(acceleration, 1.5);
      if (car.vehicle.mode === 'longboard') {
        const natural = longboardAcceleration(car.speed, this.track.grade(car.distance), car.speed < 9, car.speed >= 9, false, false, 1, car.vehicle);
        acceleration = Math.min(natural * car.pace * difficulty.acceleration, clamp((target - car.speed) * 1.4, -car.vehicle.braking, 5));
      }
      // Limit jerk during normal driving. Sudden obstructions and item hits retain braking priority.
      car.acceleration += clamp(acceleration - car.acceleration, -(expert ? 24 : 14) * dt,
        (car.boosting ? 40 : car.acceleration < 0 ? 24 : expert ? 12 : 8) * dt);
      if (emergencyBrake || (itemState && itemState.stun > 0)) car.acceleration = Math.min(car.acceleration, acceleration);
      if (car.airborne) car.acceleration = -car.speed * 0.035;
      car.braking = car.acceleration < (car.braking ? -0.6 : -1.8);
      const speedLimit = car.usingNitro ? nitroLimit : Math.max(normalLimit, car.speed - (car.airborne ? 0 : 12 * dt));
      car.speed = clamp(car.speed + car.acceleration * dt, 0, speedLimit);
      if (car.speed === 0) car.acceleration = Math.max(0, car.acceleration);
      const previousDistance = car.distance;
      const advance = Math.min(car.speed * dt, available);
      if (advance < car.speed * dt) { car.speed = advance / dt; car.acceleration = Math.min(0, car.acceleration); }
      car.distance = deferFinish ? car.distance + advance : Math.min(this.track.length, car.distance + advance);
      const previousLane = car.lane;
      const laneError = car.targetLane - car.lane;
      const laneSpeedLimit = expert && clearLine ? 3.4 : 2.1;
      const laneAcceleration = expert && clearLine ? 5.2 : 3.2;
      const desiredLaneVelocity = clamp(laneError * (expert && clearLine ? 2 : 1.6), -laneSpeedLimit, laneSpeedLimit) * Math.min(1, car.speed / 3);
      car.laneVelocity += clamp(desiredLaneVelocity - car.laneVelocity, -laneAcceleration * dt, laneAcceleration * dt);
      let laneStep = car.laneVelocity * dt;
      if (Math.abs(laneStep) > Math.abs(laneError) && laneStep * laneError >= 0) laneStep = laneError;
      if (car.airborne || car.speed < 0.05) laneStep = 0;
      for (const other of traffic) {
        if (other.id !== car.id && Math.abs(other.distance - car.distance) < 6
          && Math.abs(other.lane - car.lane - laneStep) < 2.7 && (other.lane - car.lane) * laneStep > 0) {
          laneStep = 0; car.planIn = 0;
        }
      }
      car.laneVelocity = laneStep / dt;
      car.lane += laneStep;
      Object.assign(car.position, this.track.position(car.distance, car.lane));
      if (Math.hypot(car.collisionVelocity.x, car.collisionVelocity.z) > 0.001) {
        const movement = moveWithinTrack(this.track, car.position, car.collisionVelocity.x, car.collisionVelocity.z,
          dt, vehicleClearance(car.vehicle), car.distance);
        car.distance = movement.road.distance; car.lane = movement.road.lane;
        car.position.y = this.track.surfaceHeight(car.position.x, car.position.z, movement.road);
        const decay = Math.exp(-dt * (car.airborne ? 0.3 : 5));
        car.collisionVelocity.x = movement.vx * decay; car.collisionVelocity.z = movement.vz * decay;
      } else car.collisionVelocity.x = car.collisionVelocity.z = 0;
      const frame = this.track.sample(car.distance);
      const laneSpeed = dt > 0 ? (car.lane - previousLane) / dt : 0;
      const heading = frame.heading - Math.atan2(laneSpeed, Math.max(1, car.speed));
      car.heading += Math.atan2(Math.sin(heading - car.heading), Math.cos(heading - car.heading)) * (1 - Math.exp(-dt * 9));
      const steering = clamp(-this.track.curvature(car.distance + car.speed * 0.15) * 35 + laneSpeed * 0.2 + car.driftAngle * 1.1, -1, 1);
      car.steering += (steering - car.steering) * (1 - Math.exp(-dt * 7));
      if (this.track.hasJumps) {
        car.vertical.update(dt, { height: car.position.y, speed: car.speed,
          launchVelocity: this.track.grade(previousDistance, 1.3) * car.speed,
          groundVelocity: this.track.grade(car.distance, 1.3) * car.speed,
          pitch: Math.atan(this.track.grade(car.distance, 1.3)) });
        car.position.y = car.vertical.height; car.pitch = car.vertical.pitch;
        car.airHeight = car.vertical.clearance; car.airborne = car.vertical.airborne;
        if (car.airborne) { car.boosting = false; car.usingNitro = false; car.drifting = false; }
      }
      if (!deferFinish && car.distance >= this.track.length) {
        const fraction = advance > 0 ? (this.track.length - previousDistance) / advance : 1;
        car.finishTime = startTime + dt * clamp(fraction, 0, 1); car.speed = 0; car.braking = true;
        car.boosting = false; car.usingNitro = false; car.drifting = false;
      }
    }
  }

  standings(player: Race): Standing[] {
    const rows: Standing[] = this.cars.map(car => ({ id: car.id, name: car.name, color: car.color, vehicle: car.vehicle.name,
      distance: car.distance, finishTime: car.finishTime, player: false }));
    rows.push({ id: 'player', name: '你', color: '#f1d175', vehicle: player.vehicle.name, player: true,
      distance: Math.min(player.distance, player.nextCheckpointDistance), finishTime: player.phase === 'finished' ? player.elapsed : null });
    return rows.sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime || a.id.localeCompare(b.id);
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.distance - a.distance || Number(a.player) - Number(b.player) || a.id.localeCompare(b.id);
    });
  }
}
