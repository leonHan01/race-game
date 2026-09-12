import * as THREE from 'three';

/** Small, static reflection source; Three.js filters it once, never captures the scene per frame. */
export function createVehicleEnvironment(sky: string, horizon: string, ground: string, indoor = false) {
  const texture = new THREE.DataTexture(new Uint8Array(256 * 128 * 4), 256, 128);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.name = 'vehicle-sky-reflections';
  const { data, width, height } = texture.image;
  const skyColor = new THREE.Color(sky); const horizonColor = new THREE.Color(horizon);
  const groundColor = new THREE.Color(ground).multiplyScalar(0.55);
  const highlight = new THREE.Color('#f1f6ff'); const color = new THREE.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Equirectangular v=1 is the zenith (DataTexture does not flip its rows).
    const elevation = Math.sin((y / (height - 1) - 0.5) * Math.PI);
    const longitude = x / width * Math.PI * 2;
    if (elevation >= 0) color.copy(horizonColor).lerp(skyColor, Math.sqrt(elevation));
    else color.copy(horizonColor).lerp(groundColor, Math.min(1, -elevation * 8));
    const cloud = Math.exp(-(((elevation - 0.48) / (indoor ? 0.11 : 0.21)) ** 2));
    const openings = (0.5 + Math.cos(longitude * (indoor ? 4 : 2) + 0.5) * 0.5) ** 6;
    color.lerp(highlight, cloud * openings * (indoor ? 0.9 : 0.8));
    color.convertLinearToSRGB();
    const index = (y * width + x) * 4;
    data[index] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
    data[index + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
    data[index + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
    data[index + 3] = 255;
  }
  texture.needsUpdate = true;
  return texture;
}
