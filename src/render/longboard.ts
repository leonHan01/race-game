import * as THREE from 'three';
import { LONGBOARD, type VehicleDefinition } from '../content/vehicles';
import { boardOutline } from '../content/board-outline';
import { LIVERIES } from '../settings';
import { idleLongboardPose, longboardCarve, type LongboardPose } from '../simulation/longboard-motion';
import { RiderModel } from './longboard-rider-model';
import { RiderRig } from './longboard-rider-pose';

/** Articulated downhill athlete and drop-through deck. Forward is -Z. */
export class LongboardRider {
  readonly group = new THREE.Group();
  readonly suspension = new THREE.Group();
  readonly wheels: THREE.Mesh[] = [];
  private rider: RiderModel;
  private rig: RiderRig;
  private fallbackPose = idleLongboardPose();
  private accent = new THREE.MeshStandardMaterial({ color: LIVERIES[0].accent, roughness: 0.5 });
  private clock = 0;
  private tuck = 0;
  private lean = 0;
  private slide = 0;
  private handDown = 0;
  private footbrake = 0;
  private push = 0;
  constructor(color?: string, readonly vehicle: VehicleDefinition = LONGBOARD) {
    this.group.name = 'longboard-rider'; this.group.rotation.order = 'YXZ';
    this.rider = new RiderModel(color); this.rig = new RiderRig(this.rider);
    this.group.add(this.suspension); this.suspension.add(this.rider.root);
    const dark = new THREE.MeshStandardMaterial({ color: '#202b34', roughness: 0.88 });
    const metal = new THREE.MeshStandardMaterial({ color: '#9ba7ad', metalness: 0.65, roughness: 0.4 });
    const board = vehicle.board ?? LONGBOARD.board!;
    const wood = new THREE.MeshStandardMaterial({ color: board.deckColor, roughness: board.shape === 'race' ? 0.42 : 0.8 });
    const shape = new THREE.Shape();
    boardOutline(board).forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
    shape.closePath();
    const deckGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false, curveSegments: 5 });
    deckGeometry.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(deckGeometry, wood); deck.position.y = 0.13; deck.name = `${board.shape}-deck`;
    const grip = new THREE.Mesh(new THREE.ShapeGeometry(shape, 5), dark);
    grip.rotation.x = -Math.PI / 2; grip.position.y = 0.154; grip.scale.setScalar(0.94);
    this.suspension.add(deck, grip);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(board.width * 0.2, 0.006, board.length * 0.65), this.accent);
    stripe.position.y = 0.158; this.suspension.add(stripe);
    const wheelGeometry = new THREE.CylinderGeometry(board.wheelRadius, board.wheelRadius, 0.065, 10); wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: board.wheelColor, roughness: 0.8 });
    const truckGeometry = new THREE.BoxGeometry(board.width * 0.825, 0.035, 0.055);
    for (const z of [-board.wheelbase / 2, board.wheelbase / 2]) {
      const truck = new THREE.Mesh(truckGeometry, metal); truck.position.set(0, board.wheelRadius + 0.02, z); this.group.add(truck);
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial); wheel.position.set(side * board.width * 0.45, board.wheelRadius, z);
        wheel.name = 'urethane-wheel'; this.wheels.push(wheel); this.group.add(wheel);
      }
    }
    this.update(0, 0, 0, false, false, 0);
  }

  setLivery(index: number) {
    this.accent.color.set(LIVERIES[index].accent); this.rider.setLivery(index);
  }

  update(speed: number, steering: number, driftAngle: number, brake: boolean, sliding: boolean, dt: number, tucking = false, pushing = false, pose?: LongboardPose) {
    this.clock += dt;
    const damping = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    this.tuck = pose?.tuck ?? this.tuck + (Number(tucking) - this.tuck) * damping;
    this.slide = pose?.slide ?? this.slide + (Number(sliding) - this.slide) * damping;
    this.handDown = pose?.handsDown ?? this.handDown + (Number(sliding) - this.handDown) * damping;
    this.footbrake = pose?.footbrake ?? this.footbrake + (Number(brake) - this.footbrake) * damping;
    this.push = pose?.push ?? this.push + (Number(pushing) - this.push) * damping;
    const leanTarget = -steering * Math.cos(pose?.stanceYaw ?? 0) * Math.min(1, speed / 7) * (0.28 - this.handDown * 0.22);
    this.lean = pose ? leanTarget : this.lean + (leanTarget - this.lean) * damping;
    this.suspension.rotation.z = this.lean * 0.16;
    this.wheels.forEach(wheel => { wheel.rotation.x -= speed * dt * (1 - this.slide * 0.85) / (this.vehicle.board?.wheelRadius ?? 0.055); });
    Object.assign(this.fallbackPose, { tuck: this.tuck, slide: this.slide, handsDown: this.handDown,
      footbrake: this.footbrake, push: this.push, pushPhase: this.clock * 7 });
    const carve = brake || sliding || pushing ? 0 : longboardCarve(speed, steering);
    const carveResponse = carve * this.fallbackPose.carve < 0 ? 3 : 7;
    this.fallbackPose.carve += (carve - this.fallbackPose.carve) * (dt > 0 ? 1 - Math.exp(-dt * carveResponse) : 1);
    if (sliding) this.fallbackPose.supportSide = Math.sign(driftAngle || -steering || -1);
    this.rig.update(pose ?? this.fallbackPose, this.lean, driftAngle);
  }
}
