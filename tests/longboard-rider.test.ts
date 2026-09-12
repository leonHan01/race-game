import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LongboardRider } from '../src/render/longboard.ts';
import { idleLongboardPose, type LongboardPose } from '../src/simulation/longboard-motion.ts';
import { disposeObject } from '../src/render/dispose.ts';

const point = (rider: LongboardRider, name: string, offset = new THREE.Vector3()) =>
  rider.group.getObjectByName(name)!.localToWorld(offset);
function pose(rider: LongboardRider, values: Partial<LongboardPose>, drift = 0) {
  const state = { ...idleLongboardPose(), ...values };
  rider.group.rotation.y = state.stanceYaw + drift;
  rider.update(20, 0, drift, false, false, 0, false, false, state);
  rider.group.updateMatrixWorld(true);
}

test('limbs keep their length and remain connected through every action in both stances', () => {
  const rider = new LongboardRider();
  for (const stanceYaw of [0, Math.PI]) for (let frame = 0; frame <= 36; frame++) {
    const weight = frame / 36;
    for (const action of ['tuck', 'handsDown', 'footbrake', 'push', 'slide'] as const) {
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
