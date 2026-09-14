import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LongboardRider } from '../src/render/longboard.ts';
import { idleLongboardPose, LongboardMotion, type LongboardPose } from '../src/simulation/longboard-motion.ts';
import { disposeObject } from '../src/render/dispose.ts';

const point = (rider: LongboardRider, name: string, offset = new THREE.Vector3()) =>
  rider.group.getObjectByName(name)!.localToWorld(offset);
function pose(rider: LongboardRider, values: Partial<LongboardPose>, drift = 0, steering = 0) {
  const state = { ...idleLongboardPose(), ...values };
  state.supportSide = values.supportSide ?? Math.sign(drift || -1) * Math.cos(state.stanceYaw);
  rider.group.rotation.y = state.stanceYaw + drift;
  rider.update(20, steering, drift, false, false, 0, false, false, state);
  rider.group.updateMatrixWorld(true);
}

test('a footbrake turns the supporting foot along travel before unloading the rear foot', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) {
    pose(rider, { stanceYaw, footbrake: 1 });
    const shoe = rider.group.getObjectByName(stanceYaw === 0 ? 'left-foot' : 'right-foot')!;
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(shoe.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(direction.dot(new THREE.Vector3(0, 0, -1)) > .97, 'the supporting ankle cannot stay twisted sideways');
    const ankle = shoe.localToWorld(new THREE.Vector3(0, .069, .035));
    const knee = point(rider, stanceYaw === 0 ? 'left-knee' : 'right-knee');
    assert.ok(ankle.z - knee.z < .28, 'footbraking does not collapse into a deep forward squat');
  }
  disposeObject(rider.group);
});

test('the tuck compacts the rear knee toward the front calf without thrusting the front knee out', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) {
    pose(rider, { stanceYaw, tuck: 1 });
    const front = stanceYaw === 0 ? 'left' : 'right'; const rear = stanceYaw === 0 ? 'right' : 'left';
    const ankle = point(rider, `${front}-foot`, new THREE.Vector3(0, .069, .035));
    const knee = point(rider, `${front}-knee`);
    assert.ok(ankle.z - knee.z < .22, 'front shin leans excessively beyond the toes');
    const calf = new THREE.Line3(ankle, knee).closestPointToPoint(point(rider, `${rear}-knee`), true, new THREE.Vector3());
    assert.ok(calf.distanceTo(point(rider, `${rear}-knee`)) < .24, 'rear knee should fold beside the front calf');
  }
  disposeObject(rider.group);
});

test('hips and upper-body balance stay over the leading foot in regular and switch', () => {
  const rider = new LongboardRider();
  const actions: [Partial<LongboardPose>, number][] = [
    [{}, 0], [{ tuck: 1 }, 0], [{ carve: 1 }, 0], [{ carve: -1 }, 0],
    [{ slide: 1 }, -.65], [{ slide: 1 }, .65],
    ...[-1.18, -.65, .65, 1.18].map(drift => [{ slide: 1, handsDown: 1 }, drift] as [Partial<LongboardPose>, number]),
  ];
  for (const stanceYaw of [0, Math.PI]) for (const [action, drift] of actions) {
    pose(rider, { stanceYaw, ...action }, drift);
    const front = point(rider, stanceYaw === 0 ? 'left-foot' : 'right-foot');
    const rear = point(rider, stanceYaw === 0 ? 'right-foot' : 'left-foot');
    const axis = front.clone().sub(rear); axis.y = 0;
    const hips = point(rider, 'rider-pelvis');
    // A visual balance proxy, independent of the rig's hip offsets (not a physics mass).
    const balance = hips.clone().multiplyScalar(.4)
      .addScaledVector(point(rider, 'rider-torso', new THREE.Vector3(0, .2, 0)), .4)
      .addScaledVector(point(rider, 'full-face-helmet'), .2);
    const fraction = (p: THREE.Vector3) => p.clone().sub(rear).dot(axis) / axis.lengthSq();
    const label = `${stanceYaw}/${JSON.stringify(action)}/${drift}`;
    assert.ok(fraction(hips) > .68, `hips load the front half: ${label}`);
    assert.ok(fraction(balance) > .62, `the upper body cannot sit over the rear foot: ${label}`);
    for (const side of ['left', 'right']) {
      const shoe = rider.group.getObjectByName(`${side}-foot`)!;
      const isRear = side === (stanceYaw === 0 ? 'right' : 'left');
      if (action.tuck && isRear) {
        // A raised rear heel still supports on its toe; it is not a hovering flat foot.
        const toe = shoe.localToWorld(new THREE.Vector3(0, -.045, -.10));
        const heel = shoe.localToWorld(new THREE.Vector3(0, -.045, .10));
        assert.ok(Math.abs(toe.y - .166) < 1e-6, 'rear toe stays on the deck');
        assert.ok(heel.y - toe.y > .04 && heel.y - toe.y < .08, 'rear heel lifts moderately');
      } else assert.ok(Math.abs(shoe.position.y - .211) < 1e-6, 'loaded foot stays planted');
      assert.ok(rider.group.getObjectByName(`${side}-knee`)!.position.y >= .25 - 1e-6);
    }
  }
  disposeObject(rider.group);
});

test('footbrake setup finishes the support-foot pivot before the rear foot descends', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (const action of ['footbrake', 'push'] as const) {
    for (let frame = 0; frame <= 60; frame++) {
      // Reverse this same sequence to check planting before the support foot pivots back.
      pose(rider, { stanceYaw, [action]: frame / 60 });
      const front = rider.group.getObjectByName(stanceYaw === 0 ? 'left-foot' : 'right-foot')!;
      const rear = point(rider, stanceYaw === 0 ? 'right-foot' : 'left-foot');
      assert.ok(Math.abs(front.position.y - .211) < 1e-6, 'the support foot cannot lift');
      if (rear.y < .205) {
        const toes = new THREE.Vector3(0, 0, -1).applyQuaternion(front.getWorldQuaternion(new THREE.Quaternion()));
        assert.ok(toes.z < -.97, 'the supporting toes point along travel before unloading');
      }
    }
  }
  disposeObject(rider.group);
});

test('tucked hands stay beside one another at the lower back with elbows close to the body', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) {
    pose(rider, { stanceYaw, tuck: 1 });
    const torso = rider.group.getObjectByName('rider-torso')!;
    const hands = ['left', 'right'].map(side => {
      const hand = torso.worldToLocal(point(rider, `${side}-slide-glove`));
      const elbow = torso.worldToLocal(point(rider, `${side}-elbow`));
      assert.ok(hand.y > -.02 && hand.y < .20 && hand.z > .12 && hand.z < .26, 'hands rest behind the lumbar panel');
      assert.ok(Math.abs(elbow.x) < .28, 'elbows do not flare sideways in the tuck');
      assert.ok(point(rider, `${side}-elbow`).y < point(rider, 'rider-pelvis').y + .07, 'elbows hang beside the waist instead of rising behind the helmet');
      const glove = rider.group.getObjectByName(`${side}-slide-glove`)!;
      const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(glove.getWorldQuaternion(new THREE.Quaternion()));
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(palm.dot(back) > .97, 'the palms rest toward the back');
      return hand;
    });
    assert.ok(hands[0].distanceTo(hands[1]) > .065, 'the gloves must not overlap');
    assert.ok(hands[0].distanceTo(hands[1]) < .20, 'hands stay together behind the back');
  }
  disposeObject(rider.group);
});

test('leaving a tuck for braking, pushing or Switch keeps planted support and continuous joints', () => {
  const rider = new LongboardRider();
  const names = ['rider-pelvis', 'full-face-helmet', 'left-knee', 'right-knee', 'left-slide-glove', 'right-slide-glove', 'left-foot', 'right-foot'];
  const vertex = new THREE.Vector3();
  const input = { speed: 22, steering: 0, slide: false, standup: false, brake: false, tuck: true, push: false };
  for (const switched of [false, true]) for (const action of ['brake', 'push', 'switch'] as const) {
    const motion = new LongboardMotion();
    if (switched) {
      motion.requestSwitch(22, 0);
      for (let tick = 0; tick < 60; tick++) motion.update(1 / 60, { ...input, tuck: false });
    }
    for (let tick = 0; tick < 120; tick++) motion.update(1 / 60, input);
    pose(rider, motion.pose, motion.angle);
    let previous = names.map(name => point(rider, name));
    if (action === 'switch') motion.requestSwitch(22, 0);
    // Keep Shift held during the action and return to tuck on release.
    for (let tick = 0; tick < 180; tick++) {
      motion.update(1 / 60, { ...input, brake: action === 'brake' && tick < 90, push: action === 'push' && tick < 90 });
      pose(rider, motion.pose, motion.angle);
      const next = names.map(name => point(rider, name));
      next.forEach((p, i) => assert.ok(p.distanceTo(previous[i]) < .12, `${action}: ${names[i]} snaps at frame ${tick}`));
      if (action !== 'switch') {
        const front = rider.group.getObjectByName(switched ? 'right-foot' : 'left-foot')!;
        assert.ok(Math.abs(front.position.y - .211) < 1e-6, 'support foot stays on the deck throughout the transition');
      }
      for (const side of ['left', 'right']) {
        const shoe = rider.group.getObjectByName(`${side}-foot`) as THREE.Mesh;
        const vertices = shoe.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          shoe.localToWorld(vertex.fromBufferAttribute(vertices, i));
          assert.ok(vertex.y >= -.005, `${action}: the shoe penetrates the road`);
        }
      }
      previous = next;
    }
  }
  disposeObject(rider.group);
});

test('the front leg supports a complete push stroke and footbrake without shifting back', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (const action of ['push', 'footbrake']) for (let frame = 0; frame <= 60; frame++) {
    pose(rider, { stanceYaw, [action]: 1, pushPhase: frame / 60 * Math.PI * 2 });
    const foot = point(rider, stanceYaw === 0 ? 'left-foot' : 'right-foot');
    const hips = point(rider, 'rider-pelvis');
    assert.ok(Math.hypot(hips.x - foot.x, hips.z - foot.z) < .09, `${action}: hips stay above the supporting foot`);
    assert.ok(Math.abs(foot.y - .211) < 1e-6, 'the planted foot does not slide or lift');
  }
  disposeObject(rider.group);
});

test('the pushing foot finishes its ground stroke before lifting and the arms counter-swing', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) {
    const rear = stanceYaw === 0 ? 'right' : 'left';
    const front = stanceYaw === 0 ? 'left' : 'right';
    const start = new Map<string, THREE.Vector3>();
    for (let frame = 0; frame <= 60; frame++) {
      pose(rider, { stanceYaw, push: 1, pushPhase: frame / 60 * Math.PI });
      const foot = point(rider, `${rear}-foot`);
      assert.ok(Math.abs(foot.y - .066) < .002, 'the push cannot lose ground contact before the stroke ends');
      for (const side of [front, rear]) {
        const hand = point(rider, `${side}-slide-glove`);
        if (frame === 0) start.set(side, hand);
        if (frame === 60) {
          const travel = hand.z - start.get(side)!.z;
          assert.ok(side === rear ? travel < -.18 : travel > .18, 'arms swing opposite to the working leg');
        }
      }
    }
    pose(rider, { stanceYaw, push: 1, pushPhase: Math.PI * 1.5 });
    assert.ok(point(rider, `${rear}-foot`).y > .24, 'the returning foot clears the road');
  }
  disposeObject(rider.group);
});

test('deep turns keep the knees gathered instead of spreading beyond the stance', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (const carve of [-1, 1]) {
    pose(rider, { stanceYaw, carve }, 0, carve);
    const left = point(rider, 'left-knee'), right = point(rider, 'right-knee');
    assert.ok(left.distanceTo(right) < .60, 'the knees cannot form a wide split during a compressed turn');
    const leading = stanceYaw === 0 ? 'left' : 'right';
    const foot = rider.group.getObjectByName(`${leading}-foot`)!;
    const ankle = foot.localToWorld(new THREE.Vector3(0, .069, .035));
    const bend = point(rider, `${leading}-knee`).sub(ankle); bend.y = 0;
    const toes = new THREE.Vector3(0, 0, -1).applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion())); toes.y = 0;
    assert.ok(bend.angleTo(toes) < Math.PI / 4, 'the support knee follows the toes');
  }
  disposeObject(rider.group);
});

test('reversing a deep carve keeps knee positions and kneepad rotations continuous', () => {
  const rider = new LongboardRider();
  const input = { speed: 25, steering: 1, slide: false, standup: false, brake: false, tuck: false, push: false };
  const names = ['left-knee', 'right-knee', 'left-foot', 'right-foot'];
  const sample = () => names.map(name => {
    const part = rider.group.getObjectByName(name)!;
    return { position: part.getWorldPosition(new THREE.Vector3()), rotation: part.getWorldQuaternion(new THREE.Quaternion()) };
  });
  for (const switched of [false, true]) {
    const motion = new LongboardMotion();
    if (switched) {
      motion.requestSwitch(25, 0);
      for (let frame = 0; frame < 60; frame++) motion.update(1 / 60, { ...input, steering: 0 });
    }
    for (let frame = 0; frame < 100; frame++) motion.update(1 / 60, input);
    pose(rider, motion.pose, 0, 1);
    let previous = sample();
    for (let frame = 0; frame < 140; frame++) {
      motion.update(1 / 60, { ...input, steering: -1 });
      pose(rider, motion.pose, 0, -1);
      const current = sample();
      current.forEach((part, i) => {
        assert.ok(part.position.distanceTo(previous[i].position) < .12, `${names[i]} jumps at frame ${frame}`);
        assert.ok(part.rotation.angleTo(previous[i].rotation) < .65, `${names[i]} twists at frame ${frame}`);
      });
      previous = current;
    }
  }
  disposeObject(rider.group);
});

test('the collar and helmet remain connected throughout tuck and low-turn transitions', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (let frame = 0; frame <= 30; frame++) {
    for (const action of ['tuck', 'handsDown', 'carve'] as const) {
      const weight = frame / 30;
      pose(rider, { stanceYaw, [action]: weight, ...(action === 'handsDown' ? { slide: weight } : {}) });
      const collar = point(rider, 'rider-torso', new THREE.Vector3(0, .386, 0));
      const helmet = point(rider, 'full-face-helmet', new THREE.Vector3(0, -.085, .008));
      assert.ok(point(rider, 'rider-neck').distanceTo(collar) < 1e-6);
      assert.ok(point(rider, 'rider-neck', new THREE.Vector3(0, .12, 0)).distanceTo(helmet) < 1e-6);
    }
  }
  let meshes = 0; let triangles = 0;
  rider.group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
  });
  assert.ok(meshes <= 32 && triangles < 15000, 'detail stays within the rider geometry budget');
  disposeObject(rider.group);
});

test('elbows, sleeves and wrists move continuously through turns, pushing, tuck and Switch', () => {
  const rider = new LongboardRider();
  const names = ['left-upper-arm', 'right-upper-arm', 'left-forearm', 'right-forearm', 'left-slide-glove', 'right-slide-glove'];
  const input = { speed: 25, steering: 1, slide: false, standup: false, brake: false, tuck: false, push: false };
  const sample = () => names.map(name => {
    const part = rider.group.getObjectByName(name)!;
    return { position: part.getWorldPosition(new THREE.Vector3()), rotation: part.getWorldQuaternion(new THREE.Quaternion()) };
  });
  for (const switched of [false, true]) for (const action of ['turn', 'push', 'tuck', 'switch']) {
    const motion = new LongboardMotion();
    if (switched) {
      motion.requestSwitch(25, 0);
      for (let frame = 0; frame < 60; frame++) motion.update(1 / 60, { ...input, steering: 0 });
    }
    for (let frame = 0; frame < 100; frame++) {
      motion.update(1 / 60, { ...input, steering: action === 'turn' ? 1 : 0, slide: action === 'switch' });
    }
    pose(rider, motion.pose, motion.angle, action === 'turn' ? 1 : 0);
    let previous = sample();
    if (action === 'switch') motion.requestSwitch(25, 1);
    for (let frame = 0; frame < 150; frame++) {
      const steering = action === 'turn' ? -1 : 0;
      motion.update(1 / 60, { ...input, steering, push: action === 'push' && frame < 90, tuck: action === 'tuck' && frame < 90 });
      pose(rider, motion.pose, motion.angle, steering);
      const current = sample();
      current.forEach((part, i) => {
        assert.ok(part.position.distanceTo(previous[i].position) < .14, `${switched}/${action}: ${names[i]} jumps at ${frame}`);
        assert.ok(part.rotation.angleTo(previous[i].rotation) < .75, `${switched}/${action}: ${names[i]} twists at ${frame}`);
      });
      previous = current;
    }
  }
  disposeObject(rider.group);
});

test('relaxed hands face inward beside the body instead of holding the palms down', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (const footbrake of [0, 1]) {
    pose(rider, { stanceYaw, footbrake });
    const torso = rider.group.getObjectByName('rider-torso')!;
    for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
      const glove = rider.group.getObjectByName(`${side}-slide-glove`)!;
      const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(glove.getWorldQuaternion(new THREE.Quaternion()));
      const inward = new THREE.Vector3(-sign, 0, 0).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(palm.dot(inward) > .65, `${side}: relaxed palm faces the body`);
    }
  }
  disposeObject(rider.group);
});

test('limbs keep their length and remain connected through every action in both stances', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (let frame = 0; frame <= 36; frame++) {
    const weight = frame / 36;
    for (const action of ['tuck', 'handsDown', 'footbrake', 'push', 'slide', 'carve'] as const) {
      pose(rider, { stanceYaw, [action]: weight, ...(action === 'handsDown' ? { slide: weight } : {}), pushPhase: weight * Math.PI * 2 }, -.95);
      for (const side of ['left', 'right']) {
        const knee = point(rider, `${side}-knee`), elbow = point(rider, `${side}-elbow`);
        assert.ok(point(rider, `${side}-thigh`, new THREE.Vector3(0, .41, 0)).distanceTo(knee) < 1e-6);
        const ankle = point(rider, `${side}-foot`, new THREE.Vector3(0, .069, .035));
        assert.ok(point(rider, `${side}-shin`, new THREE.Vector3(0, .39, 0)).distanceTo(ankle) < 1e-6);
        assert.ok(point(rider, `${side}-upper-arm`, new THREE.Vector3(0, .29, 0)).distanceTo(elbow) < 1e-6);
        const wrist = point(rider, `${side}-slide-glove`, new THREE.Vector3(0, .004, .049));
        assert.ok(point(rider, `${side}-forearm`, new THREE.Vector3(0, .28, 0)).distanceTo(wrist) < 1e-6);
        assert.ok(Math.abs(point(rider, `${side}-thigh`).distanceTo(knee) - .41) < 1e-6);
        assert.ok(Math.abs(knee.distanceTo(ankle) - .39) < 1e-6);
        assert.ok(Math.abs(elbow.distanceTo(wrist) - .28) < 1e-6);
      }
    }
  }
  disposeObject(rider.group);
});

test('each hands-down stance plants its palm beside the board without stretching an arm', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI, -Math.PI, Math.PI * 2]) for (const drift of [-1.18, -.65, .65, 1.18]) {
    pose(rider, { stanceYaw, slide: 1, handsDown: 1 }, drift);
    const gloves = ['left-slide-glove', 'right-slide-glove'].map(name => rider.group.getObjectByName(name)!);
    const planted = gloves.find(glove => glove.position.y < .08);
    assert.ok(planted, `palm contact at stance ${stanceYaw}, slide ${drift}`);
    assert.ok(Math.abs(planted.position.x) >= .30, 'puck contacts the road beside the deck');
    assert.ok(planted.position.y >= .045, 'puck stays above the road');
    assert.ok(gloves.some(glove => glove.position.y > .6));
    assert.ok(rider.group.getObjectByName('rider-pelvis')!.position.y > .5, 'hips stay lifted out of a seated split');
    for (const name of ['left-knee', 'right-knee']) {
      assert.ok(rider.group.getObjectByName(name)!.position.y > .23, 'kneepads clear the deck');
    }
  }
  disposeObject(rider.group);
});

test('switch turns continuously while both feet stay on the deck', () => {
  const rider = new LongboardRider();
  let previous: THREE.Vector3[] | undefined;
  for (let frame = 0; frame <= 90; frame++) {
    const progress = frame / 90;
    pose(rider, { stanceYaw: -Math.PI * progress, switchWeight: Math.sin(progress * Math.PI), slide: Math.sin(progress * Math.PI) * .7 });
    const next = ['full-face-helmet', 'left-knee', 'right-knee', 'left-slide-glove', 'right-slide-glove'].map(name => point(rider, name));
    if (previous) next.forEach((p, i) => assert.ok(p.distanceTo(previous![i]) < .07, 'no joint snaps between frames'));
    for (const name of ['left-foot', 'right-foot']) assert.ok(Math.abs(point(rider, name).y - .211) < 1e-6);
    previous = next;
  }
  disposeObject(rider.group);
});

test('reference turns plant the inside palm and extend the free arm in both stances', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, -Math.PI]) for (const carve of [-1, 1]) {
    pose(rider, { stanceYaw, carve }, 0, carve);
    const plantedSide = carve > 0 ? 'right' : 'left';
    const freeSide = carve > 0 ? 'left' : 'right';
    const palm = point(rider, `${plantedSide}-slide-glove`);
    const free = point(rider, `${freeSide}-slide-glove`);
    const shoulder = point(rider, `${freeSide}-upper-arm`);
    assert.ok(palm.x * carve > .3, 'support hand sits inside the turn');
    assert.ok(Math.abs(palm.y - .054) < .005, 'puck follows the road while the deck banks');
    assert.ok((free.x - shoulder.x) * carve < -.35, 'the free arm extends across the road');
    assert.ok(Math.abs(free.y - shoulder.y) < .16, 'the free hand is near shoulder height');
    const hips = point(rider, 'rider-pelvis');
    assert.ok(hips.y > .48 && hips.y < .58 && hips.x * carve > .08);
    for (const side of ['left', 'right']) {
      assert.ok(Math.abs(rider.group.getObjectByName(`${side}-foot`)!.position.y - .211) < 1e-6);
      assert.ok(point(rider, `${side}-knee`).y > .16, 'knees stay above the asphalt');
    }
  }
  disposeObject(rider.group);
});

test('changing turn direction lifts through centre smoothly before planting the other hand', () => {
  const motion = new LongboardMotion(); const rider = new LongboardRider();
  const input = { speed: 25, steering: 1, slide: false, standup: false, brake: false, tuck: false, push: false };
  for (let tick = 0; tick < 90; tick++) motion.update(1 / 60, input);
  pose(rider, motion.pose);
  const names = ['full-face-helmet', 'rider-pelvis', 'left-slide-glove', 'right-slide-glove'];
  let previous = names.map(name => point(rider, name));
  let raised = false;
  for (let tick = 0; tick < 90; tick++) {
    motion.update(1 / 60, { ...input, steering: -1 }); pose(rider, motion.pose);
    const next = names.map(name => point(rider, name));
    next.forEach((p, i) => assert.ok(p.distanceTo(previous[i]) < .16, `${names[i]} snaps at frame ${tick}`));
    if (point(rider, 'rider-pelvis').y > .85) raised = true;
    previous = next;
  }
  assert.ok(raised, 'the rider unloads before leaning into the opposite turn');
  assert.ok(point(rider, 'left-slide-glove').y < .08);
  disposeObject(rider.group);
});

test('both slide sides release the same palm into Switch without joint snaps or a backwards neck', () => {
  const rider = new LongboardRider();
  const names = ['full-face-helmet', 'rider-pelvis', 'left-knee', 'right-knee', 'left-slide-glove', 'right-slide-glove'];
  for (const switched of [false, true]) for (const steering of [-1, 1]) {
    const motion = new LongboardMotion();
    const input = { speed: 22, steering, slide: false, standup: false, brake: false, tuck: false, push: false };
    if (switched) {
      motion.requestSwitch(22, 0);
      for (let tick = 0; tick < 60; tick++) motion.update(1 / 60, input);
    }
    for (let tick = 0; tick < 40; tick++) motion.update(1 / 60, { ...input, slide: true });
    pose(rider, motion.pose, motion.angle);
    let previous = names.map(name => point(rider, name));
    const supportSide = motion.pose.supportSide;
    motion.requestSwitch(22, steering);
    for (let tick = 0; tick < 60; tick++) {
      motion.update(1 / 60, input);
      pose(rider, motion.pose, motion.angle);
      assert.equal(motion.pose.supportSide, supportSide, 'the planted hand cannot swap during the release');
      const next = names.map(name => point(rider, name));
      next.forEach((p, i) => assert.ok(p.distanceTo(previous[i]) < .14, `${names[i]} snaps at frame ${tick}`));
      const torso = rider.group.getObjectByName('rider-torso')!;
      const helmet = rider.group.getObjectByName('full-face-helmet')!;
      const chestForward = new THREE.Vector3(0, 0, -1).applyQuaternion(torso.quaternion);
      const gaze = new THREE.Vector3(0, 0, -1).applyQuaternion(helmet.quaternion);
      assert.ok(chestForward.angleTo(gaze) < Math.PI / 2, 'the head follows the torso through the turn');
      for (const name of ['left-foot', 'right-foot']) assert.ok(Math.abs(point(rider, name).y - .211) < 1e-6);
      previous = next;
    }
  }
  disposeObject(rider.group);
});

test('repeated render-time livery selection does not recolor or reupload the rider every frame', () => {
  const rider = new LongboardRider(); rider.setLivery(0);
  const torso = rider.group.getObjectByName('rider-torso') as THREE.Mesh;
  const color = torso.geometry.getAttribute('color') as THREE.BufferAttribute;
  const baseline = color.array.slice(), version = color.version;
  for (let frame = 0; frame < 120; frame++) rider.setLivery(0);
  assert.equal(color.version, version);
  rider.setLivery(1);
  assert.equal(color.version, version + 1); assert.notDeepEqual(color.array, baseline);
  assert.equal(torso.material instanceof THREE.MeshStandardMaterial, true);
  disposeObject(rider.group);
});
