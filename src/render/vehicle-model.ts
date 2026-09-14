import * as THREE from 'three';
import type { VehicleDefinition } from '../content/vehicles';
import { mergeVehicleGeometry as merge, tintGeometry, vehicleSurface as surface } from './vehicle-geometry';

type Point = [number, number, number];
type Detail = 'player' | 'rival';
const AXLES = [-1.3, 1.29];
const FRONT = -2.16;
const REAR = 2.12;
const ARCH = 0.59;
const BODY_COLUMNS = 12;
export const WHEEL_RADIUS = 0.46;
const EXHAUST_X = 0.68; const EXHAUST_Y = 0.445; const EXHAUST_Z = 2.238;
// Tail fittings are bent by roundEnds along with the bumper. Flame origins use
// the same final outlet coordinates, before the selected vehicle's root scale.
export const CAR_EXHAUST_PORTS: readonly Point[] = [-1, 1].map(side =>
  [side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z - 0.16 * (EXHAUST_X / 1.1) ** 4]);

/** Bevelled small fittings; the body itself is a continuous, wheel-cut surface. */
function fitting(size: Point, position: Point, radius = 0.02) {
  const [w, h, d] = size; const r = Math.min(radius, w / 3, h / 3, d / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2 + r);
  shape.lineTo(w / 2 - r, -h / 2 + r); shape.lineTo(w / 2 - r, h / 2 - r);
  shape.lineTo(-w / 2 + r, h / 2 - r); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, steps: 1, bevelEnabled: true,
    bevelSegments: 2, bevelSize: r, bevelThickness: r, curveSegments: 1 }).translate(position[0], position[1], position[2] - d / 2 + r);
}

function tube(points: Point[], radius: number, segments = 12) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false);
}

/** Tapered mirror housing with a recessed, oval rear face and a continuous rim. */
function wingMirror(side: number, low: boolean, detailed: boolean) {
  const columns = detailed ? 16 : 8, height = low ? 0.061 : 0.076;
  const center: Point = [side * 1.115, 1.27, -0.7];
  const outline = (angle: number, radius: number, depth: number): Point => {
    const x = Math.cos(angle) * 0.171 * radius;
    return [center[0] + side * x, center[1] + Math.sin(angle) * height * radius,
      center[2] + depth - x * 0.16];
  };
  const shell = surface(detailed ? 5 : 2, columns, (u, v) => {
    const angle = u * Math.PI * 0.66;
    return outline(v * Math.PI * 2, Math.sin(angle), -0.145 * Math.cos(angle));
  }, side > 0);
  const edgeRadius = Math.sin(Math.PI * 0.66), edgeDepth = -0.145 * Math.cos(Math.PI * 0.66);
  const rim = surface(1, columns, (u, v) => outline(v * Math.PI * 2,
    THREE.MathUtils.lerp(edgeRadius, edgeRadius * 0.8, u), edgeDepth - u * 0.005), side > 0);
  const lens = surface(detailed ? 2 : 1, columns, (u, v) => outline(v * Math.PI * 2,
    edgeRadius * 0.8 * u, edgeDepth - 0.005 - (1 - u * u) * 0.006), side < 0);
  for (const geometry of [shell, lens]) {
    // Each patch starts at one pole: retain a fan, removing its zero-area triangles.
    geometry.setIndex(Array.from(geometry.index!.array).filter((_, i) => i >= columns * 6 || i % 6 >= 3));
    const normals = geometry.getAttribute('normal'), normal = new THREE.Vector3(), other = new THREE.Vector3();
    for (let i = 0; i <= columns; i++) normal.add(other.fromBufferAttribute(normals, i));
    normal.normalize();
    for (let i = 0; i <= columns; i++) normals.setXYZ(i, normal.x, normal.y, normal.z);
    // Keep the longitudinal UV seam out of the painted and reflective highlights.
    for (let start = columns + 1; start < normals.count; start += columns + 1) {
      normal.fromBufferAttribute(normals, start).add(other.fromBufferAttribute(normals, start + columns)).normalize();
      normals.setXYZ(start, normal.x, normal.y, normal.z); normals.setXYZ(start + columns, normal.x, normal.y, normal.z);
    }
  }
  return { shell, rim, lens };
}

/** Closed wing with a rounded nose, tapered trailing edge and slightly raised tips. */
function airfoil(width: number, chord: number, thickness: number, position: Point, detailed: boolean) {
  const columns = detailed ? 12 : 8;
  const point = (span: number, turn: number): Point => {
    const angle = turn * Math.PI * 2, depth = (1 - Math.cos(angle)) / 2;
    return [position[0] + span * width / 2,
      position[1] + Math.sin(angle) * thickness * (1 - depth * 0.65) / 2 + chord * depth * 0.1 + 0.018 * span ** 4,
      position[2] + (depth - 0.5) * chord];
  };
  const skin = surface(detailed ? 6 : 1, columns, (u, v) => point(u * 2 - 1, v), true);
  const normals = skin.getAttribute('normal'), normal = new THREE.Vector3(), other = new THREE.Vector3();
  for (let start = 0; start < normals.count; start += columns + 1) {
    normal.fromBufferAttribute(normals, start).add(other.fromBufferAttribute(normals, start + columns)).normalize();
    normals.setXYZ(start, normal.x, normal.y, normal.z); normals.setXYZ(start + columns, normal.x, normal.y, normal.z);
  }
  const patches = [skin];
  for (const side of [-1, 1]) patches.push(surface(1, columns, (u, v) => {
    const p = point(side, v), centerY = position[1] + chord * 0.05 + 0.018;
    return [p[0], THREE.MathUtils.lerp(centerY, p[1], u), THREE.MathUtils.lerp(position[2], p[2], u)];
  }, side < 0));
  return merge(patches);
}

function profile(z: number, vehicle: VehicleDefinition) {
  const flare = Math.max(...AXLES.map(axle => Math.exp(-(((z - axle) / 0.48) ** 2))));
  const end = THREE.MathUtils.smoothstep(Math.abs(z), 1.7, 2.17);
  const flareWidth = vehicle.id === 'swift' ? 0.085 : vehicle.body === 'supercar' ? (z > 0 ? 0.19 : 0.15)
    : vehicle.body === 'coupe' ? (z > 0 ? 0.165 : 0.145) : vehicle.body === 'muscle' ? 0.15 : 0.125;
  return { width: 1.005 + flare * flareWidth - end * 0.11,
    top: 1.13 + flare * 0.055 - end * 0.12 };
}

function section(z: number, vehicle: VehicleDefinition): Point[] {
  const { width: w, top } = profile(z, vehicle);
  const bottom = Math.max(0.4, ...AXLES.map(axle => 0.4 + Math.sqrt(Math.max(0, ARCH ** 2 - (z - axle) ** 2))));
  const shoulder = top - 0.06;
  const waist = 0.026 * (1 - Math.max(...AXLES.map(axle => Math.exp(-(((z - axle) / 0.52) ** 2)))))
    + (vehicle.body === 'supercar' ? 0.085 * Math.exp(-(((z - 0.63) / 0.24) ** 2)) : 0);
  const half: Point[] = [[-w + 0.06, bottom, z], [-w + waist, bottom + (shoulder - bottom) * 0.4, z],
    [-w, shoulder - 0.025, z], [-w + 0.06, shoulder + 0.035, z], [-w * 0.78, top + 0.027, z],
    [-w * 0.46, top + 0.012, z], [0, top + (vehicle.body === 'coupe' ? 0.06 : 0.045), z]];
  return [...half, ...half.slice(0, -1).reverse().map(([x, y, depth]): Point => [-x, y, depth])];
}

/** All decals and panel gaps sample the same cross-section as the sheet metal. */
function bonnetY(x: number, z: number, vehicle: VehicleDefinition) {
  const half = section(z, vehicle).slice(3, BODY_COLUMNS / 2 + 1); const target = -Math.abs(x);
  const index = Math.max(0, half.findIndex((p, i) => i < half.length - 1 && target >= p[0] && target <= half[i + 1][0]));
  const a = half[index], b = half[index + 1];
  return THREE.MathUtils.lerp(a[1], b[1], THREE.MathUtils.clamp((target - a[0]) / (b[0] - a[0]), 0, 1));
}

function sidePoint(y: number, z: number, side: number, vehicle: VehicleDefinition, offset = 0.006): Point {
  const edge = section(z, vehicle);
  const index = Math.max(0, edge.slice(0, 3).findIndex((p, i) => y >= p[1] && y <= edge[i + 1][1]));
  const a = edge[index], b = edge[index + 1];
  const x = -THREE.MathUtils.lerp(a[0], b[0], THREE.MathUtils.clamp((y - a[1]) / (b[1] - a[1]), 0, 1));
  return [side * (x + offset), y, z];
}

export function buildDoorDecalGeometry(vehicle: VehicleDefinition, side: number) {
  // UV X is horizontal from either side; the race number must never be mirrored.
  return surface(4, 8, (u, v) => sidePoint(0.735 + u * 0.27, -0.05 - side * (v - 0.5) * 0.54, side, vehicle), true);
}

function cap(points: Point[], front: boolean, detailed: boolean) {
  // Interior subdivisions let the bumper bow across its width along with the lamps.
  const half = BODY_COLUMNS / 2;
  return surface(detailed ? half * 2 : half, detailed ? 16 : 8, (u, v) => {
    const edge = Math.min(half - 1, Math.floor(u * half)); const t = u * half - edge;
    const width = -THREE.MathUtils.lerp(points[edge][0], points[edge + 1][0], t);
    const y = THREE.MathUtils.lerp(points[edge][1], points[edge + 1][1], t);
    return [(v * 2 - 1) * width, y, points[0][2]];
  }, !front);
}

function face(points: [number, number][], z: number, front = false) {
  // Vertical strips follow the curved bumper. A single large triangle cuts
  // through the bowed body and makes the grille/lights disappear in patches.
  const clip = (polygon: [number, number][], edge: number, keepRight: boolean) => {
    const result: [number, number][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = keepRight ? a[0] >= edge : a[0] <= edge;
      const insideB = keepRight ? b[0] >= edge : b[0] <= edge;
      if (insideA) result.push(a);
      if (insideA !== insideB) result.push([edge, THREE.MathUtils.lerp(a[1], b[1], (edge - a[0]) / (b[0] - a[0]))]);
    }
    return result;
  };
  const min = Math.min(...points.map(p => p[0])), max = Math.max(...points.map(p => p[0]));
  const strips = Math.ceil((max - min) / 0.085); const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < strips; i++) {
    const polygon = clip(clip(points, THREE.MathUtils.lerp(min, max, i / strips), true), THREE.MathUtils.lerp(min, max, (i + 1) / strips), false);
    if (polygon.length < 3) continue;
    const shape = new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(front ? -x : x, y)));
    const geometry = new THREE.ShapeGeometry(shape);
    if (front) geometry.rotateY(Math.PI);
    parts.push(geometry.translate(0, 0, z));
  }
  return merge(parts);
}

/** Wrap the nose and tail around the corners, including lights and bumper fittings. */
function roundEnds(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position'); const normals = geometry.getAttribute('normal');
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i); const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp((Math.abs(z) - 1.7) / 0.46, 0, 1);
    if (t === 0) continue;
    const ease = t * t * (3 - 2 * t); const width = (x / 1.1) ** 4;
    positions.setZ(i, z - Math.sign(z) * 0.16 * ease * width);
    // Inverse-transpose of the bend preserves the original smooth vertex normals.
    const dx = -Math.sign(z) * 0.16 * ease * 4 * x ** 3 / 1.1 ** 4;
    const dz = 1 - 0.16 * width * 6 * t * (1 - t) / 0.46;
    normal.fromBufferAttribute(normals, i);
    normal.set(normal.x - dx / dz * normal.z, normal.y, normal.z / dz).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return geometry;
}

export function createVehicleMaterials(color: THREE.ColorRepresentation, accent: THREE.ColorRepresentation, detail: Detail = 'player') {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.42, roughness: 0.26,
      clearcoat: detail === 'player' ? 1 : 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.37, metalness: 0.22 }),
    trim: new THREE.MeshStandardMaterial({ color: '#171c20', roughness: 0.63, metalness: 0.14 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#29414d', roughness: 0.15, metalness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3, vertexColors: true }),
    alloy: new THREE.MeshStandardMaterial({ color: '#abb3bd', roughness: 0.32, metalness: 0.85, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: '#16191b', roughness: 0.94, metalness: 0 }),
    light: new THREE.MeshStandardMaterial({ color: '#d9efff', roughness: 0.18, metalness: 0.35, emissive: '#b5d9ff', emissiveIntensity: 0.65 }),
    brake: new THREE.MeshStandardMaterial({ color: '#6e101a', roughness: 0.24, metalness: 0.2, emissive: '#ff2436', emissiveIntensity: 0.3 }),
  };
}
export type VehicleMaterials = ReturnType<typeof createVehicleMaterials>;

/** Batched by material: more sculpted surfaces without one draw call per fitting. */
export function buildVehicleBody(vehicle: VehicleDefinition, materials: VehicleMaterials, detail: Detail = 'player') {
  const group = new THREE.Group(); const detailed = detail === 'player';
  // Car wheels provide shoulder-tread tints; motorcycle tyres share the factory only.
  materials.rubber.vertexColors = true;
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (key: keyof VehicleMaterials, geometry: THREE.BufferGeometry) => {
    const material = materials[!detailed && key === 'accent' ? 'paint' : !detailed && key === 'alloy' ? 'trim' : key];
    const batch = parts.get(material) ?? []; batch.push(geometry); parts.set(material, batch);
  };
  const truck = vehicle.body === 'truck', suv = vehicle.body === 'suv', muscle = vehicle.body === 'muscle';
  const supercar = vehicle.body === 'supercar', coupe = vehicle.body === 'coupe' || supercar;
  const utility = truck || suv;
  // A continuous shoulder/bonnet/quarter-panel shell with genuine open wheel wells.
  add('paint', surface(detailed ? 96 : muscle || supercar || suv ? 32 : 40, BODY_COLUMNS, (u, v) => section(THREE.MathUtils.lerp(FRONT, REAR, u), vehicle)[Math.round(v * BODY_COLUMNS)]));
  add('paint', cap(section(FRONT, vehicle), true, detailed)); add('paint', cap(section(REAR, vehicle), false, detailed));
  add('trim', fitting([1.5, 0.1, 3.65], [0, 0.43, 0], 0.035));
  for (const side of [-1, 1]) for (const axle of AXLES) {
    // A rolled lip and dark inner return follow the cutout instead of covering the tyre.
    for (const [key, inner, outer] of [[utility ? 'trim' : 'paint', ARCH, ARCH + 0.065], ['trim', ARCH - 0.02, ARCH]] as const) {
      add(key, surface(detailed ? 28 : 12, 2, (u, v) => {
        const theta = u * Math.PI; const radius = THREE.MathUtils.lerp(inner, outer, v);
        const z = axle - Math.cos(theta) * radius;
        return [side * (profile(z, vehicle).width + 0.007 + Math.sin(v * Math.PI) * 0.015), 0.4 + Math.sin(theta) * radius, z];
      }, side > 0));
    }
    if (utility && detailed) for (const angle of [0.55, Math.PI / 2, Math.PI - 0.55]) {
      const z = axle - Math.cos(angle) * (ARCH + 0.033);
      add('alloy', tintGeometry(new THREE.CircleGeometry(0.012, 6).rotateY(side * Math.PI / 2)
        .translate(side * (profile(z, vehicle).width + 0.027), 0.4 + Math.sin(angle) * (ARCH + 0.033), z), '#68757b'));
    }
  }

  const frontBase = muscle ? -0.72 : supercar ? -1.1 : utility ? -1.02 : -0.96;
  const roofFront = muscle ? -0.08 : supercar ? -0.56 : suv ? -0.67 : coupe ? -0.28 : truck ? -0.48 : -0.44;
  const roofRear = muscle ? 0.62 : supercar ? 0.26 : suv ? 1.35 : truck ? 0.22 : coupe ? 0.58 : vehicle.id === 'swift' ? 1.02 : 0.9;
  const rearBase = muscle ? 1.5 : supercar ? 1.19 : suv ? 1.76 : truck ? 0.49 : coupe ? 1.68 : 1.72;
  const roofHeight = suv ? 1.94 : muscle ? 1.67 : supercar ? 1.59 : truck ? 1.77 : coupe ? 1.6 : 1.69;
  const belt = 1.145; const bottomWidth = 0.89; const roofWidth = suv ? 0.8 : muscle ? 0.77 : coupe ? 0.715 : 0.735;
  const roofY = (z: number) => roofHeight + 0.05 * Math.sin((z - roofFront) / (roofRear - roofFront) * Math.PI);
  const roofEdgeAt = (z: number) => roofY(z) - 0.055;
  const roofEdge = roofHeight - 0.055;
  const frontGlass = (u: number, v: number): Point => {
    const x = v * 2 - 1;
    return [x * THREE.MathUtils.lerp(bottomWidth, roofWidth, u),
      THREE.MathUtils.lerp(belt, roofEdge, u) + (1 - x * x) * 0.035,
      THREE.MathUtils.lerp(frontBase, roofFront, u) - (1 - x * x) * 0.022];
  };
  const rearGlass = (u: number, v: number): Point => {
    const x = v * 2 - 1;
    return [x * THREE.MathUtils.lerp(roofWidth, bottomWidth, u),
      THREE.MathUtils.lerp(roofEdge, belt, u) + (1 - x * x) * 0.035,
      THREE.MathUtils.lerp(roofRear, rearBase, u) + (1 - x * x) * 0.022];
  };
  add('glass', surface(detailed ? 8 : 3, detailed ? 12 : 6, frontGlass));
  add('glass', surface(detailed ? 8 : 3, detailed ? 12 : 6, rearGlass));
  if (detailed) {
    for (const edge of [0, 1]) {
      add('trim', tube(Array.from({ length: 9 }, (_, i): Point => {
        const [x, y, z] = frontGlass(edge, i / 8); return [x, y + 0.003, z - 0.006];
      }), 0.013, 8));
      add('trim', tube(Array.from({ length: 9 }, (_, i): Point => {
        const [x, y, z] = rearGlass(edge, i / 8); return [x, y + 0.003, z + 0.006];
      }), 0.011, 8));
    }
    // Parked blades and their arms use each vehicle's actual windscreen rake.
    const glazingPoint = (sample: (u: number, v: number) => Point, u: number, v: number, rear = false): Point => {
      const [x, y, z] = sample(u, v); return [x, y + 0.009, z + (rear ? 0.009 : -0.009)];
    };
    add('trim', surface(1, 12, (u, v) => glazingPoint(frontGlass, u * 0.035, v)));
    for (const offset of [0.09, 0.55]) {
      add('trim', tube(Array.from({ length: 7 }, (_, i) => glazingPoint(frontGlass,
        0.19 - i / 6 * 0.09, offset + i / 6 * 0.34)), 0.008, 6));
      add('trim', tube([glazingPoint(frontGlass, 0.035, offset + 0.08),
        glazingPoint(frontGlass, 0.15, offset + 0.17)], 0.006, 1));
    }
    if (vehicle.body === 'hatch' || suv) {
      add('trim', tube(Array.from({ length: 7 }, (_, i) => glazingPoint(rearGlass,
        0.84 + i / 6 * 0.035, 0.44 + i / 6 * 0.32, true)), 0.008, 6));
      add('trim', tube([glazingPoint(rearGlass, 0.97, 0.5, true),
        glazingPoint(rearGlass, 0.857, 0.6, true)], 0.007, 1));
      add('brake', surface(1, 6, (u, v) => {
        const [x, y, z] = rearGlass(0.065 + u * 0.028, 0.39 + v * 0.22);
        return [x, y + 0.011, z + 0.012];
      }));
    }
  }
  add('paint', surface(detailed ? 12 : 4, detailed ? 12 : 6, (u, v) => {
    const x = v * 2 - 1; const z = THREE.MathUtils.lerp(roofFront, roofRear, u);
    return [x * roofWidth, roofY(z) - 0.055 * x ** 4, z];
  }));
  for (const side of [-1, 1]) {
    const frontBottom: Point = [side * bottomWidth, belt, frontBase];
    const frontTop: Point = [side * roofWidth, roofEdge, roofFront];
    const backTop: Point = [side * roofWidth, roofEdge, roofRear];
    const backBottom: Point = [side * bottomWidth, belt, rearBase];
    add('glass', surface(detailed ? 12 : 4, 4, (u, v) => {
      const lowerZ = THREE.MathUtils.lerp(frontBase, rearBase, u);
      const upperZ = THREE.MathUtils.lerp(roofFront, roofRear, u);
      return [side * (THREE.MathUtils.lerp(bottomWidth, roofWidth, v) + Math.sin(v * Math.PI) * 0.012),
        THREE.MathUtils.lerp(belt, roofEdgeAt(upperZ), v), THREE.MathUtils.lerp(lowerZ, upperZ, v)];
    }, side > 0));
    add('paint', tube([frontBottom, frontTop], 0.042, 1));
    add('paint', tube([backTop, backBottom], truck ? 0.052 : 0.065, 1));
    // A tapered rear pillar joins the roof to the quarter panel, framing the glass.
    add('paint', surface(detailed ? 8 : 3, 1, (u, v) => [
      side * (THREE.MathUtils.lerp(roofWidth, bottomWidth, u) + Math.sin(u * Math.PI) * 0.012 + 0.008),
      THREE.MathUtils.lerp(roofEdge, belt, u),
      THREE.MathUtils.lerp(roofRear, rearBase, u) - v * (truck ? 0.07 : coupe ? 0.11 + u * 0.17 : 0.09 + u * 0.14),
    ], side < 0));
    add('paint', tube(Array.from({ length: 5 }, (_, i): Point => {
      const z = THREE.MathUtils.lerp(roofFront, roofRear, i / 4);
      return [side * roofWidth, roofEdgeAt(z), z];
    }), 0.028, detailed ? 10 : 4));
    add('trim', tube([frontBottom, backBottom], 0.021, 1));
    const pillarZ = supercar ? 0.06 : truck ? -0.025 : coupe ? 0.48 : 0.3;
    add('trim', tube([[side * (bottomWidth + 0.007), belt, pillarZ], [side * (roofWidth + 0.008), roofEdgeAt(pillarZ), pillarZ]], 0.035, 1));
    // Slim rocker, aerodynamic mirror, flush handle and restrained team stripe.
    add('trim', fitting([0.12, 0.115, 1.4], [side * 1.015, 0.435, 0], 0.025));
    add('accent', surface(detailed ? 20 : 8, 1, (u, v) => {
      const z = THREE.MathUtils.lerp(-0.64, 0.63, u);
      const y = 0.52 + u * u * 0.11 + v * (0.025 + Math.sin(u * Math.PI) * 0.055);
      return sidePoint(y, z, side, vehicle);
    }, side > 0));
    add('trim', tube([[side * 0.895, 1.2, -0.77], [side * 1.06, 1.25, -0.7]], 0.021, 1));
    const mirror = wingMirror(side, coupe, detailed);
    add('paint', mirror.shell); add('trim', mirror.rim);
    add(detailed ? 'alloy' : 'trim', detailed ? tintGeometry(mirror.lens, '#9ab5c6') : mirror.lens);
    if (detailed) {
      add('trim', fitting([0.028, 0.028, 0.18], [side * 1.025, 1.034, coupe ? 0.37 : 0.15], 0.008));
      // Panel gaps follow the curved sheet metal, including the bonnet shut line.
      add('trim', tube([[1.07, -0.64], [0.91, -0.64], [0.61, -0.61], [0.59, 0.55], [0.89, 0.66], [1.07, 0.66]]
        .map(([y, z]) => sidePoint(y, z, side, vehicle)), 0.004, 20));
      add('trim', tube(Array.from({ length: 17 }, (_, i): Point => {
        const z = THREE.MathUtils.lerp(-1.91, -1.02, i / 16), x = side * THREE.MathUtils.lerp(0.74, 0.69, i / 16);
        return [x, bonnetY(x, z, vehicle) + 0.009, z];
      }), 0.004, 16));
      if (!coupe && !truck && !muscle) add('trim', fitting([0.026, 0.025, 0.13], [side * 1.04, 1.025, 0.69], 0.005));
    }
  }
  // Body-specific lights, grilles and aero share the same material batches.
  const grilleTop = utility || muscle ? 0.94 : coupe ? 0.75 : vehicle.id === 'swift' ? 0.79 : 0.87;
  const grilleWidth = muscle ? 0.86 : utility ? 0.56 : coupe ? 0.68 : 0.61;
  add('trim', face([[-grilleWidth * 0.83, 0.53], [-grilleWidth, grilleTop - 0.07], [-grilleWidth * 0.78, grilleTop],
    [grilleWidth * 0.78, grilleTop], [grilleWidth, grilleTop - 0.07], [grilleWidth * 0.83, 0.53]], FRONT - 0.014, true));
  add('trim', fitting([1.91, 0.065, 0.19], [0, 0.435, FRONT + 0.02], 0.02));
  add('trim', face([[-0.94, 0.42], [-0.91, 0.62], [-0.62, 0.66], [0.62, 0.66], [0.91, 0.62], [0.94, 0.42]], REAR + 0.024));
  for (const side of [-1, 1]) {
    const lamp = (muscle ? [[0.36, 1.035], [0.875, 1.025], [0.885, 0.825], [0.36, 0.825]]
      : utility ? [[0.61, 1.035], [0.875, 1.025], [0.885, 0.835], [0.61, 0.835]]
      : coupe ? [[0.36, 1.015], [0.87, 1.03], [0.89, 0.925], [0.43, 0.915]]
      : [[0.38, 1.015], [0.86, 1.005], [0.885, 0.855], [0.43, 0.88]]) as [number, number][];
    add('trim', face(lamp.map(([x, y]) => [x * side, y]), FRONT - 0.018, true));
    const led = (utility ? [[0.635, 1.008], [0.856, 1.002], [0.856, 0.974], [0.635, 0.979]]
      : coupe ? [[0.402, 0.987], [0.85, 1.004], [0.858, 0.979], [0.424, 0.96]]
      : [[0.425, 0.986], [0.842, 0.977], [0.85, 0.947], [0.45, 0.951]]) as [number, number][];
    if (muscle) {
      for (const x of [0.48, 0.75]) {
        add('alloy', new THREE.TorusGeometry(0.083, 0.012, 4, detailed ? 16 : 10).translate(side * x, 0.93, FRONT - 0.031));
        add('light', detailed
          ? new THREE.SphereGeometry(0.069, 16, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 1).rotateX(-Math.PI / 2).translate(side * x, 0.93, FRONT - 0.037)
          : new THREE.CircleGeometry(0.069, 10).rotateY(Math.PI).translate(side * x, 0.93, FRONT - 0.037));
      }
    } else add('light', face(led.map(([x, y]) => [side * x, y]), FRONT - 0.027, true));
    if (utility) add('light', face([[side * 0.635, 0.98], [side * 0.66, 0.98], [side * 0.66, 0.865], [side * 0.635, 0.865]], FRONT - 0.028, true));
    add('trim', face([[side * 0.72, 0.59], [side * 0.86, 0.59], [side * 0.87, 0.78], [side * 0.73, 0.77]], FRONT - 0.015, true));
    if (utility) {
      add('trim', face([[side * 0.65, 1.04], [side * 0.87, 1.035], [side * 0.87, 0.73], [side * 0.65, 0.73]], REAR + 0.026));
      add('brake', face([[side * 0.685, 1.01], [side * 0.725, 1.01], [side * 0.725, 0.76], [side * 0.685, 0.76]], REAR + 0.037));
      for (const y of [0.76, 0.97]) add('brake', face([[side * 0.72, y], [side * 0.84, y], [side * 0.84, y + 0.036], [side * 0.72, y + 0.036]], REAR + 0.037));
    } else {
      add('trim', face([[side * 0.32, 1.035], [side * 0.885, 1.025], [side * 0.885, 0.87], [side * 0.32, 0.88]], REAR + 0.026));
      if (muscle) {
        for (const x of [0.41, 0.58, 0.75]) add('brake', face([[side * x, 0.9], [side * (x + 0.06), 0.9], [side * (x + 0.06), 1.015], [side * x, 1.015]], REAR + 0.038));
      } else {
        for (const y of [0.925, 0.985]) add('brake', face([[side * 0.37, y], [side * 0.845, y], [side * 0.845, y + 0.024], [side * 0.37, y + 0.024]], REAR + 0.038));
        if (vehicle.id === 'swift') add('brake', face([[side * 0.819, 0.925], [side * 0.845, 0.925],
          [side * 0.845, 1.009], [side * 0.819, 1.009]], REAR + 0.039));
      }
    }
    if (detailed) {
      for (const x of muscle ? [] : utility ? [0.76] : coupe ? [0.64, 0.78] : [0.57, 0.76]) {
        const lampY = coupe ? 0.954 : 0.921;
        add('alloy', tintGeometry(new THREE.CylinderGeometry(0.041, 0.026, 0.018, 12, 1, true)
          .rotateX(-Math.PI / 2).translate(side * x, lampY, FRONT - 0.029), '#a0b2bd'));
        add('light', new THREE.SphereGeometry(0.026, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2)
          .scale(1, 0.45, 1).rotateX(-Math.PI / 2).translate(side * x, lampY, FRONT - 0.029));
      }
      for (const y of [0.646, 0.705]) add('alloy', tintGeometry(face([[side * 0.742, y], [side * 0.852, y],
        [side * 0.852, y + 0.012], [side * 0.742, y + 0.012]], FRONT - 0.025, true), '#485660'));
      const reverseX = utility ? 0.765 : muscle ? 0.35 : 0.385;
      const reverseY = utility ? 0.85 : 0.895;
      add('alloy', tintGeometry(face([[side * reverseX, reverseY], [side * (reverseX + 0.055), reverseY],
        [side * (reverseX + 0.055), reverseY + 0.017], [side * reverseX, reverseY + 0.017]], REAR + 0.038), '#b4c7d3'));
      add('alloy', tintGeometry(face([[side * 0.79, 0.535], [side * 0.885, 0.53],
        [side * 0.878, 0.555], [side * 0.79, 0.56]], REAR + 0.036), '#a23438'));
      add('alloy', new THREE.CylinderGeometry(0.065, 0.065, 0.19, 12, 1, true).rotateX(Math.PI / 2).translate(side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z - 0.098));
      add('trim', new THREE.CircleGeometry(0.051, 12).translate(side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z));
    }
  }
  if (coupe) {
    add('trim', face([[-0.33, 0.94], [0.33, 0.94], [0.33, 1.018], [-0.33, 1.018]], REAR + 0.026));
    add('brake', face([[-0.36, 0.985], [0.36, 0.985], [0.36, 1.009], [-0.36, 1.009]], REAR + 0.038));
  }
  if (detailed) {
    for (let y = 0.575; y < grilleTop - 0.05; y += utility ? 0.09 : 0.055) {
      const w = grilleWidth * 0.76;
      add('alloy', tintGeometry(face([[-w, y], [w, y], [w, y + (utility ? 0.018 : 0.009)], [-w, y + (utility ? 0.018 : 0.009)]], FRONT - 0.035, true), utility ? '#b4bcc0' : '#536069'));
    }
    add('alloy', face([[-0.075, 0.958], [0, 0.926], [0.075, 0.958], [0, 0.986]], FRONT - 0.028, true));
    for (const side of [-1, 1]) {
      // Fixed calipers stay on the chassis while the open wheel spokes rotate.
      for (const axle of AXLES) add('accent', fitting([0.075, 0.21, 0.1], [side * 1.18, WHEEL_RADIUS, axle + 0.17], 0.018));
      if (vehicle.id !== 'swift' && !muscle && !supercar) {
        add('trim', surface(8, 1, (u, v) => {
          const z = THREE.MathUtils.lerp(-1.72, -1.2, u); const x = side * (0.43 + v * 0.19);
          return [x, bonnetY(x, z, vehicle) + 0.005, z];
        }, side < 0));
        for (const z of [-1.59, -1.45, -1.31]) add('paint', tube([[side * 0.43, bonnetY(0.43, z, vehicle) + 0.01, z],
          [side * 0.62, bonnetY(0.62, z, vehicle) + 0.01, z]], 0.009, 1));
      }
    }
    add('trim', surface(8, 4, (u, v) => [THREE.MathUtils.lerp(-0.62, 0.62, v),
      0.405 + u * u * 0.095, THREE.MathUtils.lerp(1.82, 2.21, u)]));
    for (const x of [-0.55, -0.27, 0, 0.27, 0.55]) add('trim', fitting([0.026, 0.09, 0.37], [x, 0.427, 2.04], 0.007));
    add('trim', fitting([0.56, 0.19, 0.021], [0, 0.77, REAR + 0.014], 0.008));
    // Tailgate shut lines sit on the rounded cap, outside the number-plate recess.
    for (const side of [-1, 1]) add('trim', face([[side * 0.555, 0.705], [side * 0.56, 0.705],
      [side * 0.56, 0.869], [side * 0.555, 0.869]], REAR + 0.011));
    add('trim', face([[-0.56, 0.702], [0.56, 0.702], [0.56, 0.707], [-0.56, 0.707]], REAR + 0.011));
    if (!utility) for (const side of [-1, 1]) add('trim', tube(Array.from({ length: 9 }, (_, i): Point => {
      const z = THREE.MathUtils.lerp(rearBase + 0.035, 2.035, i / 8), x = side * THREE.MathUtils.lerp(0.82, 0.78, i / 8);
      return [x, bonnetY(x, z, vehicle) + 0.008, z];
    }), 0.0035, 8));
  }

  if (truck) {
    // Recessed cargo liner and rounded bed rails make a distinct pickup silhouette.
    add('trim', fitting([1.67, 0.045, 1.39], [0, 1.21, 1.31], 0.012));
    for (const side of [-1, 1]) {
      add('paint', fitting([0.18, 0.205, 1.59], [side * 0.91, 1.3, 1.3], 0.035));
      add('trim', tube([[side * 0.72, 1.28, 0.68], [side * 0.7, 1.76, 0.69], [side * 0.56, 1.84, 0.69]], 0.038, 6));
    }
    add('paint', fitting([1.8, 0.23, 0.13], [0, 1.295, 2.075], 0.025));
    add('trim', tube([[-0.56, 1.84, 0.69], [0.56, 1.84, 0.69]], 0.038, 1));
    if (detailed) {
      for (let x = -0.6; x <= 0.61; x += 0.15) add('trim', fitting([0.018, 0.02, 1.23], [x, 1.242, 1.34], 0.004));
      const spare = buildWheelGeometry('rival', 'truck');
      add('rubber', spare.tyre.rotateZ(Math.PI / 2).translate(0, 1.41, 1.34));
      add('alloy', spare.rim.rotateZ(Math.PI / 2).translate(0, 1.41, 1.34));
      add('alloy', fitting([1.23, 0.13, 0.045], [0, 0.44, FRONT - 0.043], 0.012));
      for (const side of [-1, 1]) add('trim', fitting([0.12, 0.08, 1.32], [side * 1.1, 0.36, 0], 0.015));
      add('trim', fitting([0.27, 0.06, 0.024], [0, 1.315, 2.145], 0.008));
    }
  } else if (suv) {
    // A full-height rear cabin, framed quarter windows and a shallow expedition rack.
    for (const side of [-1, 1]) {
      add('trim', tube([[side * 0.904, belt, 0.93], [side * 0.817, roofEdgeAt(0.93), 0.93]], 0.028, 1));
      add('trim', fitting([0.15, 0.1, 1.36], [side * 1.08, 0.37, 0], 0.018));
      add('trim', tube([[side * 0.7, roofHeight + 0.05, -0.49], [side * 0.7, roofHeight + 0.17, -0.35],
        [side * 0.7, roofHeight + 0.17, 1.14], [side * 0.7, roofHeight + 0.05, 1.27]], 0.032, 6));
      for (const z of [-0.31, 1.11]) add('trim', fitting([0.055, 0.11, 0.12], [side * 0.7, roofHeight + 0.08, z], 0.008));
    }
    for (const z of [-0.3, 0.42, 1.12]) add('trim', tube([[-0.7, roofHeight + 0.1, z], [0.7, roofHeight + 0.1, z]], 0.025, 1));
    add('alloy', fitting([1.3, 0.15, 0.07], [0, 0.43, FRONT - 0.035], 0.015));
    add('trim', fitting([0.29, 0.055, 0.025], [0, 1.08, REAR + 0.025], 0.008));
    if (detailed) {
      // Low roof cargo and a single snorkel stay within the shared collision footprint.
      add('trim', fitting([0.77, 0.15, 0.75], [0, roofHeight + 0.16, 0.57], 0.04));
      for (const x of [-0.27, 0.27]) add('accent', fitting([0.035, 0.012, 0.71], [x, roofHeight + 0.242, 0.57], 0.003));
      add('trim', tube([[1.035, 1.11, -0.87], [0.94, 1.3, -0.85], [0.88, 1.87, -0.57], [0.86, 1.99, -0.59]], 0.045, 8));
    }
  } else if (muscle) {
    add('paint', airfoil(1.81, 0.23, 0.09, [0, 1.205, 1.94], detailed));
    // A tapered scoop grows out of the hood, with an open-looking recessed mouth.
    add('trim', surface(detailed ? 8 : 3, detailed ? 8 : 4, (u, v) => {
      const z = THREE.MathUtils.lerp(-1.54, -1.04, u), across = v * 2 - 1, x = across * (0.25 - u * 0.045);
      return [x, bonnetY(x, z, vehicle) + 0.015 + 0.18 * (1 - u * u * 0.9) * (1 - across ** 4), z];
    }));
    add('alloy', tintGeometry(surface(1, detailed ? 8 : 4, (u, v) => {
      const across = (v * 2 - 1) * 0.88, x = across * 0.25, z = -1.545;
      return [x, bonnetY(x, z, vehicle) + 0.023 + u * (0.116 * (1 - across ** 4)), z];
    }), '#44525c'));
    // Two broad stripes follow the hood, roof and rear deck instead of hovering.
    for (const side of [-1, 1]) {
      for (const [start, end] of [[-2.01, -0.82], [1.57, 1.8]]) add('accent', surface(detailed ? 16 : 6, 1, (u, v) => {
        const z = THREE.MathUtils.lerp(start, end, u), x = side * (0.13 + v * 0.18);
        return [x, bonnetY(x, z, vehicle) + 0.006, z];
      }, side < 0));
      add('accent', surface(detailed ? 10 : 4, 1, (u, v) => {
        const z = THREE.MathUtils.lerp(roofFront, roofRear, u), x = side * (0.13 + v * 0.18);
        return [x, roofY(z) - 0.055 * (x / roofWidth) ** 4 + 0.006, z];
      }, side < 0));
    }
  } else {
    // Shallow airfoil with rounded leading edge, mounted close to the rear body.
    const compact = vehicle.id === 'swift';
    const wingY = supercar ? 1.76 : coupe ? 1.52 : roofHeight + (compact ? -0.015 : 0.025); const wingZ = coupe ? 1.85 : roofRear + 0.15;
    const mountBottom = coupe ? profile(wingZ, vehicle).top + 0.015
      : THREE.MathUtils.lerp(roofEdge, belt, (wingZ - roofRear) / (rearBase - roofRear));
    const mountHeight = wingY - mountBottom;
    for (const side of [-1, 1]) {
      add('trim', fitting([0.055, mountHeight, 0.17], [side * 0.7, wingY - mountHeight / 2, wingZ], 0.015));
      if (!compact) add('trim', fitting([0.045, 0.13, 0.34], [side * 0.98, wingY + 0.025, wingZ], 0.012));
    }
    add(compact ? 'paint' : 'trim', airfoil(compact ? 1.63 : 2.0, compact ? 0.23 : 0.33, 0.07, [0, wingY, wingZ], detailed));
    if (vehicle.id === 'falcon') {
      add('paint', fitting([0.43, 0.075, 0.35], [0, roofHeight + 0.07, 0.03], 0.022));
      add('trim', fitting([0.32, 0.03, 0.012], [0, roofHeight + 0.062, -0.148], 0.003));
    }
  }
  if (supercar) {
    add('trim', fitting([2.14, 0.05, 0.27], [0, 0.415, FRONT - 0.025], 0.015));
    for (const side of [-1, 1]) {
      add('trim', surface(detailed ? 12 : 4, 4, (u, v) => {
        const z = THREE.MathUtils.lerp(0.31, 0.88, u);
        return sidePoint(THREE.MathUtils.lerp(0.79 + u * 0.22, 1.087, v), z, side, vehicle, 0.012);
      }, side > 0));
      add('accent', tube(Array.from({ length: 7 }, (_, i) => sidePoint(0.79 + i / 6 * 0.22, 0.31 + i / 6 * 0.57, side, vehicle, 0.018)), 0.014, detailed ? 6 : 2));
    }
    for (const z of [1.3, 1.44, 1.58, 1.72]) {
      add('trim', surface(detailed ? 6 : 3, 1, (u, v) => {
        const x = THREE.MathUtils.lerp(-0.65, 0.65, u), depth = z + v * 0.06;
        return [x, bonnetY(x, depth, vehicle) + 0.009, depth];
      }, true));
    }
  }
  if (detailed) {
    if (!muscle && !supercar && !suv) add('trim', tube([[0, roofHeight + 0.025, roofRear - 0.17], [0, roofHeight + 0.34, roofRear - 0.06]], 0.008, 1));
    // Two narrow bonnet stripes sit on the curved bonnet rather than floating above it.
    for (const offset of muscle ? [] : [-0.37, -0.24]) add('accent', surface(16, 1, (u, v) => {
      const z = THREE.MathUtils.lerp(-1.99, -1.07, u); const x = offset + v * 0.055;
      return [x, bonnetY(x, z, vehicle) + 0.005, z];
    }));
  }
  for (const [material, geometries] of parts) {
    const geometry = merge(geometries.map(roundEnds));
    if (material instanceof THREE.MeshStandardMaterial && material.vertexColors && !geometry.hasAttribute('color')) tintGeometry(geometry, '#ffffff');
    if (material === materials.glass) {
      const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
      for (let i = 0; i < positions.count; i++) {
        const shade = THREE.MathUtils.lerp(1, 0.52, THREE.MathUtils.clamp((positions.getY(i) - belt) / (roofHeight - belt), 0, 1));
        colors.setXYZ(i, shade, shade, shade);
      }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `vehicle-${Object.entries(materials).find(([, value]) => value === material)![0]}`; group.add(mesh);
  }
  return group;
}

/** Rounded tyre shoulders, recessed barrels, open spokes and concentric rim lips. */
export function buildWheelGeometry(detail: Detail = 'player', body: VehicleDefinition['body'] = 'hatch') {
  const detailed = detail === 'player'; const segments = detailed ? 24 : 16;
  const truck = body === 'truck' || body === 'suv', coupe = body === 'coupe' || body === 'supercar', muscle = body === 'muscle';
  const radius = body === 'supercar' ? 0.345 : coupe ? 0.325 : truck ? 0.267 : muscle ? 0.28 : 0.295;
  const halfProfile = [[radius + 0.01, -0.17], [radius + 0.057, -0.18], [0.43, -0.157], [0.46, -0.105]];
  if (detailed) halfProfile.push([0.46, -0.063], [0.45, -0.05], [0.46, -0.037]);
  const tyreProfile = [...halfProfile, ...halfProfile.slice().reverse().map(([r, width]) => [r, -width])];
  const rubber: THREE.BufferGeometry[] = [new THREE.LatheGeometry(tyreProfile.map(([r, width]) => new THREE.Vector2(r, width)), segments).rotateZ(Math.PI / 2)];
  const rim: THREE.BufferGeometry[] = [];
  if (detailed) rim.push(tintGeometry(new THREE.CylinderGeometry(radius - 0.02, radius - 0.02, 0.25, segments, 1, true).rotateZ(Math.PI / 2), '#47535d'));
  const spokeCount = coupe ? 10 : muscle ? 5 : truck ? 6 : 8;
  for (const side of [-1, 1]) {
    rim.push(new THREE.TorusGeometry(radius, 0.016, detailed ? 5 : 3, segments).rotateY(Math.PI / 2).translate(side * 0.164, 0, 0));
    rubber.push(new THREE.CircleGeometry(radius - 0.02, segments).rotateY(side * Math.PI / 2).translate(side * 0.075, 0, 0));
    if (detailed) {
      rim.push(tintGeometry(new THREE.RingGeometry(0.075, radius * 0.78, segments).rotateY(side * Math.PI / 2).translate(side * 0.105, 0, 0), '#69757d'));
      rubber.push(new THREE.RingGeometry(0.382, 0.387, segments).rotateY(side * Math.PI / 2).translate(side * 0.174, 0, 0));
      // Shoulder sipes wrap the existing tyre profile; the contact radius stays fixed.
      const grooves = truck ? 16 : 12;
      for (let groove = 0; groove < grooves; groove++) rubber.push(tintGeometry(surface(1, 2, (u, v) => {
        const width = THREE.MathUtils.lerp(0.112, 0.153, v);
        const angle = groove / grooves * Math.PI * 2 + u * (truck ? 0.048 : 0.026) + v * (truck ? 0.08 : 0.19);
        // Match the polygonal circumference as well as the cross-section, avoiding floating bands.
        const step = Math.PI * 2 / segments;
        const chord = Math.cos(step / 2) / Math.cos((angle % step) - step / 2);
        const r = THREE.MathUtils.lerp(0.46, 0.43, (width - 0.105) / 0.052) * chord + 0.0007;
        return [side * width, Math.sin(angle) * r, Math.cos(angle) * r];
      }, side > 0), '#65717a'));
      for (let hole = 0; hole < 10; hole++) {
        const angle = hole / 10 * Math.PI * 2;
        rim.push(tintGeometry(new THREE.CircleGeometry(0.01, 5).rotateY(side * Math.PI / 2)
          .translate(side * 0.107, Math.cos(angle) * radius * 0.68, Math.sin(angle) * radius * 0.68), '#202930'));
      }
    }
    for (let spoke = 0; spoke < spokeCount; spoke++) {
      const angle = coupe ? Math.floor(spoke / 2) / 5 * Math.PI * 2 + (spoke % 2 ? 0.14 : -0.14) : spoke / spokeCount * Math.PI * 2;
      const spokePoint = (u: number, v: number, depth = 0): Point => {
        const r = THREE.MathUtils.lerp(0.059, radius - 0.008, u);
        const theta = angle + (truck || muscle ? 0 : u * 0.14) + (v - 0.5) * (muscle ? 0.32 : truck ? 0.27 : coupe ? 0.095 : 0.15);
        return [side * (THREE.MathUtils.lerp(0.127, 0.165, u) - depth), Math.cos(theta) * r, Math.sin(theta) * r];
      };
      rim.push(surface(detailed ? 2 : 1, 1, (u, v) => spokePoint(u, v), side < 0));
      // Bevelled spoke sides remain visible in a three-quarter view of the wheel.
      if (detailed) for (const edge of [0, 1]) rim.push(tintGeometry(surface(2, 1, (u, v) =>
        spokePoint(u, edge + (edge ? -1 : 1) * v * 0.08, v * 0.022), (side > 0) === (edge === 0)), '#667681'));
    }
    if (detailed) for (let bolt = 0; bolt < 5; bolt++) {
      const angle = bolt / 5 * Math.PI * 2;
      rim.push(tintGeometry(new THREE.CircleGeometry(0.008, 5).rotateY(side * Math.PI / 2)
        .translate(side * 0.16, Math.cos(angle) * 0.047, Math.sin(angle) * 0.047), '#394650'));
    }
  }
  rim.push(tintGeometry(new THREE.CylinderGeometry(0.068, 0.068, 0.313, detailed ? 12 : 8).rotateZ(Math.PI / 2), '#78858f'));
  const tyre = merge(rubber);
  if (!tyre.hasAttribute('color')) tintGeometry(tyre, '#ffffff');
  return { tyre, rim: merge(rim) };
}
