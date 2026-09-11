// Shared by the terrain mesh and off-road vehicle height sampling.
export const terrainNoise = (x: number, z: number) => Math.sin(x * 0.033 + z * 0.021) * 0.5 + Math.sin(x * 0.013 - z * 0.031) * 0.3 + Math.cos(z * 0.061 + x * 0.041) * 0.2;

/** A smooth four-metre transition from the raised gravel shoulder to the ground. */
export function shoulderBlend(lateral: number, edge = 8) {
  const t = Math.max(0, Math.min(1, (Math.abs(lateral) - edge) / 4));
  return t * t * (3 - 2 * t);
}

export function terrainOffset(x: number, z: number, lateral: number) {
  const fade = Math.max(0, Math.abs(lateral) - 20);
  return -1.1 + Math.min(1, fade / 25) * (3 + terrainNoise(x, z) * 5) + Math.max(0, fade - 30) * 0.11;
}
