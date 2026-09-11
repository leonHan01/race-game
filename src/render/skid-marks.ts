import * as THREE from 'three';

const CAPACITY = 256;
const LIFETIME = 7;

/** A bounded, single-draw-call pool of gravel scuffs left by the rear tyres. */
export class SkidMarks {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private positions = new Float32Array(CAPACITY * 18);
  private colors = new Float32Array(CAPACITY * 24);
  private birth = new Float64Array(CAPACITY).fill(-Infinity);
  private strength = new Float32Array(CAPACITY);
  private previous = [new THREE.Vector3(), new THREE.Vector3()];
  private connected = false;
  private cursor = 0;
  private count = 0;
  private lastTime = -1;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const color = new THREE.Color('#594936');
    for (let i = 0; i < CAPACITY * 6; i++) this.colors.set([color.r, color.g, color.b, 0], i * 4);
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    this.mesh.frustumCulled = false;
  }

  reset() {
    this.birth.fill(-Infinity); this.connected = false; this.cursor = 0; this.count = 0; this.lastTime = -1;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  update(left: THREE.Vector3, right: THREE.Vector3, intensity: number, time: number) {
    if (time === this.lastTime) return;
    this.lastTime = time;
    if (intensity < 0.16) this.connected = false;
    else if (!this.connected) {
      this.previous[0].copy(left); this.previous[1].copy(right); this.connected = true;
    } else {
      this.addSegment(this.previous[0], left, intensity, time);
      this.addSegment(this.previous[1], right, intensity, time);
    }
    for (let i = 0; i < this.count; i++) {
      const fade = Math.max(0, 1 - (time - this.birth[i]) / LIFETIME);
      const opacity = fade * fade * this.strength[i];
      for (let vertex = 0; vertex < 6; vertex++) this.colors[i * 24 + vertex * 4 + 3] = opacity;
    }
    this.mesh.geometry.getAttribute('color').needsUpdate = true;
  }

  private addSegment(previous: THREE.Vector3, next: THREE.Vector3, intensity: number, time: number) {
    const dx = next.x - previous.x; const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.45) return;
    // Never join tyre tracks across a reset, rescue, or discontinuity.
    if (length > 6) { previous.copy(next); return; }
    const halfWidth = 0.15 + intensity * 0.065;
    const x = -dz / length * halfWidth; const z = dx / length * halfWidth;
    const offset = this.cursor * 18;
    const ay = previous.y + 0.025; const by = next.y + 0.025;
    this.positions.set([
      previous.x - x, ay, previous.z - z, previous.x + x, ay, previous.z + z, next.x - x, by, next.z - z,
      previous.x + x, ay, previous.z + z, next.x + x, by, next.z + z, next.x - x, by, next.z - z,
    ], offset);
    this.birth[this.cursor] = time; this.strength[this.cursor] = intensity;
    this.cursor = (this.cursor + 1) % CAPACITY; this.count = Math.min(CAPACITY, this.count + 1);
    previous.copy(next);
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.count * 6);
  }
}
