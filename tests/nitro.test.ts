import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, idleControls, NITRO_SPEED_BONUS_KMH } from '../src/simulation/race.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { VEHICLES } from '../src/content/vehicles.ts';
import { RaceTimeline } from '../src/presentation.ts';

const track = new Track();
const STEP = 1 / 60;
const throttle = { ...idleControls(), throttle: true };
const boost = { ...idleControls(), nitro: true };

function running(speed = 36) {
  const race = new Race(track); race.phase = 'racing'; race.speed = speed;
  race.placeOnTrack(-2000);
  return race;
}

test('left and right moving slides charge nitro, stronger slides earn more, and the tank caps at 100', () => {
  const charges: number[] = [];
  for (const steering of [-1, 1]) {
    const race = running();
    for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, steering, drift: true });
    assert.ok(race.nitro > 0); assert.equal(race.nitroCharging, true);
    assert.equal(race.boosting, false);
    charges.push(race.nitro);
    const smallerAngle = race.driftAngle; const smallerCharge = race.nitro;
    race.update(STEP, { ...throttle, drift: true });
    const smallerGain = race.nitro - smallerCharge;
    race.driftAngle = smallerAngle * 2;
    const largerCharge = race.nitro;
    race.update(STEP, { ...throttle, drift: true });
    assert.ok(race.nitro - largerCharge > smallerGain);
    race.nitro = 99.99;
    race.update(STEP, { ...throttle, drift: true });
    assert.equal(race.nitro, 100); assert.equal(race.nitroCharging, false);
  }
  assert.ok(Math.abs(charges[0] - charges[1]) < 1e-9);
});

test('ordinary driving, straight handbraking and parked or slow slides cannot farm nitro', () => {
  for (const [speed, controls] of [
    [36, throttle], [36, { ...throttle, steering: 1 }],
    [36, { ...throttle, drift: true }],
    [0, { ...throttle, drift: true, steering: 1 }],
    [5, { ...throttle, drift: true, steering: 1 }],
  ] as const) {
    const race = running(speed);
    for (let i = 0; i < 45; i++) race.update(STEP, controls);
    assert.equal(race.nitro, 0); assert.equal(race.nitroCharging, false);
  }
});

test('earned nitro accelerates out of a slide and releasing saves remaining charge', () => {
  const race = running();
  for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, steering: 1, drift: true });
  const charge = race.nitro; const speed = race.speed;
  race.update(STEP, boost);
  assert.ok(race.speed > speed); assert.ok(race.nitro < charge);
  assert.equal(race.boosting, true); assert.equal(race.nitroCharging, false);
  const remaining = race.nitro;
  race.update(STEP, throttle);
  assert.equal(race.nitro, remaining); assert.equal(race.boosting, false);
});

test('nitro has stronger acceleration and reaches a higher bounded top speed for every vehicle', () => {
  for (const vehicle of VEHICLES) for (const autoThrottle of [false, true]) {
    const nitroLimit = vehicle.topSpeed + NITRO_SPEED_BONUS_KMH;
    const boosted = new Race(track, vehicle); const normal = new Race(track, vehicle);
    for (const race of [boosted, normal]) {
      race.phase = 'racing'; race.placeOnTrack(-2000); race.speed = 12; race.autoThrottle = autoThrottle;
    }
    boosted.nitro = 100;
    for (let i = 0; i < 60; i++) {
      boosted.update(STEP, boost); normal.update(STEP, throttle);
      assert.ok(boosted.speed * 3.6 <= nitroLimit + 1e-9);
    }
    assert.ok(boosted.speed > normal.speed + 20, `${vehicle.id} gets a stronger acceleration advantage`);
    assert.ok(Math.abs(boosted.nitro - 75) < 1e-9);
    for (let i = 0; i < 180; i++) boosted.update(STEP, boost);
    assert.ok(boosted.nitro < 1e-9);
    assert.ok(Math.abs(boosted.speed * 3.6 - nitroLimit) < 1e-9, `${vehicle.id} reaches its nitro limit`);
    boosted.integrity = 40; boosted.nitro = 100;
    boosted.update(STEP, boost);
    assert.ok(boosted.speed * 3.6 <= nitroLimit * 0.85 + 1e-9);
  }
});

test('releasing or exhausting nitro sheds excess speed progressively back to the normal limit', () => {
  for (const empty of [false, true]) {
    const race = running(250 / 3.6); race.nitro = 100;
    for (let i = 0; i < 60; i++) race.update(STEP, boost);
    assert.ok(race.speed * 3.6 > 310);
    if (empty) race.nitro = 0;
    const charge = race.nitro; const speed = race.speed;
    const controls = { ...throttle, nitro: empty };
    race.update(STEP, controls);
    assert.ok(race.speed < speed && race.speed > speed - 1, 'release must not snap directly to 250 km/h');
    assert.equal(race.boosting, false); assert.equal(race.nitro, charge);
    for (let i = 0; i < 180; i++) race.update(STEP, controls);
    assert.ok(Math.abs(race.speed * 3.6 - 250) < 1e-9);
  }
});

test('empty tanks give no boost and a partial final tick cannot yield a full boost pulse', () => {
  const empty = running(0);
  empty.update(STEP, boost);
  assert.equal(empty.speed, 0); assert.equal(empty.nitro, 0); assert.equal(empty.boosting, false);
  const partial = running(12); const full = running(12); const normal = running(12);
  partial.nitro = 25 * STEP / 4; full.nitro = 100;
  partial.update(STEP, boost); full.update(STEP, boost); normal.update(STEP, throttle);
  assert.equal(partial.nitro, 0);
  assert.ok(Math.abs((partial.speed - normal.speed) / (full.speed - normal.speed) - 0.25) < 1e-9);
  partial.update(STEP, boost);
  assert.equal(partial.boosting, false); assert.equal(partial.nitro, 0);
});

test('brake and handbrake override boost without draining the tank', () => {
  for (const autoThrottle of [false, true]) for (const control of ['brake', 'drift']) {
    const race = running(); race.nitro = 70; race.autoThrottle = autoThrottle;
    race.update(STEP, { ...throttle, nitro: true, [control]: true });
    assert.ok(race.speed < 36); assert.equal(race.nitro, 70); assert.equal(race.boosting, false);
  }
  const race = running(); race.nitro = 20;
  for (let i = 0; i < 30; i++) race.update(STEP, { ...boost, steering: 1, drift: true });
  assert.ok(race.nitro > 20); assert.equal(race.boosting, false);
});

test('pause and recovery stop boost, inactive phases freeze charge, and restart empties it', () => {
  const race = running(); race.nitro = 70; race.update(STEP, boost);
  const remaining = race.nitro;
  race.pause(); race.update(1, boost);
  assert.equal(race.nitro, remaining); assert.equal(race.boosting, false);
  race.resume(); race.update(STEP, idleControls());
  assert.equal(race.nitro, remaining); assert.equal(race.boosting, false);
  race.update(STEP, boost);
  const beforeRescue = race.nitro;
  race.recover(); assert.equal(race.nitro, beforeRescue); assert.equal(race.boosting, false);
  race.start(); assert.equal(race.nitro, 0); assert.equal(race.boosting, false);
  for (const phase of ['menu', 'countdown', 'paused', 'finished'] as const) {
    race.phase = phase; race.nitro = 70; race.update(STEP, boost);
    assert.equal(race.nitro, 70); assert.equal(race.boosting, false); assert.equal(race.nitroCharging, false);
  }
});

test('crossing the finish immediately clears active boost', () => {
  const race = running(20); race.nitro = 70;
  race.splits = Array.from({ length: SECTORS - 1 }, () => ({ time: 1, total: 1, delta: 0 }));
  race.placeOnTrack(track.length - 0.1, 0, track.sample(track.length).heading);
  race.update(STEP, boost);
  assert.equal(race.phase, 'finished'); assert.equal(race.boosting, false);
  const charge = race.nitro; race.update(STEP, boost); assert.equal(race.nitro, charge);
});

test('nitro charging and consumption are consistent across display refresh rates', () => {
  const outcomes = [30, 60, 144].map(hz => {
    const race = running(); const timeline = new RaceTimeline(race);
    for (let i = 0; i < hz / 2; i++) timeline.advance(1 / hz, { ...throttle, drift: true, steering: 1 });
    for (let i = 0; i < hz / 2; i++) timeline.advance(1 / hz, boost);
    return { nitro: race.nitro, speed: race.speed, position: race.position };
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});
