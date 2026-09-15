import * as THREE from 'three';
import type { Race } from '../simulation/race';
import type { Controls } from '../simulation/race';
import { Track } from '../simulation/track';
import { settings } from '../settings';
import { createPlayerVehicle } from './car';
import { buildWorld } from './world';
import { SkidMarks } from './skid-marks';
import { capturePose, type VehiclePose } from '../presentation';
import type { VehicleDefinition } from '../content/vehicles';
import { raceSelection } from '../content/modes';
import { LongboardRider } from './longboard';
import { disposeObject } from './dispose';
import { RivalCars } from './rivals';
import { createVehicleEnvironment } from './vehicle-environment';
import { ItemVisuals } from './items';
import { placeGroundShadow } from './ground-shadow';
import { BIKE_AXLES } from './motorcycle';
import { SprintView } from './sprint-view';
import { GhostFleet } from './ghost';

const DUST_COUNT = 160;
interface Dust { x: number; y: number; z: number; vx: number; vz: number; life: number; maxLife: number; size: number; spread: number }

export class RallyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.12, 6500);
  car = createPlayerVehicle(raceSelection(settings.mode, settings.stageId, settings.vehicleId).vehicle);
  private rivals = new RivalCars(raceSelection(settings.mode, settings.stageId, settings.vehicleId).vehicle.mode);
  private itemVisuals?: ItemVisuals;
  private ghost?: GhostFleet;
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
  private sprintView = new SprintView();
  private motionPreference?: MediaQueryList;
  private sky: THREE.Mesh;
  private hemisphere = new THREE.HemisphereLight('#fff0d8', '#686e4f', 2.5);
  private sun = new THREE.DirectionalLight('#ffdda4', 3.5);
  private scenery: ReturnType<typeof buildWorld>;
  contextAvailable = true;

  constructor(canvas: HTMLCanvasElement, public track: Track, onContext: (available: boolean) => void) {
    this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.environmentIntensity = 0.7;
    this.scene.fog = new THREE.Fog('#b7b9a7', 140, 800);
    this.sun.position.set(-220, 330, -450); this.scene.add(this.hemisphere, this.sun);
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
    // Replacing the source also invalidates Three.js's cached reflection filtering.
    this.scene.environment?.dispose();
    this.scene.environment = createVehicleEnvironment(theme.sky, theme.horizon, theme.ground, Boolean(this.track.definition.venue));
    const venue = this.track.definition.venue;
    const fog = this.scene.fog as THREE.Fog; fog.color.set(theme.fog);
    fog.near = venue ? 100 : 140; fog.far = venue ? 600 : 800;
    this.sky.visible = !venue; this.scene.background = venue ? new THREE.Color(theme.fog) : null;
    this.hemisphere.color.set(venue?.light ?? '#fff0d8'); this.hemisphere.groundColor.set(venue ? theme.ground : '#686e4f');
    this.hemisphere.intensity = venue ? 1.8 : 2.5;
    this.sun.color.set(venue?.light ?? '#ffdda4'); this.sun.intensity = venue ? 1.9 : 3.5;
    if (venue) this.sun.position.set(15, 60, 20); else this.sun.position.set(-220, 330, -450);
    const material = this.sky.material as THREE.ShaderMaterial;
    material.uniforms.top.value.set(theme.sky); material.uniforms.bottom.value.set(theme.horizon);
    (this.dustMesh.material as THREE.MeshBasicMaterial).color.set(theme.road);
  }
  setStage(track: Track) {
    this.track = track;
    this.clearGhost();
    if (this.itemVisuals) {
      this.scene.remove(this.itemVisuals.group); disposeObject(this.itemVisuals.group); this.itemVisuals = undefined;
    }
    disposeObject(this.sceneryRoot); this.sceneryRoot.clear();
    this.scenery = buildWorld(this.sceneryRoot, track);
    this.applyTheme(); this.setQuality(); this.reset();
  }
  setVehicle(vehicle: VehicleDefinition) {
    if (this.car.vehicle.id === vehicle.id) return;
    this.clearGhost();
    if (this.car.vehicle.mode !== vehicle.mode) {
      this.scene.remove(this.rivals.group); disposeObject(this.rivals.group);
      this.rivals = new RivalCars(vehicle.mode); this.scene.add(this.rivals.group);
    }
    this.scene.remove(this.car.group); disposeObject(this.car.group);
    this.car = createPlayerVehicle(vehicle); this.car.group.rotation.order = 'YXZ';
    this.scene.add(this.car.group); this.reset();
  }
  setQuality() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === 'low' ? 1 : 1.35));
    if (this.scenery.crowns && this.scenery.trunks) {
      this.scenery.crowns.count = Math.round(this.scenery.treeCount * (settings.quality === 'low' ? 1400 / 2400 : 1));
      this.scenery.trunks.count = this.scenery.crowns.count;
    }
    if (this.scenery.rocks) this.scenery.rocks.count = settings.quality === 'low' ? 350 : 650;
    this.resize();
  }
  resize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
  reset() {
    this.sprintView.reset();
    this.ghost?.reset();
    if (!(this.car instanceof LongboardRider)) this.car.exhaust?.reset();
    this.dustAccumulator = 0;
    this.dust.forEach(particle => particle.life = 0);
    this.skidMarks.reset();
  }

  private clearGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.group); disposeObject(this.ghost.group); this.ghost = undefined;
  }

  render(race: Race, controls: Controls, dt: number, pose: VehiclePose = capturePose(race)) {
    if (!this.contextAvailable) return;
    const frame = this.track.sample(pose.distance);
    const p = pose.position;
    const forwardX = -Math.sin(pose.roadHeading);
    const forwardZ = -Math.cos(pose.roadHeading);
    const menu = race.phase === 'menu';
    const active = race.phase === 'racing';
    const stun = race.mode === 'items' ? race.items.player.stun : 0;
    const bodyHeading = pose.heading + pose.driftAngle + (race.isLongboard ? pose.longboardPose.stanceYaw : 0) + (stun > 0 ? Math.sin(stun / 1.15 * Math.PI) * 0.6 : 0);
    this.car.group.position.set(p.x, p.y + 0.065, p.z);
    this.car.group.rotation.y = bodyHeading;
    this.car.group.rotation.x = pose.pitch;
    const roadPitch = this.track.hasJumps ? Math.atan(this.track.grade(pose.distance, 1.3) * Math.cos(bodyHeading - frame.heading)) : 0;
    if (this.track.hasJumps) {
      // Keep both axles clear while the chassis eases onto a ramp or landing slope.
      const axleReach = (race.vehicleMode === 'motorcycle' ? 0.9 : 1.3) * race.vehicle.scale[2];
      this.car.group.position.y += Math.abs(Math.sin(roadPitch) - Math.sin(pose.pitch)) * axleReach * Math.max(0, 1 - pose.airHeight / 0.25);
    }
    // Deliberate ramp pitch is independent of camera orientation and bike lean.
    if (this.car instanceof LongboardRider) {
      this.car.group.rotation.x = Math.atan(this.track.grade(pose.distance) * Math.cos(bodyHeading - frame.heading));
      this.car.update(pose.speed, pose.steerVisual, pose.driftAngle, race.footbraking, race.handbrake, active ? dt : 0, race.tucking, race.pushing, pose.longboardPose);
    } else {
      this.car.update(pose.speed, pose.steerVisual, pose.driftAngle, controls.brake, race.handbrake, active ? dt : 0);
      if (active && !pose.airborne) this.car.exhaust?.update(race.boosting, pose.speed, dt);
      else this.car.exhaust?.reset();
    }
    this.car.setLivery(settings.livery);
    this.rivals.update(race, pose.rivals, active ? dt : 0);
    if (race.phase !== 'menu' && race.ghost.replays.length && !this.ghost) {
      this.ghost = new GhostFleet(race.vehicle); this.scene.add(this.ghost.group);
    }
    this.ghost?.update(race, pose.elapsed, pose.position);
    if (race.mode === 'items' && !this.itemVisuals) { this.itemVisuals = new ItemVisuals(race); this.scene.add(this.itemVisuals.group); }
    this.itemVisuals?.update(race, pose);
    this.car.group.updateWorldMatrix(true, false);
    placeGroundShadow(this.car.group, p, pose.airHeight, bodyHeading, roadPitch);
    const motorcycle = race.vehicleMode === 'motorcycle';
    this.rearLeft.set(race.isLongboard ? -0.18 : motorcycle ? 0 : -1.035, 0, race.isLongboard ? 0.46 : motorcycle ? BIKE_AXLES[1] : 1.29).applyMatrix4(this.car.group.matrixWorld);
    this.rearRight.set(race.isLongboard ? 0.18 : motorcycle ? 0 : 1.035, 0, race.isLongboard ? 0.46 : motorcycle ? BIKE_AXLES[1] : 1.29).applyMatrix4(this.car.group.matrixWorld);
    // Keep scuffs on the rising/falling road even when the car sits across its slope.
    for (const contact of [this.rearLeft, this.rearRight]) {
      contact.y = this.track.surfaceHeight(contact.x, contact.z) + 0.065;
    }
    // Use actual tyre contacts: a sideways car must not emit straight, centred trails.
    this.skidMarks.update(this.rearLeft, motorcycle ? null : this.rearRight, active && !pose.airborne && Math.abs(pose.speed) > 3 && Math.abs(race.lane) < this.track.roadWidth / 2 - 0.3 ? race.rearWheelSlip : 0, pose.elapsed);

    if (menu && race.isLongboard) {
      this.targetPosition.set(p.x + frame.rx * 3.5 - frame.tx * 4.5, p.y + 2.3, p.z + frame.rz * 3.5 - frame.tz * 4.5);
      const offset = this.camera.aspect < 0.8 ? 0 : 1.4;
      this.targetLook.set(p.x - frame.rx * offset, p.y + 0.85, p.z - frame.rz * offset);
    } else if (menu && motorcycle) {
      const mobile = this.camera.aspect < 0.8;
      this.targetPosition.set(p.x + frame.rx * 5.2 - frame.tx * 6.3, p.y + (mobile ? 4.1 : 2.7), p.z + frame.rz * 5.2 - frame.tz * 6.3);
      this.targetLook.set(p.x - frame.rx * (mobile ? 0 : 2.4), p.y + (mobile ? 2.6 : 1.05), p.z - frame.rz * (mobile ? 0 : 2.4));
    } else if (menu) {
      const mobile = this.camera.aspect < 0.8;
      this.targetPosition.set(p.x + frame.rx * (mobile ? 7.8 : 7.2) - frame.tx * 8.5, p.y + (mobile ? 5.6 : 3.7), p.z + frame.rz * (mobile ? 7.8 : 7.2) - frame.tz * 8.5);
      this.targetLook.set(p.x - frame.rx * (mobile ? 0 : 3.5) + frame.tx * 1.2, p.y + (mobile ? 3.4 : 1.2), p.z - frame.rz * (mobile ? 0 : 3.5) + frame.tz * 1.2);
    } else if (settings.camera === 1) {
      const noseOffset = (race.isLongboard ? 0.7 : motorcycle ? 0.78 : 1.55) * race.vehicle.scale[2];
      this.targetPosition.set(p.x + forwardX * noseOffset, pose.cameraHeight + 0.065 + (race.isLongboard ? 1.2 : motorcycle ? 1.65 : 1.31) * race.vehicle.scale[1], p.z + forwardZ * noseOffset);
      this.targetLook.set(this.targetPosition.x + forwardX * 35, this.targetPosition.y, this.targetPosition.z + forwardZ * 35);
    } else {
      const distance = race.isLongboard ? 5.2 : motorcycle ? 7 : 9.5;
      const lookDistance = 20;
      this.targetPosition.set(p.x - forwardX * distance, pose.cameraHeight + (race.isLongboard ? 2.3 : motorcycle ? 3.1 : 3.9), p.z - forwardZ * distance);
      this.targetLook.set(p.x + forwardX * lookDistance, pose.cameraHeight + 1.1, p.z + forwardZ * lookDistance);
    }
    if (race.isLongboard && !menu) {
      const ahead = this.track.sample(pose.distance + 25);
      this.targetLook.y = ahead.y + 0.8;
      this.targetPosition.y = Math.max(this.targetPosition.y, this.track.surfaceHeight(this.targetPosition.x, this.targetPosition.z) + 0.8);
    }
    if (this.track.hasJumps && !menu) {
      const floor = this.track.surfaceHeight(this.targetPosition.x, this.targetPosition.z) + 0.8;
      const lift = Math.max(0, floor - this.targetPosition.y);
      this.targetPosition.y += lift; this.targetLook.y += lift;
    }
    // Share the interpolated horizontal position, framing the road independently
    // of steering and body pitch. Raising both view points keeps the horizon steady.
    // Keep the view inside solid walls without changing its road-facing direction.
    const cameraX = this.targetPosition.x; const cameraZ = this.targetPosition.z;
    if (this.track.confine(this.targetPosition, 0.4)) {
      this.targetLook.x += this.targetPosition.x - cameraX; this.targetLook.z += this.targetPosition.z - cameraZ;
    }
    this.camera.position.copy(this.targetPosition);
    this.camera.lookAt(this.targetLook);
    this.sprintView.update(race.boosting && !race.isLongboard && !pose.airborne, active, dt, this.motionPreference?.matches);
    const desiredFov = (menu ? 44 : settings.camera === 1 ? 72 : 64) + this.sprintView.fovIncrease;
    if (this.camera.fov !== desiredFov || this.sprintView.intensity > 0) {
      this.camera.fov = desiredFov; this.camera.updateProjectionMatrix();
      // A slight horizontal squeeze complements the wide-angle rush. Only the
      // world projection changes: the HUD and physical camera anchors stay fixed.
      this.camera.projectionMatrix.elements[0] *= this.sprintView.horizontalScale;
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }
    this.sky.position.copy(this.camera.position);
    this.updateDust(race, pose, active ? dt : 0);
    this.renderer.render(this.scene, this.camera);
  }

  private updateDust(race: Race, pose: VehiclePose, dt: number) {
    const forwardX = -Math.sin(pose.travelHeading); const forwardZ = -Math.cos(pose.travelHeading);
    const intensity = race.rearWheelSlip;
    const amount = settings.quality === 'low' ? 18 : 42;
    if (!pose.airborne && Math.abs(pose.speed) > 3 && (!race.isLongboard || Math.abs(race.lane) > this.track.roadWidth / 2)) this.dustAccumulator += dt * amount * Math.min(1, Math.abs(pose.speed) / 15) * (1 + intensity);
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
