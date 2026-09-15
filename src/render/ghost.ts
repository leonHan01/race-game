import * as THREE from 'three';
import type { Race } from '../simulation/race';
import type { GhostFrame } from '../simulation/ghost';
import type { VehicleDefinition } from '../content/vehicles';
import { GHOST_COLORS } from '../content/ghosts';
import { buildVehicleBody, buildWheelGeometry, createVehicleMaterials, WHEEL_RADIUS, CAR_EXHAUST_PORTS } from './vehicle-model';
import { LongboardRider } from './longboard';
import { Motorcycle, motorcycleExhaustPort } from './motorcycle';
import { disposeObject } from './dispose';
import { ExhaustFlames } from './exhaust-flames';

/** A visual-only historical run: no collider, shadow, items or leaderboard entry. */
export class GhostVehicle {
  readonly group: THREE.Group;
  readonly color: string;
  private readonly rider?: LongboardRider;
  private readonly bike?: Motorcycle;
  private readonly wheels: THREE.Group[] = [];
  private readonly material = new THREE.MeshBasicMaterial({
    color: '#89e9f2', transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false,
  });
  private time = 0;
  private exhaust?: ExhaustFlames;

  constructor(readonly vehicle: VehicleDefinition, readonly index = 0) {
    this.color = GHOST_COLORS[index] ?? GHOST_COLORS[0]; this.material.color.set(this.color);
    if (vehicle.mode === 'longboard') {
      this.rider = new LongboardRider(this.color, vehicle); this.group = this.rider.group;
    } else if (vehicle.mode === 'motorcycle') {
      this.bike = new Motorcycle(vehicle, 'rival'); this.group = this.bike.group;
      const shadow = this.group.getObjectByName('motorcycle-shadow');
      if (shadow) { this.group.remove(shadow); disposeObject(shadow); }
    } else {
      this.group = new THREE.Group(); this.group.scale.set(...vehicle.scale);
      const materials = createVehicleMaterials(this.color, this.color, 'rival');
      this.group.add(buildVehicleBody(vehicle, materials, 'rival'));
      const geometry = buildWheelGeometry('rival', vehicle.body);
      for (const z of [-1.3, 1.29]) for (const side of [-1, 1]) {
        const wheel = new THREE.Group(); wheel.position.set(side * 1.035, WHEEL_RADIUS, z);
        wheel.rotation.order = 'YXZ';
        wheel.add(new THREE.Mesh(geometry.tyre, materials.rubber), new THREE.Mesh(geometry.rim, materials.alloy));
        this.wheels.push(wheel); this.group.add(wheel);
      }
    }
    const originals = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) originals.add(material);
      object.material = this.material; object.castShadow = false; object.receiveShadow = false;
    });
    for (const material of originals) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    textures.forEach(texture => texture.dispose());
    this.group.name = `history-ghost-${index + 1}`; this.group.rotation.order = 'YXZ';
    this.reset();
  }

  reset() { this.group.visible = false; this.time = 0; this.exhaust?.reset(); }

  update(race: Race, elapsed: number, playerPosition: { x: number; y: number; z: number }) {
    const pose = race.phase === 'menu' ? null : race.ghost.sample(elapsed, this.index);
    if (elapsed < this.time) this.exhaust?.reset();
    const dt = race.phase === 'racing' ? Math.max(0, Math.min(0.1, elapsed - this.time)) : 0; this.time = elapsed;
    const separation = pose ? Math.hypot(pose.position.x - playerPosition.x, pose.position.y - playerPosition.y, pose.position.z - playerPosition.z) : Infinity;
    this.group.visible = pose !== null && separation < 230;
    if (!this.group.visible || !pose) { this.exhaust?.reset(); return; }
    // Keep the player's vehicle readable when the two trajectories overlap.
    this.material.opacity = THREE.MathUtils.lerp(0.07, 0.28, THREE.MathUtils.clamp(separation / 6, 0, 1));
    this.place(race, pose);
    if (this.rider) this.rider.update(pose.speed, pose.steering, pose.driftAngle, pose.braking, pose.handbrake, dt, false, false, pose.longboardPose);
    else if (this.bike) this.bike.update(pose.speed, pose.steering, pose.driftAngle, pose.braking, pose.handbrake, dt);
    else this.wheels.forEach((wheel, i) => {
      if (!pose.handbrake || i < 2) wheel.rotation.x -= pose.speed * dt / (WHEEL_RADIUS * this.vehicle.scale[1]);
      wheel.rotation.y = i < 2 ? THREE.MathUtils.clamp(-pose.steering * 0.3 - pose.driftAngle * 0.95, -0.52, 0.52) : 0;
    });
    if (!this.rider && pose.boosting && !pose.airborne && race.phase === 'racing' && !this.exhaust) {
      this.exhaust = new ExhaustFlames(this.bike ? [motorcycleExhaustPort(this.vehicle)] : CAR_EXHAUST_PORTS, this.color);
      (this.bike?.suspension ?? this.group).add(this.exhaust.group);
    }
    if (pose.airborne || race.phase === 'countdown' || race.phase === 'finished') this.exhaust?.reset();
    else if (race.phase === 'racing') this.exhaust?.update(pose.boosting ?? false, pose.speed, dt);
  }

  private place(race: Race, pose: GhostFrame) {
    const frame = race.track.sample(pose.distance);
    const roadPitch = Math.atan(race.track.grade(pose.distance, this.rider ? undefined : 1.3) * Math.cos(pose.yaw - frame.heading));
    this.group.position.set(pose.position.x, pose.position.y + 0.065, pose.position.z);
    this.group.rotation.set(this.rider ? roadPitch : pose.pitch, pose.yaw, 0, 'YXZ');
    if (race.track.hasJumps && !this.rider) {
      const reach = (this.bike ? 0.9 : 1.3) * this.vehicle.scale[2];
      this.group.position.y += Math.abs(Math.sin(roadPitch) - Math.sin(pose.pitch)) * reach * Math.max(0, 1 - pose.airHeight / 0.25);
    }
  }
}

/** Models are created only for recorded runs and reused across matching starts. */
export class GhostFleet {
  readonly group = new THREE.Group();
  private readonly models: GhostVehicle[] = [];
  constructor(private readonly vehicle: VehicleDefinition) { this.group.name = 'historical-ghosts'; }

  reset() { this.models.forEach(model => model.reset()); }

  update(race: Race, elapsed: number, playerPosition: { x: number; y: number; z: number }) {
    const count = race.ghost.replays.length;
    while (!race.ghost.loading && this.models.length > count) {
      const model = this.models.pop()!; this.group.remove(model.group); disposeObject(model.group);
    }
    for (let i = this.models.length; i < count; i++) {
      const model = new GhostVehicle(this.vehicle, i); this.models.push(model); this.group.add(model.group);
    }
    this.models.forEach(model => model.update(race, elapsed, playerPosition));
  }
}
