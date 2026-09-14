import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';
import { getVehicle, LONGBOARD } from '../src/content/vehicles.ts';
import { MAX_GHOST_FRAMES, validGhost } from '../src/simulation/ghost.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { GhostVehicle } from '../src/render/ghost.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { GhostRecords, type GhostStorage } from '../src/ghost-records.ts';
import { bestTime, recordKey } from '../src/settings.ts';
import type { GhostRun } from '../src/simulation/ghost.ts';

// CPU-only fixtures. No browser, server, canvas or WebGL context is started.
const shortTrack = () => new Track({ ...getStage('pine'), points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -120 }] });
function finishRun(race: Race, duration = 4, penalty = 0) {
  race.start(); race.phase = 'racing';
  for (let i = 1; i <= 4; i++) {
    race.elapsed = duration * i / 4; race.placeOnTrack(race.track.length * i / 4);
    race.speed = race.track.length / duration;
    if (i === 4) { race.phase = 'finished'; race.penalty = penalty; }
    race.ghost.record(race, false, true);
  }
  const run = race.ghost.finish(race); assert.ok(run); return run;
}

test('a real fixed-step finish records the full route and exact finish crossing', () => {
  const race = new Race(shortTrack()); race.start();
  assert.equal(race.ghost.replay, null); assert.equal(race.ghost.finish(race), null);
  for (const car of race.opponents.cars) car.finishTime = 0;
  for (let step = 0; step < 3000 && race.phase !== 'finished'; step++) race.update(1 / 60, { ...idleControls(), throttle: true });
  assert.equal(race.phase, 'finished');
  const run = race.ghost.finish(race); assert.ok(run);
  assert.ok(validGhost(run, race, race.totalTime));
  assert.equal(run.frames[0].time, 0); assert.equal(run.frames[0].distance, 0);
  assert.equal(run.frames.at(-1)!.time, race.elapsed);
  assert.deepEqual(run.frames.at(-1)!.position, race.position);
  assert.ok(run.frames.length < race.elapsed * 21 + 2, 'recording is independent of paint rate');
  assert.equal(race.standings.length, 6); assert.equal(race.opponents.cars.length, 5);
});

test('playback interpolates world position and takes the short path across wrapped headings', () => {
  const race = new Race(shortTrack()); const run = finishRun(race);
  run.frames[1].yaw = Math.PI * 179 / 180; run.frames[2].yaw = -Math.PI * 179 / 180;
  run.frames[1].position.y = 2; run.frames[2].position.y = 4;
  run.frames[1].airborne = true; run.frames[2].airborne = true;
  race.ghost.setReplay(run);
  const pose = race.ghost.sample(1.5)!;
  assert.ok(Math.abs(Math.abs(pose.yaw) - Math.PI) < 1e-9);
  assert.equal(pose.position.y, 3); assert.equal(pose.position.z, -45); assert.equal(pose.airborne, true);
  assert.equal(race.ghost.sample(run.duration + 0.001), null);
  assert.equal(race.ghost.sample(-1), null); assert.equal(race.ghost.sample(NaN), null);
  assert.equal(race.ghost.sample(0)!.position.z, 0, 'rewinding must not retain the last cursor');
});

test('countdown and pause freeze the race clock; restart drops the aborted recording', () => {
  const race = new Race(shortTrack()); const run = finishRun(race);
  race.start(); race.ghost.setReplay(run);
  const timeline = new RaceTimeline(race);
  timeline.advance(0.1, idleControls());
  assert.equal(race.ghost.sample(timeline.pose.elapsed)!.time, 0);
  race.pause(); const before = JSON.stringify(race.ghost.sample(timeline.pose.elapsed));
  for (let i = 0; i < 10; i++) timeline.advance(0.1, idleControls());
  assert.equal(JSON.stringify(race.ghost.sample(timeline.pose.elapsed)), before);
  race.resume(); race.countdown = 0.001;
  for (let i = 0; i < 6; i++) timeline.advance(0.1, { ...idleControls(), throttle: true });
  race.pause(); const pausedElapsed = timeline.pose.elapsed;
  timeline.advance(0.1, idleControls()); assert.equal(timeline.pose.elapsed, pausedElapsed);
  assert.equal(race.ghost.finish(race), null);
  race.start(); timeline.reset(); race.ghost.setReplay(run);
  assert.equal(race.ghost.sample(timeline.pose.elapsed)!.time, 0);
  assert.equal(race.elapsed, 0); assert.equal(race.ghost.finish(race), null);
});

test('rescue replays snap at the recorded instant and penalties only select the best total time', () => {
  const race = new Race(shortTrack()); race.start(); race.phase = 'racing';
  race.elapsed = 1; race.placeOnTrack(15); race.position.x = 180; race.ghost.record(race, false, true);
  race.elapsed = 1.5; race.position.x = 200;
  const beforeRescue = { ...race.position };
  race.recover(); const rescued = { ...race.position };
  race.elapsed = 3; race.placeOnTrack(race.track.length); race.phase = 'finished'; race.ghost.record(race);
  const run = race.ghost.finish(race)!;
  assert.equal(run.duration, 3); assert.equal(run.totalTime, 8);
  race.ghost.setReplay(run);
  assert.ok(Math.abs(race.ghost.sample(1.5 - 1e-6)!.position.x - beforeRescue.x) < 0.001);
  assert.deepEqual(race.ghost.sample(1.5)!.position, rescued);
  assert.ok(validGhost(run, race, 8));
});

test('longboard pose samples are independent snapshots and replay stance transitions', () => {
  const race = new Race(shortTrack(), LONGBOARD); const run = finishRun(race);
  run.frames[1].longboardPose!.stanceYaw = 0; run.frames[2].longboardPose!.stanceYaw = Math.PI;
  run.frames[1].longboardPose!.tuck = 0; run.frames[2].longboardPose!.tuck = 1;
  race.longboard.pose.tuck = 0.9;
  assert.equal(run.frames[2].longboardPose!.tuck, 1);
  race.ghost.setReplay(run);
  assert.equal(race.ghost.sample(1.5)!.longboardPose!.stanceYaw, Math.PI / 2);
  assert.equal(race.ghost.sample(1.5)!.longboardPose!.tuck, 0.5);
});

test('endurance recordings stay bounded while preserving the start, finish and rescue cuts', () => {
  const race = new Race(shortTrack()); race.start(); race.phase = 'racing';
  for (let i = 1; i <= 40000; i++) {
    race.elapsed = i / 20; race.distance = race.track.length * i / 40000;
    race.ghost.record(race);
    if (i === 19999) { race.position.x = 150; race.recover(); }
  }
  race.phase = 'finished'; race.ghost.record(race);
  const run = race.ghost.finish(race)!;
  assert.ok(run.frames.length < MAX_GHOST_FRAMES);
  assert.ok(validGhost(run, race, race.totalTime));
  assert.equal(run.frames[0].time, 0); assert.equal(run.frames.at(-1)!.time, 2000);
  const cut = run.frames.findIndex(frame => frame.cut);
  assert.ok(cut > 0); assert.equal(run.frames[cut - 1].position.x, 150);
  assert.equal(run.frames[cut].time, run.frames[cut - 1].time);
});

test('car, bike and board ghosts use translucent isolated materials and follow recorded poses', () => {
  for (const vehicle of [getVehicle('falcon'), getVehicle('apex'), LONGBOARD]) {
    const race = new Race(shortTrack(), vehicle); const run = finishRun(race);
    race.start(); race.phase = 'racing'; race.ghost.setReplay(run);
    const view = new GhostVehicle(vehicle);
    try {
      view.update(race, 1.5, race.position);
      assert.equal(view.group.visible, true); assert.equal(view.group.position.z, -45);
      let meshes = 0;
      view.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++; assert.ok(object.material instanceof THREE.MeshBasicMaterial);
        assert.equal(object.material.transparent, true); assert.equal(object.material.depthWrite, false);
        assert.ok(object.material.opacity < 0.5); assert.equal(object.castShadow, false);
      });
      assert.ok(meshes > 0); assert.equal(view.group.getObjectByName('motorcycle-shadow'), undefined);
      view.update(race, run.duration + 0.01, race.position); assert.equal(view.group.visible, false);
      view.update(race, 1.5, { x: 1000, y: 0, z: 0 }); assert.equal(view.group.visible, false);
      view.reset(); assert.equal(view.group.visible, false);
      race.phase = 'menu'; view.update(race, 0, race.position); assert.equal(view.group.visible, false);
    } finally { disposeObject(view.group); }
  }
});

function localScores(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const scores = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => scores.get(key) ?? null,
    setItem: (key: string, value: string) => scores.set(key, value),
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return scores;
}
class MemoryGhostStorage implements GhostStorage {
  readonly values = new Map<string, GhostRun>();
  async load(key: string) { return structuredClone(this.values.get(key)); }
  async save(key: string, run: GhostRun) { this.values.set(key, structuredClone(run)); }
}

test('only completed personal bests replace the ghost, using total time including penalties', async t => {
  localScores(t); const records = new GhostRecords(new MemoryGhostStorage()); const race = new Race(shortTrack());
  assert.equal(await records.load(race), null);
  finishRun(race, 4); assert.equal(records.save(race), true);
  assert.equal(bestTime(race), 4); assert.equal((await records.load(race))!.duration, 4);
  finishRun(race, 3, 5); assert.equal(records.save(race), false);
  assert.equal((await records.load(race))!.duration, 4, 'a quicker drive with rescue penalties is not a PB');
  finishRun(race, 2); assert.equal(records.save(race), true);
  assert.equal((await records.load(race))!.duration, 2);
  race.start(); race.elapsed = 1; assert.equal(records.save(race), false);
  assert.equal((await records.load(race))!.duration, 2, 'aborted attempts must preserve the PB');
});

test('persisted ghosts remain isolated by stage, vehicle, difficulty, throttle and race mode', async t => {
  localScores(t); const storage = new MemoryGhostStorage(); const records = new GhostRecords(storage);
  const races = [new Race(shortTrack()), new Race(shortTrack()), new Race(shortTrack()),
    new Race(shortTrack()), new Race(shortTrack(), getVehicle('apex')), new Race(shortTrack(), LONGBOARD),
    new Race(new Track({ ...shortTrack().definition, id: 'valley' }))];
  races[1].difficulty = 'hard'; races[2].autoThrottle = true; races[3].mode = 'items';
  for (let i = 0; i < races.length; i++) { finishRun(races[i], i + 2); assert.equal(records.save(races[i]), true); }
  await new Promise(resolve => setImmediate(resolve));
  const reloaded = new GhostRecords(storage);
  for (let i = 0; i < races.length; i++) {
    const ghost = await reloaded.load(races[i]); assert.ok(ghost);
    assert.equal(ghost.totalTime, i + 2); assert.equal(ghost.vehicleId, races[i].vehicleId);
  }
  assert.equal(storage.values.size, races.length);
});

test('legacy times are preserved until matched or beaten, and malformed or stale ghosts are ignored', async t => {
  const scores = localScores(t); const storage = new MemoryGhostStorage(); const records = new GhostRecords(storage);
  const race = new Race(shortTrack()); scores.set('dustline-best-v2-club-manual', '4');
  assert.equal(await records.load(race), null);
  finishRun(race, 5); assert.equal(records.save(race), false); assert.equal(await records.load(race), null);
  const run = finishRun(race, 4); assert.equal(records.save(race), false);
  assert.equal((await records.load(race))!.duration, 4);
  const changed = new Race(new Track({ ...race.track.definition, roadWidth: race.track.roadWidth + 1 }));
  assert.equal(await records.load(changed), null);
  const corrupt: unknown[] = [null, {}, { ...run, version: 99 }, { ...run, totalTime: 5 },
    { ...run, vehicleId: 'apex' }, { ...run, frames: run.frames.slice(0, -1) },
    { ...run, frames: [run.frames[1], run.frames[0], ...run.frames.slice(2)] },
    { ...run, frames: [{ ...run.frames[0], position: { x: NaN, y: 0, z: 0 } }, ...run.frames.slice(1)] }];
  for (const value of corrupt) {
    const invalid = new GhostRecords({ load: async () => value, save: async () => {} });
    assert.equal(await invalid.load(race), null);
  }
  assert.equal(scores.get('dustline-best-v2-club-manual'), '4');
});

test('storage failures keep the session best available and late reads cannot replace a newer ghost', async t => {
  localScores(t); const race = new Race(shortTrack());
  const broken = new GhostRecords({ load: async () => { throw new Error('disabled'); }, save: async () => { throw new Error('quota'); } });
  finishRun(race, 4); broken.save(race);
  assert.equal((await broken.load(race))!.duration, 4);
  finishRun(race, 5); assert.equal(broken.save(race), false);
  assert.equal((await broken.load(race))!.duration, 4);
  const old = finishRun(race, 4); let resolveRead!: (run: GhostRun) => void;
  const records = new GhostRecords({ load: () => new Promise(resolve => { resolveRead = resolve; }), save: async () => {} });
  const pending = records.load(race);
  finishRun(race, 2); records.save(race); resolveRead(old);
  assert.equal((await pending)!.duration, 2);
  assert.equal(bestTime(race), 2); assert.ok(recordKey(race).includes(race.vehicleId));
});
