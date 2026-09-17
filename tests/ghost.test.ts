import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';
import { getVehicle, LONGBOARD } from '../src/content/vehicles.ts';
import { MAX_GHOST_FRAMES, validGhost, rankGhosts } from '../src/simulation/ghost.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { GhostFleet, GhostVehicle } from '../src/render/ghost.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { GhostRecords, type GhostStorage } from '../src/ghost-records.ts';
import { bestTime, recordKey } from '../src/settings.ts';
import type { GhostRun } from '../src/simulation/ghost.ts';
import { GHOST_COLORS, MAX_GHOSTS } from '../src/content/ghosts.ts';
import { ghostLegend } from '../src/ui/ui.ts';
import { CAR_EXHAUST_PORTS } from '../src/render/vehicle-model.ts';
import { motorcycleExhaustPort } from '../src/render/motorcycle.ts';

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
  assert.deepEqual(race.ghost.replays, []); assert.equal(race.ghost.finish(race), null);
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
  race.ghost.setReplays([run]);
  const pose = race.ghost.sample(1.5)!;
  assert.ok(Math.abs(Math.abs(pose.yaw) - Math.PI) < 1e-9);
  assert.equal(pose.position.y, 3); assert.equal(pose.position.z, -45); assert.equal(pose.airborne, true);
  assert.equal(race.ghost.sample(run.duration + 0.001), null);
  assert.equal(race.ghost.sample(-1), null); assert.equal(race.ghost.sample(NaN), null);
  assert.equal(race.ghost.sample(0)!.position.z, 0, 'rewinding must not retain the last cursor');
});

test('countdown and pause freeze the race clock; restart drops the aborted recording', () => {
  const race = new Race(shortTrack()); const run = finishRun(race);
  race.start(); race.ghost.setReplays([run]);
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
  race.start(); timeline.reset(); race.ghost.setReplays([run]);
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
  race.ghost.setReplays([run]);
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
  race.ghost.setReplays([run]);
  assert.equal(race.ghost.sample(1.5)!.longboardPose!.stanceYaw, Math.PI / 2);
  assert.equal(race.ghost.sample(1.5)!.longboardPose!.tuck, 0.5);
});

test('endurance recordings stay bounded while preserving the start, finish and rescue cuts', () => {
  const race = new Race(shortTrack()); race.start(); race.phase = 'racing';
  for (let i = 1; i <= 40000; i++) {
    race.elapsed = i / 20; race.distance = race.track.length * i / 40000;
    race.boosting = i === 1000;
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
  assert.ok(run.frames.some(frame => frame.boosting), 'downsampling retains short boost events');
});

test('car, bike and board ghosts use translucent isolated materials and follow recorded poses', () => {
  for (const vehicle of [getVehicle('falcon'), getVehicle('apex'), LONGBOARD]) {
    const race = new Race(shortTrack(), vehicle); const run = finishRun(race);
    race.start(); race.phase = 'racing'; race.ghost.setReplays([run]);
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
  readonly values = new Map<string, GhostRun[] | GhostRun>();
  async load(key: string) { return structuredClone(this.values.get(key)); }
  async save(key: string, run: GhostRun) {
    const value = this.values.get(key);
    const retained = rankGhosts([...(Array.isArray(value) ? value : value ? [value] : []), run]);
    this.values.set(key, structuredClone(retained)); return retained;
  }
}

test('all finishes compete for the five fastest total times, including penalties and non-PBs', async t => {
  localScores(t); const records = new GhostRecords(new MemoryGhostStorage()); const race = new Race(shortTrack());
  assert.deepEqual(await records.load(race), []);
  finishRun(race, 4); assert.equal(records.save(race), true);
  assert.equal(bestTime(race), 4); assert.equal((await records.load(race))[0].duration, 4);
  finishRun(race, 3, 5); assert.equal(records.save(race), false);
  assert.deepEqual((await records.load(race)).map(run => run.totalTime), [4, 8]);
  finishRun(race, 2); assert.equal(records.save(race), true);
  for (const duration of [7, 6, 5, 9]) { finishRun(race, duration); assert.equal(records.save(race), false); }
  assert.deepEqual((await records.load(race)).map(run => run.totalTime), [2, 4, 5, 6, 7]);
  race.start(); race.elapsed = 1; assert.equal(records.save(race), false);
  assert.deepEqual((await records.load(race)).map(run => run.totalTime), [2, 4, 5, 6, 7], 'aborted attempts preserve history');
  assert.equal(bestTime(race), 2);
});

test('persisted ghosts remain isolated by stage, vehicle, difficulty, throttle and race mode', async t => {
  localScores(t); const storage = new MemoryGhostStorage(); const records = new GhostRecords(storage);
  const races = [new Race(shortTrack()), new Race(shortTrack()), new Race(shortTrack()),
    new Race(shortTrack()), new Race(shortTrack(), getVehicle('apex')), new Race(shortTrack(), LONGBOARD),
    new Race(new Track({ ...shortTrack().definition, id: 'valley' }))];
  races[1].difficulty = 'hard'; races[2].autoThrottle = true; races[3].mode = 'downhill';
  for (let i = 0; i < races.length; i++) { finishRun(races[i], i + 2); assert.equal(records.save(races[i]), true); }
  await new Promise(resolve => setImmediate(resolve));
  const reloaded = new GhostRecords(storage);
  for (let i = 0; i < races.length; i++) {
    const [ghost] = await reloaded.load(races[i]); assert.ok(ghost);
    assert.equal(ghost.totalTime, i + 2); assert.equal(ghost.vehicleId, races[i].vehicleId);
  }
  assert.equal(storage.values.size, races.length);
});

test('legacy scores remain unchanged while new trajectories accumulate; invalid and stale runs are ignored', async t => {
  const scores = localScores(t); const storage = new MemoryGhostStorage(); const records = new GhostRecords(storage);
  const race = new Race(shortTrack()); scores.set('dustline-best-v2-club-manual', '4');
  assert.deepEqual(await records.load(race), []);
  finishRun(race, 5); assert.equal(records.save(race), false); assert.equal((await records.load(race))[0].duration, 5);
  const run = finishRun(race, 4); assert.equal(records.save(race), false);
  assert.deepEqual((await records.load(race)).map(run => run.duration), [4, 5]);
  const changed = new Race(new Track({ ...race.track.definition, roadWidth: race.track.roadWidth + 1 }));
  assert.deepEqual(await records.load(changed), []);
  const corrupt: unknown[] = [null, {}, { ...run, version: 99 }, { ...run, totalTime: NaN }, { ...run, id: 7 },
    { ...run, vehicleId: 'apex' }, { ...run, frames: run.frames.slice(0, -1) },
    { ...run, frames: [run.frames[1], run.frames[0], ...run.frames.slice(2)] },
    { ...run, frames: [{ ...run.frames[0], position: { x: NaN, y: 0, z: 0 } }, ...run.frames.slice(1)] }];
  for (const value of corrupt) {
    const invalid = new GhostRecords({ load: async () => value, save: async () => {} });
    assert.deepEqual(await invalid.load(race), []);
  }
  assert.equal(scores.get('dustline-best-v2-club-manual'), '4');
});

test('storage failures keep the session best available and late reads cannot replace a newer ghost', async t => {
  localScores(t); const race = new Race(shortTrack());
  const broken = new GhostRecords({ load: async () => { throw new Error('disabled'); }, save: async () => { throw new Error('quota'); } });
  finishRun(race, 4); broken.save(race);
  assert.equal((await broken.load(race))[0].duration, 4);
  finishRun(race, 5); assert.equal(broken.save(race), false);
  assert.deepEqual((await broken.load(race)).map(run => run.duration), [4, 5]);
  const old = finishRun(race, 4); let resolveRead!: (run: GhostRun) => void;
  const records = new GhostRecords({ load: () => new Promise(resolve => { resolveRead = resolve; }), save: async () => {} });
  const pending = records.load(race);
  finishRun(race, 2); records.save(race); resolveRead(old);
  assert.deepEqual((await pending).map(run => run.duration), [2, 4]);
  assert.equal(bestTime(race), 2); assert.ok(recordKey(race).includes(race.vehicleId));
});

test('matching scores from separate races survive, but saving the same finish cannot duplicate it', async t => {
  localScores(t); const records = new GhostRecords(new MemoryGhostStorage()); const race = new Race(shortTrack());
  const first = finishRun(race, 4); records.save(race); records.save(race);
  assert.equal(race.ghost.finish(race)!.id, first.id);
  assert.equal((await records.load(race)).length, 1);
  const second = finishRun(race, 4); records.save(race);
  assert.notEqual(first.id, second.id);
  const history = await records.load(race);
  assert.equal(history.length, 2); assert.deepEqual(history.map(run => run.totalTime), [4, 4]);
});

test('single-ghost saves migrate into history, including a finish saved before the first read completes', async t => {
  const scores = localScores(t); const storage = new MemoryGhostStorage(); const race = new Race(shortTrack());
  const legacy = finishRun(race, 4); legacy.version = 1; delete legacy.id;
  legacy.frames.forEach(frame => { delete frame.boosting; });
  storage.values.set(recordKey(race), legacy); scores.set(recordKey(race), '4');
  const records = new GhostRecords(storage);
  finishRun(race, 5); assert.equal(records.save(race), false);
  await new Promise(resolve => setImmediate(resolve));
  const reloaded = new GhostRecords(storage);
  const runs = await reloaded.load(race);
  assert.deepEqual(runs.map(run => run.duration), [4, 5]);
  assert.equal(runs[0].version, 1); assert.equal(runs[1].version, 2);
  race.ghost.setReplays(runs);
  assert.equal(race.ghost.sample(1)!.boosting, false, 'legacy boost state is unknown and must not be invented');
  for (const duration of [6, 7, 8, 9, 3]) { finishRun(race, duration); reloaded.save(race); }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await new GhostRecords(storage).load(race)).map(run => run.duration), [3, 4, 5, 6, 7]);
});

test('delayed persistence keeps the completed race category after next-race settings change', async t => {
  localScores(t); const storage = new MemoryGhostStorage(); const records = new GhostRecords(storage); const race = new Race(shortTrack());
  const key = recordKey(race); finishRun(race, 4); records.save(race);
  race.start(); race.difficulty = 'hard'; race.autoThrottle = true; race.mode = 'downhill';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.values.has(key), true); assert.equal(storage.values.has(recordKey(race)), false);
  assert.deepEqual(await records.load(race), []);
});

test('five replays retain independent interpolated poses and finish at their own times', () => {
  const race = new Race(shortTrack()); const runs = [8, 6, 4, 7, 5, 9].map(duration => finishRun(race, duration));
  race.start(); race.ghost.setReplays(runs);
  assert.deepEqual(race.ghost.replays.map(run => run.duration), [4, 5, 6, 7, 8]);
  const poses = race.ghost.replays.map((run, index) => {
    const pose = race.ghost.sample(1, index)!;
    assert.ok(Math.abs(pose.position.z + 120 / run.duration) < 1e-8); return pose;
  });
  assert.equal(new Set(poses).size, MAX_GHOSTS);
  assert.equal(poses[0].position.z, -30, 'sampling later ghosts does not mutate the fastest pose');
  assert.equal(race.ghost.sample(4.1, 0), null); assert.ok(race.ghost.sample(4.1, 1));
  assert.equal(race.ghost.sample(9, 4), null);
  race.start(); assert.deepEqual(race.ghost.replays, []);
  race.ghost.setReplays(runs);
  for (let i = 0; i < MAX_GHOSTS; i++) assert.equal(race.ghost.sample(0, i)!.time, 0);
});

test('a one-tick nitro pulse is recorded even between regular samples and replays only during that interval', () => {
  const race = new Race(shortTrack()); race.start(); race.phase = 'racing'; race.speed = 20; race.nitro = 10;
  for (const car of race.opponents.cars) car.finishTime = 0;
  const step = 1 / 60;
  race.update(step, { ...idleControls(), throttle: true, nitro: true });
  race.update(step, { ...idleControls(), throttle: true });
  for (let i = 0; i < 1200 && race.phase !== 'finished'; i++) race.update(step, { ...idleControls(), throttle: true });
  const run = race.ghost.finish(race)!; assert.ok(run);
  assert.ok(run.frames.some(frame => frame.time === step && frame.boosting));
  race.ghost.setReplays([run]);
  assert.equal(race.ghost.sample(step * 0.9)!.boosting, false);
  assert.equal(race.ghost.sample(step * 1.5)!.boosting, true);
  assert.equal(race.ghost.sample(step * 2)!.boosting, false);
});

function flameMaterials(root: THREE.Object3D) {
  const materials = new Set<THREE.ShaderMaterial>();
  root.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial) materials.add(object.material); });
  return [...materials];
}

test('five coloured ghosts replay their own jets, freeze on pause and release excess models on a new start', () => {
  const race = new Race(shortTrack()); const runs = [4, 5, 6, 7, 8].map(duration => {
    const run = finishRun(race, duration); run.frames.forEach(frame => { frame.boosting = true; }); return run;
  });
  race.start(); race.ghost.setReplays(runs); const fleet = new GhostFleet(race.vehicle);
  try {
    fleet.update(race, 0, race.position);
    assert.equal(fleet.group.children.length, MAX_GHOSTS);
    assert.equal(flameMaterials(fleet.group).length, 0, 'countdown does not allocate idle jets');
    race.phase = 'racing'; race.boosting = false;
    for (let i = 1; i <= 60; i++) fleet.update(race, i / 60, race.position);
    const legend = ghostLegend(race.ghost.replays, 0);
    for (const [index, model] of fleet.group.children.entries()) {
      const jets = model.getObjectByName('nitro-exhaust-flames')!; assert.ok(jets?.visible);
      jets.children.forEach((jet, i) => assert.deepEqual(jet.position.toArray(), CAR_EXHAUST_PORTS[i]));
      const color = new THREE.Color(GHOST_COLORS[index]);
      assert.ok(flameMaterials(model)[0].uniforms.base.value.equals(color));
      model.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) assert.ok(object.material.color.equals(color)); });
      assert.ok(legend.includes(`color:${GHOST_COLORS[index]}`)); assert.ok(legend.includes(`历史第 ${index + 1} 名`));
    }
    const clocks = flameMaterials(fleet.group).map(material => material.uniforms.time.value);
    race.pause(); for (let i = 0; i < 10; i++) fleet.update(race, 1, race.position);
    assert.deepEqual(flameMaterials(fleet.group).map(material => material.uniforms.time.value), clocks);
    assert.ok(fleet.group.children.every(model => model.getObjectByName('nitro-exhaust-flames')!.visible));
    race.resume(); fleet.update(race, 1.1, race.position);
    assert.ok(flameMaterials(fleet.group)[0].uniforms.time.value > clocks[0]);
    fleet.update(race, 1.2, { x: 1000, y: 0, z: 0 });
    assert.ok(fleet.group.children.every(model => !model.visible && !model.getObjectByName('nitro-exhaust-flames')!.visible));
    let released = 0;
    for (const model of fleet.group.children.slice(1)) flameMaterials(model)[0].addEventListener('dispose', () => released++);
    race.start(); race.ghost.setReplays([runs[0]]); fleet.reset(); fleet.update(race, 0, race.position);
    assert.equal(fleet.group.children.length, 1); assert.equal(released, 4);
    assert.equal(fleet.group.children[0].getObjectByName('nitro-exhaust-flames')!.visible, false);
    assert.equal(race.opponents.cars.length, 5); assert.equal(race.standings.length, 6);
  } finally { disposeObject(fleet.group); }
});

test('motorcycle jets attach to the leaning silencer and never use the current player boost state', () => {
  const race = new Race(shortTrack(), getVehicle('trail')); const run = finishRun(race, 4);
  run.frames[1].boosting = true; run.frames[1].steering = 0.6;
  race.start(); race.phase = 'racing'; race.boosting = true; race.ghost.setReplays([run]);
  const view = new GhostVehicle(race.vehicle);
  try {
    view.update(race, 0.5, race.position);
    assert.equal(view.group.getObjectByName('nitro-exhaust-flames'), undefined);
    race.boosting = false; view.update(race, 1.2, race.position);
    const jets = view.group.getObjectByName('nitro-exhaust-flames')!; assert.ok(jets.visible);
    assert.notEqual(jets.parent, view.group); assert.notEqual(jets.parent!.rotation.z, 0);
    assert.deepEqual(jets.children[0].position.toArray(), motorcycleExhaustPort(race.vehicle));
    run.frames[2].airborne = true; view.update(race, 2, race.position); assert.equal(jets.visible, false);
    run.frames[2].airborne = false;
    for (let i = 0; i < 60; i++) view.update(race, 2 + i / 60, race.position);
    assert.equal(jets.visible, false);
    view.update(race, 4.01, race.position); assert.equal(view.group.visible, false);
  } finally { disposeObject(view.group); }
});

test('spectator start loads track-wide top five across vehicles and driving settings', async () => {
  const runs = [12, 9, 15, 10, 14, 11].map((duration, i) => {
    const recorded = new Race(shortTrack(), getVehicle(i % 2 ? 'vortex' : 'swift'));
    recorded.difficulty = i % 2 ? 'hard' : 'easy'; recorded.autoThrottle = true;
    return { key: recordKey(recorded), run: finishRun(recorded, duration) };
  });
  const data = new Map<string, GhostRun[]>();
  runs.forEach(({key, run}) => data.set(key, [...(data.get(key) ?? []), run]));
  const records = new GhostRecords({
    async load(key) { return data.get(key); },
    async save() { throw new Error('read-only fixture'); },
    ...{ async loadAll() { return [...data.values()]; } },
  });
  const watching = new Race(shortTrack(), getVehicle('falcon')); watching.spectating = true;
  const history = await records.load(watching);
  assert.deepEqual(history.map(run => run.totalTime), [9, 10, 11, 12, 14]);
  watching.spectating = false;
  assert.deepEqual(await records.load(watching), [], 'driving still uses the exact competition category');
});

test('spectator fleet uses original vehicle models and replaces them when the top five changes', t => {
  const race = new Race(shortTrack()); race.spectating = true;
  const swift = finishRun(new Race(shortTrack(), getVehicle('swift')), 9);
  const vortex = finishRun(new Race(shortTrack(), getVehicle('vortex')), 10);
  race.start(); race.phase = 'racing'; race.ghost.setReplays([swift, vortex]);
  const fleet = new GhostFleet(race.vehicle); t.after(() => disposeObject(fleet.group));
  fleet.update(race, 1, race.position);
  assert.equal(fleet.group.children.length, 2);
  assert.deepEqual(fleet.group.getObjectByName('history-ghost-1')!.scale.toArray(), getVehicle('swift').scale);
  assert.deepEqual(fleet.group.getObjectByName('history-ghost-2')!.scale.toArray(), getVehicle('vortex').scale);
  const old = fleet.group.getObjectByName('history-ghost-1');
  race.ghost.setReplays([vortex]); fleet.update(race, 1, race.position);
  assert.equal(fleet.group.children.length, 1);
  assert.notEqual(fleet.group.children[0], old);
  assert.deepEqual(fleet.group.children[0].scale.toArray(), getVehicle('vortex').scale);
  assert.equal(fleet.group.children[0].visible, true);
});

test('spectator loading rejects stale layouts and reports unavailable storage instead of an empty history', async () => {
  const watching = new Race(shortTrack()); watching.spectating = true;
  const good = finishRun(new Race(shortTrack()), 15);
  const stale = { ...good, id: 'stale', track: good.track + '-old', totalTime: 5 };
  const unknown = { ...good, id: 'unknown', vehicleId: 'missing' };
  const data = { async load() { return []; }, async save() { return []; }, async loadAll() { return [good, stale, unknown]; } };
  assert.deepEqual(await new GhostRecords(data).load(watching), [good]);
  data.loadAll = async () => { throw new Error('unavailable'); };
  await assert.rejects(new GhostRecords(data).load(watching), /storage unavailable/);
});
