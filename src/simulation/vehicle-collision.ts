import type { VehicleDefinition } from '../content/vehicles';
import type { TrackFrame, TrackPoint } from './track';

const EPSILON = 1e-7;
const SEPARATION = 1e-4;
const RESTITUTION = 0.12;

/** Horizontal body bounds, plus the height needed to reject over/under passes. */
export function vehicleBody(vehicle: VehicleDefinition) {
  const bike = vehicle.mode === 'motorcycle'; const board = vehicle.mode === 'longboard';
  return {
    halfWidth: (board ? Math.max(0.32, (vehicle.board?.width ?? 0.4) / 2) : bike ? 0.58 : 1.25) * vehicle.scale[0],
    halfLength: (board ? (vehicle.board?.length ?? 1.4) / 2 : bike ? 1.55 : 2.35) * vehicle.scale[2],
    height: (board ? 1.4 : bike ? 1.8 : 1.65) * vehicle.scale[1],
    // Equipment-only weights exclude the rider in the bike/board catalog.
    mass: vehicle.weight + (vehicle.mode === 'car' ? 0 : 75),
  };
}

export interface VehicleMovement {
  id: string;
  vehicle: VehicleDefinition;
  heading: number;
  before: TrackPoint;
  after: TrackPoint;
  /** A finish crossing removes this body from further contacts. */
  canFinish?: boolean;
  /** Stop the shared simulation clock when this body finishes. */
  endsRace?: boolean;
}
export interface CollisionFinish { frame: TrackFrame; halfWidth: number }
export interface CollisionResult {
  id: string; position: TrackPoint; vx: number; vz: number;
  collided: boolean; impact: number; finishTime: number | null;
}
interface Body extends CollisionResult {
  source: VehicleMovement;
  vy: number;
  inverseMass: number;
  halfWidth: number; halfLength: number; height: number;
  fx: number; fz: number; rx: number; rz: number;
}
interface Contact { a: Body; b: Body; time: number; nx: number; nz: number; depth: number }
type Constrain = (body: CollisionResult) => void;

function contact(a: Body, b: Body, duration: number): Contact | null {
  const dx = b.position.x - a.position.x; const dz = b.position.z - a.position.z;
  const vx = b.vx - a.vx; const vz = b.vz - a.vz;
  // Cheap swept broad phase before the four separating-axis tests.
  const radius = Math.hypot(a.halfWidth, a.halfLength) + Math.hypot(b.halfWidth, b.halfLength);
  if (Math.abs(dx) > radius + Math.abs(vx) * duration || Math.abs(dz) > radius + Math.abs(vz) * duration) return null;
  let enter = -Infinity; let leave = duration;
  let nx = 0; let nz = 0; let overlap = Infinity; let ox = 0; let oz = 0;
  for (const [x, z] of [[a.fx, a.fz], [a.rx, a.rz], [b.fx, b.fz], [b.rx, b.rz]]) {
    const span = a.halfLength * Math.abs(a.fx * x + a.fz * z) + a.halfWidth * Math.abs(a.rx * x + a.rz * z)
      + b.halfLength * Math.abs(b.fx * x + b.fz * z) + b.halfWidth * Math.abs(b.rx * x + b.rz * z);
    const offset = dx * x + dz * z; const velocity = vx * x + vz * z;
    const depth = span - Math.abs(offset);
    const direction = Math.abs(offset) > EPSILON ? Math.sign(offset) : velocity > 0 ? -1 : 1;
    if (depth < overlap) { overlap = depth; ox = x * direction; oz = z * direction; }
    if (Math.abs(velocity) < EPSILON) {
      if (depth < -EPSILON) return null;
      continue;
    }
    const t1 = (-span - offset) / velocity; const t2 = (span - offset) / velocity;
    const first = Math.min(t1, t2);
    if (first > enter) { enter = first; nx = -Math.sign(velocity) * x; nz = -Math.sign(velocity) * z; }
    leave = Math.min(leave, Math.max(t1, t2));
    if (enter > leave + EPSILON) return null;
  }
  // Sweep vertical intervals too: two vehicles at different jump heights do not collide.
  const dy = b.position.y + b.height / 2 - a.position.y - a.height / 2;
  const vy = b.vy - a.vy; const height = (a.height + b.height) / 2;
  if (Math.abs(vy) < EPSILON) {
    if (Math.abs(dy) >= height - EPSILON) return null;
  } else {
    const t1 = (-height - dy) / vy; const t2 = (height - dy) / vy;
    enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
  }
  if (leave < -EPSILON || enter > leave + EPSILON || enter > duration) return null;
  if (overlap >= -EPSILON && enter <= EPSILON) {
    nx = ox; nz = oz;
    if (overlap <= EPSILON && vx * nx + vz * nz >= -EPSILON) return null;
    return { a, b, time: 0, nx, nz, depth: Math.max(0, overlap) };
  }
  if (enter < -EPSILON) return null;
  return { a, b, time: Math.max(0, enter), nx, nz, depth: 0 };
}

function finishTime(body: Body, finish: CollisionFinish, duration: number) {
  if (!body.source.canFinish || body.finishTime !== null) return Infinity;
  const { frame, halfWidth } = finish;
  const from = (body.position.x - frame.x) * frame.tx + (body.position.z - frame.z) * frame.tz;
  const forward = body.vx * frame.tx + body.vz * frame.tz;
  if (from > EPSILON || forward <= EPSILON) return Infinity;
  const time = Math.max(0, -from / forward);
  if (time > duration + EPSILON) return Infinity;
  const lane = (body.position.x + body.vx * time - frame.x) * frame.rx
    + (body.position.z + body.vz * time - frame.z) * frame.rz;
  return Math.abs(lane) <= halfWidth ? Math.min(time, duration) : Infinity;
}

/**
 * Continuous, translation-only OBB contacts for the existing arcade handling.
 * Replay proposed movement to each impact, exchange momentum, then use the remaining
 * time. The rendered body yaw stays under steering control. No WebGL or physics clock.
 */
export function resolveVehicleCollisions(movements: VehicleMovement[], dt: number, constrain?: Constrain, finish?: CollisionFinish): { elapsed: number; bodies: CollisionResult[] } {
  const bodies: Body[] = movements.map(source => {
    const bounds = vehicleBody(source.vehicle);
    return { source, id: source.id, position: { ...source.before },
      vx: dt > 0 ? (source.after.x - source.before.x) / dt : 0,
      vz: dt > 0 ? (source.after.z - source.before.z) / dt : 0,
      vy: dt > 0 ? (source.after.y - source.before.y) / dt : 0,
      ...bounds, inverseMass: 1 / bounds.mass,
      fx: -Math.sin(source.heading), fz: -Math.cos(source.heading), rx: Math.cos(source.heading), rz: -Math.sin(source.heading),
      collided: false, impact: 0, finishTime: null };
  }).sort((a, b) => a.id.localeCompare(b.id));
  let elapsed = 0;
  const advance = (time: number) => {
    for (const body of bodies) {
      if (body.finishTime !== null) continue;
      body.position.x += body.vx * time; body.position.z += body.vz * time; body.position.y += body.vy * time;
      if (body.collided) constrain?.(body);
    }
    elapsed += time;
  };
  // Bound pile-up work independently of frame duration and contact count.
  for (let iteration = 0; dt > 0 && iteration < 64; iteration++) {
    const remaining = Math.max(0, dt - elapsed);
    let hit: Contact | null = null;
    let finisher: Body | null = null; let crossing = Infinity;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]; if (a.finishTime !== null) continue;
      if (finish) {
        const time = finishTime(a, finish, remaining);
        if (time < crossing) { crossing = time; finisher = a; }
      }
      for (const b of bodies.slice(i + 1)) {
        if (b.finishTime !== null) continue;
        const candidate = contact(a, b, remaining);
        if (candidate && (!hit || candidate.time < hit.time)) hit = candidate;
      }
    }
    if (finisher && crossing < (hit?.time ?? Infinity)) {
      advance(crossing); finisher.finishTime = elapsed;
      // Record simultaneous crossings before freezing at the player's finish.
      for (const body of bodies) if (finish && finishTime(body, finish, 0) === 0) body.finishTime = elapsed;
      if (bodies.some(body => body.source.endsRace && body.finishTime !== null)) break;
      continue;
    }
    if (!hit) { advance(remaining); break; }
    advance(hit.time);
    const { a, b, nx, nz, depth } = hit;
    a.collided = b.collided = true;
    const inverseMass = a.inverseMass + b.inverseMass;
    const separation = (depth + SEPARATION) / inverseMass;
    a.position.x -= nx * separation * a.inverseMass; a.position.z -= nz * separation * a.inverseMass;
    b.position.x += nx * separation * b.inverseMass; b.position.z += nz * separation * b.inverseMass;
    const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (closing < 0) {
      const impulse = -closing * (closing < -1 ? 1 + RESTITUTION : 1) / inverseMass;
      // Coulomb-limited tangential friction keeps glancing contact driveable.
      const tangent = (b.vx - a.vx) * -nz + (b.vz - a.vz) * nx;
      const friction = Math.max(-impulse * 0.15, Math.min(impulse * 0.15, -tangent / inverseMass));
      const ix = nx * impulse - nz * friction; const iz = nz * impulse + nx * friction;
      a.vx -= ix * a.inverseMass; a.vz -= iz * a.inverseMass;
      b.vx += ix * b.inverseMass; b.vz += iz * b.inverseMass;
      a.impact = Math.max(a.impact, impulse * a.inverseMass); b.impact = Math.max(b.impact, impulse * b.inverseMass);
    }
    constrain?.(a); constrain?.(b);
  }
  // If a tightly trapped pile-up exhausts the solver budget, stop the contacted
  // bodies for this tick instead of advancing unresolved velocities through cars.
  if (elapsed < dt && !bodies.some(body => body.source.endsRace && body.finishTime !== null)) {
    for (const body of bodies) if (body.collided) body.vx = body.vz = 0;
    advance(dt - elapsed);
  }
  for (const body of bodies) {
    if (!body.collided && body.finishTime === null && elapsed === dt) Object.assign(body.position, body.source.after);
  }
  return { elapsed, bodies };
}
