import * as THREE from 'three';
import type { Race } from '../simulation/race';
import { MAX_PROJECTILES, MAX_TRAPS } from '../simulation/items';
import type { VehiclePose } from '../presentation';

function labelTexture(kind: 'box' | 'pad') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kind === 'box' ? '#28639e' : '#126874'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = kind === 'box' ? '#b3f6ff' : '#8cffff'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 120, 120);
  if (kind === 'box') {
    ctx.fillStyle = '#fff3ac'; ctx.font = 'bold 100px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 64, 70);
    ctx.fillStyle = '#ff91cc'; for (const [x, y] of [[15, 15], [113, 113]]) ctx.fillRect(x - 5, y - 5, 10, 10);
  } else {
    ctx.strokeStyle = '#aaffef'; ctx.lineWidth = 10;
    for (const y of [24, 60, 96]) { ctx.beginPath(); ctx.moveTo(25, y + 15); ctx.lineTo(64, y - 8); ctx.lineTo(103, y + 15); ctx.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function bananaGeometry() {
  const vertices: number[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const x = Math.cos(angle); const z = Math.sin(angle);
    vertices.push(-z * 0.3, 0.2, x * 0.3, z * 0.3, 0.2, -x * 0.3, x * 0.65, 0.7, z * 0.65);
    vertices.push(z * 0.3, 0.2, -x * 0.3, x * 1.35, 0.1, z * 1.35, x * 0.65, 0.7, z * 0.65);
    vertices.push(-z * 0.3, 0.2, x * 0.3, 0, 1.25, 0, z * 0.3, 0.2, -x * 0.3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals(); return geometry;
}

/** All props share geometry and use fixed instance pools; no per-item lights. */
export class ItemVisuals {
  readonly group = new THREE.Group();
  private transform = new THREE.Object3D();
  private color = new THREE.Color();
  private boxes: THREE.InstancedMesh;
  private markers: THREE.InstancedMesh;
  private pads: THREE.InstancedMesh;
  private discs: THREE.InstancedMesh;
  private bananas: THREE.InstancedMesh;
  private shields: THREE.InstancedMesh;
  private trails: THREE.InstancedMesh;
  private pulse: THREE.InstancedMesh;
  private batches: THREE.InstancedMesh[] = [];
  constructor(race: Race) {
    this.transform.rotation.order = 'YXZ';
    const basic = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.boxes = this.batch(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ map: labelTexture('box'), toneMapped: false }), race.items.boxes.length);
    this.markers = this.batch(new THREE.TorusGeometry(1.45, 0.1, 4, 16).rotateX(-Math.PI / 2), basic('#b3efff'), race.items.boxes.length);
    this.pads = this.batch(new THREE.PlaneGeometry(3.5, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: labelTexture('pad'), side: THREE.DoubleSide, toneMapped: false }), race.items.pads.length);
    this.discs = this.batch(new THREE.TorusGeometry(0.85, 0.3, 6, 12).rotateX(-Math.PI / 2), basic('#ffffff'), MAX_PROJECTILES);
    this.bananas = this.batch(bananaGeometry(), new THREE.MeshBasicMaterial({ color: '#ffe04d', side: THREE.DoubleSide, toneMapped: false }), MAX_TRAPS);
    this.shields = this.batch(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#8fbfff', wireframe: true, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }), 6);
    this.trails = this.batch(new THREE.TorusGeometry(2, 0.14, 4, 18).rotateX(-Math.PI / 2), basic('#71fff1'), 6);
    this.pulse = this.batch(new THREE.TorusGeometry(1, 0.04, 4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#dba0ff', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }), 1);
  }
  private batch(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
    this.group.add(mesh); this.batches.push(mesh); return mesh;
  }
  private put(mesh: THREE.InstancedMesh, x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, color?: string) {
    this.transform.position.set(x, y, z); this.transform.rotation.set(0, yaw, 0); this.transform.scale.set(sx, sy, sz); this.transform.updateMatrix();
    mesh.setMatrixAt(mesh.count, this.transform.matrix);
    if (color) mesh.setColorAt(mesh.count, this.color.set(color));
    mesh.count++;
  }
  update(race: Race, pose: VehiclePose) {
    this.group.visible = race.mode === 'items';
    if (!this.group.visible) return;
    this.batches.forEach(mesh => mesh.count = 0);
    const nearby = (p: { x: number; z: number }) => Math.hypot(p.x - pose.position.x, p.z - pose.position.z) < 240;
    for (const box of race.items.boxes) {
      if (box.cooldown > 0 || !nearby(box.position)) continue;
      const p = box.position; const yaw = pose.elapsed * 1.3 + box.id;
      this.put(this.boxes, p.x, p.y + 2.2 + Math.sin(pose.elapsed * 2.5 + box.id) * 0.25, p.z, yaw);
      this.put(this.markers, p.x, p.y + 0.15, p.z);
    }
    for (const pad of race.items.pads) {
      if (!nearby(pad.position)) continue;
      const p = pad.position; const frame = race.track.sample(pad.distance);
      // Tilt the plane to follow the road gradient rather than intersecting hills.
      this.put(this.pads, p.x, p.y + 0.12, p.z, frame.heading);
      const before = race.track.sample(pad.distance - 3); const after = race.track.sample(pad.distance + 3);
      this.transform.rotation.x = Math.atan2(after.y - before.y, 6);
      this.transform.updateMatrix(); this.pads.setMatrixAt(this.pads.count - 1, this.transform.matrix);
    }
    for (const disc of race.items.projectiles) if (nearby(disc.position)) {
      const p = disc.position;
      this.put(this.discs, p.x, p.y + 0.8, p.z, pose.elapsed * 9, 1, 1, 1, disc.kind === 'homing' ? '#ff6483' : '#8dfc82');
    }
    for (const trap of race.items.traps) if (nearby(trap.position)) {
      const p = trap.position; this.put(this.bananas, p.x, p.y + 0.1, p.z, trap.id);
    }
    const cars = [{ id: 'player', pose }, ...race.opponents.cars.map((car, i) => ({ id: car.id, pose: pose.rivals[i] }))];
    for (const car of cars) {
      if (!car.pose || !nearby(car.pose.position)) continue;
      const state = race.items.state(car.id); const p = car.pose.position;
      if (state.shield > 0) this.put(this.shields, p.x, p.y + 1.4, p.z, car.pose.heading, 2.1, 1.9, 3.1);
      if (state.boost > 0 && state.stun <= 0) this.put(this.trails, p.x, p.y + 0.18, p.z, car.pose.heading, 0.8, 1, 1.5);
    }
    if (race.items.pulse > 0) {
      const p = race.items.pulsePosition; const radius = 2 + (1 - race.items.pulse / 0.65) * 80;
      this.put(this.pulse, p.x, p.y + 0.5, p.z, 0, radius, 1, radius);
    }
    for (const mesh of this.batches) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
