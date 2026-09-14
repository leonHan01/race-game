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
  private lift = v(); private hinge = v();
  private frontAnkle = v(); private frontKnee = v();
  private armGuide = v();
  private matrix = new THREE.Matrix4();
  private pelvisRotation = new THREE.Quaternion();
  private footRotation = new THREE.Quaternion();
  private handRotation = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(readonly model: RiderModel) {}

  private solve(root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upper: number, lower: number, jointFloor = -Infinity) {
    this.axis.subVectors(target, root);
    const distance = clamp(this.axis.length(), Math.abs(upper - lower) + .001, upper + lower - .001);
    this.axis.normalize();
    this.end.copy(root).addScaledVector(this.axis, distance);
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    this.bend.subVectors(pole, root).addScaledVector(this.axis, -this.bend.dot(this.axis)).normalize();
    this.joint.copy(root).addScaledVector(this.axis, along).addScaledVector(this.bend, height);
    if (this.joint.y < jointFloor) {
      // Rotate the bend around its bone axis instead of lifting the foot or stretching a leg.
      this.lift.set(0, 1, 0).addScaledVector(this.axis, -this.axis.y);
      const verticalReach = this.lift.length();
      if (verticalReach > 1e-6 && height > 1e-6) {
        this.lift.divideScalar(verticalReach);
        const amount = clamp((jointFloor - root.y - this.axis.y * along) / (height * verticalReach), -1, 1);
        this.hinge.copy(this.bend).addScaledVector(this.lift, -this.bend.dot(this.lift));
        if (this.hinge.lengthSq() < 1e-8) this.hinge.crossVectors(this.axis, this.lift);
        this.hinge.normalize();
        this.bend.copy(this.lift).multiplyScalar(amount).addScaledVector(this.hinge, Math.sqrt(1 - amount * amount));
        this.joint.copy(root).addScaledVector(this.axis, along).addScaledVector(this.bend, height);
      }
    }
  }

  private segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, front: THREE.Vector3) {
    this.y.subVectors(to, from).normalize();
    this.z.copy(front).negate().addScaledVector(this.y, front.dot(this.y)).normalize();
    this.x.crossVectors(this.y, this.z).normalize(); this.z.crossVectors(this.x, this.y);
    this.matrix.makeBasis(this.x, this.y, this.z);
    mesh.position.copy(from); mesh.quaternion.setFromRotationMatrix(this.matrix);
  }

  update(pose: LongboardPose, lean: number, driftAngle: number) {
    const { handsDown: down, footbrake, push, switchWeight, stanceYaw, switchCompression, switchLead } = pose;
    // Total deck orientation stays continuous when a slide becomes a Switch.
    const boardYaw = stanceYaw + driftAngle;
    const forward = Math.cos(boardYaw), turning = Math.sin(boardYaw);
    // A sideways slide still loads its leading foot; only a pivot transfers that load.
    const supportForward = forward * Math.sqrt(1.09 / (.09 + forward * forward));
    const stand = pose.slide * (1 - down);
    const oneFoot = Math.max(footbrake, push);
    const pushCycle = ((pose.pushPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / Math.PI;
    const pushStroke = pushCycle < 1 ? smooth(pushCycle) : 1 - smooth(pushCycle - 1);
    const pushSwing = pushStroke * 2 - 1;
    const pushLift = pushCycle > 1 ? Math.sin((pushCycle - 1) * Math.PI) ** 2 * .22 : 0;
    const carve = smooth(Math.abs(pose.carve)) * (1 - Math.max(down, pose.slide, oneFoot, switchWeight));
    const carveSide = Math.sign(pose.carve);
    const low = down + carve;
    const side = low > .0001 ? (pose.supportSide * down + carveSide * carve) / low : pose.supportSide;
    // These action weights already cross-fade; multiplying them would stand up twice as fast.
    const tuck = Math.min(pose.tuck, 1 - Math.max(carve, down, pose.slide, oneFoot, switchWeight));
    const armTuck = smooth(tuck), armPush = smooth(push);
    const yaw = THREE.MathUtils.lerp(-Math.PI / 2 + ((.46 + tuck * .64) * forward + turning * .28) * (1 - low)
      + low * .75 * forward + switchLead, -Math.PI / 2 + forward * (Math.PI / 2 - .22), oneFoot)
      + push * pushSwing * .07 * forward;
    // The gaze passes through the turn with the shoulders; never twist the neck backwards.
    const lookYaw = yaw + ((1.04 - tuck * .59 - low * .22) * (1 - oneFoot) + .20 * oneFoot) * forward
      + turning * .20 - pose.carve * .26;
    const model = this.model;

    // Move the pelvis into the leading half of the stance before folding the chest.
    // Cosine transfers support continuously to the new front foot through a 180.
    this.hip.set(-lean * .38, .88, -.16 * forward);
    this.hip.lerp(this.target.set(.015 - lean * .24, .70, -.20 * forward), tuck);
    this.hip.lerp(this.target.set(-lean * .40, .74, -.19 * forward), stand);
    this.hip.lerp(this.target.set(side * forward * .11, .55, -.30 * supportForward), low);
    // The swing leg works behind a planted front foot; pushing never sits the rider back.
    // Stay compressed until the working foot finishes its stroke, then rise during recovery.
    this.hip.lerp(this.target.set(-.012, .90 - push * (.035 + pushStroke * .075), -.28 * forward), oneFoot);
    this.hip.y += switchWeight * .04 - switchCompression * .10;

    // Open the hips with the feet, so a forward-facing shoe does not twist below a sideways knee.
    const pelvisYaw = THREE.MathUtils.lerp(-Math.PI / 2 + (.13 + tuck * 1.15 + low * .15) * forward + switchLead * .3,
      -Math.PI / 2 + forward * (Math.PI / 2 - .20), oneFoot) - push * pushSwing * .035 * forward;
    this.pelvisRotation.setFromEuler(this.euler.set(0, pelvisYaw, 0));
    model.pelvis.position.copy(this.hip); model.pelvis.quaternion.copy(this.pelvisRotation);
    this.y.set(-lean * .18, 1, -.24 * forward);
    this.y.lerp(this.target.set(0, 1, -forward * (.36 + pushStroke * .12)), push);
    this.y.lerp(this.target.set(.04, .52, -.84 * forward), tuck);
    // Lean through the planted shoulder, including when the opposite foot leads.
    this.y.lerp(this.target.set(side * Math.cos(yaw) * .72, .42,
      -side * Math.sin(yaw) * .72 - forward * .34), low).normalize();
    this.x.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.x.addScaledVector(this.y, -this.x.dot(this.y)).normalize(); this.z.crossVectors(this.x, this.y);
    this.matrix.makeBasis(this.x, this.y, this.z);
    model.torso.position.copy(this.hip); model.torso.quaternion.setFromRotationMatrix(this.matrix);
    model.torso.quaternion.multiply(this.handRotation.setFromEuler(this.euler.set(0, 0, -side * low * .28)));
    model.helmet.position.set(0, .405, 0).applyQuaternion(model.torso.quaternion).add(this.hip);
    model.helmet.position.y += .118;
    model.helmet.position.x -= Math.sin(lookYaw) * .025;
    model.helmet.position.z -= Math.cos(lookYaw) * .025;
    model.helmet.rotation.set(-.055 * tuck, lookYaw, lean * .12 + side * low * .08, 'YXZ');
    // Bridge collar and helmet with a continuous undersuit, even in a deep tuck.
    this.shoulder.set(0, .386, 0).applyQuaternion(model.torso.quaternion).add(this.hip);
    this.target.set(0, -.085, .008).applyQuaternion(model.helmet.quaternion).add(model.helmet.position);
    this.front.set(-Math.sin(lookYaw), 0, -Math.cos(lookYaw));
    this.segment(model.neck, this.shoulder, this.target, this.front);
    model.neck.scale.y = this.shoulder.distanceTo(this.target) / .12;

    const leadingLeg = forward >= 0 ? 0 : 1;
    const tuckSetup = smooth(clamp(tuck / .75, 0, 1));
    for (let order = 0; order < 2; order++) {
      const i = order === 0 ? leadingLeg : 1 - leadingLeg;
      const sign = i === 0 ? -1 : 1;
      const trailing = (1 + sign * forward) / 2;
      const ridingFootYaw = THREE.MathUtils.lerp(-Math.PI / 2 + forward * (.12 + .36 * (1 - trailing)),
        -Math.PI / 2 + forward * (.35 + trailing * .55), low);
      // Open both feet toward travel before the rear foot leaves the deck.
      const tuckedFootYaw = -Math.PI / 2 + forward * (Math.PI / 2 - .44 + trailing * .09);
      const footYaw = THREE.MathUtils.lerp(THREE.MathUtils.lerp(ridingFootYaw, tuckedFootYaw, tuckSetup),
        -Math.PI / 2 + forward * Math.PI / 2, smooth(clamp(oneFoot / .25, 0, 1)));
      const heelLift = trailing * tuckSetup * .30;
      this.footRotation.setFromEuler(this.euler.set(-heelLift, footYaw, 0, 'YXZ'));
      this.foot.set(sign * .016, .211, sign * .335);
      // A small unloaded setup step narrows the tuck; then the rear heel pivots around the toes.
      this.foot.z -= forward * trailing * tuckSetup * .17;
      this.foot.y += trailing * Math.sin(Math.PI * tuckSetup) * .045;
      this.target.set(0, -.045, -.10).applyAxisAngle(this.y.set(0, 1, 0), footYaw);
      this.foot.add(this.target);
      this.target.set(0, -.045, -.10).applyQuaternion(this.footRotation);
      this.foot.sub(this.target);
      if (footbrake > 0) this.foot.lerp(this.target.set(.235, .054, -.12 * forward), trailing * smooth(clamp((footbrake - .25) / .75, 0, 1)));
      if (push > 0) {
        this.foot.lerp(this.target.set(.24, .066 + pushLift, forward * (-.38 + pushStroke * .56)), trailing * smooth(clamp((push - .25) / .75, 0, 1)));
      }
      this.ankle.set(0, .069, .035).applyQuaternion(this.footRotation).add(this.foot);
      this.shoulder.set(sign * .111, -.04, 0).applyQuaternion(this.pelvisRotation).add(this.hip);
      // The loaded front knee follows the toes; the rear knee folds toward it.
      this.front.set(.78 - tuck * .48 - low * .35, .12 + tuck * (.05 + trailing * .5) + low * trailing * .18,
        -forward * (.22 + tuck * (.24 + trailing * .28) + low * (.40 - trailing * .12) + trailing * .20 * stand));
      this.pole.copy(this.shoulder).add(this.front);
      if (order === 0) this.target.copy(this.ankle).add(this.front.set(.22, .30, -.14 * forward));
      else this.target.copy(this.frontAnkle).lerp(this.frontKnee, .28);
      this.pole.lerp(this.target, tuck);
      // In a deep turn the front knee follows its shoe and the rear knee gathers toward that calf.
      if (order === 0) {
        this.target.set(0, .35, -1).applyQuaternion(this.footRotation).add(this.shoulder);
        // Keep the compressed knee across the deck rather than forcing it below the toe line.
        this.target.z += forward * .50;
      } else this.target.copy(this.frontAnkle).lerp(this.frontKnee, .65);
      this.pole.lerp(this.target, low);
      this.target.set(0, .18, -1).applyQuaternion(this.footRotation).add(this.shoulder);
      this.pole.lerp(this.target, oneFoot);
      this.solve(this.shoulder, this.ankle, this.pole, .41, .39, .25);
      // Keep the kneepad aligned with the solved bend plane throughout a turn.
      this.front.copy(this.bend);
      if (order === 0) { this.frontAnkle.copy(this.end); this.frontKnee.copy(this.joint); }
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
      const contact = ((1 + sign * pose.supportSide) * down + (1 + sign * carveSide) * carve) * .5;
      const free = ((1 - sign * pose.supportSide) * down + (1 - sign * carveSide) * carve) * .5;
      const plantSide = Math.sign(sign * forward || sign);
      this.shoulder.set(sign * .191, .317, 0).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.set(sign * .25, -.15, -.12).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.target.set(sign * .30, -.08, -.14 - sign * forward * pushSwing * .18)
        .applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.lerp(this.target, armPush);
      // Rest the hands behind the lumbar panel instead of raising fists behind the shoulders.
      this.target.set(sign * .095, .085, .15).applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.lerp(this.target, armTuck);
      this.target.set(sign * (.54 + switchWeight * .04), .10 + sign * (forward * .045 + switchLead * .15), -.12)
        .applyQuaternion(model.torso.quaternion).add(this.hip);
      this.hand.lerp(this.target, Math.max(stand, switchWeight));
      // The free arm reaches sideways at shoulder height, rather than lifting a fist.
      this.target.set(this.shoulder.x + plantSide * .53, this.shoulder.y - .035, this.shoulder.z + .03 * forward);
      this.hand.lerp(this.target, free);
      const plantX = plantSide * Math.max(.32, Math.abs(this.shoulder.x + plantSide * .14));
      const roll = lean * .16;
      const plantY = (.054 - plantX * Math.sin(roll)) / Math.cos(roll);
      this.hand.lerp(this.target.set(plantX, plantY, this.shoulder.z + .09 * forward), contact);
      // Palm puck faces the asphalt only during contact; loose hands follow the forearm.
      const glove = model.gloves[i];
      glove.rotation.set(-.8 * (1 - armTuck) * (1 - contact), lookYaw, sign * .2 * (1 - contact), 'YXZ');
      glove.quaternion.premultiply(this.handRotation.setFromEuler(this.euler.set(0, 0, -roll * contact)));
      this.wrist.set(0, .004, .049).applyQuaternion(glove.quaternion).add(this.hand);
      // Shoulder-relative directions keep the elbow plane continuous as the hand moves past it.
      this.armGuide.set(sign * .2, -.15, 1).applyQuaternion(model.torso.quaternion);
      this.target.set(sign * .1, -1, -.15).applyQuaternion(model.torso.quaternion);
      this.armGuide.lerp(this.target, armTuck);
      // Guide the elbows around the flanks on the way to the lower back.
      this.target.set(sign, 0, 0).applyQuaternion(model.torso.quaternion);
      this.armGuide.addScaledVector(this.target, Math.sin(Math.PI * armTuck) * .4);
      this.armGuide.lerp(this.target.set(plantSide * .2, -.35, .4 * forward), free);
      this.armGuide.lerp(this.target.set(plantSide * .15, .1, .6 * forward), contact);
      this.pole.copy(this.shoulder).add(this.armGuide);
      this.solve(this.shoulder, this.wrist, this.pole, .29, .28);
      this.handRotation.copy(glove.quaternion);
      this.z.subVectors(this.joint, this.end).normalize();
      // Hanging palms face the thighs; raised balancing hands turn gradually toward the road.
      this.y.set(sign, 0, 0).applyQuaternion(model.torso.quaternion);
      this.y.lerp(this.target.set(0, 1, 0), Math.max(free, stand, switchWeight));
      this.x.crossVectors(this.y, this.z);
      if (this.x.lengthSq() < 1e-8) this.x.crossVectors(this.axis, this.bend);
      this.x.normalize(); this.y.crossVectors(this.z, this.x);
      this.matrix.makeBasis(this.x, this.y, this.z);
      glove.quaternion.setFromRotationMatrix(this.matrix).slerp(this.handRotation, contact);
      // In the tuck the palms rest toward the back and the fingers point inward, with relaxed wrists.
      this.matrix.makeBasis(this.x.set(0, sign, 0), this.y.set(0, 0, 1), this.z.set(sign, 0, 0));
      this.handRotation.setFromRotationMatrix(this.matrix).premultiply(model.torso.quaternion);
      glove.quaternion.slerp(this.handRotation, armTuck);
      this.hand.set(0, .004, .049).applyQuaternion(glove.quaternion);
      glove.position.copy(this.end).sub(this.hand);
      this.front.copy(this.bend);
      this.segment(model.arms[i * 2], this.shoulder, this.joint, this.front);
      this.segment(model.arms[i * 2 + 1], this.joint, this.end, this.front);
      model.elbows[i].position.copy(this.joint);
      model.elbows[i].quaternion.copy(model.arms[i * 2].quaternion);
    }
  }
}
