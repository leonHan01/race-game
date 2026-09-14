import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { RivalCars } from '../src/render/rivals.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { DIFFICULTIES } from '../src/content/difficulties.ts';
import { getVehicle } from '../src/content/vehicles.ts';

const STEP = 1 / 60;

function isolatedRival(track = new Track(), vehicleId = 'falcon') {
  const race = new Race(track, getVehicle(vehicleId)); race.placeOnTrack(-10000);
  race.opponents.cars.slice(1).forEach(car => { car.finishTime = 0; });
  const car = race.opponents.cars[0];
  Object.assign(car, { distance: -3000, lane: 0, targetLane: 0, planIn: 100 });
  return { race, car };
}

test('difficulty produces progressively faster opponents in car, motorcycle and downhill modes', () => {
  class DownhillStraight extends Track {
    override grade() { return -0.2; }
    override curvature() { return 0; }
  }
  for (const vehicle of ['falcon', 'apex', 'longboard']) {
    const speeds = DIFFICULTIES.map(({ id }) => {
      const { race, car } = isolatedRival(new DownhillStraight(), vehicle); race.difficulty = id;
      for (let tick = 0; tick < 30 / STEP; tick++) race.opponents.update(STEP, race, tick * STEP);
      assert.ok(car.speed <= car.vehicle.topSpeed / 3.6);
      return car.speed;
    });
    assert.ok(speeds[1] > speeds[0] * 1.08 && speeds[2] > speeds[1] * 1.08, `${vehicle}: ${speeds}`);
  }
});

test('acceleration and lane changes ease in and settle smoothly at different update rates', () => {
  const results: number[] = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const { race, car } = isolatedRival(); car.speed = 25; car.targetLane = 4.2;
    let laneSpeed = 0;
    for (let tick = 0; tick < 8 / dt; tick++) {
      const previousLane = car.lane; const previousSpeed = car.speed; const previousSteering = car.steering;
      race.opponents.update(dt, race, tick * dt);
      const nextLaneSpeed = (car.lane - previousLane) / dt;
      assert.ok(Math.abs(nextLaneSpeed - laneSpeed) <= 3.2 * dt + 1e-8, 'bounded lateral acceleration');
      assert.ok(car.lane >= previousLane && car.lane <= 4.2, 'no lane overshoot or oscillation');
      assert.ok(Math.abs(car.steering - previousSteering) <= 7 * dt + 1e-8, 'smooth visible steering');
      if (tick === 0) assert.ok(car.speed - previousSpeed < 9 * dt ** 2, 'gradual throttle application');
      laneSpeed = nextLaneSpeed;
    }
    assert.ok(Math.abs(car.lane - 4.2) < 0.01 && laneSpeed < 0.01);
    results.push(car.distance);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 1.5, 'similar progress across simulation rates');
});

test('rivals begin braking before a tight corner with bounded deceleration changes', () => {
  class CornerTrack extends Track { override curvature(distance: number) { return distance >= 200 ? 0.045 : 0; } }
  const { race, car } = isolatedRival(new CornerTrack());
  car.distance = 0; car.speed = 65;
  let previousAcceleration = 0; let brakedBeforeCorner = false;
  for (let tick = 0; tick < 10 / STEP && car.distance < 200; tick++) {
    race.opponents.update(STEP, race, tick * STEP);
    assert.ok(car.acceleration >= previousAcceleration - 14 * STEP - 1e-8);
    if (car.distance < 100 && car.acceleration < -2) brakedBeforeCorner = true;
    previousAcceleration = car.acceleration;
  }
  assert.ok(brakedBeforeCorner);
  assert.ok(car.speed < 20, `corner entry speed: ${car.speed}`);
});

test('all wider roads fit six separate starting cars, including the largest bodies', () => {
  for (const stage of STAGES) {
    const race = new Race(new Track(stage));
    assert.equal(race.opponents.cars.length, 5);
    assert.equal(new Set(race.opponents.cars.map(car => car.id)).size, 5);
    assert.equal(race.standings.length, 6);
    const cars = [race, ...race.opponents.cars];
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      assert.ok(Math.abs(a.lane) + 1.3 * a.vehicle.scale[0] < stage.roadWidth / 2);
      for (const b of cars.slice(i + 1)) {
        assert.ok(Math.abs(a.lane - b.lane) > 2.6 || Math.abs(a.distance - b.distance) > 5.4);
      }
    }
  }
});

test('five rivals finish every map within their speed limits and keep safe same-lane spacing', () => {
  for (const stage of STAGES) {
    const race = new Race(new Track(stage)); race.phase = 'racing'; race.placeOnTrack(-1000);
    const playerBefore = { position: { ...race.position }, heading: race.heading, speed: race.speed };
    const timeLimit = Math.max(440, race.targetTime * 1.5);
    for (let tick = 0; tick < timeLimit / STEP && race.opponents.cars.some(car => car.finishTime === null); tick++) {
      const previous = race.opponents.cars.map(car => car.distance);
      race.opponents.update(STEP, race, tick * STEP);
      for (let i = 0; i < 5; i++) {
        const car = race.opponents.cars[i];
        assert.ok(car.distance >= previous[i]);
        assert.ok(car.speed >= 0 && car.speed * 3.6 <= car.vehicle.topSpeed + 1e-9);
        assert.ok(Math.abs(car.lane) + 1.3 * car.vehicle.scale[0] < stage.roadWidth / 2);
        assert.ok(Number.isFinite(car.heading) && Number.isFinite(car.position.y));
        if (car.finishTime !== null) continue;
        for (const other of race.opponents.cars.slice(i + 1)) {
          if (other.finishTime === null && Math.abs(car.lane - other.lane) < 2.4) {
            assert.ok(Math.abs(car.distance - other.distance) >= 5.4, `${stage.id}: overlapping rivals`);
          }
        }
      }
    }
    assert.ok(race.opponents.cars.every(car => car.finishTime !== null && car.finishTime > 0), stage.id);
    assert.equal(new Set(race.opponents.cars.map(car => car.finishTime)).size, 5);
    assert.deepEqual({ position: race.position, heading: race.heading, speed: race.speed }, playerBefore);
  }
});

test('rivals pass a stopped player through a free lane without steering or pushing the player', () => {
  const race = new Race(new Track()); race.phase = 'racing'; race.placeOnTrack(40);
  for (const car of race.opponents.cars) car.finishTime = 0;
  const car = race.opponents.cars[0];
  Object.assign(car, { finishTime: null, distance: 20, lane: 0, targetLane: 0, speed: 22, planIn: 0 });
  const before = JSON.stringify({ position: race.position, heading: race.heading, lane: race.lane });
  let slowed = false;
  for (let tick = 0; tick < 15 / STEP; tick++) {
    race.opponents.update(STEP, race, tick * STEP);
    if (car.speed < 20) slowed = true;
    assert.ok(Math.abs(car.lane - race.lane) > 2.4 || Math.abs(car.distance - race.distance) > 5.4);
  }
  assert.ok(slowed); assert.ok(car.distance > 150); assert.ok(Math.abs(car.lane) > 3);
  assert.equal(JSON.stringify({ position: race.position, heading: race.heading, lane: race.lane }), before);
});

test('rivals wait behind traffic when both adjacent lanes are occupied', () => {
  const race = new Race(new Track()); race.phase = 'racing'; race.placeOnTrack(40);
  const car = race.opponents.cars[0];
  Object.assign(car, { distance: 32, lane: 0, targetLane: 0, speed: 0, planIn: 0 });
  for (const other of race.opponents.cars.slice(3)) other.finishTime = 0;
  const blockers = race.opponents.cars.slice(1, 3);
  blockers.forEach((other, i) => Object.assign(other, {
    distance: 32, lane: i ? 4.2 : -4.2, targetLane: i ? 4.2 : -4.2, speed: 0, planIn: 10,
    vehicle: { ...other.vehicle, acceleration: 0 },
  }));
  for (let tick = 0; tick < 3 / STEP; tick++) race.opponents.update(STEP, race, tick * STEP);
  assert.equal(car.lane, 0);
  assert.ok(car.distance < race.distance - 5.4);
  assert.ok(car.speed < 1);
});

test('countdown, pause, rescue, finish and restart preserve the shared race lifecycle', () => {
  const race = new Race(new Track()); race.start();
  const grid = JSON.stringify(race.opponents.cars);
  race.update(0.5, idleControls()); assert.equal(JSON.stringify(race.opponents.cars), grid);
  race.phase = 'racing';
  for (let tick = 0; tick < 120; tick++) race.update(STEP, idleControls());
  const moving = JSON.stringify(race.opponents.cars); assert.notEqual(moving, grid);
  race.pause(); race.update(2, idleControls()); assert.equal(JSON.stringify(race.opponents.cars), moving);
  race.resume(); race.recover(); assert.equal(JSON.stringify(race.opponents.cars), moving);
  race.phase = 'finished'; race.update(2, idleControls()); assert.equal(JSON.stringify(race.opponents.cars), moving);
  race.start(); assert.equal(JSON.stringify(race.opponents.cars), grid);
});

test('ranking uses route progress and real crossing times, including a fractional final tick', () => {
  const race = new Race(new Track()); race.phase = 'racing';
  assert.equal(race.rank, 6);
  race.placeOnTrack(30); assert.equal(race.rank, 1);
  race.placeOnTrack(race.track.length - 0.1);
  const car = race.opponents.cars[0]; car.distance = race.nextCheckpointDistance + 20;
  assert.equal(race.rank, 2, 'a player who skips a checkpoint cannot claim full progress');
  race.splits = [1, 2, 3, 4].map(total => ({ time: 1, total, delta: 0 }));
  race.elapsed = 99; race.penalty = 5; race.speed = 30;
  Object.assign(car, { distance: race.track.length - 0.05, speed: 50, lane: -4.2, targetLane: -4.2 });
  const other = race.opponents.cars[1];
  Object.assign(other, { distance: race.track.length - 0.3, speed: 40, lane: 4.2, targetLane: 4.2 });
  race.update(STEP, idleControls());
  assert.equal(race.phase, 'finished'); assert.equal(race.rank, 2);
  assert.ok(car.finishTime !== null && car.finishTime > 99 && car.finishTime < race.elapsed);
  assert.equal(other.finishTime, null, 'opponents cannot advance beyond the player finish instant');
  assert.ok(other.distance < race.track.length);
  assert.equal(race.standings.find(row => row.player)?.finishTime, race.elapsed);
  assert.equal(race.totalTime, race.elapsed + 5);
});

test('all five opponent poses interpolate between ticks, freeze on pause, and reset without a jump', () => {
  const race = new Race(new Track()); race.phase = 'racing';
  const initial = race.opponents.cars.map(car => ({ ...car.position }));
  const timeline = new RaceTimeline(race); timeline.advance(0.025, idleControls());
  assert.equal(timeline.pose.rivals.length, 5);
  timeline.pose.rivals.forEach((pose, i) => {
    for (const axis of ['x', 'y', 'z'] as const) {
      assert.ok(Math.abs(pose.position[axis] - (initial[i][axis] + race.opponents.cars[i].position[axis]) / 2) < 1e-9);
    }
  });
  race.pause(); const frozen = JSON.stringify(timeline.pose.rivals);
  timeline.advance(3, idleControls()); assert.equal(JSON.stringify(timeline.pose.rivals), frozen);
  race.start(); timeline.reset();
  assert.deepEqual(timeline.pose.rivals.map(pose => pose.position), initial);
});

test('five lightweight rival models use interpolated poses and release their resources without WebGL', () => {
  const models = new RivalCars(); const race = new Race(new Track()); const timeline = new RaceTimeline(race);
  let meshes = 0; let triangles = 0;
  models.group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3
        * (object instanceof THREE.InstancedMesh ? object.count : 1);
    }
  });
  // Sculpted bodies and rounded tyres keep the existing draw-call budget.
  assert.equal(models.group.children.length, 5); assert.ok(meshes <= 40); assert.ok(triangles < 24000);
  models.update(race, timeline.pose.rivals, 0); assert.equal(models.group.visible, false);
  race.phase = 'racing'; timeline.advance(0.025, idleControls()); models.update(race, timeline.pose.rivals, 0.025);
  assert.equal(models.group.visible, true);
  models.group.children.forEach((model, i) => {
    assert.equal(model.position.x, timeline.pose.rivals[i].position.x);
    assert.equal(model.position.z, timeline.pose.rivals[i].position.z);
    assert.equal(model.rotation.y, timeline.pose.rivals[i].heading);
  });
  timeline.pose.rivals[0].position.x += 1000;
  models.update(race, timeline.pose.rivals, STEP); assert.equal(models.group.children[0].visible, false);
  disposeObject(models.group);
});
