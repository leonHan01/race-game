import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { LONGBOARD, getVehicle } from '../src/content/vehicles.ts';
import { DOWNHILL_STAGE } from '../src/content/stages.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { LongboardRider } from '../src/render/longboard.ts';
import { disposeObject } from '../src/render/dispose.ts';

const step = 1 / 60;
function raceAt(speed = 22) { const race = new Race(new Track(DOWNHILL_STAGE), LONGBOARD); race.phase = 'racing'; race.speed = speed; return race; }
function switchOnce(race: Race) {
  assert.equal(race.switchLongboardStance(), true);
  for (let i = 0; i < 60; i++) race.update(step, idleControls());
  assert.equal(race.longboard.switching, false);
}
function animate(rider: LongboardRider, race: Race, dt = step) {
  rider.group.rotation.y = race.heading + race.driftAngle + race.longboardPose.stanceYaw;
  rider.update(race.speed, race.steerVisual, race.driftAngle, race.footbraking, race.handbrake, dt, race.tucking, race.pushing, race.longboardPose);
  rider.group.updateMatrixWorld(true);
}
const point = (rider: LongboardRider, name: string) => rider.group.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

test('hands-down and standing slides have distinct braking, angles and contact poses', () => {
  const hands = raceAt(); const stand = raceAt();
  for (let i = 0; i < 45; i++) {
    hands.update(step, { ...idleControls(), drift: true, steering: 0.5 });
    stand.update(step, { ...idleControls(), standupSlide: true, steering: 0.5 });
  }
  assert.equal(hands.longboard.style, 'hands-down'); assert.equal(stand.longboard.style, 'standup');
  assert.ok(hands.speed < stand.speed - 1.5);
  assert.ok(Math.abs(hands.driftAngle) > Math.abs(stand.driftAngle) * 1.5);
  const rider = new LongboardRider(); animate(rider, hands);
  const low = Math.min(point(rider, 'left-slide-glove').y, point(rider, 'right-slide-glove').y);
  const high = Math.max(point(rider, 'left-slide-glove').y, point(rider, 'right-slide-glove').y);
  assert.ok(low < 0.12 && high > 0.5, 'one hand plants while the free arm balances');
  animate(rider, stand);
  assert.ok(point(rider, 'left-slide-glove').y > 0.5 && point(rider, 'right-slide-glove').y > 0.5);
  disposeObject(rider.group);
});

test('heelside and toeside mirror and exchange relative to the leading foot in switch', () => {
  const heel = raceAt(); const toe = raceAt();
  heel.update(step, { ...idleControls(), drift: true, steering: 1 });
  toe.update(step, { ...idleControls(), drift: true, steering: -1 });
  assert.equal(heel.longboard.heelside, true); assert.equal(toe.longboard.heelside, false);
  assert.ok(Math.abs(heel.driftAngle + toe.driftAngle) < 1e-12);
  const switched = raceAt(); switchOnce(switched);
  switched.update(step, { ...idleControls(), drift: true, steering: 1 });
  assert.equal(switched.longboard.heelside, false);
  assert.match(switched.longboard.label, /脚尖侧/);
});

test('slide onset preloads, countersteer reduces the angle, and release restores grip smoothly', () => {
  const held = raceAt(); const counter = raceAt();
  held.update(step, { ...idleControls(), drift: true, steering: 0.6 });
  const first = Math.abs(held.driftAngle); assert.ok(first > 0 && first < 0.01);
  for (let i = 0; i < 40; i++) {
    held.update(step, { ...idleControls(), drift: true, steering: 0.6 });
    counter.update(step, { ...idleControls(), drift: true, steering: i < 20 ? 0.6 : -1 });
  }
  assert.ok(Math.abs(held.driftAngle) > Math.abs(counter.driftAngle));
  const before = Math.abs(held.driftAngle);
  held.update(step, idleControls());
  assert.ok(Math.abs(held.driftAngle) > 0 && Math.abs(held.driftAngle) < before);
  assert.match(held.longboard.label, /收板/);
});

test('180 slides keep world travel forward, swap the physical leading foot, and can return to regular', () => {
  const race = raceAt(); const heading = race.heading;
  assert.equal(race.switchLongboardStance(), true); assert.equal(race.switchLongboardStance(), false);
  for (let i = 0; i < 60; i++) race.update(step, { ...idleControls(), throttle: true, nitro: true });
  assert.equal(race.longboard.stance, 'switch'); assert.equal(race.heading, heading); assert.equal(race.wrongWay, false);
  assert.ok(Math.abs(Math.abs(race.longboardPose.stanceYaw) - Math.PI) < 1e-9);
  assert.ok(race.distance > 10); assert.equal(race.nitro, 0);
  const rider = new LongboardRider(); animate(rider, race);
  assert.ok(point(rider, 'right-foot').z < point(rider, 'left-foot').z, 'the opposite foot leads after the 180');
  switchOnce(race); animate(rider, race);
  assert.equal(race.longboard.stance, 'regular');
  assert.ok(point(rider, 'left-foot').z < point(rider, 'right-foot').z);
  disposeObject(rider.group);
});

test('switch from an existing slide preserves total board orientation at entry', () => {
  const race = raceAt();
  for (let i = 0; i < 30; i++) race.update(step, { ...idleControls(), drift: true, steering: 0.5 });
  const yaw = race.longboardPose.stanceYaw + race.driftAngle;
  assert.equal(race.switchLongboardStance(), true); race.update(step, idleControls());
  assert.ok(Math.abs(race.longboardPose.stanceYaw + race.driftAngle - yaw) < 0.02);
  assert.equal(race.longboard.switching, true); assert.equal(race.tucking, false);
});

test('pause freezes a mid-switch pose, recovery retains committed stance, and restart clears it', () => {
  const race = raceAt(); const timeline = new RaceTimeline(race);
  race.switchLongboardStance();
  for (let i = 0; i < 12; i++) timeline.advance(step, idleControls());
  const pose = JSON.stringify(timeline.pose); race.pause();
  for (let i = 0; i < 20; i++) timeline.advance(step, idleControls());
  assert.equal(JSON.stringify(timeline.pose), pose);
  race.resume();
  for (let i = 0; i < 60; i++) timeline.advance(step, idleControls());
  assert.equal(race.longboard.stance, 'switch');
  race.recover(); timeline.reset(); assert.equal(race.longboard.stance, 'switch');
  assert.equal(race.longboard.switching, false); assert.deepEqual(timeline.pose.longboardPose, race.longboardPose);
  race.start(); timeline.reset(); assert.equal(race.longboard.stance, 'regular'); assert.equal(race.longboardPose.stanceYaw, 0);
});

test('inactive races, cars, motorcycles and parked boards reject switch; X never brakes motor vehicles', () => {
  const race = raceAt(0); assert.equal(race.switchLongboardStance(), false);
  race.speed = 20;
  for (const phase of ['menu', 'countdown', 'paused', 'finished'] as const) { race.phase = phase; assert.equal(race.switchLongboardStance(), false); }
  for (const vehicle of ['falcon', 'trail']) {
    const motor = new Race(new Track(DOWNHILL_STAGE), getVehicle(vehicle)); motor.phase = 'racing'; motor.speed = 20;
    assert.equal(motor.switchLongboardStance(), false);
    motor.update(step, { ...idleControls(), throttle: true, standupSlide: true });
    assert.equal(motor.handbrake, false); assert.ok(motor.speed > 20);
  }
});

test('brake wins over both slide inputs and tuck, while Space wins over standing slides', () => {
  const race = raceAt();
  race.update(step, { throttle: true, brake: true, drift: true, steering: 1, nitro: true, standupSlide: true });
  assert.equal(race.footbraking, true); assert.equal(race.longboard.style, 'none'); assert.equal(race.tucking, false);
  race.update(step, { ...idleControls(), drift: true, standupSlide: true });
  assert.equal(race.longboard.style, 'hands-down');
});

test('fixed-step trick state is deterministic across paint rates and model pose holds on pause', () => {
  const states = [30, 60, 144].map(rate => {
    const race = raceAt(); const timeline = new RaceTimeline(race); race.switchLongboardStance();
    for (let frame = 0; frame < rate * 2; frame++) timeline.advance(1 / rate, idleControls());
    return { pose: { ...race.longboardPose }, speed: race.speed, position: { ...race.position } };
  });
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);
  const race = raceAt(); const rider = new LongboardRider(); race.switchLongboardStance();
  for (let tick = 0; tick < 20; tick++) { race.update(step, idleControls()); animate(rider, race); }
  const before = point(rider, 'full-face-helmet'); animate(rider, race, 0);
  assert.deepEqual(point(rider, 'full-face-helmet'), before);
  disposeObject(rider.group);
});

test('pushing in either stance keeps the supporting foot on the deck and return foot above ground', () => {
  const race = raceAt(5); const rider = new LongboardRider();
  for (const switched of [false, true]) {
    if (switched) switchOnce(race);
    for (let i = 0; i < 90; i++) {
      race.speed = 5; race.update(step, { ...idleControls(), throttle: true }); animate(rider, race);
      const support = point(rider, switched ? 'right-foot' : 'left-foot');
      const rear = point(rider, switched ? 'left-foot' : 'right-foot');
      assert.ok(support.y > 0.16 && support.y < 0.25);
      assert.ok(rear.y >= 0.06, 'the returning foot does not penetrate the road');
    }
  }
  disposeObject(rider.group);
});
