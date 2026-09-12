import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleDefinition } from '../content/vehicles';
import { LIVERIES } from '../settings';
import { createVehicleMaterials, type VehicleMaterials } from './vehicle-model';
import { ExhaustFlames } from './exhaust-flames';

type Point = [number, number, number];
type Detail = 'player' | 'rival';
export const BIKE_WHEEL_RADIUS = 0.42;
export const BIKE_AXLES = [-1.02, 1.03] as const;
export const motorcycleExhaustPort = (vehicle: VehicleDefinition): Point => [0.35, vehicle.id === 'trail' ? 0.97 : 0.59, 1.04];

function merge(parts: THREE.BufferGeometry[]) {
  const normalized = parts.map(part => part.index ? part.toNonIndexed() : part);
  const geometry = mergeGeometries(normalized)!;
  new Set([...parts, ...normalized]).forEach(part => part.dispose());
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
        const mesh = new THREE.Mesh(merge(geometries), materials[key]);
        mesh.name = `motorcycle-${key}`; group.add(mesh);
      }
    },
  };
}

/** Lean follows the interpolated steering pose, so pause and reset need no extra clock. */
export function motorcycleLean(speed: number, steering: number, driftAngle = 0) {
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
    const oval = (size: Point, p: Point) => new THREE.SphereGeometry(1, segments, detailed ? 10 : 6).scale(...size).translate(...p);
    const bar = (a: Point, b: Point, radius: number) => {
      const start = new THREE.Vector3(...a); const end = new THREE.Vector3(...b);
      const direction = end.clone().sub(start);
      const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), detailed ? 8 : 5);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      return geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    };
    const sidePanel = (points: number[][], width: number) => {
      // Profile lives in the Y/Z plane, with a narrow extrusion across the bike.
      const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
      return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSegments: 1,
        bevelSize: 0.035, bevelThickness: 0.035, steps: 1, curveSegments: 1 }).rotateY(Math.PI / 2).translate(-width / 2, 0, 0);
    };

    body.add('trim', oval([0.26, 0.28, 0.34], [0, 0.63, 0.03])); // engine
    body.add('alloy', bar([-0.3, 0.67, 0.02], [0.3, 0.67, 0.02], 0.18));
    for (const side of [-1, 1]) {
      body.add('alloy', bar([side * 0.19, 0.62, 0.22], [side * 0.18, BIKE_WHEEL_RADIUS, BIKE_AXLES[1]], 0.055));
      body.add('accent', bar([side * 0.23, 0.69, 0.22], [side * 0.2, 1.13, -0.65], 0.045));
      body.add('accent', bar([side * 0.2, 1.13, -0.65], [side * 0.22, 0.98, 0.63], 0.04));
      body.add('alloy', bar([side * 0.2, 0.55, 0.27], [side * 0.42, 0.55, 0.27], 0.025)); // footpegs
    }
    body.add('paint', oval([enduro ? 0.25 : 0.32, 0.23, 0.45], [0, 1.09, -0.21]));
    body.add('trim', oval([0.22, 0.07, enduro ? 0.48 : 0.33], [0, 1.12, 0.4])); // saddle
    body.add('paint', sidePanel([[0.34, 1.08], [0.99, 1.28], [1.25, 1.19], [1.12, 1.04], [0.45, 0.95]], 0.33));
    body.add('brake', box([0.23, 0.06, 0.03], [0, 1.15, 1.25]));
    body.add('trim', box([0.2, 0.19, 0.025], [0, 0.98, 1.25]));
    body.add('alloy', bar([0.28, 0.48, -0.24], [0.35, enduro ? 0.97 : 0.59, 0.99], enduro ? 0.08 : 0.095));
    const exhaustPort = motorcycleExhaustPort(vehicle);
    body.add('trim', bar([exhaustPort[0], exhaustPort[1], exhaustPort[2] - 0.13], exhaustPort, 0.065));
    if (detailed) { this.exhaust = new ExhaustFlames([exhaustPort]); this.suspension.add(this.exhaust.group); }

    if (enduro) {
      body.add('paint', oval([0.19, 0.055, 0.4], [0, 1.03, -1.04])); // high mudguard
      body.add('paint', box([0.38, 0.34, 0.12], [0, 1.24, -0.83]));
      body.add('light', box([0.22, 0.12, 0.025], [0, 1.26, -0.91]));
      body.add('alloy', box([0.37, 0.065, 0.48], [0, 0.35, -0.05]));
    } else {
      body.add('paint', sidePanel([[-0.99, 1.22], [-0.53, 1.34], [0.17, 0.94], [0.26, 0.46], [-0.37, 0.38], [-0.62, 0.75]], 0.53));
      body.add('glass', oval([0.24, 0.24, 0.08], [0, 1.4, -0.76]));
      for (const side of [-1, 1]) {
        body.add('light', box([0.15, 0.055, 0.065], [side * 0.17, 1.23, -1]));
        body.add('trim', box([0.035, 0.15, 0.28], [side * 0.302, 0.82, -0.22]));
        body.add('accent', bar([side * 0.306, 0.59, 0.02], [side * 0.306, 1.04, -0.57], 0.025));
      }
      body.add('paint', oval([0.16, 0.06, 0.3], [0, 0.9, BIKE_AXLES[0]]));
    }

    // Rider leans with the chassis: boots on pegs, knees at the tank, hands on grips.
    const shoulderY = enduro ? 1.77 : 1.62; const shoulderZ = enduro ? -0.05 : -0.27;
    const gripY = enduro ? 1.41 : 1.28;
    body.add('trim', oval([0.25, 0.16, 0.23], [0, 1.27, 0.35]));
    body.add('trim', bar([0, 1.31, 0.32], [0, shoulderY - 0.09, shoulderZ + 0.09], 0.23));
    body.add('accent', oval([0.245, 0.12, 0.18], [0, shoulderY - 0.1, shoulderZ + 0.14]));
    body.add('paint', oval([0.2, 0.23, 0.235], [0, shoulderY + 0.23, shoulderZ - 0.1]));
    body.add('glass', oval([0.185, 0.105, 0.07], [0, shoulderY + 0.26, shoulderZ - 0.303]));
    for (const side of [-1, 1]) {
      body.add('trim', bar([side * 0.2, 1.27, 0.37], [side * 0.35, 0.88, -0.02], 0.12));
      body.add('trim', bar([side * 0.35, 0.88, -0.02], [side * 0.33, 0.56, 0.31], 0.09));
      body.add('alloy', oval([0.095, 0.09, 0.095], [side * 0.37, 0.86, -0.03])); // knee guards
      body.add('trim', oval([0.1, 0.09, 0.19], [side * 0.34, 0.54, 0.22]));
      body.add('trim', bar([side * 0.21, shoulderY, shoulderZ], [side * 0.36, gripY + 0.05, -0.3], 0.075));
      body.add('trim', bar([side * 0.36, gripY + 0.05, -0.3], [side * 0.43, gripY, -0.66], 0.065));
      body.add('accent', oval([0.085, 0.07, 0.085], [side * 0.43, gripY, -0.66]));
    }
    body.finish();

    this.frontAxle.position.set(0, BIKE_WHEEL_RADIUS, BIKE_AXLES[0]);
    this.suspension.add(this.frontAxle);
    const fork = batch(this.frontAxle, this.materials);
    for (const side of [-1, 1]) {
      fork.add('alloy', bar([side * 0.15, 0, 0], [side * 0.15, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.032));
      fork.add('trim', bar([side * 0.32, gripY - BIKE_WHEEL_RADIUS, 0.36], [side * 0.51, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.036));
    }
    fork.add('alloy', bar([-0.4, gripY - BIKE_WHEEL_RADIUS, 0.36], [0.4, gripY - BIKE_WHEEL_RADIUS, 0.36], 0.025));
    fork.finish();

    // Narrow rounded tyres with open rims. Wheels share geometry and spin on X.
    const tyreParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.31, 0.11, detailed ? 10 : 6, detailed ? 28 : 16).rotateY(Math.PI / 2)];
    const rimParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.245, 0.021, 5, segments).rotateY(Math.PI / 2),
      bar([-0.13, 0, 0], [0.13, 0, 0], 0.07)];
    for (let spoke = 0; spoke < (enduro ? 12 : 6); spoke++) {
      const angle = spoke * Math.PI * 2 / (enduro ? 12 : 6);
      rimParts.push(bar([0, 0, 0], [0, Math.cos(angle) * 0.245, Math.sin(angle) * 0.245], enduro ? 0.009 : 0.018));
    }
    for (const side of [-1, 1]) rimParts.push(new THREE.RingGeometry(0.095, 0.19, segments).rotateY(side * Math.PI / 2).translate(side * 0.065, 0, 0));
    if (enduro) for (let tread = 0; tread < 20; tread++) {
      const angle = tread / 20 * Math.PI * 2;
      tyreParts.push(new THREE.BoxGeometry(0.14, 0.023, 0.055).translate(0, 0.409, 0).rotateX(angle));
    }
    const tyre = merge(tyreParts); const rim = merge(rimParts);
    for (const z of BIKE_AXLES) {
      const wheel = new THREE.Group(); wheel.name = z < 0 ? 'front-wheel' : 'rear-wheel';
      wheel.add(new THREE.Mesh(tyre, this.materials.rubber), new THREE.Mesh(rim, this.materials.alloy));
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
