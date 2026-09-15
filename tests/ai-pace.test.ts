import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/simulation/track.ts';
import { Race } from '../src/simulation/race.ts';
import { getVehicle } from '../src/content/vehicles.ts';
import { getStage } from '../src/content/stages.ts';

const STEP = 1 / 60;
class Straight extends Track {
  override curvature(_distance = 0) { return 0; }
  override grade() { return 0; }
}

function solo(track: Track, vehicle = 'falcon') {
  const race = new Race(track, getVehicle(vehicle));
  race.difficulty = 'hard'; race.start(); race.phase = 'racing'; race.placeOnTrack(-10000);
  race.opponents.cars.slice(1).forEach(car => { car.finishTime = 0; });
  const car = race.opponents.cars[0];
  Object.assign(car, { distance: 0, lane: 0, targetLane: 0, planIn: 0 });
  return { race, car };
}

test('hard cars and motorcycles accelerate through sweeping bends instead of crawling in a slide', () => {
  for (const vehicle of ['falcon', 'apex']) for (const direction of [-1, 1]) {
    class Sweep extends Straight { override curvature() { return direction * 0.004; } }
    const { race, car } = solo(new Sweep(), vehicle); car.nitro = 0;
    for (let tick = 0; tick < 10 / STEP; tick++) race.opponents.update(STEP, race, tick * STEP);
    assert.ok(car.speed * 3.6 > 150, `${vehicle}, bend ${direction}: ${car.speed * 3.6} km/h after 10 s`);
    assert.ok(car.speed <= car.vehicle.topSpeed / 3.6);
  }
});

test('hard AI uses a short clear exit to accelerate and still brakes for the next tight corner', () => {
  // A 50 m radius hairpin needs braking even with the increased cornering pace.
  class ShortExit extends Straight { override curvature(distance = 0) { return distance >= 100 ? 0.02 : 0; } }
  const { race, car } = solo(new ShortExit()); car.speed = 45;
  race.opponents.update(STEP, race, 0);
  assert.equal(car.usingNitro, true, 'a useful exit need not allow the full nitro top speed');
  assert.ok(car.nitro < 60);
  for (let tick = 1; tick < 5 / STEP && car.distance < 100; tick++) race.opponents.update(STEP, race, tick * STEP);
  assert.ok(car.distance >= 100);
  assert.equal(car.usingNitro, false);
  assert.ok(car.speed * 3.6 < 140, `tight corner entry: ${car.speed * 3.6} km/h`);
});

test('hard AI anticipates a slower car and completes a clear overtake without falling to its speed', () => {
  const { race, car } = solo(new Straight()); car.speed = 65; car.nitro = 0;
  let minimumSpeed = car.speed;
  let passed = false;
  for (let tick = 0; tick < 5 / STEP; tick++) {
    race.placeOnTrack(100 + 20 * tick * STEP); race.speed = 20;
    race.opponents.update(STEP, race, tick * STEP);
    minimumSpeed = Math.min(minimumSpeed, car.speed);
    assert.ok(Math.abs(car.lane - race.lane) > 2.4 || Math.abs(car.distance - race.distance) > 5.4);
    if (car.distance > race.distance + 8) { passed = true; break; }
  }
  assert.ok(passed, `AI at ${car.distance} m, slower car at ${race.distance} m`);
  assert.ok(minimumSpeed * 3.6 > 120, `overtaking speed dropped to ${minimumSpeed * 3.6} km/h`);
});

test('medium and hard grids maintain a competitive pace on mountain and technical stages', () => {
  // Average budgets cover the full mixed grid, including the 200 km/h SUV.
  for (const [stage, mediumBudget, hardBudget] of [['pine', 160, 130], ['depot', 93, 73]] as const) {
    for (const difficulty of ['medium', 'hard'] as const) {
      const race = new Race(new Track(getStage(stage)));
      race.difficulty = difficulty; race.start(); race.phase = 'racing'; race.placeOnTrack(-10000);
      const budget = difficulty === 'hard' ? hardBudget : mediumBudget;
      for (let tick = 0; tick < budget * 2 / STEP && race.opponents.cars.some(car => car.finishTime === null); tick++) {
        race.opponents.update(STEP, race, tick * STEP);
      }
      const times = race.opponents.cars.map(car => { assert.notEqual(car.finishTime, null); return car.finishTime!; });
      const average = times.reduce((total, time) => total + time, 0) / times.length;
      assert.ok(average < budget, `${difficulty} ${stage}: average finish ${average.toFixed(2)} s, budget ${budget} s`);
    }
  }
});
