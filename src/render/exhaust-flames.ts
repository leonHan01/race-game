import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Two tiny meshes for twin exhausts. Shared geometry, no lights or render passes. */
export class ExhaustFlames {
  readonly group = new THREE.Group();
  private readonly jets: THREE.Group[] = [];
  private readonly material: THREE.ShaderMaterial;
  private time = 0;
  private intensity = 0;

  constructor(ports: readonly (readonly [number, number, number])[], color?: THREE.ColorRepresentation) {
    this.group.name = 'nitro-exhaust-flames'; this.group.visible = false; this.group.scale.setScalar(0);
    const profile = [[0.054, 0], [0.09, 0.12], [0.16, 0.35], [0.13, 0.65], [0.065, 1.05], [0, 1.5]];
    const outer = new THREE.LatheGeometry(profile.map(([radius, z]) => new THREE.Vector2(radius, z)), 12).rotateX(Math.PI / 2);
    const inner = outer.clone().scale(0.52, 0.52, 0.6);
    outer.setAttribute('innerLayer', new THREE.BufferAttribute(new Float32Array(outer.getAttribute('position').count), 1));
    inner.setAttribute('innerLayer', new THREE.BufferAttribute(new Float32Array(inner.getAttribute('position').count).fill(1), 1));
    const geometry = mergeGeometries([outer, inner])!; outer.dispose(); inner.dispose();
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { time: { value: 0 }, strength: { value: 0 },
        opacity: { value: color === undefined ? 1 : 0.65 },
        base: { value: new THREE.Color(color ?? '#288fff') }, tip: { value: color === undefined ? new THREE.Color('#ff8235') : new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35) },
        coreBase: { value: new THREE.Color('#edfdff') }, coreTip: { value: color === undefined ? new THREE.Color('#52dcff') : new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6) } },
      vertexShader: `varying vec2 flameUv; varying float flameInner; attribute float innerLayer; uniform float time;
        void main() {
          flameUv = uv; flameInner = innerLayer; vec3 p = position; float bend = uv.y * uv.y;
          p.x += sin(time * 23.0 + p.z * 11.0) * 0.035 * bend;
          p.y += cos(time * 19.0 + p.z * 14.0) * 0.025 * bend;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec2 flameUv; varying float flameInner; uniform float time; uniform float strength; uniform float opacity;
        uniform vec3 base; uniform vec3 tip; uniform vec3 coreBase; uniform vec3 coreTip;
        void main() {
          float flow = 0.78 + 0.22 * sin(flameUv.y * 34.0 - time * 30.0 + sin(flameUv.x * 25.0 + time * 7.0));
          float fade = 1.0 - smoothstep(0.35, 1.0, flameUv.y);
          float gradient = smoothstep(0.12, 0.85, flameUv.y);
          vec3 color = mix(mix(base, tip, gradient), mix(coreBase, coreTip, gradient), flameInner);
          gl_FragColor = vec4(color, opacity * strength * fade * flow * mix(0.8, 1.0, flameInner));
          #include <colorspace_fragment>
        }`,
    });
    for (const port of ports) {
      const jet = new THREE.Group(); jet.position.set(...port);
      const flame = new THREE.Mesh(geometry, this.material); flame.frustumCulled = false;
      jet.add(flame); this.group.add(jet); this.jets.push(jet);
    }
  }

  update(boosting: boolean, speed: number, dt: number) {
    const step = THREE.MathUtils.clamp(dt, 0, 0.1);
    this.time += step;
    this.intensity += ((boosting ? 1 : 0) - this.intensity) * (1 - Math.exp(-step * (boosting ? 20 : 24)));
    if (this.intensity < 0.003) this.intensity = 0;
    this.group.visible = this.intensity > 0;
    this.group.scale.setScalar(this.group.visible ? 1 : 0);
    this.material.uniforms.time.value = this.time;
    this.material.uniforms.strength.value = this.intensity;
    this.jets.forEach((jet, i) => {
      const flicker = 0.88 + Math.sin(this.time * 31 + i * 2.3) * 0.09 + Math.sin(this.time * 47 + i) * 0.06;
      const width = 0.65 + this.intensity * 0.35;
      jet.scale.set(width, width, this.intensity * flicker * (0.9 + Math.min(1, speed / 85) * 0.55));
    });
  }

  reset() {
    this.time = 0; this.intensity = 0; this.group.visible = false;
    this.group.scale.setScalar(0);
    this.material.uniforms.time.value = 0; this.material.uniforms.strength.value = 0;
  }
}
