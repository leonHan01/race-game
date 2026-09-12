import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getVehicle } from '../content/vehicles';
import { RIVAL_DRIVERS, type RivalPose } from '../simulation/opponents';
import type { Race } from '../simulation/race';

function box(size: [number, number, number], position: [number, number, number]) {
  return new THREE.BoxGeometry(...size).translate(...position);
}
function batch(group: THREE.Group, parts: THREE.BufferGeometry[], material: THREE.Material) {
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose());
  group.add(new THREE.Mesh(geometry, material));
}

/** Low-detail rivals merge body parts and instance wheels to keep draw calls bounded. */
export class RivalCars {
  readonly group = new THREE.Group();
  private readonly models = RIVAL_DRIVERS.map(driver => {
    const vehicle = getVehicle(driver.vehicle); const truck = vehicle.body === 'truck';
    const car = new THREE.Group(); car.scale.set(...vehicle.scale); this.group.add(car);
    const paint = [box([2.04, 0.6, 4.12], [0, 0.78, 0]), box([1.8, 0.17, 1.1], [0, 1.11, -1.45]),
      box([1.72, 0.12, truck ? 0.8 : 1.5], [0, 1.77, truck ? -0.1 : 0.18])];
    if (truck) paint.push(box([0.15, 0.28, 1.5], [-0.95, 1.21, 1.25]), box([0.15, 0.28, 1.5], [0.95, 1.21, 1.25]));
    batch(car, paint, new THREE.MeshStandardMaterial({ color: driver.color, roughness: 0.6 }));
    const cabin = new THREE.Shape();
    cabin.moveTo(-1.06, 1.02); cabin.lineTo(-0.48, 1.73); cabin.lineTo(truck ? 0.25 : 0.95, 1.73); cabin.lineTo(truck ? 0.48 : 1.65, 1.06); cabin.closePath();
    const glass = new THREE.ExtrudeGeometry(cabin, { depth: 1.66, bevelEnabled: false });
    glass.rotateY(-Math.PI / 2); glass.translate(0.83, 0, 0);
    car.add(new THREE.Mesh(glass, new THREE.MeshStandardMaterial({ color: '#293b40', roughness: 0.3, metalness: 0.4 })));
    batch(car, [box([2.1, 0.22, 0.3], [0, 0.57, -2.08]), box([2.1, 0.22, 0.3], [0, 0.57, 2.08]),
      box(truck ? [1.75, 0.1, 1.4] : [2.12, 0.12, 0.42], truck ? [0, 1.1, 1.27] : [0, 1.86, 1.7])],
    new THREE.MeshStandardMaterial({ color: '#26312e', roughness: 0.8 }));
    batch(car, [-1, 1].map(side => box([0.58, 0.18, 0.04], [side * 0.65, 0.99, -2.085])), new THREE.MeshBasicMaterial({ color: '#fff0ce' }));
    const brake = new THREE.MeshBasicMaterial({ color: '#9e3025' });
    batch(car, [-1, 1].map(side => box([0.42, 0.2, 0.04], [side * 0.73, 1.01, 2.09])), brake);
    const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#262822', roughness: 1 }), 4);
    const hubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, 0.36, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b8bcae', metalness: 0.5, roughness: 0.5 }), 4);
    tyres.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    car.add(tyres, hubs);
    return { car, tyres, hubs, brake, vehicle, wheelAngle: 0 };
  });
  private readonly wheel = new THREE.Object3D();

  update(race: Race, poses: RivalPose[], dt: number) {
    this.group.visible = race.phase !== 'menu';
    this.models.forEach((model, i) => {
      const pose = poses[i]; if (!pose) return;
      model.car.visible = Math.hypot(pose.position.x - race.position.x, pose.position.z - race.position.z) < 230;
      model.car.position.set(pose.position.x, pose.position.y + 0.065, pose.position.z); model.car.rotation.y = pose.heading;
      model.brake.color.set(race.opponents.cars[i].braking ? '#ff7154' : '#9e3025');
      model.wheelAngle -= pose.speed * dt / (0.46 * model.vehicle.scale[1]);
      for (let w = 0; w < 4; w++) {
        const front = w < 2;
        this.wheel.position.set(w % 2 ? 1.035 : -1.035, 0.46, front ? -1.3 : 1.29);
        this.wheel.rotation.set(model.wheelAngle, front ? -pose.steering * 0.28 : 0, 0, 'YXZ');
        this.wheel.updateMatrix(); model.tyres.setMatrixAt(w, this.wheel.matrix); model.hubs.setMatrixAt(w, this.wheel.matrix);
      }
      model.tyres.instanceMatrix.needsUpdate = true; model.hubs.instanceMatrix.needsUpdate = true;
    });
  }
}
