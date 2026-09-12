import { getVehicle, type VehicleDefinition } from '../content/vehicles';
import { clamp, type Track, type TrackPoint } from './track';
import type { Race } from './race';

export const RIVAL_DRIVERS = [
  { id: 'rival-1', name: '林岳', vehicle: 'falcon', color: '#d77850', pace: 1.01 },
  { id: 'rival-2', name: '夏岚', vehicle: 'comet', color: '#679ac7', pace: 0.98 },
  { id: 'rival-3', name: '陈墨', vehicle: 'swift', color: '#d5bb61', pace: 1.02 },
  { id: 'rival-4', name: '苏禾', vehicle: 'nomad', color: '#80a17d', pace: 1.04 },
  { id: 'rival-5', name: '周野', vehicle: 'falcon', color: '#b592b7', pace: 0.94 },
] as const;
export interface RivalPose { position: TrackPoint; heading: number; speed: number; steering: number }
export interface Rival extends RivalPose {
  id: string; name: string; color: string; vehicle: VehicleDefinition; pace: number;
  distance: number; lane: number; targetLane: number; planIn: number;
  finishTime: number | null; braking: boolean;
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
  constructor(readonly track: Track) {
    this.laneSpacing = Math.min(4.2, track.roadWidth * 0.28);
    this.cars = RIVAL_DRIVERS.map(driver => ({ ...driver, vehicle: getVehicle(driver.vehicle),
      position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, steering: 0, distance: 0, lane: 0,
      targetLane: 0, planIn: 0, finishTime: null, braking: false }));
    this.reset();
  }
  reset() {
    const grid = startingGrid(this.track);
    this.cars.forEach((car, i) => {
      car.distance = grid[i + 1].distance; car.lane = grid[i + 1].lane;
      car.targetLane = car.lane; car.planIn = i * 0.06;
      car.speed = 0; car.steering = 0; car.braking = false; car.finishTime = null;
      Object.assign(car.position, this.track.position(car.distance, car.lane));
      car.heading = this.track.sample(car.distance).heading;
    });
  }

  private targetSpeed(car: Rival, professional: boolean) {
    const pace = car.pace * (professional ? 1 : 0.87);
    let target = car.vehicle.topSpeed / 3.6 * pace;
    // Brake for the corner before reaching it; long straights still permit top speed.
    for (const ahead of [0, 15, 35, 65, 100]) {
      const curvature = Math.abs(this.track.curvature(car.distance + ahead));
      const cornerSpeed = Math.sqrt(8.4 * this.track.definition.grip * car.vehicle.grip / Math.max(0.0005, curvature)) * pace;
      target = Math.min(target, Math.sqrt(cornerSpeed ** 2 + 2 * car.vehicle.braking * 0.65 * ahead));
    }
    return Math.min(car.vehicle.topSpeed / 3.6, target);
  }

  private chooseLane(car: Rival, traffic: Traffic[]) {
    const score = (lane: number) => {
      let ahead = 100;
      for (const other of traffic) {
        if (other.id === car.id || Math.min(Math.abs(other.lane - lane), Math.abs(other.targetLane - lane)) > 2.9) continue;
        const gap = other.distance - car.distance;
        if (gap > -9 && gap < 11 && Math.abs(lane - car.lane) > 0.8) return -Infinity;
        if (gap > 0) ahead = Math.min(ahead, gap);
      }
      return ahead - Math.abs(lane - car.lane) * 2;
    };
    let best = car.targetLane; let bestScore = score(best);
    for (const lane of [-this.laneSpacing, 0, this.laneSpacing]) {
      // Change one lane at a time rather than cutting across a neighbouring car.
      if (Math.abs(lane - car.lane) > this.laneSpacing + 0.8) continue;
      const candidate = score(lane);
      if (candidate > bestScore + 7) { best = lane; bestScore = candidate; }
    }
    car.targetLane = best;
  }

  update(dt: number, player: Race, startTime: number) {
    // Snapshot traffic first: the result does not depend on opponent iteration order.
    const traffic: Traffic[] = this.cars.filter(car => car.finishTime === null).map(car => ({ id: car.id, distance: car.distance, lane: car.lane, targetLane: car.targetLane, speed: car.speed }));
    if (Math.abs(player.lane) < this.track.roadWidth / 2 + 1.5) {
      const roadHeading = this.track.sample(player.distance).heading;
      traffic.push({ id: 'player', distance: player.distance, lane: player.lane, targetLane: player.lane,
        speed: Math.max(0, player.speed * Math.cos(player.travelHeading - roadHeading)) });
    }
    for (const car of this.cars) {
      if (car.finishTime !== null) continue;
      car.planIn -= dt;
      if (car.planIn <= 0) { this.chooseLane(car, traffic); car.planIn = 0.45; }
      let target = this.targetSpeed(car, player.difficulty === 'pro');
      let available = Infinity;
      for (const other of traffic) {
        if (other.id === car.id) continue;
        const gap = other.distance - car.distance;
        const inLane = Math.min(Math.abs(other.lane - car.lane), Math.abs(other.lane - car.targetLane)) < 2.9;
        if (gap > 0 && inLane) {
          const followingGap = 6 + car.speed * 0.3;
          target = Math.min(target, Math.max(0, other.speed + (gap - followingGap) * 1.3));
          available = Math.min(available, Math.max(0, gap - 5.5));
        }
      }
      const acceleration = clamp((target - car.speed) * 2, -car.vehicle.braking, car.vehicle.acceleration * (1 - car.speed / (car.vehicle.topSpeed / 3.6 * 1.1)));
      car.braking = acceleration < -2;
      car.speed = clamp(car.speed + acceleration * dt, 0, car.vehicle.topSpeed / 3.6);
      const previousDistance = car.distance;
      const advance = Math.min(car.speed * dt, available);
      if (dt > 0) car.speed = advance / dt;
      car.distance = Math.min(this.track.length, car.distance + advance);
      const previousLane = car.lane;
      let laneStep = clamp(car.targetLane - car.lane, -2.1 * dt, 2.1 * dt) * Math.min(1, car.speed / 5);
      for (const other of traffic) {
        if (other.id !== car.id && Math.abs(other.distance - car.distance) < 6
          && Math.abs(other.lane - car.lane - laneStep) < 2.7 && (other.lane - car.lane) * laneStep > 0) {
          laneStep = 0; car.planIn = 0;
        }
      }
      car.lane += laneStep;
      const frame = this.track.sample(car.distance);
      const laneSpeed = dt > 0 ? (car.lane - previousLane) / dt : 0;
      const heading = frame.heading - Math.atan2(laneSpeed, Math.max(1, car.speed));
      car.heading += Math.atan2(Math.sin(heading - car.heading), Math.cos(heading - car.heading)) * (1 - Math.exp(-dt * 9));
      car.steering = clamp(-this.track.curvature(car.distance) * 35 + laneSpeed * 0.2, -1, 1);
      Object.assign(car.position, this.track.position(car.distance, car.lane));
      if (car.distance >= this.track.length) {
        const fraction = advance > 0 ? (this.track.length - previousDistance) / advance : 1;
        car.finishTime = startTime + dt * clamp(fraction, 0, 1); car.speed = 0; car.braking = true;
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
