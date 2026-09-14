import * as THREE from 'three';
import type { Track } from '../simulation/track';

export function ribbon(track: Track, left: number, right: number, y: number | ((lane: number) => number), material: THREE.Material, step = track.hasJumps ? 2 : 5, start = track.closed ? 0 : -130, end = track.length + (track.closed ? 0 : 100)) {
  const vertices: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const count = Math.ceil((end - start) / step);
  for (let i = 0; i <= count; i++) {
    const d = Math.min(end, start + i * step);
    for (const lane of [left, right]) {
      const p = track.position(d, lane);
      vertices.push(p.x, p.y + (typeof y === 'number' ? y : y(lane)), p.z); uvs.push((lane - left) / 5, d / 5);
    }
    if (i < count) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
