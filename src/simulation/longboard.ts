import { clamp } from './track';
import { LONGBOARD, type VehicleDefinition } from '../content/vehicles';

const DOWNHILL_DRIVE_MULTIPLIER = 5;
const PUSH_MULTIPLIER = 5;
const BRAKE_MULTIPLIER = 0.8;
const MINIMUM_BRAKE_DECELERATION = 0.8;

/** Arcade forces in m/s². Positive grade climbs; gravity follows travel direction. */
export function longboardAcceleration(speed: number, grade: number, pushing: boolean, tucking: boolean, braking: boolean, sliding: boolean, slideStrength = 1, vehicle: VehicleDefinition = LONGBOARD) {
  const gravity = -9.81 * grade / Math.sqrt(1 + grade * grade);
  const push = pushing ? vehicle.acceleration * PUSH_MULTIPLIER * clamp(1 - speed / 9, 0, 1) : 0;
  const air = speed * speed * (tucking ? 0.00105 : 0.0025);
  if (braking || sliding) {
    const brakeForce = braking ? vehicle.braking : 8 * slideStrength * vehicle.drift / LONGBOARD.drift;
    return Math.min(-MINIMUM_BRAKE_DECELERATION, gravity - 0.13 - air - brakeForce * BRAKE_MULTIPLIER);
  }
  // Extra downhill drive helps regain speed after a corner; it never fights braking.
  const downhillAssist = Math.max(0, gravity) * (DOWNHILL_DRIVE_MULTIPLIER - 1);
  return gravity + downhillAssist + push - 0.13 - air;
}
