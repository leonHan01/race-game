import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';
import { GhostRecords } from '../src/ghost-records.ts';
import { spectatorEntries, spectatorFocus, spectatorStandings } from '../src/simulation/spectator.ts';

const createRace = () => new Race(new Track({ ...getStage('pine'), points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -120 }] }));
function replay(duration: number) {
  const race = createRace(); race.start(); race.phase = 'racing';
  race.elapsed = duration; race.placeOnTrack(race.track.length); race.phase = 'finished';
  race.ghost.record(race, false, true);
  return race.ghost.finish(race)!;
}

test('spectating ignores driving, waits for history, pauses, and finishes all AI without saving', () => {
  const race = createRace(); race.spectating = true; race.start(); race.phase = 'racing';
  race.ghost.loading = true; race.update(1 / 60, idleControls());
  assert.equal(race.elapsed, 0);
  race.ghost.setReplays([]);
  const position = { ...race.position };
  for (let i = 0; i < 120; i++) race.update(1 / 60, { ...idleControls(), throttle: true, steering: 1 });
  assert.deepEqual(race.position, position); assert.equal(race.speed, 0);
  assert.ok(race.opponents.cars.some(car => car.speed > 0));
  race.pause(); const elapsed = race.elapsed; race.update(1, idleControls()); assert.equal(race.elapsed, elapsed); race.resume();
  for (let i = 0; i < 6000 && race.phase !== 'finished'; i++) race.update(1 / 60, idleControls());
  assert.equal(race.phase, 'finished'); assert.ok(race.opponents.cars.every(car => car.finishTime !== null));
  assert.equal(new GhostRecords().save(race), false);
  race.start(); assert.equal(race.elapsed, 0); assert.ok(race.opponents.cars.every(car => car.finishTime === null));
});

test('all five historical runs participate, remain at the finish, and can be selected', () => {
  const race = createRace(); race.spectating = true; race.start(); race.phase = 'racing';
  race.ghost.setReplays([10, 20, 30, 40, 50].map(replay));
  race.opponents.cars.forEach(car => { car.finishTime = 5; car.distance = race.track.length; });
  race.elapsed = 25; race.update(1 / 60, idleControls());
  assert.equal(race.phase, 'racing'); assert.equal(spectatorEntries(race).length, 10);
  assert.equal(spectatorStandings(race).filter(entry => entry.finishTime !== null).length, 7);
  assert.equal(spectatorFocus(race).index, 7);
  race.spectatorTarget = 5; assert.equal(spectatorFocus(race).distance, race.track.length);
  race.elapsed = 50; race.update(1 / 60, idleControls()); assert.equal(race.phase, 'finished');
});
