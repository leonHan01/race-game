import { LongboardRider } from './longboard';
import * as THREE from 'three';
import { buildVehicleBody, buildWheelGeometry, createVehicleMaterials, WHEEL_RADIUS } from './vehicle-model';
import type { VehicleMode } from '../content/vehicles';
import { rivalDrivers, type RivalPose } from '../simulation/opponents';
import type { Race } from '../simulation/race';
import { Motorcycle } from './motorcycle';
import { placeGroundShadow } from './ground-shadow';

/** Rivals share the sculpted silhouette, with fewer subdivisions and two wheel batches. */
export class RivalCars {
  readonly group = new THREE.Group();
  private readonly models;
  constructor(mode: VehicleMode = 'car') {
    this.models = rivalDrivers(mode).map(driver => {
      const vehicle = driver.vehicle;
      if (vehicle.mode === 'longboard') {
        const board = new LongboardRider(driver.color, vehicle); this.group.add(board.group);
        return { car: board.group, board };
      }
      if (vehicle.mode === 'motorcycle') {
        const bike = new Motorcycle(vehicle, 'rival', driver.color, driver.color);
        this.group.add(bike.group);
        return { car: bike.group, bike };
      }
      const car = new THREE.Group(); car.scale.set(...vehicle.scale); this.group.add(car);
      const materials = createVehicleMaterials(driver.color, driver.color, 'rival');
      car.add(buildVehicleBody(vehicle, materials, 'rival'));
      const wheelGeometry = buildWheelGeometry('rival');
      const tyres = new THREE.InstancedMesh(wheelGeometry.tyre, materials.rubber, 4);
      const hubs = new THREE.InstancedMesh(wheelGeometry.rim, materials.alloy, 4);
      tyres.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      car.add(tyres, hubs);
      return { car, tyres, hubs, brake: materials.brake, vehicle, wheelAngle: 0 };
    });
  }
  private readonly wheel = new THREE.Object3D();

  update(race: Race, poses: RivalPose[], dt: number) {
    this.group.visible = race.phase !== 'menu';
    this.models.forEach((model, i) => {
      const pose = poses[i]; if (!pose) return;
      model.car.visible = Math.hypot(pose.position.x - race.position.x, pose.position.z - race.position.z) < 230;
      model.car.position.set(pose.position.x, pose.position.y + 0.065, pose.position.z); model.car.rotation.y = pose.heading;
      model.car.rotation.order = 'YXZ'; model.car.rotation.x = pose.pitch;
      const groundPitch = race.track.hasJumps ? Math.atan(race.track.grade(race.opponents.cars[i].distance, 1.3)) : 0;
      if (race.track.hasJumps) {
        const rival = race.opponents.cars[i];
        const reach = (rival.vehicle.mode === 'motorcycle' ? 0.9 : 1.3) * rival.vehicle.scale[2];
        model.car.position.y += Math.abs(Math.sin(groundPitch) - Math.sin(pose.pitch)) * reach * Math.max(0, 1 - pose.airHeight / 0.25);
      }
      model.car.updateWorldMatrix(true, false);
      placeGroundShadow(model.car, pose.position, pose.airHeight, pose.heading, groundPitch);
      if (model.board) {
        const rival = race.opponents.cars[i];
        const sliding = rival.braking && pose.speed > 13 && Math.abs(pose.steering) > 0.25;
        const slideAngle = sliding ? -Math.sign(pose.steering) * 0.65 : 0;
        model.car.rotation.y += slideAngle;
        model.car.rotation.x = Math.atan(race.track.grade(rival.distance) * Math.cos(slideAngle));
        model.board.update(pose.speed, pose.steering, slideAngle, rival.braking && !sliding, sliding, dt, pose.speed > 9 && !rival.braking, pose.speed < 9 && !rival.braking);
        return;
      }
      const stun = race.mode === 'items' ? race.items.state(race.opponents.cars[i].id).stun : 0;
      if (stun > 0) model.car.rotation.y += Math.sin(stun / 1.15 * Math.PI) * 0.6;
      if (model.bike) {
        model.bike.update(pose.speed, pose.steering, 0, race.opponents.cars[i].braking, false, dt);
        return;
      }
      model.brake.emissiveIntensity = race.opponents.cars[i].braking ? 2.8 : 0.3;
      model.wheelAngle -= pose.speed * dt / (WHEEL_RADIUS * model.vehicle.scale[1]);
      for (let w = 0; w < 4; w++) {
        const front = w < 2;
        this.wheel.position.set(w % 2 ? 1.035 : -1.035, WHEEL_RADIUS, front ? -1.3 : 1.29);
        this.wheel.rotation.set(model.wheelAngle, front ? -pose.steering * 0.28 : 0, 0, 'YXZ');
        this.wheel.updateMatrix(); model.tyres.setMatrixAt(w, this.wheel.matrix); model.hubs.setMatrixAt(w, this.wheel.matrix);
      }
      model.tyres.instanceMatrix.needsUpdate = true; model.hubs.instanceMatrix.needsUpdate = true;
    });
  }
}
