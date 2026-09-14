import type { Track, TrackPoint } from './track';

/** Sweep a conservative vehicle footprint along the road corridor, including in flight. */
export function moveWithinTrack(track: Track, position: TrackPoint, vx: number, vz: number, dt: number, clearance: number, referenceDistance: number) {
  const limit = Math.max(0, track.boundaryEdge - clearance);
  const frame = track.sample(referenceDistance);
  // A point inside this known road cross-section is already safe; avoid another
  // full centre-line search on every ordinary fixed tick.
  let road = { ...frame, distance: referenceDistance, lane: (position.x - frame.x) * frame.rx + (position.z - frame.z) * frame.rz };
  if (Math.hypot(position.x - frame.x, position.z - frame.z) > limit) road = track.project(position.x, position.z, referenceDistance);
  let blocked = false;
  let impactSpeed = 0;
  const constrain = () => {
    const dx = position.x - road.x; const dz = position.z - road.z;
    const offset = Math.hypot(dx, dz);
    if (offset <= limit + 1e-8) return false;
    const nx = dx / offset; const nz = dz / offset;
    impactSpeed = Math.max(impactSpeed, vx * nx + vz * nz);
    // Resolve only penetration. Heading stays under player control and the
    // remaining movement can slide along the barrier or move back into the road.
    const inset = Math.max(0, limit - 1e-6);
    position.x = road.x + nx * inset; position.z = road.z + nz * inset;
    road = track.project(position.x, position.z, road.distance);
    blocked = true;
    return true;
  };
  // Repair invalid placements without counting their correction as race progress.
  const correctedStart = constrain();
  const startX = position.x; const startZ = position.z;
  // A long update must not tunnel through the outside of a bend and land on a
  // different part of the circuit. Normal fixed ticks usually need one step.
  const steps = Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / Math.max(0.5, limit / 2)));
  for (let i = 0; i < steps; i++) {
    position.x += vx * dt / steps; position.z += vz * dt / steps;
    road = track.project(position.x, position.z, road.distance);
    constrain();
  }
  return { road, blocked, impactSpeed, correctedStart,
    vx: blocked ? (position.x - startX) / dt : vx,
    vz: blocked ? (position.z - startZ) / dt : vz };
}
