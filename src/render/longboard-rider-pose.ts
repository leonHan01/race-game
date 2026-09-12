import * as THREE from 'three';
import type { LongboardPose } from '../simulation/longboard-motion';
import { RiderModel } from './longboard-rider-model';

const v = () => new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Fixed bone lengths and bend poles keep elbows/knees articulated throughout transitions. */
export class RiderRig {
  private hip = v(); private shoulder = v(); private ankle = v(); private wrist = v();
  private joint = v(); private end = v(); private pole = v(); private front = v();
  private axis = v(); private bend = v(); private x = v(); private y = v(); private z = v();
  private target = v(); private foot = v(); private hand = v();
  private matrix = new THREE.Matrix4();
  private pelvisRotation = new THREE.Quaternion();
  private footRotation = new THREE.Quaternion();
  private handRotation = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(readonly model: RiderModel) {}

  private solve(root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upper: number, lower: number) {
    this.axis.subVectors(target, root);
    const distance = clamp(this.axis.length(), Math.abs(upper - lower) + .001, upper + lower - .001);
    this.axis.normalize();
    this.end.copy(root).addScaledVector(this.axis, distance);
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    this.bend.subVectors(pole, root).addScaledVector(this.axis, -this.bend.dot(this.axis)).normalize();
    this.joint.copy(root).addScaledVector(this.axis, along).addScaledVector(this.bend, height);
  }

  private segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, front: THREE.Vector3) {
    this.y.subVectors(to, from).normalize();
    this.z.copy(front).negate().addScaledVector(this.y, front.dot(this.y)).normalize();
    this.x.crossVectors(this.y, this.z).normalize(); this.z.crossVectors(this.x, this.y);
    this.matrix.makeBasis(this.x, this.y, this.z);
    mesh.position.copy(from); mesh.quaternion.setFromRotationMatrix(this.matrix);
  }

  update(pose: LongboardPose, lean: number, driftAngle: number) {
    const { tuck, handsDown: down, footbrake, push, switchWeight, stanceYaw } = pose;
    const forward = Math.cos(stanceYaw), turning = Math.sin(stanceYaw);
    const stand = pose.slide * (1 - down);
    const side = Math.sign(driftAngle || -1) * forward;
    const oneFoot = Math.max(footbrake, push);
    const yaw = -Math.PI / 2 + .44 * forward - driftAngle * .38 - turning * .22;
    const lookYaw = -stanceYaw - driftAngle * .72;
    const model = this.model;

    this.hip.set(-lean * .42, .99, .025 * forward);
    this.hip.lerp(this.target.set(.055 - lean * .3, .64, .10 * forward), tuck);
    this.hip.lerp(this.target.set(-lean * .45, .75, .025 * forward), stand);
    this.hip.lerp(this.target.set(side * .20, .405, .025 * forward), down);
    this.hip.y -= Math.max(0, -Math.cos(yaw)) * down * .085;
    this.hip.lerp(this.target.set(-.015, .81 - push * .04, -forward * (.24 - push * .08)), oneFoot);
    this.hip.y += switchWeight * .075;

    // Hip and shoulder axes stay across the board; the shoulders open toward travel.
    this.pelvisRotation.setFromEuler(this.euler.set(0, -Math.PI / 2 + .13 * forward, 0));
    model.pelvis.position.copy(this.hip); model.pelvis.quaternion.copy(this.pelvisRotation);
    this.y.set(-lean * .18, 1, -.18 * forward);
    this.y.lerp(this.target.set(.09, .47, -.88 * forward), tuck);
    // Lean through the planted shoulder, including when the opposite foot leads.
    this.y.lerp(this.target.set(side * (.20 + Math.cos(yaw) * .60), .70,
      -side * Math.sin(yaw) * .60 - .08 * forward), down).normalize();
    this.x.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.x.addScaledVector(this.y, -this.x.dot(this.y)).normalize(); this.z.crossVectors(this.x, this.y);
    this.matrix.makeBasis(this.x, this.y, this.z);
    model.torso.position.copy(this.hip); model.torso.quaternion.setFromRotationMatrix(this.matrix);
    model.helmet.position.set(0, .405, 0).applyQuaternion(model.torso.quaternion).add(this.hip);
    model.helmet.position.y += .118;
    model.helmet.position.x -= Math.sin(lookYaw) * .025;
    model.helmet.position.z -= Math.cos(lookYaw) * .025;
    model.helmet.rotation.set(-.055 * tuck, lookYaw, lean * .12 + side * down * .08, 'YXZ');

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const trailing = (1 + sign * forward) / 2;
      const footYaw = (-Math.PI / 2 + forward * (.12 + .36 * (1 - trailing))) * (1 - trailing * oneFoot)
        + lookYaw * trailing * oneFoot;
      this.footRotation.setFromEuler(this.euler.set(0, footYaw, 0));
      this.foot.set(sign * .016, .211, sign * .335);
      if (footbrake > 0) this.foot.lerp(this.target.set(.235, .054, -.12 * forward), trailing * footbrake);
      if (push > 0) {
        const phase = ((pose.pushPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / Math.PI;
        const stroke = phase < 1 ? smooth(phase) : 1 - smooth(phase - 1);
        const lift = phase > 1 ? Math.sin((phase - 1) * Math.PI) * .22 : 0;
        this.foot.lerp(this.target.set(.24, .066 + lift, forward * (-.38 + stroke * .66)), trailing * push);
      }
      this.ankle.set(0, .069, .035).applyQuaternion(this.footRotation).add(this.foot);
      this.shoulder.set(sign * .111, -.04, 0).applyQuaternion(this.pelvisRotation).add(this.hip);
      this.front.set(1 - tuck * .62, .12 + tuck * .05, -forward * (.16 + tuck * .95));
      this.pole.copy(this.shoulder).add(this.front);
      this.solve(this.shoulder, this.ankle, this.pole, .41, .39);
      // Reposition only an unreachable swing foot; a planted foot is never visually stretched to.
      this.foot.add(this.end).sub(this.ankle);
      model.shoes[i].position.copy(this.foot); model.shoes[i].quaternion.copy(this.footRotation);
      this.segment(model.legs[i * 2], this.shoulder, this.joint, this.front);
      this.segment(model.legs[i * 2 + 1], this.joint, this.end, this.front);
      model.knees[i].position.copy(this.joint);
      model.knees[i].quaternion.copy(model.legs[i * 2 + 1].quaternion);
    }

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const contact = (1 + sign * side) * .5 * down;
      this.shoulder.set(sign * .191, .317, 0).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.set(sign * .25, -.15, -.12).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.lerp(this.target.set(this.hip.x + sign * .047, this.hip.y + .09, this.hip.z + .15 * forward), tuck);
      this.target.set(sign * .68, .285 + sign * turning * switchWeight * .035, -.08)
        .applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.lerp(this.target, Math.max(stand, switchWeight));
      this.target.set(sign * .50, .37, -.08).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.target.y = Math.max(.74, this.target.y); this.target.z -= .10 * forward;
      this.hand.lerp(this.target, down * (1 - contact));
      const plantX = Math.sign(side || -1) * Math.max(.32, Math.abs(this.shoulder.x + side * .14));
      this.hand.lerp(this.target.set(plantX, .054, this.shoulder.z - .12 * forward), contact);
      // Palm puck faces the asphalt only during contact; loose hands follow the forearm.
      const glove = model.gloves[i];
      glove.rotation.set(-.8 * (1 - tuck) * (1 - contact), lookYaw, sign * .2 * (1 - contact), 'YXZ');
      this.wrist.set(0, .004, .049).applyQuaternion(glove.quaternion).add(this.hand);
      this.pole.set(sign * .47, .12, .21).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.pole.lerp(this.target.set(this.shoulder.x - side * .10, this.shoulder.y - .13, this.shoulder.z + .32 * forward), contact);
      this.solve(this.shoulder, this.wrist, this.pole, .29, .28);
      this.handRotation.copy(glove.quaternion);
      this.z.subVectors(this.joint, this.end).normalize();
      this.y.set(0, 1, 0).applyQuaternion(model.torso.quaternion);
      this.x.crossVectors(this.y, this.z).normalize(); this.y.crossVectors(this.z, this.x);
      this.matrix.makeBasis(this.x, this.y, this.z);
      glove.quaternion.setFromRotationMatrix(this.matrix).slerp(this.handRotation, contact);
      this.hand.set(0, .004, .049).applyQuaternion(glove.quaternion);
      glove.position.copy(this.end).sub(this.hand);
      this.front.copy(this.pole).sub(this.shoulder).normalize();
      this.segment(model.arms[i * 2], this.shoulder, this.joint, this.front);
      this.segment(model.arms[i * 2 + 1], this.joint, this.end, this.front);
      model.elbows[i].position.copy(this.joint);
    }
  }
}
