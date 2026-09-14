import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A small indexed patch; winding stays explicit for mirrored body surfaces. */
export function vehicleSurface(rows: number, columns: number, point: (u: number, v: number) => [number, number, number], reverse = false) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
    positions.push(...point(i / rows, j / columns)); uv.push(j / columns, i / rows);
    if (i < rows && j < columns) {
      const a = i * (columns + 1) + j, b = a + columns + 1;
      indices.push(...(reverse ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Metal finishes share one material and draw call, with local colour multipliers. */
export function tintGeometry(geometry: THREE.BufferGeometry, tint: THREE.ColorRepresentation) {
  const color = new THREE.Color(tint); const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function mergeVehicleGeometry(parts: THREE.BufferGeometry[]) {
  // A coloured brake disc may share a batch with uncoloured spokes/body fittings.
  if (parts.some(part => part.hasAttribute('color'))) {
    for (const part of parts) if (!part.hasAttribute('color')) tintGeometry(part, '#ffffff');
  }
  // Preserve shared vertices, UV seams and hard normals from the source patches.
  // Expanding every indexed patch tripled the body and wheel attribute buffers.
  for (const part of parts) if (!part.index) {
    part.setIndex(Array.from({ length: part.getAttribute('position').count }, (_, i) => i));
  }
  const result = mergeGeometries(parts)!;
  new Set(parts).forEach(part => part.dispose());
  return result;
}
