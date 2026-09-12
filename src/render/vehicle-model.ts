import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleDefinition } from '../content/vehicles';

type Point = [number, number, number];
type Detail = 'player' | 'rival';
const AXLES = [-1.3, 1.29];
const FRONT = -2.16;
const REAR = 2.12;
const ARCH = 0.59;
export const WHEEL_RADIUS = 0.46;
const EXHAUST_X = 0.68; const EXHAUST_Y = 0.445; const EXHAUST_Z = 2.238;
// Tail fittings are bent by roundEnds along with the bumper. Flame origins use
// the same final outlet coordinates, before the selected vehicle's root scale.
export const CAR_EXHAUST_PORTS: readonly Point[] = [-1, 1].map(side =>
  [side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z - 0.16 * (EXHAUST_X / 1.1) ** 4]);

/** All geometry is local, with -Z forward and tyre contacts at Y=0. */
function surface(rows: number, columns: number, point: (u: number, v: number) => Point, reverse = false) {
  const positions: number[] = []; const uv: number[] = []; const indices: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
    positions.push(...point(i / rows, j / columns)); uv.push(j / columns, i / rows);
    if (i < rows && j < columns) {
      const a = i * (columns + 1) + j; const b = a + columns + 1;
      indices.push(...(reverse ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]) {
  const normalized = parts.map(part => part.index ? part.toNonIndexed() : part);
  const result = mergeGeometries(normalized)!;
  new Set([...parts, ...normalized]).forEach(part => part.dispose());
  return result;
}

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

function profile(z: number, vehicle: VehicleDefinition) {
  const flare = Math.max(...AXLES.map(axle => Math.exp(-(((z - axle) / 0.48) ** 2))));
  const end = THREE.MathUtils.smoothstep(Math.abs(z), 1.7, 2.17);
  return { width: 1.005 + flare * (vehicle.id === 'swift' ? 0.085 : 0.125) - end * 0.11,
    top: 1.13 + flare * 0.055 - end * 0.12 };
}

function section(z: number, vehicle: VehicleDefinition): Point[] {
  const { width: w, top } = profile(z, vehicle);
  const bottom = Math.max(0.4, ...AXLES.map(axle => 0.4 + Math.sqrt(Math.max(0, ARCH ** 2 - (z - axle) ** 2))));
  const shoulder = top - 0.06;
  const half: Point[] = [[-w + 0.06, bottom, z], [-w, bottom + (shoulder - bottom) * 0.4, z],
    [-w, shoulder - 0.025, z], [-w + 0.075, shoulder + 0.035, z], [-w * 0.55, top + 0.028, z], [0, top + 0.042, z]];
  return [...half, ...half.slice(0, -1).reverse().map(([x, y, depth]): Point => [-x, y, depth])];
}

function cap(points: Point[], front: boolean, detailed: boolean) {
  // Interior subdivisions let the bumper bow across its width along with the lamps.
  return surface(detailed ? 10 : 5, detailed ? 16 : 8, (u, v) => {
    const edge = Math.min(4, Math.floor(u * 5)); const t = u * 5 - edge;
    const width = -THREE.MathUtils.lerp(points[edge][0], points[edge + 1][0], t);
    const y = THREE.MathUtils.lerp(points[edge][1], points[edge + 1][1], t);
    return [(v * 2 - 1) * width, y, points[0][2]];
  }, !front);
}

function face(points: [number, number][], z: number, front = false) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(front ? -x : x, y)));
  const geometry = new THREE.ShapeGeometry(shape);
  if (front) geometry.rotateY(Math.PI);
  return geometry.translate(0, 0, z);
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
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.38, roughness: 0.29,
      clearcoat: detail === 'player' ? 1 : 0.55, clearcoatRoughness: 0.16, envMapIntensity: 0.8 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.37, metalness: 0.22 }),
    trim: new THREE.MeshStandardMaterial({ color: '#171c20', roughness: 0.63, metalness: 0.14 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#162831', roughness: 0.12, metalness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 }),
    alloy: new THREE.MeshStandardMaterial({ color: '#abb3bd', roughness: 0.28, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#16191b', roughness: 0.94, metalness: 0 }),
    light: new THREE.MeshStandardMaterial({ color: '#d9efff', roughness: 0.18, metalness: 0.35, emissive: '#b5d9ff', emissiveIntensity: 0.65 }),
    brake: new THREE.MeshStandardMaterial({ color: '#6e101a', roughness: 0.24, metalness: 0.2, emissive: '#ff2436', emissiveIntensity: 0.3 }),
  };
}
export type VehicleMaterials = ReturnType<typeof createVehicleMaterials>;

/** Batched by material: more sculpted surfaces without one draw call per fitting. */
export function buildVehicleBody(vehicle: VehicleDefinition, materials: VehicleMaterials, detail: Detail = 'player') {
  const group = new THREE.Group(); const detailed = detail === 'player';
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (key: keyof VehicleMaterials, geometry: THREE.BufferGeometry) => {
    const material = materials[!detailed && key === 'accent' ? 'paint' : !detailed && key === 'alloy' ? 'trim' : key];
    const batch = parts.get(material) ?? []; batch.push(geometry); parts.set(material, batch);
  };
  const truck = vehicle.body === 'truck'; const coupe = vehicle.body === 'coupe';
  // A continuous shoulder/bonnet/quarter-panel shell with genuine open wheel wells.
  add('paint', surface(detailed ? 112 : 40, 10, (u, v) => section(THREE.MathUtils.lerp(FRONT, REAR, u), vehicle)[Math.round(v * 10)]));
  add('paint', cap(section(FRONT, vehicle), true, detailed)); add('paint', cap(section(REAR, vehicle), false, detailed));
  add('trim', fitting([1.5, 0.1, 3.65], [0, 0.43, 0], 0.035));
  for (const side of [-1, 1]) for (const axle of AXLES) {
    // A rolled lip and dark inner return follow the cutout instead of covering the tyre.
    for (const [key, inner, outer] of [['paint', ARCH, ARCH + 0.065], ['trim', ARCH - 0.02, ARCH]] as const) {
      add(key, surface(detailed ? 28 : 12, 2, (u, v) => {
        const theta = u * Math.PI; const radius = THREE.MathUtils.lerp(inner, outer, v);
        const z = axle - Math.cos(theta) * radius;
        return [side * (profile(z, vehicle).width + 0.007 + Math.sin(v * Math.PI) * 0.015), 0.4 + Math.sin(theta) * radius, z];
      }, side > 0));
    }
  }

  const frontBase = truck ? -1.02 : -0.96;
  const roofFront = coupe ? -0.28 : truck ? -0.48 : -0.44;
  const roofRear = truck ? 0.22 : coupe ? 0.58 : vehicle.id === 'swift' ? 0.72 : 0.9;
  const rearBase = truck ? 0.49 : coupe ? 1.68 : 1.72;
  const roofHeight = truck ? 1.77 : coupe ? 1.6 : 1.69;
  const belt = 1.145; const bottomWidth = 0.89; const roofWidth = coupe ? 0.715 : 0.735;
  const roofY = (z: number) => roofHeight + 0.028 * Math.sin((z - roofFront) / (roofRear - roofFront) * Math.PI);
  const roofEdge = roofHeight - 0.035;
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
  add('paint', surface(detailed ? 12 : 4, detailed ? 12 : 6, (u, v) => {
    const x = v * 2 - 1; const z = THREE.MathUtils.lerp(roofFront, roofRear, u);
    return [x * roofWidth, roofY(z) - 0.035 * x ** 4, z];
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
        THREE.MathUtils.lerp(belt, roofEdge, v), THREE.MathUtils.lerp(lowerZ, upperZ, v)];
    }, side > 0));
    add('paint', tube([frontBottom, frontTop], 0.042, 1));
    add('paint', tube([backTop, backBottom], truck ? 0.052 : 0.065, 1));
    add('paint', tube([frontTop, [side * roofWidth, roofEdge + 0.025, (roofFront + roofRear) / 2], backTop], 0.028, detailed ? 10 : 4));
    add('trim', tube([frontBottom, backBottom], 0.021, 1));
    const pillarZ = truck ? -0.025 : coupe ? 0.48 : 0.3;
    add('trim', tube([[side * (bottomWidth + 0.007), belt, pillarZ], [side * (roofWidth + 0.008), roofEdge, pillarZ]], 0.035, 1));
    // Slim rocker, aerodynamic mirror, flush handle and restrained team stripe.
    add('trim', fitting([0.12, 0.115, 1.4], [side * 1.015, 0.435, 0], 0.025));
    add('accent', fitting([0.023, 0.085, 1.28], [side * 1.024, 0.57, 0], 0.006));
    add('trim', tube([[side * 0.895, 1.2, -0.77], [side * 1.06, 1.25, -0.7]], 0.021, 1));
    const mirror = new THREE.SphereGeometry(1, detailed ? 12 : 8, detailed ? 8 : 4);
    mirror.scale(0.175, 0.082, 0.13).translate(side * 1.12, 1.275, -0.68); add('paint', mirror);
    if (detailed) {
      add('alloy', fitting([0.23, 0.093, 0.014], [side * 1.13, 1.276, -0.563], 0.004));
      add('trim', fitting([0.028, 0.028, 0.18], [side * 1.025, 1.034, coupe ? 0.37 : 0.15], 0.008));
      // Panel gaps follow the curved sheet metal, including the bonnet shut line.
      add('trim', tube([[side * 1.021, 1.07, -0.64], [side * 1.016, 0.91, -0.64],
        [side * 0.988, 0.61, -0.61], [side * 0.988, 0.59, 0.55], [side * 1.034, 0.89, 0.66], [side * 1.04, 1.07, 0.66]], 0.006, 20));
      add('trim', tube([[-1.91, -0.73], [-1.58, -0.73], [-1.17, -0.7], [-1.02, -0.69]].map(([z, x]): Point =>
        [side * -x, profile(z, vehicle).top + 0.02, z]), 0.006, 10));
    }
  }
  // Deep intake, shaped lamp housings, LED signatures and a thin lower splitter.
  add('trim', face([[-0.6, 0.52], [-0.67, 0.77], [-0.48, 0.85], [0.48, 0.85], [0.67, 0.77], [0.6, 0.52]], FRONT - 0.012, true));
  add('trim', fitting([1.91, 0.065, 0.19], [0, 0.435, FRONT + 0.02], 0.02));
  add('trim', fitting([1.87, 0.14, 0.12], [0, 0.52, REAR - 0.01], 0.025));
  for (const side of [-1, 1]) {
    const lamp = [[0.38, 1.015], [0.86, 1.005], [0.885, 0.855], [0.43, 0.88]] as [number, number][];
    add('trim', face(lamp.map(([x, y]) => [x * side, y]), FRONT - 0.018, true));
    add('light', face([[side * 0.425, 0.986], [side * 0.842, 0.977], [side * 0.85, 0.947], [side * 0.45, 0.951]], FRONT - 0.021, true));
    add('trim', face([[side * 0.72, 0.59], [side * 0.86, 0.59], [side * 0.87, 0.78], [side * 0.73, 0.77]], FRONT - 0.015, true));
    add('trim', fitting([0.56, 0.152, 0.045], [side * 0.61, 0.955, REAR + 0.009], 0.012));
    add('brake', fitting([0.49, 0.046, 0.016], [side * 0.61, 0.993, REAR + 0.035], 0.004));
    add('brake', fitting([0.49, 0.027, 0.016], [side * 0.61, 0.933, REAR + 0.035], 0.004));
    if (detailed) {
      for (const x of [0.57, 0.76]) {
        const ring = new THREE.TorusGeometry(0.036, 0.008, 5, 12);
        add('alloy', ring.translate(side * x, 0.921, FRONT - 0.023));
        const projector = new THREE.CircleGeometry(0.026, 12).rotateY(Math.PI).translate(side * x, 0.921, FRONT - 0.024);
        add('light', projector);
      }
      add('alloy', new THREE.CylinderGeometry(0.065, 0.065, 0.19, 12, 1, true).rotateX(Math.PI / 2).translate(side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z - 0.098));
      add('trim', new THREE.CircleGeometry(0.051, 12).translate(side * EXHAUST_X, EXHAUST_Y, EXHAUST_Z));
    }
  }
  if (detailed) {
    for (let y = 0.565; y < 0.81; y += 0.055) add('alloy', fitting([1.09, 0.009, 0.008], [0, y, FRONT - 0.02], 0.002));
    for (let x = -0.48; x <= 0.5; x += 0.12) add('trim', fitting([0.008, 0.26, 0.009], [x, 0.68, FRONT - 0.027], 0.002));
    for (const x of [-0.55, -0.27, 0, 0.27, 0.55]) add('trim', fitting([0.026, 0.1, 0.3], [x, 0.443, 2.07], 0.007));
    add('trim', fitting([0.56, 0.19, 0.021], [0, 0.77, REAR + 0.014], 0.008));
    for (const x of [-0.43, 0.2]) add('trim', tube([[x - 0.12, 1.194, -0.927], [x + 0.21, 1.275, -0.835]], 0.009, 1));
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
      const spare = buildWheelGeometry('rival');
      add('rubber', spare.tyre.rotateZ(Math.PI / 2).translate(0, 1.41, 1.34));
      add('alloy', spare.rim.rotateZ(Math.PI / 2).translate(0, 1.41, 1.34));
    }
  } else {
    // Shallow airfoil with rounded leading edge, mounted close to the rear body.
    const wingY = coupe ? 1.52 : roofHeight + 0.025; const wingZ = coupe ? 1.85 : roofRear + 0.15;
    const mountBottom = coupe ? profile(wingZ, vehicle).top + 0.015
      : THREE.MathUtils.lerp(roofEdge, belt, (wingZ - roofRear) / (rearBase - roofRear));
    const mountHeight = wingY - mountBottom;
    for (const side of [-1, 1]) {
      add('trim', fitting([0.055, mountHeight, 0.17], [side * 0.7, wingY - mountHeight / 2, wingZ], 0.015));
      add('trim', fitting([0.045, 0.13, 0.34], [side * 0.98, wingY + 0.025, wingZ], 0.012));
    }
    add('trim', fitting([2.0, 0.07, 0.33], [0, wingY, wingZ], 0.025));
    if (vehicle.id !== 'swift') {
      add('paint', fitting([0.43, 0.075, 0.35], [0, roofHeight + 0.07, 0.03], 0.022));
      add('trim', fitting([0.32, 0.03, 0.012], [0, roofHeight + 0.062, -0.148], 0.003));
    }
  }
  if (detailed) {
    add('trim', tube([[0, roofHeight + 0.025, roofRear - 0.17], [0, roofHeight + 0.34, roofRear - 0.06]], 0.008, 1));
    // Two narrow bonnet stripes sit on the curved bonnet rather than floating above it.
    for (const offset of [-0.37, -0.24]) add('accent', surface(16, 1, (u, v) => {
      const z = THREE.MathUtils.lerp(-1.99, -1.07, u); const x = offset + v * 0.055;
      return [x, profile(z, vehicle).top + 0.042 - Math.abs(x) / (profile(z, vehicle).width * 0.55) * 0.014 + 0.004, z];
    }));
  }
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(merge(geometries.map(roundEnds)), material);
    mesh.name = `vehicle-${Object.entries(materials).find(([, value]) => value === material)![0]}`; group.add(mesh);
  }
  return group;
}

/** Rounded tyre shoulders, recessed barrels, open spokes and concentric rim lips. */
export function buildWheelGeometry(detail: Detail = 'player') {
  const detailed = detail === 'player'; const segments = detailed ? 32 : 16;
  const tyreProfile = [[0.293, -0.17], [0.355, -0.18], [0.43, -0.157], [0.46, -0.105],
    [0.46, 0.105], [0.43, 0.157], [0.355, 0.18], [0.293, 0.17]];
  const rubber: THREE.BufferGeometry[] = [new THREE.LatheGeometry(tyreProfile.map(([radius, width]) => new THREE.Vector2(radius, width)), segments).rotateZ(Math.PI / 2)];
  const rim: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    rim.push(new THREE.TorusGeometry(0.283, 0.018, detailed ? 6 : 3, segments).rotateY(Math.PI / 2).translate(side * 0.164, 0, 0));
    rubber.push(new THREE.CircleGeometry(0.259, segments).rotateY(side * Math.PI / 2).translate(side * 0.121, 0, 0));
    if (detailed) {
      rim.push(new THREE.RingGeometry(0.09, 0.225, 24).rotateY(side * Math.PI / 2).translate(side * 0.124, 0, 0));
      rubber.push(new THREE.TorusGeometry(0.376, 0.006, 3, 32).rotateY(Math.PI / 2).translate(side * 0.177, 0, 0));
    }
    for (let spoke = 0; spoke < (detailed ? 10 : 6); spoke++) {
      const angle = spoke / (detailed ? 10 : 6) * Math.PI * 2;
      const shape = new THREE.Shape([new THREE.Vector2(0.058, -0.025), new THREE.Vector2(0.273, -0.014),
        new THREE.Vector2(0.273, 0.014), new THREE.Vector2(0.11, 0.026)]);
      const geometry = new THREE.ShapeGeometry(shape).rotateY(side * Math.PI / 2).rotateX(angle).translate(side * 0.173, 0, 0);
      rim.push(geometry);
      if (detailed) {
        rubber.push(new THREE.CircleGeometry(0.008, 5).rotateY(side * Math.PI / 2).translate(side * 0.194, Math.sin(angle) * 0.05, Math.cos(angle) * 0.05));
      }
    }
  }
  rim.push(new THREE.CylinderGeometry(0.073, 0.073, 0.38, detailed ? 16 : 8).rotateZ(Math.PI / 2));
  return { tyre: merge(rubber), rim: merge(rim) };
}
