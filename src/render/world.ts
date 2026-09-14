import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SECTORS, Track } from '../simulation/track';
import { terrainNoise as noise, terrainOffset as terrainHeight, shoulderBlend } from '../simulation/ground';
import { startingGrid } from '../simulation/opponents';
import { ribbon } from './road';
import { buildIndoorVenue } from './venue';
import { buildTrackBarriers } from './track-barriers';

export interface WorldScenery { crowns?: THREE.InstancedMesh; trunks?: THREE.InstancedMesh; rocks?: THREE.InstancedMesh; treeCount: number }

function randomSource(seed = 48) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function gravelTexture(snow = false, asphalt = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = randomSource();
  ctx.fillStyle = asphalt ? '#b8babc' : snow ? '#edf0ef' : '#a39074'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) {
    const shade = Math.floor(95 + random() * 90);
    ctx.fillStyle = asphalt ? `rgba(${shade},${shade},${shade},0.18)` : snow ? `rgba(140,162,169,${0.04 + random() * 0.15})` : `rgba(${shade + 16},${shade + 6},${shade - 9},${0.1 + random() * 0.45})`;
    ctx.fillRect(random() * 256, random() * 256, 0.6 + random() * 2.3, 0.5 + random() * 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}


function signTexture(text: string, subtext: string, background = '#e5b644') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#232922'; ctx.font = 'italic 900 125px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 512, 149);
  ctx.font = 'bold 34px Arial'; ctx.fillText(subtext, 512, 215);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildWorld(scene: THREE.Object3D, track: Track): WorldScenery {
  if (track.definition.venue) { buildIndoorVenue(scene, track); buildCourseFurniture(scene, track); return { treeCount: 0 }; }
  const random = randomSource(734);
  const theme = track.definition.theme;
  const edge = track.shoulderEdge;
  const width = track.roadWidth;
  const asphalt = track.definition.surfaceCode === 'ASPHALT';
  const surface = new THREE.MeshStandardMaterial({ map: gravelTexture(track.definition.surfaceCode === 'SNOW', asphalt), color: theme.road, roughness: 1, side: THREE.DoubleSide });
  const shoulderMaterial = new THREE.MeshStandardMaterial({ map: surface.map, color: theme.shoulder, roughness: 1, side: THREE.DoubleSide });
  scene.add(ribbon(track, -edge, edge, -0.07, shoulderMaterial));
  // Match the smooth physical shoulder transition; merge the strips into one draw.
  const apronParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (let lane = edge; lane < edge + 4; lane++) {
    const edgeHeight = (offset: number) => -0.07 * (1 - shoulderBlend(offset, edge)) - 1.1 * shoulderBlend(offset, edge);
    apronParts.push(ribbon(track, side * lane, side * (lane + 1), edgeHeight, shoulderMaterial).geometry);
  }
  const apronGeometry = mergeGeometries(apronParts)!;
  apronParts.forEach(geometry => geometry.dispose());
  scene.add(new THREE.Mesh(apronGeometry, shoulderMaterial));
  const road = ribbon(track, -width / 2, width / 2, 0.04, surface); road.name = 'rally-road'; scene.add(road);
  buildTrackBarriers(scene, track);
  const rutMaterial = new THREE.MeshBasicMaterial({ color: '#504634', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  for (const lane of (asphalt ? [] : [-2.1, -0.8, 1, 2.4])) scene.add(ribbon(track, lane - 0.25, lane + 0.25, 0.055, rutMaterial));

  if (asphalt) {
    const white = new THREE.MeshBasicMaterial({ color: '#e2e1cb', side: THREE.DoubleSide });
    const yellow = new THREE.MeshBasicMaterial({ color: '#e4b85f', side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      scene.add(ribbon(track, side * (width / 2 - 0.28), side * (width / 2 - 0.16), 0.055, white));
      scene.add(ribbon(track, side * 0.07, side * 0.14, 0.055, yellow));
    }
  }

  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  // A single heightfield avoids overlapping terrain ribbons covering winding roads.
  const guide = Array.from({ length: Math.ceil((track.length + 320) / 18) + 1 }, (_, i) => track.sample(i * 18 - 160));
  const groundAt = (x: number, z: number) => {
    let nearest = Infinity; let elevation = 0; let roadDistance = 0;
    for (let i = 1; i < guide.length; i++) {
      const a = guide[i - 1]; const b = guide[i];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
      if (distance < nearest) { nearest = distance; elevation = a.y + (b.y - a.y) * t; roadDistance = (i - 1 + t) * 18 - 160; }
    }
    const distance = Math.sqrt(nearest);
    if (track.hasJumps) elevation = track.sample(roadDistance).y;
    return { height: elevation + terrainHeight(x, z, distance), distance };
  };
  // Cover the full route and its scenery without increasing the terrain vertex budget.
  const minX = Math.min(...guide.map(point => point.x)) - 260;
  const maxX = Math.max(...guide.map(point => point.x)) + 260;
  const minZ = Math.min(...guide.map(point => point.z)) - 260;
  const maxZ = Math.max(...guide.map(point => point.z)) + 260;
  const terrainWidth = maxX - minX; const terrainDepth = maxZ - minZ;
  const cell = Math.max(12, Math.sqrt(terrainWidth * terrainDepth / (140 * 282)));
  const columns = Math.max(1, Math.floor(terrainWidth / cell));
  const rows = Math.max(1, Math.floor(terrainDepth / cell));
  const color = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= columns; j++) {
      const x = minX + j / columns * terrainWidth; const z = maxZ - i / rows * terrainDepth;
      const ground = groundAt(x, z);
      positions.push(x, ground.height, z);
      if (ground.distance < 11) color.set(theme.shoulder);
      else color.set(theme.ground).offsetHSL(noise(x, z) * 0.015, random() * 0.06, noise(x, z) * 0.04 + random() * 0.04);
      colors.push(color.r, color.g, color.b);
      if (i < rows && j < columns) {
        const n = i * (columns + 1) + j;
        indices.push(n, n + 1, n + columns + 1, n + 1, n + columns + 2, n + columns + 1);
      }
    }
  }
  const terrain = new THREE.BufferGeometry(); terrain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); terrain.setIndex(indices); terrain.computeVertexNormals();
  const groundMesh = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  groundMesh.name = 'rally-terrain'; scene.add(groundMesh);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(16000, terrainWidth + 4000), Math.max(16000, terrainDepth + 4000)), new THREE.MeshBasicMaterial({ color: theme.ground }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((minX + maxX) / 2, -28, (minZ + maxZ) / 2); scene.add(floor);

  const crownParts = track.definition.scenery?.trees === 'broadleaf' ? [
    new THREE.IcosahedronGeometry(2.8, 0).translate(0, 6, 0),
    new THREE.IcosahedronGeometry(2.1, 0).translate(0.5, 8.1, 0),
  ] : [
    new THREE.ConeGeometry(2.2, 5.7, 7).translate(0, 5, 0),
    new THREE.ConeGeometry(1.8, 5.1, 7).translate(0, 7.05, 0),
    new THREE.ConeGeometry(1.25, 4.5, 7).translate(0, 9, 0),
  ];
  const crownGeometry = mergeGeometries(crownParts)!; crownParts.forEach(part => part.dispose());
  const treeCount = Math.round(2400 * theme.density);
  const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.31, 5, 5).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: '#655344', roughness: 1 }), treeCount);
  const transform = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const d = -100 + random() * (track.length + 180);
    const lane = (random() < 0.5 ? -1 : 1) * (12 + Math.pow(random(), 1.7) * 195);
    const p = track.position(d, lane);
    const ground = groundAt(p.x, p.z);
    transform.position.set(p.x, ground.height - 0.4, p.z);
    const size = ground.distance < edge + 2 ? 0 : 0.7 + random() * 1.35;
    transform.scale.set(size * (0.7 + random() * 0.4), size, size * (0.7 + random() * 0.4));
    transform.rotation.set((random() - 0.5) * 0.05, random() * 6.28, (random() - 0.5) * 0.06); transform.updateMatrix();
    crowns.setMatrixAt(i, transform.matrix); trunks.setMatrixAt(i, transform.matrix);
    color.set(theme.trees).offsetHSL(random() * 0.025, random() * 0.05, -0.12 + random() * 0.12); crowns.setColorAt(i, color);
  }
  scene.add(crowns, trunks);

  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), 650);
  for (let i = 0; i < rocks.count; i++) {
    const lane = (random() < 0.5 ? -1 : 1) * (edge + 1 + random() * 48);
    const p = track.position(random() * track.length, lane);
    const size = 0.35 + random() ** 2 * 3;
    const ground = groundAt(p.x, p.z);
    transform.position.set(p.x, ground.height - size * 0.25, p.z);
    transform.rotation.set(random() * 3, random() * 3, random() * 3); transform.scale.set(size * 1.4, size * 0.6, size); transform.updateMatrix();
    rocks.setMatrixAt(i, transform.matrix); color.set(theme.rock).offsetHSL(0, 0, -0.12 + random() * 0.15); rocks.setColorAt(i, color);
  }
  scene.add(rocks);

  const mountainMaterial = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 1, flatShading: true });
  for (let i = 0; i < 36; i++) {
    const radius = 180 + random() * 250;
    const height = 220 + random() * 350;
    const geometry = track.definition.scenery?.mountains === 'mesa'
      ? new THREE.CylinderGeometry(radius * 0.45, radius, height, 6)
      : new THREE.ConeGeometry(radius, height, 7);
    const mountain = new THREE.Mesh(geometry, mountainMaterial);
    mountain.position.set(i % 2 ? minX - radius - random() * 480 : maxX + radius + random() * 480, 20, minZ + random() * terrainDepth);
    mountain.rotation.y = random() * 6.28; scene.add(mountain);
  }

  buildCourseFurniture(scene, track);
  return { crowns, trunks, rocks, treeCount };
}

function buildCourseFurniture(scene: THREE.Object3D, track: Track) {
  const width = track.roadWidth; const edge = track.shoulderEdge; const transform = new THREE.Object3D();
  // Roadside markers use two instanced batches for the whole stage.
  const markerCount = Math.floor(track.length / 18) * 2;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.9, 0.13), new THREE.MeshStandardMaterial({ color: '#e4dfcd', roughness: 1 }), markerCount);
  const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.115, 0.16, 0.145), new THREE.MeshBasicMaterial({ color: '#af4b32' }), markerCount);
  for (let i = 0; i < markerCount; i++) {
    const frame = track.sample(Math.floor(i / 2) * 18);
    const side = i % 2 ? -1 : 1;
    transform.position.set(frame.x + frame.rx * side * (width / 2 + 1), frame.y + 0.55, frame.z + frame.rz * side * (width / 2 + 1));
    transform.rotation.set(0, frame.heading, 0); transform.scale.setScalar(1); transform.updateMatrix(); posts.setMatrixAt(i, transform.matrix);
    transform.position.y += 0.2; transform.updateMatrix(); reflectors.setMatrixAt(i, transform.matrix);
  }
  scene.add(posts, reflectors);

  const crests = track.definition.jumps ?? [];
  if (crests.length) {
    const signs = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 1.1), new THREE.MeshBasicMaterial({
      map: signTexture('JUMP', 'CREST AHEAD', '#dcba68'), side: THREE.DoubleSide,
    }), crests.length * 2);
    const supports = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), new THREE.MeshStandardMaterial({ color: '#655d45', roughness: 1 }), crests.length * 2);
    signs.name = 'jump-warning-boards'; supports.name = 'jump-warning-posts';
    crests.forEach((crest, i) => {
      const frame = track.sample(crest.distance - crest.approach - 24);
      for (let side = 0; side < 2; side++) {
        const lane = (side ? 1 : -1) * (width / 2 + 1.6);
        transform.position.set(frame.x + frame.rx * lane, frame.y + 0.9, frame.z + frame.rz * lane);
        transform.rotation.set(0, frame.heading, 0); transform.scale.setScalar(1); transform.updateMatrix();
        supports.setMatrixAt(i * 2 + side, transform.matrix);
        transform.position.y += 0.9; transform.updateMatrix(); signs.setMatrixAt(i * 2 + side, transform.matrix);
      }
    });
    scene.add(supports, signs);
  }

  const archMaterial = new THREE.MeshStandardMaterial({ color: '#242a25', roughness: 0.8 });
  function arch(distance: number, text: string, subtext: string) {
    const group = new THREE.Group(); const p = track.sample(distance);
    group.position.set(p.x, p.y, p.z); group.rotation.y = p.heading;
    for (const x of [-width / 2 - 0.9, width / 2 + 0.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.3, 0.35), archMaterial); post.position.set(x, 2.65, 0); group.add(post);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 1), archMaterial); base.position.set(x, 0.2, 0); group.add(base);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(width + 2.1, 1.45, 0.23), new THREE.MeshStandardMaterial({ map: signTexture(text, subtext), roughness: 1 }));
    banner.position.y = 4.9; group.add(banner); scene.add(group);
    return group;
  }
  if (track.closed) arch(0, 'START / FINISH', track.definition.english).name = 'start-finish-arch';
  else {
    arch(18, 'DUSTLINE', `${track.definition.english}  /  START`);
    arch(track.length - 4, 'FINISH', track.definition.downhill ? 'LONGBOARD DOWNHILL CLUB' : 'DUSTLINE RALLY CLUB');
  }
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#e7dcb4', transparent: true, opacity: 0.75 });
  const gridPlane = new THREE.PlaneGeometry(2.9, 5.4);
  const gridGeometry = new THREE.EdgesGeometry(gridPlane); gridPlane.dispose();
  for (const slot of startingGrid(track)) {
    const p = track.position(slot.distance, slot.lane); const frame = track.sample(slot.distance);
    const outline = new THREE.LineSegments(gridGeometry, gridMaterial);
    outline.rotation.set(-Math.PI / 2, frame.heading, 0, 'YXZ'); outline.position.set(p.x, p.y + 0.09, p.z); scene.add(outline);
  }

  const stripeMaterial = new THREE.MeshBasicMaterial({ color: '#e8dfc7', side: THREE.DoubleSide });
  for (const d of (track.closed ? [0] : [18, track.length - 4])) {
    const p = track.sample(d); const stripe = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.4), stripeMaterial);
    if (track.closed) stripe.name = 'start-finish-line';
    stripe.rotation.set(-Math.PI / 2, 0, -p.heading); stripe.position.set(p.x, p.y + 0.07, p.z); scene.add(stripe);
  }

  for (let i = 1; i < SECTORS; i++) {
    const p = track.sample(track.length * i / SECTORS);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: signTexture(`0${i}`, 'SPLIT'), side: THREE.DoubleSide }));
      board.position.set(p.x + p.rx * side * (width / 2 + 1.5), p.y + 1.65, p.z + p.rz * side * (width / 2 + 1.5)); board.rotation.y = p.heading; scene.add(board);
    }
  }
  // A few trackside flags create the organised rally atmosphere at the starting grid.
  for (let i = 0; i < 8; i++) {
    const p = track.position(35 + i * 14, i % 2 ? -edge : edge);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 5, 5), archMaterial); pole.position.set(p.x, p.y + 2.5, p.z); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.1), new THREE.MeshStandardMaterial({ map: signTexture('D /', 'RALLY CLUB'), side: THREE.DoubleSide, roughness: 1 }));
    flag.position.set(p.x + 0.58, p.y + 3.3, p.z); flag.rotation.y = -0.2; scene.add(flag);
  }
}
