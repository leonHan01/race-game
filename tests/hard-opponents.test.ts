import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { NITRO_SPEED_BONUS_KMH } from '../src/simulation/nitro.ts';
import { getVehicle } from '../src/content/vehicles.ts';
import { STAGES, getStage } from '../src/content/stages.ts';
import type { Difficulty } from '../src/content/difficulties.ts';
import { capturePose, RaceTimeline } from '../src/presentation.ts';
import { RivalCars } from '../src/render/rivals.ts';
import { disposeObject } from '../src/render/dispose.ts';

const STEP = 1 / 60;
class Straight extends Track { override curvature() { return 0; } override grade() { return 0; } }
class Corner extends Straight {
  override curvature(distance = 0) { return distance > 100 && distance < 300 ? Math.sin((distance - 100) / 200 * Math.PI) * 0.008 : 0; }
}
function solo(track = new Straight(), difficulty: Difficulty = 'hard', vehicle = 'falcon') {
  const race = new Race(track, getVehicle(vehicle)); race.difficulty = difficulty; race.start(); race.phase = 'racing';
  race.placeOnTrack(-10000);
  race.opponents.cars.slice(1).forEach(car => { car.finishTime = 0; });
  const car = race.opponents.cars[0];
  Object.assign(car, { distance: 20, speed: 35, lane: 0, targetLane: 0, planIn: 0 });
  return { race, car };
}

test('hard AI executes an outside-apex-exit line, earns nitro by drifting, and boosts on exit', () => {
  const { race, car } = solo(new Corner()); car.nitro = 0;
  let entry = 0; let apex = 0; let exit = 0; let charged = 0; let maxSpeed = 0; let drifted = false; let boosted = false;
  for (let tick = 0; tick < 14 / STEP; tick++) {
    race.opponents.update(STEP, race, tick * STEP);
    if (car.distance > 80 && car.distance < 100) entry = Math.max(entry, car.lane);
    if (car.distance > 190 && car.distance < 220) apex = Math.min(apex, car.lane);
    if (car.distance > 285 && car.distance < 330) exit = Math.max(exit, car.lane);
    if (car.drifting) { drifted = true; charged = Math.max(charged, car.nitro); assert.equal(car.usingNitro, false); }
    if (car.usingNitro) { boosted = true; assert.ok(car.distance > 280); assert.ok(Math.abs(car.driftAngle) < 0.13); }
    maxSpeed = Math.max(maxSpeed, car.speed * 3.6);
    assert.ok(Math.abs(car.lane) < race.track.roadWidth / 2 - 2);
    assert.ok(car.nitro >= 0 && car.nitro <= 100);
    assert.ok(car.speed * 3.6 <= car.vehicle.topSpeed + NITRO_SPEED_BONUS_KMH + 1e-8);
  }
  assert.ok(entry > 1 && apex < -1 && exit > 0.5, `line: ${entry}, ${apex}, ${exit}`);
  assert.ok(drifted && boosted && charged > 30);
  assert.ok(maxSpeed > car.vehicle.topSpeed + 50);
  assert.ok(car.nitro < charged, 'nitro is spent after the drift');
});

test('car and motorcycle slides turn into either bend; easier opponents and boards do not gain nitro abilities', () => {
  const angles: number[] = [];
  for (const direction of [-1, 1]) for (const vehicle of ['falcon', 'apex']) {
    class Bend extends Straight { override curvature() { return direction * 0.008; } }
    const { race, car } = solo(new Bend(), 'hard', vehicle); car.nitro = 0;
    for (let tick = 0; tick < 120; tick++) race.opponents.update(STEP, race, tick * STEP);
    assert.equal(car.drifting, true); assert.equal(Math.sign(car.driftAngle), direction);
    assert.ok(car.nitro > 10); assert.equal(car.boosting, false);
    angles.push(Math.abs(car.driftAngle));
  }
  assert.ok(angles[1] < angles[0] * 0.6 && angles[3] < angles[2] * 0.6, 'bikes use smaller rear-wheel slides');
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const { race, car } = solo(new Corner(), difficulty, difficulty === 'hard' ? 'longboard' : 'falcon');
    for (let tick = 0; tick < 600; tick++) {
      race.opponents.update(STEP, race, tick * STEP);
      assert.equal(car.usingNitro, false); assert.equal(car.drifting, false); assert.equal(car.nitro, 0);
    }
  }
});

test('nitro has a finite tank, handles a partial tick, and releases speed smoothly', () => {
  const { race, car } = solo(); car.nitro = 100; car.speed = 65;
  for (let tick = 0; tick < 60; tick++) race.opponents.update(STEP, race, tick * STEP);
  assert.ok(Math.abs(car.nitro - 75) < 1e-8); assert.ok(car.speed > car.vehicle.topSpeed / 3.6);
  car.nitro = 0.01; race.opponents.update(STEP, race, 1);
  assert.equal(car.nitro, 0);
  const speed = car.speed;
  race.opponents.update(STEP, race, 1 + STEP);
  assert.equal(car.boosting, false); assert.equal(car.nitro, 0);
  assert.ok(car.speed < speed && car.speed > speed - 1, 'boost release does not snap back to the normal limit');
  for (let tick = 0; tick < 180; tick++) race.opponents.update(STEP, race, 2 + tick * STEP);
  assert.ok(car.speed <= car.vehicle.topSpeed / 3.6 + 1e-8);
});

test('blocked traffic, incoming corners, flight and item stuns prevent nitro use', () => {
  for (const condition of ['traffic', 'corner', 'airborne', 'stun'] as const) {
    class ApproachingCorner extends Straight { override curvature(distance = 0) { return distance > 100 ? 0.015 : 0; } }
    const { race, car } = solo(condition === 'corner' ? new ApproachingCorner() : new Straight());
    car.speed = 60;
    if (condition === 'traffic') { race.placeOnTrack(car.distance + 15); race.speed = 0; }
    if (condition === 'airborne') car.airborne = true;
    if (condition === 'stun') { race.mode = 'items'; race.items.state(car.id).stun = 1; }
    const charge = car.nitro;
    race.opponents.update(STEP, race, 0);
    assert.equal(car.usingNitro, false, condition); assert.equal(car.boosting, false, condition);
    assert.equal(car.nitro, charge, condition);
    assert.ok(car.speed < 60, condition);
  }
});

test('hard racecraft survives pause and interpolation, resets at restart and stops at the finish', () => {
  const { race, car } = solo(); const timeline = new RaceTimeline(race);
  timeline.advance(0.025, idleControls());
  assert.ok(timeline.pose.rivals[0].boosting);
  race.pause(); const frozen = JSON.stringify(car); const pose = JSON.stringify(timeline.pose.rivals);
  timeline.advance(0.1, idleControls());
  assert.equal(JSON.stringify(car), frozen); assert.equal(JSON.stringify(timeline.pose.rivals), pose);
  race.start(); timeline.reset();
  assert.equal(car.nitro, 60); assert.equal(car.driftAngle, 0); assert.equal(car.usingNitro, false); assert.equal(car.boosting, false);
  assert.equal(timeline.pose.rivals[0].driftAngle, 0); assert.equal(timeline.pose.rivals[0].boosting, false);
  car.distance = race.track.length - 0.1; car.speed = 50;
  race.opponents.update(STEP, race, 10);
  assert.ok(car.finishTime !== null); assert.equal(car.boosting, false); assert.equal(car.drifting, false);
});

test('rival drift yaw and lazy nitro flames render from the shared pose and release their resources', () => {
  for (const vehicle of ['falcon', 'apex']) {
    const { race, car } = solo(new Straight(), 'hard', vehicle); race.placeOnTrack(10);
    Object.assign(car.position, race.track.position(car.distance));
    const models = new RivalCars(race.vehicleMode);
    const pose = capturePose(race).rivals;
    assert.equal(models.group.getObjectByName('nitro-exhaust-flames'), undefined);
    pose[0].driftAngle = 0.3;
    models.update(race, pose, STEP);
    assert.ok(Math.abs(models.group.children[0].rotation.y - pose[0].heading - 0.3) < 1e-8);
    pose[0].boosting = true; models.update(race, pose, STEP);
    const flames = models.group.getObjectByName('nitro-exhaust-flames')!;
    assert.ok(flames?.visible);
    const meshes: THREE.Mesh[] = [];
    flames.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    const material = meshes[0].material as THREE.ShaderMaterial;
    const time = material.uniforms.time.value;
    race.pause(); models.update(race, pose, 0.1); assert.equal(material.uniforms.time.value, time);
    race.start(); models.update(race, capturePose(race).rivals, 0); assert.equal(flames.visible, false);
    let geometries = 0; let materials = 0;
    meshes[0].geometry.addEventListener('dispose', () => geometries++);
    material.addEventListener('dispose', () => materials++);
    disposeObject(models.group); assert.equal(geometries, 1); assert.equal(materials, 1);
  }
});

test('hard opponents finish every stage with bounded speed, road position and traffic spacing', () => {
  for (const stage of STAGES) {
    const race = new Race(new Track(stage)); race.difficulty = 'hard'; race.start(); race.phase = 'racing'; race.placeOnTrack(-10000);
    const limit = Math.max(440, race.targetTime * 1.5);
    for (let tick = 0; tick < limit / STEP && race.opponents.cars.some(car => car.finishTime === null); tick++) {
      race.opponents.update(STEP, race, tick * STEP);
      for (const car of race.opponents.cars) {
        assert.ok(Number.isFinite(car.speed) && car.speed * 3.6 <= car.vehicle.topSpeed + 70 + 1e-8, stage.id);
        assert.ok(Math.abs(car.lane) + 1.3 * car.vehicle.scale[0] < stage.roadWidth / 2, stage.id);
        for (const other of race.opponents.cars) {
          if (car.id !== other.id && car.finishTime === null && other.finishTime === null && Math.abs(car.lane - other.lane) < 2.4) {
            assert.ok(Math.abs(car.distance - other.distance) > 5.4, `${stage.id}: overlapping opponents`);
          }
        }
      }
    }
    assert.ok(race.opponents.cars.every(car => car.finishTime !== null), stage.id);
  }
});

test('hard cars and motorcycles finish through the actual collision loop while the player remains stationary', () => {
  for (const vehicle of ['falcon', 'apex']) {
    const race = new Race(new Track(getStage('pine')), getVehicle(vehicle));
    race.difficulty = 'hard'; race.start(); race.phase = 'racing'; race.placeOnTrack(-10000);
    const playerBefore = { ...race.position };
    let drifted = false; let boosted = false;
    for (let tick = 0; tick < 350 / STEP && race.opponents.cars.some(car => car.finishTime === null); tick++) {
      race.update(STEP, idleControls());
      for (const car of race.opponents.cars) {
        drifted ||= car.drifting; boosted ||= car.usingNitro;
        assert.ok(Number.isFinite(car.distance) && car.speed * 3.6 <= car.vehicle.topSpeed + 70 + 1e-8);
      }
    }
    assert.ok(race.opponents.cars.every(car => car.finishTime !== null), vehicle);
    assert.ok(drifted && boosted, vehicle);
    assert.deepEqual(race.position, playerBefore);
  }
});
