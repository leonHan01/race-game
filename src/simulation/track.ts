import { shoulderBlend, terrainOffset } from './ground';
import { getStage, type StageDefinition } from '../content/stages';

export interface TrackPoint { x: number; y: number; z: number }
export interface TrackFrame extends TrackPoint { tx: number; tz: number; rx: number; rz: number; heading: number }
export interface TrackProjection extends TrackFrame { distance: number; lane: number }
export interface PaceNote { distance: number; direction: 'left' | 'right' | 'straight'; severity: number; label: string }
export interface VenueBounds { minX: number; maxX: number; minZ: number; maxZ: number; floor: number; height: number }
export const ROAD_WIDTH = 18;
export const SECTORS = 5;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));


function catmull(a: number, b: number, c: number, d: number, t: number) {
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}

/** Point-to-point rally stage, sampled by arc length. Units: metres. */
export class Track {
  readonly points: TrackPoint[] = [];
  readonly distances: number[] = [0];
  readonly length: number;
  readonly notes: PaceNote[] = [];
  readonly venueBounds: VenueBounds | null;

  get roadWidth() { return this.definition.roadWidth; }
  get shoulderEdge() { return this.roadWidth / 2 + 2.5; }
  get hasJumps() { return Boolean(this.definition.jumps?.length); }

  constructor(readonly definition: StageDefinition = getStage('pine')) {
    const controls = definition.points;
    for (let segment = 0; segment < controls.length - 1; segment++) {
      const a = controls[Math.max(0, segment - 1)];
      const b = controls[segment];
      const c = controls[segment + 1];
      const d = controls[Math.min(controls.length - 1, segment + 2)];
      for (let i = 0; i < 70; i++) {
        const t = i / 70;
        this.points.push({ x: catmull(a.x, b.x, c.x, d.x, t), y: catmull(a.y, b.y, c.y, d.y, t), z: catmull(a.z, b.z, c.z, d.z, t) });
      }
    }
    this.points.push({ ...controls[controls.length - 1] });
    for (let i = 1; i < this.points.length; i++) {
      const p = this.points[i - 1];
      const q = this.points[i];
      this.distances.push(this.distances[i - 1] + Math.hypot(q.x - p.x, q.z - p.z));
    }
    this.length = this.distances[this.distances.length - 1];
    const venue = definition.venue;
    if (venue) {
      const footprint = [...this.points, this.position(-32), this.position(this.length + 40)];
      const padding = venue.margin + this.roadWidth / 2;
      this.venueBounds = { minX: Math.min(...footprint.map(p => p.x)) - padding, maxX: Math.max(...footprint.map(p => p.x)) + padding,
        minZ: Math.min(...footprint.map(p => p.z)) - padding, maxZ: Math.max(...footprint.map(p => p.z)) + padding,
        floor: controls[0].y, height: venue.height };
    } else this.venueBounds = null;
    let lastNote = -150;
    for (let distance = 100; distance < this.length - 80; distance += 20) {
      const curvature = this.curvature(distance);
      if (Math.abs(curvature) < 0.0028 || distance - lastNote < 145) continue;
      let peak = curvature;
      let apex = distance;
      for (let offset = 20; offset <= 100; offset += 20) {
        const next = this.curvature(distance + offset);
        if (Math.sign(next) === Math.sign(curvature) && Math.abs(next) > Math.abs(peak)) { peak = next; apex = distance + offset; }
      }
      const severity = Math.abs(peak) > 0.013 ? 2 : Math.abs(peak) > 0.008 ? 3 : Math.abs(peak) > 0.0045 ? 4 : 5;
      const direction = peak < 0 ? 'right' : 'left';
      this.notes.push({ distance: apex, direction, severity, label: `${direction === 'left' ? '左' : '右'} ${severity}` });
      lastNote = apex;
    }
  }

  sample(distance: number): TrackFrame {
    const d = clamp(distance, 0, this.length - 0.00001);
    let low = 0;
    let high = this.points.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (this.distances[mid] <= d) low = mid;
      else high = mid;
    }
    const p = this.points[low];
    const q = this.points[high];
    const f = (d - this.distances[low]) / (this.distances[high] - this.distances[low]);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const tx = (q.x - p.x) / len;
    const tz = (q.z - p.z) / len;
    const extension = distance < 0 ? distance : distance > this.length ? distance - this.length : 0;
    // Rendered ribbons, tyres, AI and collision height read the same crest profile.
    let elevation = p.y + (q.y - p.y) * f;
    for (const crest of this.definition.jumps ?? []) {
      const offset = distance - crest.distance;
      const span = offset < 0 ? crest.approach : crest.landing;
      if (Math.abs(offset) < span) elevation += crest.height * (1 + Math.cos(Math.PI * offset / span)) / 2;
    }
    return { x: p.x + (q.x - p.x) * f + tx * extension, y: elevation, z: p.z + (q.z - p.z) * f + tz * extension,
      tx, tz, rx: -tz, rz: tx, heading: Math.atan2(-tx, -tz) };
  }

  grade(distance: number, span = 5): number {
    const start = clamp(distance - span, 0, this.length - 0.01);
    const end = clamp(distance + span, start + 0.01, this.length);
    return (this.sample(end).y - this.sample(start).y) / (end - start);
  }

  curvature(distance: number): number {
    const a = this.sample(distance - 9);
    const b = this.sample(distance + 9);
    let delta = b.heading - a.heading;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta / 18;
  }

  position(distance: number, lane = 0): TrackPoint {
    const frame = this.sample(distance);
    return { x: frame.x + frame.rx * lane, y: frame.y, z: frame.z + frame.rz * lane };
  }

  /** Read the nearest road coordinates without moving or steering the vehicle. */
  project(x: number, z: number): TrackProjection {
    let nearest = Infinity;
    let segment = 0;
    let fraction = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]; const b = this.points[i + 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const raw = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
      const t = clamp(raw, i === 0 ? -Infinity : 0, i === this.points.length - 2 ? Infinity : 1);
      const squared = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
      if (squared < nearest) { nearest = squared; segment = i; fraction = t; }
    }
    const distance = this.distances[segment] + (this.distances[segment + 1] - this.distances[segment]) * fraction;
    const frame = this.sample(distance);
    return { ...frame, distance, lane: (x - frame.x) * frame.rx + (z - frame.z) * frame.rz };
  }

  surfaceHeight(x: number, z: number, projection?: TrackProjection): number {
    if (this.venueBounds) return this.venueBounds.floor;
    projection ??= this.project(x, z);
    // Blend down to the heightfield instead of dropping 1.1 m at the shoulder edge.
    return projection.y + terrainOffset(x, z, projection.lane) * shoulderBlend(projection.lane, this.shoulderEdge);
  }

  /** Solid outer walls stop translation, without steering or bouncing the car. */
  confine(position: TrackPoint, clearance: number): boolean {
    const bounds = this.venueBounds;
    if (!bounds) return false;
    const x = clamp(position.x, bounds.minX + clearance, bounds.maxX - clearance);
    const z = clamp(position.z, bounds.minZ + clearance, bounds.maxZ - clearance);
    const blocked = x !== position.x || z !== position.z;
    position.x = x; position.z = z;
    return blocked;
  }
}
