import * as THREE from 'three';
import type { VehicleDefinition } from '../content/vehicles';
import { LIVERIES } from '../settings';
import { createVehicleMaterials, type VehicleMaterials } from './vehicle-model';
import { ExhaustFlames } from './exhaust-flames';
import { mergeVehicleGeometry as merge, tintGeometry } from './vehicle-geometry';

type Point = [number, number, number];
type Detail = 'player' | 'rival';
type ShellSection = readonly [z: number, bottom: number, top: number, width: number];
export const BIKE_WHEEL_RADIUS = 0.42;
export const BIKE_AXLES = [-1.02, 1.03] as const;
export const motorcycleExhaustPort = (vehicle: VehicleDefinition): Point => [0.35, vehicle.id === 'trail' ? 0.97 : 0.59, 1.04];

/** Closed cross-sections taper the tank, fairing and tail in all three axes. */
function smoothShell(sections: readonly ShellSection[], detailed: boolean): readonly ShellSection[] {
  if (!detailed) return sections;
  const curve = new THREE.CatmullRomCurve3(sections.map(([, bottom, top, width]) => new THREE.Vector3(bottom, top, width)), false, 'catmullrom', 0.35);
  return Array.from({ length: sections.length * 2 - 1 }, (_, i): ShellSection => {
    const row = Math.min(sections.length - 2, Math.floor(i / 2)), t = i / 2 - row;
    const point = curve.getPoint(i / (sections.length * 2 - 2));
    return [THREE.MathUtils.lerp(sections[row][0], sections[row + 1][0], t), point.x, point.y, Math.max(0.01, point.z)];
  });
}

function shell(sections: readonly ShellSection[], segments: number) {
  const positions: number[] = [], indices: number[] = [], uv: number[] = [];
  sections.forEach(([z, bottom, top, width], row) => {
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      positions.push(Math.sin(angle) * width, (top + bottom) / 2 + Math.cos(angle) * (top - bottom) / 2, z);
      uv.push(j / segments, row / (sections.length - 1));
      if (row < sections.length - 1 && j < segments) {
        const a = row * (segments + 1) + j, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  // End fans close the shell without introducing a different material batch.
  for (const row of [0, sections.length - 1]) {
    const [z, bottom, top] = sections[row]; const center = positions.length / 3;
    positions.push(0, (bottom + top) / 2, z); uv.push(0.5, row ? 1 : 0);
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      indices.push(...(row === 0 ? [center, a, a + 1] : [center, a + 1, a]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal'); const average = new THREE.Vector3();
  // Both sides of the longitudinal UV seam have the same smooth normal.
  for (let row = 0; row < sections.length; row++) {
    const a = row * (segments + 1), b = a + segments;
    average.fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, average.x, average.y, average.z); normals.setXYZ(b, average.x, average.y, average.z);
  }
  return geometry;
}

/** Project a fitting onto the actual triangles, including the coarse rival shell. */
function shellPoint(sections: readonly ShellSection[], segments: number, z: number, angle: number, offset = 0.006) {
  const row = Math.max(0, sections.findIndex((section, i) => i < sections.length - 1 && z >= section[0] && z <= sections[i + 1][0]));
  const u = THREE.MathUtils.clamp((z - sections[row][0]) / (sections[row + 1][0] - sections[row][0]), 0, 1);
  const sector = THREE.MathUtils.euclideanModulo(angle, Math.PI * 2) / (Math.PI * 2) * segments;
  const column = Math.floor(sector), v = sector - column;
  const point = (r: number, c: number) => {
    const [depth, bottom, top, width] = sections[r], theta = c / segments * Math.PI * 2;
    return new THREE.Vector3(Math.sin(theta) * width, (top + bottom) / 2 + Math.cos(theta) * (top - bottom) / 2, depth);
  };
  const a = point(row, column), b = point(row + 1, column), c = point(row, column + 1), d = point(row + 1, column + 1);
  const normal = u + v <= 1 ? b.clone().sub(a).cross(c.clone().sub(a)).normalize() : c.clone().sub(d).cross(b.clone().sub(d)).normalize();
  const position = u + v <= 1 ? a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v)
    : d.clone().addScaledVector(c.clone().sub(d), 1 - u).addScaledVector(b.clone().sub(d), 1 - v);
  return { position: position.addScaledVector(normal, offset), normal };
}

/** Cut the graphic against each shell triangle so a broad panel cannot cut corners. */
function shellOverlay(sections: readonly ShellSection[], segments: number, outline: [number, number][], side: number) {
  type UV = [number, number];
  const positions: number[] = [], uv: number[] = [];
  const clip = (polygon: UV[], a: UV, b: UV) => {
    const result: UV[] = [];
    const distance = (p: UV) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = distance(p), dq = distance(q);
      if (dp >= 0) result.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq); result.push([THREE.MathUtils.lerp(p[0], q[0], t), THREE.MathUtils.lerp(p[1], q[1], t)]);
      }
    }
    return result;
  };
  for (let row = 0; row < sections.length - 1; row++) for (let column = 0; column < segments / 2; column++) {
    const a: UV = [sections[row][0], column / segments * Math.PI * 2];
    const b: UV = [sections[row + 1][0], a[1]];
    const c: UV = [a[0], (column + 1) / segments * Math.PI * 2];
    const d: UV = [b[0], c[1]];
    for (const triangle of [[a, b, c], [c, b, d]]) {
      let polygon = outline;
      for (let edge = 0; edge < 3; edge++) polygon = clip(polygon, triangle[edge], triangle[(edge + 1) % 3]);
      if (polygon.length < 3) continue;
      const centerZ = triangle.reduce((sum, p) => sum + p[0], 0) / 3;
      const centerAngle = triangle.reduce((sum, p) => sum + p[1], 0) / 3;
      const normal = shellPoint(sections, segments, centerZ, centerAngle).normal;
      // Clip the positive side once; reflection keeps both graphics truly symmetric.
      const vertex = ([z, angle]: UV) => {
        const point = shellPoint(sections, segments, z, angle, 0).position.addScaledVector(normal, 0.006);
        positions.push(point.x * side, point.y, point.z); uv.push(z, angle);
      };
      for (let i = 1; i < polygon.length - 1; i++) {
        vertex(polygon[0]); vertex(polygon[side > 0 ? i : i + 1]); vertex(polygon[side > 0 ? i + 1 : i]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function batch(group: THREE.Group, materials: VehicleMaterials) {
  const parts = new Map<keyof VehicleMaterials, THREE.BufferGeometry[]>();
  return {
    add(key: keyof VehicleMaterials, geometry: THREE.BufferGeometry) {
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key)!.push(geometry);
    },
    finish() {
      for (const [key, geometries] of parts) {
        const geometry = merge(geometries);
        if (materials[key].vertexColors && !geometry.hasAttribute('color')) tintGeometry(geometry, '#ffffff');
        const mesh = new THREE.Mesh(geometry, materials[key]);
        mesh.name = `motorcycle-${key}`; group.add(mesh);
      }
    },
  };
}

/** Lean follows the interpolated steering pose, so pause and reset need no extra clock. */
export function motorcycleLean(speed: number, steering: number, driftAngle = 0) {
  speed = Math.abs(speed);
  const turnRate = Math.min(speed / 8, 1) * 1.2 / (1 + speed * 0.026);
  const lean = -steering * Math.min(0.65, Math.atan(speed * turnRate / 9.81));
  return THREE.MathUtils.clamp(lean + driftAngle * 0.18 * Math.min(1, speed / 10), -0.68, 0.68);
}

/** Two wheels, a leaning chassis and a helmeted rider. No textures or GPU work at construction. */
export class Motorcycle {
  readonly group = new THREE.Group();
  readonly suspension = new THREE.Group();
  readonly exhaust?: ExhaustFlames;
  readonly wheels: THREE.Group[] = [];
  readonly frontAxle = new THREE.Group();
  private readonly materials: VehicleMaterials;

  constructor(readonly vehicle: VehicleDefinition, detail: Detail = 'player', color = LIVERIES[0].color, accent = LIVERIES[0].accent) {
    this.materials = createVehicleMaterials(color, accent, detail);
    this.group.name = `motorcycle-${vehicle.id}`;
    this.group.scale.set(...vehicle.scale);
    this.group.add(this.suspension);
    const detailed = detail === 'player'; const enduro = vehicle.id === 'trail';
    const segments = detailed ? 16 : 8;
    const body = batch(this.suspension, this.materials);
    const box = (size: Point, p: Point) => new THREE.BoxGeometry(...size).translate(...p);
    const oval = (size: Point, p: Point) => {
      const small = Math.max(...size) < 0.2;
      return new THREE.SphereGeometry(1, detailed ? small ? 10 : 16 : 8, detailed ? small ? 6 : 10 : 6).scale(...size).translate(...p);
    };
    const bar = (a: Point, b: Point, radius: number) => {
      const start = new THREE.Vector3(...a); const end = new THREE.Vector3(...b);
      const direction = end.clone().sub(start);
      const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), detailed ? 8 : 5);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      return geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    };
    const limb = (a: Point, b: Point, startRadius: number, endRadius: number, depth = 1) => {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
      const direction = end.clone().sub(start); const length = direction.length();
      const profile = [[0, -length / 2 - startRadius * 0.25], [startRadius * 0.8, -length / 2],
        [startRadius, -length * 0.34], [(startRadius + endRadius) / 2, 0], [endRadius, length * 0.36],
        [endRadius * 0.7, length / 2], [0, length / 2 + endRadius * 0.25]];
      return new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), detailed ? 10 : 8)
        .scale(1, 1, depth).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
        .translate(...start.add(end).multiplyScalar(0.5).toArray());
    };
    const sidePanel = (points: number[][], width: number) => {
      // Profile lives in the Y/Z plane, with a narrow extrusion across the bike.
      const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
      return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSegments: 1,
        bevelSize: 0.035, bevelThickness: 0.035, steps: 1, curveSegments: 1 }).rotateY(Math.PI / 2).translate(-width / 2, 0, 0);
    };
    const curve = (points: Point[], radius: number, steps = detailed ? 12 : 6) => new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), steps, radius, detailed ? 6 : 4, false);

    body.add('trim', oval([0.26, 0.28, 0.34], [0, 0.63, 0.03])); // engine
    body.add('alloy', tintGeometry(bar([-0.3, 0.67, 0.02], [0.3, 0.67, 0.02], 0.18), '#77818a'));
    for (const side of [-1, 1]) {
      body.add('alloy', bar([side * 0.19, 0.62, 0.22], [side * 0.18, BIKE_WHEEL_RADIUS, BIKE_AXLES[1]], 0.055));
      body.add('accent', bar([side * 0.23, 0.69, 0.22], [side * 0.2, 1.13, -0.65], 0.045));
      body.add('accent', bar([side * 0.2, 1.13, -0.65], [side * 0.22, 0.98, 0.63], 0.04));
      body.add('alloy', bar([side * 0.2, 0.55, 0.27], [side * 0.42, 0.55, 0.27], 0.025)); // footpegs
    }
    const tankSections = smoothShell([[-0.66, 1.01, 1.13, 0.1], [-0.49, 0.99, 1.27, enduro ? 0.21 : 0.29],
      [-0.22, 1.01, 1.32, enduro ? 0.24 : 0.32], [0.08, 1.03, 1.24, 0.23], [0.27, 1.06, 1.14, 0.15]], detailed);
    body.add('paint', shell(tankSections, segments));
    body.add('trim', shell([[0.15, 1.08, 1.14, 0.16], [0.34, 1.08, 1.18, 0.21],
      [enduro ? 0.85 : 0.65, 1.13, 1.22, 0.18], [0.97, 1.17, 1.23, 0.12]], segments));
    const tailSections = smoothShell([[0.32, 0.99, 1.1, 0.18], [0.69, 1.07, 1.2, 0.23],
      [1.05, 1.14, 1.28, enduro ? 0.15 : 0.19], [1.26, 1.17, 1.22, 0.07]], detailed);
    body.add('paint', shell(tailSections, segments));
    for (const side of [-1, 1]) {
      body.add('accent', shellOverlay(tailSections, segments, [[0.66, Math.PI * 0.47], [1.19, Math.PI * 0.47],
        [1.19, Math.PI * 0.56], [0.66, Math.PI * 0.56]], side));
    }
    body.add('brake', box([0.19, 0.035, 0.03], [0, 1.185, 1.26]));
    body.add('trim', box([0.2, 0.19, 0.025], [0, 0.98, 1.25]));
    body.add('alloy', curve([[0.14, 0.62, -0.25], [0.18, 0.38, -0.24], [0.3, 0.4, 0.36], [0.35, enduro ? 0.85 : 0.57, 0.67]], 0.034));
    body.add('alloy', bar([0.35, enduro ? 0.77 : 0.55, 0.53], [0.35, enduro ? 0.97 : 0.59, 0.99], enduro ? 0.08 : 0.095));
    const exhaustPort = motorcycleExhaustPort(vehicle);
    body.add('trim', bar([exhaustPort[0], exhaustPort[1], exhaustPort[2] - 0.13], exhaustPort, 0.065));
    if (detailed) { this.exhaust = new ExhaustFlames([exhaustPort]); this.suspension.add(this.exhaust.group); }

    if (enduro) {
      body.add('paint', shell([[-1.43, 1.03, 1.06, 0.075], [-1.19, 1.035, 1.105, 0.16],
        [-0.89, 1.01, 1.085, 0.19], [-0.66, 1.0, 1.025, 0.09]], segments));
      body.add('paint', shell([[-0.96, 1.12, 1.38, 0.13], [-0.86, 1.1, 1.45, 0.205], [-0.73, 1.16, 1.42, 0.15]], segments));
      body.add('trim', box([0.19, 0.21, 0.023], [0, 1.265, -0.973]));
      for (const y of [1.22, 1.3]) body.add('light', box([0.135, 0.045, 0.012], [0, y, -0.988]));
      body.add('alloy', sidePanel([[-0.38, 0.48], [-0.28, 0.33], [0.28, 0.34], [0.37, 0.47]], 0.37));
      for (const side of [-1, 1]) {
        body.add('paint', sidePanel([[-0.62, 1.14], [-0.22, 1.21], [0.04, 1.02], [-0.17, 0.79], [-0.47, 0.87]], 0.035).translate(side * 0.235, 0, 0));
        body.add('accent', bar([side * 0.267, 1.07, -0.48], [side * 0.267, 0.92, -0.2], 0.026));
      }
    } else {
      const fairingSections = smoothShell([[-1.13, 1.08, 1.2, 0.13], [-0.94, 0.96, 1.34, 0.33],
        [-0.66, 0.62, 1.37, 0.37], [-0.41, 0.43, 1.16, 0.34], [-0.05, 0.39, 0.91, 0.29],
        [0.26, 0.47, 0.67, 0.19]], detailed);
      body.add('paint', shell(fairingSections, segments));
      // Open curved screen with a visible rim, instead of a solid oval blister.
      const screen = new THREE.SphereGeometry(1, segments, detailed ? 8 : 4, Math.PI * 1.13, Math.PI * 0.74, 0.28, 1.27);
      screen.scale(0.29, 0.34, 0.37).translate(0, 1.3, -0.47);
      body.add('glass', screen);
      for (const side of [-1, 1]) {
        body.add('trim', curve([[side * 0.095, 1.174, -1.125], [side * 0.205, 1.217, -1.052], [side * 0.289, 1.247, -0.966]], 0.045));
        body.add('light', curve([[side * 0.09, 1.19, -1.185], [side * 0.205, 1.233, -1.118], [side * 0.29, 1.263, -1.026]], 0.013));
        body.add('trim', shellOverlay(fairingSections, segments, [[-0.62, Math.PI * 0.38], [0.12, Math.PI * 0.54],
          [0.12, Math.PI * 0.69], [-0.62, Math.PI * 0.6]], side));
        body.add('accent', shellOverlay(fairingSections, segments, [[-0.77, Math.PI * 0.3], [0.05, Math.PI * 0.48],
          [0.05, Math.PI * 0.525], [-0.77, Math.PI * 0.345]], side));
        if (detailed) for (const z of [-0.58, -0.28, 0.035]) {
          const sample = shellPoint(fairingSections, segments, z, side * Math.PI * 0.69, 0.009);
          body.add('alloy', tintGeometry(new THREE.CircleGeometry(0.011, 6)
            .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sample.normal))
            .translate(...sample.position.toArray()), '#7a8791'));
        }
        body.add('trim', bar([side * 0.23, 1.42, -0.63], [side * 0.46, 1.43, -0.72], 0.017));
        body.add('paint', oval([0.087, 0.047, 0.11], [side * 0.48, 1.43, -0.73]));
        if (detailed) body.add('glass', oval([0.073, 0.035, 0.016], [side * 0.48, 1.433, -0.625]));
      }
      body.add('trim', sidePanel([[-0.39, 0.47], [0.28, 0.53], [0.28, 0.44], [-0.12, 0.36], [-0.36, 0.39]], 0.34));
    }

    // Rider leans with the chassis: boots on pegs, knees at the tank, hands on grips.
    const shoulderY = enduro ? 1.77 : 1.62; const shoulderZ = enduro ? -0.05 : -0.27;
    const gripY = enduro ? 1.41 : 1.28;
    body.add('trim', oval([0.225, 0.13, 0.2], [0, 1.27, 0.35]));
    body.add('trim', limb([0, 1.31, 0.32], [0, shoulderY - 0.055, shoulderZ + 0.09], 0.18, 0.25, 0.68));
    body.add('trim', limb([0, shoulderY - 0.01, shoulderZ - 0.025], [0, shoulderY + 0.115, shoulderZ - 0.07], 0.083, 0.072));
    body.add('paint', oval([0.18, 0.21, 0.22], [0, shoulderY + 0.23, shoulderZ - 0.1]));
    const helmetBand = (thetaStart: number, thetaLength: number, size: Point) => new THREE.SphereGeometry(1,
      segments, detailed ? 5 : 3, Math.PI * 1.04, Math.PI * 0.92, thetaStart, thetaLength)
      .scale(...size).translate(0, shoulderY + 0.23, shoulderZ - 0.1);
    body.add('trim', helmetBand(1.08, 0.65, [0.187, 0.217, 0.227]));
    body.add('glass', helmetBand(1.13, 0.46, [0.189, 0.219, 0.23]));
    body.add('paint', oval([0.135, 0.043, 0.075], [0, shoulderY + 0.088, shoulderZ - 0.258]));
    if (enduro) body.add('trim', shell([[shoulderZ - 0.41, shoulderY + 0.36, shoulderY + 0.38, 0.12],
      [shoulderZ - 0.16, shoulderY + 0.38, shoulderY + 0.41, 0.18]], segments));
    for (const side of [-1, 1]) {
      body.add('trim', limb([side * 0.18, 1.26, 0.37], [side * 0.35, 0.89, -0.02], 0.123, 0.092, 0.85));
      body.add('trim', limb([side * 0.35, 0.89, -0.02], [side * 0.33, 0.56, 0.31], 0.087, 0.064));
      body.add('accent', oval([0.055, 0.09, 0.08], [side * 0.415, 0.89, -0.03])); // knee sliders
      body.add('trim', oval([0.091, 0.08, 0.18], [side * 0.34, 0.54, 0.22]));
      body.add('trim', limb([side * 0.2, shoulderY - 0.055, shoulderZ + 0.055], [side * 0.36, gripY + 0.09, -0.3], 0.088, 0.066));
      body.add('trim', limb([side * 0.36, gripY + 0.09, -0.3], [side * 0.43, gripY, -0.66], 0.069, 0.046));
      body.add('trim', oval([0.065, 0.054, 0.075], [side * 0.43, gripY, -0.66]));
      body.add('accent', oval([0.046, 0.018, 0.045], [side * 0.43, gripY + 0.05, -0.66]));
      if (detailed) {
        body.add('accent', oval([0.065, 0.026, 0.073], [side * 0.21, shoulderY + 0.016, shoulderZ + 0.045]));
        body.add('trim', oval([0.073, 0.075, 0.074], [side * 0.36, gripY + 0.06, -0.3]));
        body.add('alloy', box([0.017, 0.024, 0.12], [side * 0.431, 0.59, 0.23]));
        body.add('accent', curve(Array.from({ length: 9 }, (_, i): Point => {
          const theta = THREE.MathUtils.lerp(-0.7, 1.48, i / 8);
          return [side * 0.059, shoulderY + 0.23 + Math.cos(theta) * 0.202, shoulderZ - 0.1 + Math.sin(theta) * 0.212];
        }), 0.007, 12));
      }
    }
    if (detailed) {
      const hip = new THREE.Vector3(0, 1.31, 0.32), shoulder = new THREE.Vector3(0, shoulderY - 0.055, shoulderZ + 0.09);
      const axis = shoulder.clone().sub(hip).normalize(); const back = new THREE.Vector3(0, -axis.z, axis.y);
      if (!enduro) {
        const hump = hip.clone().lerp(shoulder, 0.67).addScaledVector(back, 0.155);
        body.add('trim', new THREE.SphereGeometry(1, 12, 8).scale(0.105, 0.15, 0.052)
          .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)).translate(...hump.toArray()));
      }
      for (const side of [-1, 1]) body.add('accent', curve([0.15, 0.5, 0.83].map(t => {
        const radius = THREE.MathUtils.lerp(0.18, 0.25, t);
        const point = hip.clone().lerp(shoulder, t).addScaledVector(back, Math.sqrt(radius ** 2 - 0.12 ** 2) * 0.68 + 0.007); point.x = side * 0.12;
        return point.toArray() as Point;
      }), 0.011, 6));
      body.add('alloy', new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16).translate(0, 1.327, -0.22));
      body.add('trim', box([0.08, 0.012, 0.024], [0, 1.335, -0.22]));
      for (const z of [0.65, 0.9]) body.add('trim', bar([0.35, (enduro ? 0.97 : 0.59) - 0.075, z], [0.35, (enduro ? 0.97 : 0.59) + 0.075, z], 0.011));
      for (const side of [-1, 1]) {
        for (const y of [0.58, 0.64, 0.7, 0.76]) body.add('alloy', box([0.012, 0.015, 0.26], [side * 0.265, y, 0.01]));
      }
      body.add('trim', curve([[-0.16, 0.57, 0.2], [-0.16, 0.57, 1.03], [-0.16, 0.27, 1.03], [-0.16, 0.46, 0.2], [-0.16, 0.57, 0.2]], 0.015, 20));
      body.add('alloy', new THREE.RingGeometry(0.07, 0.14, segments).rotateY(-Math.PI / 2).translate(-0.158, BIKE_WHEEL_RADIUS, BIKE_AXLES[1]));
      body.add('accent', curve(Array.from({ length: 37 }, (_, i): Point => [Math.cos(i / 36 * Math.PI * 10) * 0.065,
        0.66 + i / 36 * 0.29, 0.48 + Math.sin(i / 36 * Math.PI * 10) * 0.065]), 0.015, 48));
    }
    body.finish();

    this.frontAxle.position.set(0, BIKE_WHEEL_RADIUS, BIKE_AXLES[0]);
    this.suspension.add(this.frontAxle);
    const fork = batch(this.frontAxle, this.materials);
    for (const side of [-1, 1]) {
      fork.add('alloy', bar([side * 0.15, 0, 0], [side * 0.15, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.032));
      fork.add('alloy', tintGeometry(bar([side * 0.15, 0.29, 0.12], [side * 0.15, gripY - BIKE_WHEEL_RADIUS - 0.09, 0.32], 0.046), enduro ? '#727e86' : '#b68b50'));
      fork.add('trim', bar([side * 0.32, gripY - BIKE_WHEEL_RADIUS, 0.36], [side * 0.51, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.036));
      if (enduro) fork.add('alloy', curve([[side * 0.3, gripY - BIKE_WHEEL_RADIUS, 0.23], [side * 0.46, gripY - BIKE_WHEEL_RADIUS + 0.025, 0.21],
        [side * 0.53, gripY - BIKE_WHEEL_RADIUS, 0.36]], 0.025));
      if (detailed) {
        fork.add('alloy', bar([side * 0.35, gripY - BIKE_WHEEL_RADIUS - 0.035, 0.28], [side * 0.49, gripY - BIKE_WHEEL_RADIUS - 0.035, 0.26], 0.013));
        fork.add('trim', box([0.055, 0.13, 0.085], [side * 0.084, 0.01, 0.17]));
      }
    }
    if (!enduro) fork.add('trim', shell([[-0.31, 0.31, 0.34, 0.06], [-0.18, 0.4, 0.46, 0.135],
      [0, 0.435, 0.49, 0.15], [0.23, 0.36, 0.41, 0.12], [0.31, 0.28, 0.31, 0.07]], segments));
    if (detailed) {
      fork.add('trim', box([0.2, 0.09, 0.055], [0, gripY - BIKE_WHEEL_RADIUS + 0.07, 0.3]));
      fork.add('alloy', box([0.16, 0.055, 0.01], [0, gripY - BIKE_WHEEL_RADIUS + 0.075, 0.335]));
    }
    fork.add('alloy', bar([-0.4, gripY - BIKE_WHEEL_RADIUS, 0.36], [0.4, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.025));
    fork.finish();

    // Narrow rounded tyres with open rims. Wheels share geometry and spin on X.
    const tyreParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.31, 0.11, detailed ? 10 : 6, detailed ? 28 : 16).rotateY(Math.PI / 2)];
    const rimParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.245, 0.021, 5, segments).rotateY(Math.PI / 2),
      bar([-0.13, 0, 0], [0.13, 0, 0], 0.07)];
    const spokeCount = enduro ? detailed ? 20 : 12 : 6;
    for (let spoke = 0; spoke < spokeCount; spoke++) {
      const angle = spoke * Math.PI * 2 / spokeCount;
      const rootAngle = angle + (enduro ? (spoke % 2 ? 0.48 : -0.48) : -0.24);
      rimParts.push(bar([enduro ? (spoke % 2 ? 0.045 : -0.045) : 0, Math.cos(rootAngle) * 0.065, Math.sin(rootAngle) * 0.065],
        [0, Math.cos(angle) * 0.245, Math.sin(angle) * 0.245], enduro ? 0.007 : 0.018));
    }
    for (const side of [-1, 1]) {
      rimParts.push(tintGeometry(new THREE.RingGeometry(0.095, 0.19, segments).rotateY(side * Math.PI / 2).translate(side * 0.065, 0, 0), '#68747c'));
      if (detailed) for (let hole = 0; hole < 12; hole++) {
        const angle = hole / 12 * Math.PI * 2;
        rimParts.push(tintGeometry(new THREE.CircleGeometry(0.01, 5).rotateY(side * Math.PI / 2).translate(side * 0.067, Math.cos(angle) * 0.161, Math.sin(angle) * 0.161), '#222d34'));
      }
    }
    if (enduro) for (let tread = 0; tread < 20; tread++) {
      const angle = tread / 20 * Math.PI * 2;
      tyreParts.push(new THREE.BoxGeometry(0.14, 0.023, 0.055).translate(0, 0.409, 0).rotateX(angle));
    }
    const tyre = merge(tyreParts); const rim = merge(rimParts);
    for (const z of BIKE_AXLES) {
      const wheel = new THREE.Group(); wheel.name = z < 0 ? 'front-wheel' : 'rear-wheel';
      const tyreMesh = new THREE.Mesh(tyre, this.materials.rubber);
      tyreMesh.scale.x = z < 0 ? 0.84 : enduro ? 1.06 : 1.22;
      wheel.add(tyreMesh, new THREE.Mesh(rim, this.materials.alloy));
      if (z < 0) this.frontAxle.add(wheel);
      else { wheel.position.set(0, BIKE_WHEEL_RADIUS, z); this.suspension.add(wheel); }
      this.wheels.push(wheel);
    }
    // Feathered contact shadow stays flat while the motorcycle leans.
    const shadowGeometry = new THREE.CircleGeometry(1, 20);
    const colors = new Float32Array(shadowGeometry.getAttribute('position').count * 4);
    for (let i = 0; i < colors.length / 4; i++) colors.set([0.03, 0.04, 0.035, i === 0 ? 0.45 : 0], i * 4);
    shadowGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    shadowGeometry.scale(0.75, 1.65, 1).rotateX(-Math.PI / 2).translate(0, 0.025, 0);
    const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    shadow.name = 'motorcycle-shadow'; this.group.add(shadow);
  }

  setLivery(index: number) {
    this.materials.paint.color.set(LIVERIES[index].color);
    this.materials.accent.color.set(LIVERIES[index].accent);
  }

  update(speed: number, steering: number, driftAngle: number, brake: boolean, rearBrake: boolean, dt: number) {
    this.wheels.forEach((wheel, index) => {
      if (!rearBrake || index === 0) wheel.rotation.x -= speed * dt / (BIKE_WHEEL_RADIUS * this.vehicle.scale[1]);
    });
    this.frontAxle.rotation.y = THREE.MathUtils.clamp(-steering * 0.25 - driftAngle * 0.5, -0.4, 0.4);
    this.suspension.rotation.z = motorcycleLean(speed, steering, driftAngle);
    this.suspension.position.y = 0.11 * (1 - Math.cos(this.suspension.rotation.z));
    this.materials.brake.emissiveIntensity = brake || rearBrake ? 2.8 : 0.3;
  }
}
