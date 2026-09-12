import * as THREE from 'three';
import type { Race } from '../simulation/race';
import type { Controls } from '../simulation/race';
import { Track } from '../simulation/track';
import { settings } from '../settings';
import { RallyCar } from './car';
import { buildWorld } from './world';
import { SkidMarks } from './skid-marks';
import { capturePose, type VehiclePose } from '../presentation';
import { getVehicle, type VehicleDefinition } from '../content/vehicles';
import { disposeObject } from './dispose';
import { RivalCars } from './rivals';

const DUST_COUNT = 160;
interface Dust { x: number; y: number; z: number; vx: number; vz: number; life: number; maxLife: number; size: number; spread: number }

export class RallyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.12, 6500);
  car = new RallyCar(getVehicle(settings.vehicleId));
  private rivals = new RivalCars();
  private sceneryRoot = new THREE.Group();
  private dust: Dust[] = [];
  private dustCursor = 0;
  private dustAccumulator = 0;
  private dustMesh: THREE.InstancedMesh;
  private dustTransform = new THREE.Object3D();
  private rearLeft = new THREE.Vector3();
  private rearRight = new THREE.Vector3();
  private skidMarks = new SkidMarks();
  private targetPosition = new THREE.Vector3();
  private targetLook = new THREE.Vector3();
  private sky: THREE.Mesh;
  private scenery: ReturnType<typeof buildWorld>;
  contextAvailable = true;

  constructor(canvas: HTMLCanvasElement, public track: Track, onContext: (available: boolean) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.fog = new THREE.Fog('#b7b9a7', 140, 800);
    this.scene.add(new THREE.HemisphereLight('#fff0d8', '#686e4f', 2.5));
    const sun = new THREE.DirectionalLight('#ffdda4', 3.5); sun.position.set(-220, 330, -450); this.scene.add(sun);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5800, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#6e8f9a') }, bottom: { value: new THREE.Color('#d8ceb0') } },
      vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDirection; uniform vec3 top; uniform vec3 bottom;
        void main(){ vec3 d = normalize(vDirection); float h = pow(max(d.y,0.0),0.42);
          vec3 color = mix(bottom,top,h); float sun = max(dot(d,normalize(vec3(-0.45,0.28,-0.86))),0.0);
          color += vec3(0.32,0.21,0.09)*pow(sun,14.0) + vec3(0.6,0.44,0.2)*pow(sun,800.0);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.sky.renderOrder = -1; this.scene.add(this.sky);
    this.scene.add(this.sceneryRoot);
    this.scenery = buildWorld(this.sceneryRoot, track);
    this.scene.add(this.car.group, this.rivals.group);
    this.car.group.rotation.order = 'YXZ';

    const dustCanvas = document.createElement('canvas'); dustCanvas.width = dustCanvas.height = 64;
    const dc = dustCanvas.getContext('2d')!;
    const gradient = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.42)'); gradient.addColorStop(0.3, 'rgba(255,255,255,.28)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = gradient; dc.fillRect(0, 0, 64, 64);
    const dustTexture = new THREE.CanvasTexture(dustCanvas); dustTexture.colorSpace = THREE.SRGBColorSpace;
    this.dustMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dustTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }), DUST_COUNT);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.dustMesh.frustumCulled = false;
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dust.push({ x: 0, y: -1000, z: 0, vx: 0, vz: 0, life: 0, maxLife: 1, size: 1, spread: 3.2 });
      this.dustTransform.scale.setScalar(0); this.dustTransform.updateMatrix(); this.dustMesh.setMatrixAt(i, this.dustTransform.matrix);
    }
    this.scene.add(this.dustMesh, this.skidMarks.mesh);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextAvailable = false; onContext(false); });
    canvas.addEventListener('webglcontextrestored', () => { this.contextAvailable = true; this.setQuality(); onContext(true); });
    this.applyTheme(); this.setQuality();
  }

  private applyTheme() {
    const theme = this.track.definition.theme;
    (this.scene.fog as THREE.Fog).color.set(theme.fog);
    const material = this.sky.material as THREE.ShaderMaterial;
    material.uniforms.top.value.set(theme.sky); material.uniforms.bottom.value.set(theme.horizon);
    (this.dustMesh.material as THREE.MeshBasicMaterial).color.set(theme.road);
  }
  setStage(track: Track) {
    this.track = track;
    disposeObject(this.sceneryRoot); this.sceneryRoot.clear();
    this.scenery = buildWorld(this.sceneryRoot, track);
    this.applyTheme(); this.setQuality(); this.reset();
  }
  setVehicle(vehicle: VehicleDefinition) {
    if (this.car.vehicle.id === vehicle.id) return;
    this.scene.remove(this.car.group); disposeObject(this.car.group);
    this.car = new RallyCar(vehicle); this.car.group.rotation.order = 'YXZ';
    this.scene.add(this.car.group); this.reset();
  }
  setQuality() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === 'low' ? 1 : 1.35));
    this.scenery.crowns.count = Math.round(this.scenery.treeCount * (settings.quality === 'low' ? 1400 / 2400 : 1));
    this.scenery.trunks.count = this.scenery.crowns.count;
    this.scenery.rocks.count = settings.quality === 'low' ? 350 : 650;
    this.resize();
  }
  resize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
  reset() {
    this.dustAccumulator = 0;
    this.dust.forEach(particle => particle.life = 0);
    this.skidMarks.reset();
  }

  render(race: Race, controls: Controls, dt: number, pose: VehiclePose = capturePose(race)) {
    if (!this.contextAvailable) return;
    const frame = this.track.sample(pose.distance);
    const p = pose.position;
    const forwardX = -Math.sin(pose.roadHeading);
    const forwardZ = -Math.cos(pose.roadHeading);
    const menu = race.phase === 'menu';
    const active = race.phase === 'racing';
    const bodyHeading = pose.heading + pose.driftAngle;
    this.car.group.position.set(p.x, p.y + 0.065, p.z);
    this.car.group.rotation.y = bodyHeading;
    // Keep the body level: no suspension bounce, roll, or terrain-driven pitching.
    this.car.update(pose.speed, pose.steerVisual, pose.driftAngle, controls.brake, race.handbrake, active ? dt : 0);
    this.car.setLivery(settings.livery);
    this.rivals.update(race, pose.rivals, active ? dt : 0);
    this.car.group.updateWorldMatrix(true, false);
    this.rearLeft.set(-1.035, 0, 1.29).applyMatrix4(this.car.group.matrixWorld);
    this.rearRight.set(1.035, 0, 1.29).applyMatrix4(this.car.group.matrixWorld);
    // Keep scuffs on the rising/falling road even when the car sits across its slope.
    for (const contact of [this.rearLeft, this.rearRight]) {
      contact.y = this.track.surfaceHeight(contact.x, contact.z) + 0.065;
    }
    // Use actual tyre contacts: a sideways car must not emit straight, centred trails.
    this.skidMarks.update(this.rearLeft, this.rearRight, active && pose.speed > 3 && Math.abs(race.lane) < this.track.roadWidth / 2 - 0.3 ? race.rearWheelSlip : 0, pose.elapsed);

    if (menu) {
      const mobile = this.camera.aspect < 0.8;
      this.targetPosition.set(p.x + frame.rx * (mobile ? 7.8 : 7.2) - frame.tx * 8.5, p.y + (mobile ? 5.6 : 3.7), p.z + frame.rz * (mobile ? 7.8 : 7.2) - frame.tz * 8.5);
      this.targetLook.set(p.x - frame.rx * (mobile ? 0 : 3.5) + frame.tx * 1.2, p.y + (mobile ? 3.4 : 1.2), p.z - frame.rz * (mobile ? 0 : 3.5) + frame.tz * 1.2);
    } else if (settings.camera === 1) {
      const noseOffset = 1.55 * race.vehicle.scale[2];
      this.targetPosition.set(p.x + forwardX * noseOffset, p.y + 0.065 + 1.31 * race.vehicle.scale[1], p.z + forwardZ * noseOffset);
      this.targetLook.set(this.targetPosition.x + forwardX * 35, this.targetPosition.y, this.targetPosition.z + forwardZ * 35);
    } else {
      const distance = 9.5;
      const lookDistance = 20;
      this.targetPosition.set(p.x - forwardX * distance, p.y + 3.9, p.z - forwardZ * distance);
      this.targetLook.set(p.x + forwardX * lookDistance, p.y + 1.1, p.z + forwardZ * lookDistance);
    }
    // Share the car's interpolated position, but frame the road independently of
    // steering so the car's yaw remains visible. No world-space follow lag or bob.
    this.camera.position.copy(this.targetPosition);
    this.camera.lookAt(this.targetLook);
    const desiredFov = menu ? 44 : settings.camera === 1 ? 72 : 64;
    if (this.camera.fov !== desiredFov) { this.camera.fov = desiredFov; this.camera.updateProjectionMatrix(); }
    this.sky.position.copy(this.camera.position);
    this.updateDust(race, pose, active ? dt : 0);
    this.renderer.render(this.scene, this.camera);
  }

  private updateDust(race: Race, pose: VehiclePose, dt: number) {
    const forwardX = -Math.sin(pose.travelHeading); const forwardZ = -Math.cos(pose.travelHeading);
    const intensity = race.rearWheelSlip;
    const amount = settings.quality === 'low' ? 18 : 42;
    if (pose.speed > 3) this.dustAccumulator += dt * amount * Math.min(1, pose.speed / 15) * (1 + intensity);
    while (this.dustAccumulator >= 1) {
      this.dustAccumulator--;
      const side = this.dustCursor % 2 === 0 ? -1 : 1;
      const particle = this.dust[this.dustCursor++ % DUST_COUNT];
      const point = side < 0 ? this.rearLeft : this.rearRight;
      const spray = Math.sin(pose.driftAngle) * pose.speed * 0.22 + side * (0.6 + intensity * 1.8) + (Math.random() - 0.5) * 1.6;
      particle.x = point.x; particle.y = point.y + 0.24; particle.z = point.z;
      particle.vx = -forwardX * pose.speed * 0.09 - forwardZ * spray;
      particle.vz = -forwardZ * pose.speed * 0.09 + forwardX * spray;
      // At peak emission the 160-particle pool still covers the entire particle lifetime.
      particle.life = particle.maxLife = 1.3 + Math.random() * 0.45 + intensity * 0.1;
      particle.size = 0.8 + Math.random() * 0.55 + intensity * 0.7;
      particle.spread = 3.2 + intensity * 1.8;
    }
    for (let i = 0; i < DUST_COUNT; i++) {
      const particle = this.dust[i]; particle.life -= dt;
      if (particle.life <= 0) this.dustTransform.scale.setScalar(0);
      else {
        particle.x += particle.vx * dt; particle.z += particle.vz * dt; particle.y += dt * 0.65;
        const age = 1 - particle.life / particle.maxLife;
        this.dustTransform.position.set(particle.x, particle.y, particle.z);
        this.dustTransform.quaternion.copy(this.camera.quaternion);
        this.dustTransform.scale.setScalar((particle.size + age * particle.spread) * Math.min(1, particle.life * 2));
      }
      this.dustTransform.updateMatrix(); this.dustMesh.setMatrixAt(i, this.dustTransform.matrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { disposeObject(this.scene); this.renderer.dispose(); }
}
