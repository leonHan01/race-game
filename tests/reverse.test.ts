import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehicle, VEHICLES, LONGBOARD, vehicleClearance } from '../src/content/vehicles.ts';
import { getStage } from '../src/content/stages.ts';
import { Race, idleControls, MAX_REVERSE_SPEED_KMH, type Controls } from '../src/simulation/race.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { VerticalMotion } from '../src/simulation/vertical-motion.ts';

const STEP = 1 / 60;
const reverse = { ...idleControls(), brake: true };
const forward = { ...idleControls(), throttle: true };
const track = new Track({ ...getStage('pine'), closed: false, venue: undefined, jumps: [], points: [
  { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -500 }, { x: 0, y: 0, z: -1000 },
] });
function running(vehicle = getVehicle('falcon')) {
  const race = new Race(track, vehicle); race.phase = 'racing'; race.placeOnTrack(100);
  for (const car of race.opponents.cars) car.finishTime = 0;
  return race;
}
function advance(race: Race, seconds: number, controls: Controls) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) race.update(STEP, controls);
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('every car and motorcycle brakes to zero before reversing, including with automatic throttle', () => {
  for (const vehicle of VEHICLES) for (const autoThrottle of [false, true]) {
    const race = running(vehicle); race.autoThrottle = autoThrottle; race.speed = 10;
    let stopped = false;
    for (let i = 0; i < 240; i++) {
      race.update(STEP, { ...reverse, throttle: !autoThrottle });
      if (race.speed === 0) stopped = true;
      if (race.speed < 0) assert.ok(stopped, `${vehicle.id} must stop before changing direction`);
      assert.ok(race.speed >= -MAX_REVERSE_SPEED_KMH / 3.6 - 1e-9);
    }
    assert.ok(race.distance < 100, `${vehicle.id} moves backwards in world space`);
    close(race.speed * 3.6, -MAX_REVERSE_SPEED_KMH);
    assert.equal(race.gear, -1); assert.equal(race.engineRevs, 1);
    close(race.heading, 0); close(race.travelHeading, 0);
  }
});

test('forward throttle brakes reverse motion before driving forward', () => {
  for (const autoThrottle of [false, true]) {
    const race = running(); race.speed = -8; race.autoThrottle = autoThrottle;
    const controls = autoThrottle ? idleControls() : forward;
    for (let i = 0; i < 60 && race.speed < 0; i++) {
      race.update(STEP, controls);
      assert.ok(race.speed <= 0, 'braking cannot skip the stopped state');
    }
    assert.equal(race.speed, 0); assert.equal(race.gear, 0);
    const distance = race.distance;
    race.update(STEP, controls);
    assert.ok(race.speed > 0 && race.distance > distance);
  }
});

test('coasting and handbraking stop reverse movement without bouncing or powering through the brake', () => {
  for (const controls of [idleControls(), { ...forward, drift: true }, { ...reverse, drift: true }]) {
    const race = running(); race.speed = -6;
    advance(race, 3, controls);
    assert.equal(race.speed, 0);
    const position = { ...race.position };
    advance(race, 0.5, controls);
    assert.deepEqual(race.position, position);
    assert.equal(race.drifting, false); assert.equal(race.nitro, 0);
  }
});

test('reverse steering mirrors forward yaw and follows the steered wheels', () => {
  for (const steering of [-1, 1]) {
    const forwards = running(); forwards.speed = 6;
    const backwards = running(); backwards.speed = -6;
    for (const race of [forwards, backwards]) advance(race, 0.4, { ...idleControls(), steering });
    close(forwards.heading, -backwards.heading);
    close(forwards.travelHeading, -backwards.travelHeading);
    assert.equal(Math.sign(backwards.heading), steering);
    assert.equal(Math.sign(backwards.position.x), steering);
    assert.ok(backwards.distance < 100);
  }
});

test('reverse movement cannot engage nitro', () => {
  const race = running(); race.nitro = 70; race.speed = -6;
  race.update(STEP, { ...forward, nitro: true });
  assert.equal(race.nitro, 70); assert.equal(race.boosting, false);
  assert.ok(race.speed > -6 && race.speed < 0);
});

test('reverse contacts preserve signed momentum instead of flipping the car into forward drive', () => {
  const race = running(); race.speed = -8;
  const car = race.opponents.cars[0];
  Object.assign(car, { distance: 95, lane: 0, targetLane: 0, speed: 0, planIn: 100, finishTime: null,
    vehicle: { ...race.vehicle, acceleration: 0 }, heading: 0 });
  Object.assign(car.position, track.position(95)); car.vertical.reset(car.position.y);
  race.update(0.1, reverse);
  assert.ok(race.integrity < 100, 'the rear of the player hits the rival');
  assert.ok(race.speed < 0 && race.speed > -8);
  close(race.travelHeading, race.heading);
  assert.ok(race.distance - car.distance >= 4.6999);
  const distance = race.distance;
  race.update(STEP, idleControls());
  assert.ok(race.speed < 0 && race.distance < distance);
});

test('reverse can back away from a front impact and remains contained when reversing into a barrier', () => {
  for (const side of [-1, 1]) {
    const race = running(); const limit = track.boundaryEdge - vehicleClearance(race.vehicle);
    race.placeOnTrack(100, side * (limit - 0.01), -side * Math.PI / 2); race.speed = 8;
    race.update(STEP, forward);
    const contactLane = race.lane;
    race.speed = 0;
    advance(race, 0.7, reverse);
    assert.ok(Math.abs(race.lane) < Math.abs(contactLane) - 0.5);
    race.placeOnTrack(100, side * (limit - 0.01), side * Math.PI / 2); race.speed = -8;
    const integrity = race.integrity;
    advance(race, 0.5, reverse);
    assert.ok(Math.abs(race.lane) <= limit + 1e-7);
    assert.ok(race.integrity < integrity && race.integrity >= 0);
    assert.ok(race.speed < 0 && race.speed > -8);
  }
});

test('wrong-way detection follows reverse velocity and backward gate crossings do not award splits', () => {
  const race = running(); const gate = track.length / SECTORS;
  race.placeOnTrack(gate + 0.05); race.speed = -8;
  assert.equal(race.wrongWay, true);
  race.update(STEP, reverse);
  assert.ok(race.distance < gate); assert.equal(race.splits.length, 0);
  race.placeOnTrack(100, 0, Math.PI); race.speed = -8;
  assert.equal(race.wrongWay, false);
  race.update(STEP, reverse);
  assert.ok(race.distance > 100);
});

test('reverse flight retains momentum and pitches the body consistently with its facing direction', () => {
  const motions = [1, -1].map(direction => {
    const motion = new VerticalMotion(); motion.reset(1);
    motion.update(0.1, { height: 0, speed: 8 * direction, launchVelocity: 3, groundVelocity: 0, pitch: 0 });
    assert.equal(motion.airborne, true);
    return motion;
  });
  close(motions[0].height, motions[1].height); close(motions[0].pitch, -motions[1].pitch);
  const race = running(); race.speed = -6;
  race.vertical.airborne = true;
  race.update(STEP, forward);
  close(race.speed, -6 * (1 - STEP * 0.035));
});

test('recovery clears reverse movement and longboards retain stop-only footbraking', () => {
  const race = running(); race.speed = -6; race.recover();
  assert.equal(race.speed, 0); assert.equal(race.gear, 0);
  race.update(STEP, forward); assert.ok(race.speed > 0);
  const board = running(LONGBOARD); board.speed = 6;
  advance(board, 3, reverse);
  assert.equal(board.speed, 0);
});
