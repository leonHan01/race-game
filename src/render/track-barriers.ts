import * as THREE from 'three';
import type { Track } from '../simulation/track';

/** Continuous outdoor guardrails share the simulation's inner collision face. */
export function buildTrackBarriers(scene: THREE.Object3D, track: Track) {
  const start = track.closed ? 0 : -130;
  const end = track.length + (track.closed ? 0 : 100);
  const count = Math.ceil((end - start) / 4);
  const vertices: number[] = []; const indices: number[] = [];
  for (const side of [-1, 1]) {
    const base = vertices.length / 3;
    for (let i = 0; i <= count; i++) {
      const d = start + (end - start) * i / count;
      for (const [offset, height] of [[0, 0.4], [0.18, 0.4], [0.18, 0.85], [0, 0.85]]) {
        const p = track.position(d, side * (track.boundaryEdge + offset));
        vertices.push(p.x, p.y + height, p.z);
      }
      if (i === count) continue;
      for (let corner = 0; corner < 4; corner++) {
        const a = base + i * 4 + corner; const b = base + i * 4 + (corner + 1) % 4;
        if (side > 0) indices.push(a, b, a + 4, b, b + 4, a + 4);
        else indices.push(a, a + 4, b, b, a + 4, b + 4);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const metal = new THREE.MeshStandardMaterial({ color: '#aab4b1', roughness: 0.65, metalness: 0.35, side: THREE.DoubleSide });
  const rails = new THREE.Mesh(geometry, metal); rails.name = 'track-guardrails'; scene.add(rails);

  const postCount = Math.ceil((end - start) / 10);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), metal, postCount * 2);
  posts.name = 'track-guardrail-posts';
  const transform = new THREE.Object3D();
  for (let i = 0; i < postCount; i++) for (let side = 0; side < 2; side++) {
    const d = start + (end - start) * i / postCount;
    const p = track.position(d, (side ? 1 : -1) * (track.boundaryEdge + 0.25));
    transform.position.set(p.x, p.y + 0.4, p.z); transform.rotation.y = track.sample(d).heading;
    transform.updateMatrix(); posts.setMatrixAt(i * 2 + side, transform.matrix);
  }
  scene.add(posts);
}
