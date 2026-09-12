import * as THREE from 'three';
import type { Track } from '../simulation/track';
import { ribbon } from './road';

/** Build enclosed venues without outdoor terrain, textures, or extra light sources. */
export function buildIndoorVenue(scene: THREE.Object3D, track: Track) {
  const venue = track.definition.venue; const bounds = track.venueBounds;
  if (!venue || !bounds) throw new Error('An indoor stage is required');
  const root = new THREE.Group(); root.name = `venue-${venue.kind}`; scene.add(root);
  const { minX, maxX, minZ, maxZ, floor, height } = bounds;
  const width = maxX - minX; const length = maxZ - minZ;
  const centerX = (minX + maxX) / 2; const centerZ = (minZ + maxZ) / 2;
  const rise = venue.kind === 'dome' ? 20 : 0;
  const roofAt = (x: number) => floor + height + Math.sin((x - minX) / width * Math.PI) * rise;
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  const wall = material(venue.wall); const structure = material(venue.structure);
  const accent = material(venue.accent); const concrete = material(track.definition.theme.ground);
  const dark = material('#41453f'); const light = new THREE.MeshBasicMaterial({ color: venue.light });
  const roofMaterial = material(venue.kind === 'depot' ? '#8b9284' : '#989e93');
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  const batches = new Map<string, { material: THREE.Material; matrices: THREE.Matrix4[] }>();
  const box = (name: string, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, roll = 0) => {
    let batch = batches.get(name);
    if (!batch) { batch = { material: mat, matrices: [] }; batches.set(name, batch); }
    transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, yaw, roll, 'YXZ'); transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  };
  const solid = (name: string, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(cube, mat); mesh.name = name;
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); root.add(mesh);
  };
  solid('venue-floor', concrete, centerX, floor - 0.28, centerZ, width + 2, 0.5, length + 2);
  solid('wall-west', wall, minX - 0.5, floor + height / 2, centerZ, 1, height, length + 2);
  solid('wall-east', wall, maxX + 0.5, floor + height / 2, centerZ, 1, height, length + 2);
  for (const [name, z] of [['wall-north', minZ - 0.5], ['wall-south', maxZ + 0.5]] as const) {
    solid(name, wall, centerX, floor + (height + rise + 1) / 2, z, width + 2, height + rise + 1, 1);
  }

  // Overlapping panels close the whole roof, including the arched dome profile.
  const roofSegments = rise ? 20 : 1;
  for (let i = 0; i < roofSegments; i++) {
    const x1 = minX + width * i / roofSegments; const x2 = minX + width * (i + 1) / roofSegments;
    const y1 = roofAt(x1); const y2 = roofAt(x2);
    box('venue-roof', roofMaterial, (x1 + x2) / 2, (y1 + y2) / 2 + 0.35, centerZ,
      Math.hypot(x2 - x1, y2 - y1) + 0.3, 0.7, length + 2, 0, Math.atan2(y2 - y1, x2 - x1));
  }

  const rows = Math.ceil(length / 34); const columns = Math.ceil(width / 36);
  for (let row = 0; row <= rows; row++) {
    const z = minZ + length * row / rows;
    for (const x of [minX + 1.2, maxX - 1.2]) {
      box('columns', structure, x, floor + height / 2, z, 0.8, height, 0.8);
      box('column-footings', accent, x, floor + 0.7, z, 1.15, 1.4, 1.15);
    }
    const segments = rise ? 10 : 1;
    for (let n = 0; n < segments; n++) {
      const x1 = minX + width * n / segments; const x2 = minX + width * (n + 1) / segments;
      box('roof-beams', structure, (x1 + x2) / 2, (roofAt(x1) + roofAt(x2)) / 2 - 0.6, z,
        Math.hypot(x2 - x1, roofAt(x2) - roofAt(x1)) + 0.2, 0.65, 0.55, 0, Math.atan2(roofAt(x2) - roofAt(x1), x2 - x1));
    }
    if (row > 0 && row < rows) for (let column = 0; column < columns; column++) {
      const x = minX + width * (column + 0.5) / columns; const y = roofAt(x) - 1.4;
      box('lamp-housings', structure, x, y, z, 7.4, 0.45, 1.1);
      box('ceiling-lamps', light, x, y - 0.26, z, 6.8, 0.06, 0.8);
    }
  }

  const asphalt = material(track.definition.theme.road);
  const route = ribbon(track, -track.roadWidth / 2, track.roadWidth / 2, 0.04, asphalt, 2, -24, track.length + 32);
  route.name = 'indoor-road'; root.add(route);
  const paint = new THREE.MeshBasicMaterial({ color: venue.accent, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const edge = side * (track.roadWidth / 2 - 0.35);
    root.add(ribbon(track, edge - 0.12, edge + 0.12, 0.055, paint, 2, -24, track.length + 32));
    for (let d = 28; d < track.length - 15; d += 4) {
      const p = track.position(d, side * (track.roadWidth / 2 + 0.9)); const frame = track.sample(d);
      const colored = Math.floor(d / 12) % 2;
      box(colored ? 'course-barriers-accent' : 'course-barriers-light', colored ? accent : concrete, p.x, floor + 0.45, p.z, 0.8, 0.9, 3.6, frame.heading);
    }
  }
  // Closed shutter doors, wall bands and service bays make enclosure legible at eye level.
  for (const z of [minZ + 0.15, maxZ - 0.15]) {
    box('wall-bands', accent, centerX, floor + 2.7, z, width, 0.45, 0.15);
    for (const x of [minX + 20, maxX - 20]) {
      box('closed-shutters', structure, x, floor + 4, z, 18, 8, 0.3);
      for (let h = 1; h < 8; h++) box('shutter-ribs', dark, x, floor + h, z + (z < centerZ ? 0.2 : -0.2), 18, 0.08, 0.18);
    }
  }
  for (const x of [minX + 0.1, maxX - 0.1]) box('wall-bands', accent, x, floor + 2.7, centerZ, 0.15, 0.45, length);

  if (venue.kind === 'dome') {
    for (const side of [-1, 1]) for (let step = 0; step < 5; step++) {
      const x = side < 0 ? minX + 2 + step * 3.4 : maxX - 2 - step * 3.4;
      const h = (5 - step) * 0.85;
      box('grandstands', concrete, x, floor + h / 2, centerZ, 3.5, h, length - 30);
      for (let z = minZ + 18; z < maxZ - 18; z += 4) {
        box('grandstand-seats', accent, x, floor + h + 0.3, z, 1.2, 0.6, 1.6);
      }
    }
  } else {
    const crate = material(venue.kind === 'depot' ? '#a2845e' : '#7c8a74');
    for (const side of [-1, 1]) for (let z = minZ + 30; z < maxZ - 30; z += 42) {
      const x = side < 0 ? minX + 5 : maxX - 5;
      if (venue.kind === 'depot') {
        for (const dz of [-6, 6]) box('storage-racks', structure, x, floor + 3.5, z + dz, 5, 7, 0.3);
        for (const y of [0.25, 3.3, 6.5]) box('storage-shelves', accent, x, floor + y, z, 5.5, 0.25, 12.5);
        for (const dy of [1.5, 4.6]) for (const dz of [-3.2, 2.8]) box('cargo', crate, x, floor + dy, z + dz, 4, 2.5, 4.4);
      } else {
        box('service-containers', crate, x, floor + 2, z, 6, 4, 12);
        for (let dz = -5; dz <= 5; dz += 2) box('container-ribs', structure, x + (side < 0 ? 3.1 : -3.1), floor + 2, z + dz, 0.15, 4, 0.14);
      }
    }
    for (const x of [minX + 9, maxX - 9]) box('overhead-ducts', structure, x, floor + height - 2, centerZ, 1.2, 0.8, length);
  }

  for (const [name, batch] of batches) {
    const mesh = new THREE.InstancedMesh(cube, batch.material, batch.matrices.length); mesh.name = name;
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); root.add(mesh);
  }
  return root;
}
