import test from 'node:test';
import { parseDifficulty } from '../src/content/difficulties.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { DOWNHILL_STAGES, DOWNHILL_STAGE, getStage, stageDrop } from '../src/content/stages.ts';
import { LONGBOARDS, LONGBOARD, getVehicle } from '../src/content/vehicles.ts';
import { raceSelection } from '../src/content/modes.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { settings, saveRecord, bestTime } from '../src/settings.ts';
import { createPlayerVehicle } from '../src/render/car.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { longboardCatalog } from '../src/ui/longboard-catalog.ts';
import { longboardDialog } from '../src/ui/longboard-ui.ts';
import { vehicleThumbnail } from '../src/ui/vehicle-thumbnail.ts';

test('all downhill courses descend continuously and every board can cross their five gates', () => {
  assert.ok(DOWNHILL_STAGES.length >= 6 && LONGBOARDS.length >= 6);
  assert.equal(new Set(DOWNHILL_STAGES.map(stage => stage.id)).size, DOWNHILL_STAGES.length);
  for (const stage of DOWNHILL_STAGES) {
    const track = new Track(stage);
    assert.equal(getStage(stage.id), stage);
    assert.ok(stage.downhill && !stage.venue && !track.hasJumps);
    assert.ok(stageDrop(stage) >= 150 && track.length > 3800 && track.length < 18000);
    assert.ok(track.notes.length >= 1, stage.id);
    for (let i = 1; i < track.points.length; i++) assert.ok(track.points[i].y < track.points[i - 1].y, stage.id);
    for (let d = 0; d < track.length; d += 31) {
      assert.ok(track.grade(d) < -.02 && track.grade(d) > -.125, `${stage.id}: unreasonable slope`);
      const p = track.position(d);
      assert.ok(Math.abs(track.project(p.x, p.z).distance - d) < .01, `${stage.id}: overlapping road`);
    }
    for (const vehicle of LONGBOARDS) {
      const race = new Race(track, vehicle); race.phase = 'racing';
      for (let gate = 1; gate <= SECTORS; gate++) {
        race.placeOnTrack(track.length * gate / SECTORS - .1); race.speed = 20;
        race.update(1 / 60, { ...idleControls(), nitro: true });
        assert.equal(race.splits.length, gate, `${stage.id}/${vehicle.id}`);
      }
      assert.equal(race.phase, 'finished'); assert.equal(race.mode, 'downhill');
    }
  }
});

test('mixed board opponents can finish every descent under their own speed limits', () => {
  for (const stage of DOWNHILL_STAGES) {
    const race = new Race(new Track(stage), LONGBOARD); race.lane = 30;
    assert.ok(new Set(race.opponents.cars.map(car => car.vehicle.id)).size > 1);
    const timeLimit = Math.max(450, race.targetTime * 1.5);
    for (let tick = 0; tick < timeLimit * 30 && race.opponents.cars.some(car => car.finishTime === null); tick++) {
      race.opponents.update(1 / 30, race, tick / 30);
      assert.ok(race.opponents.cars.every(car => car.speed * 3.6 <= car.vehicle.topSpeed + 1e-8));
    }
    assert.ok(race.opponents.cars.every(car => car.finishTime !== null), stage.id);
  }
});

test('every board can reach 270 km/h on a descent and cannot exceed it', () => {
  const track = new Track({ ...DOWNHILL_STAGE, points: [
    { x: 0, z: 0, y: 500 }, { x: 0, z: -1500, y: 275 }, { x: 0, z: -3000, y: 50 },
  ] });
  for (const vehicle of LONGBOARDS) {
    const race = new Race(track, vehicle); race.phase = 'racing'; race.placeOnTrack(50);
    race.speed = 269 / 3.6;
    for (let tick = 0; tick < 120; tick++) {
      race.update(1 / 60, { ...idleControls(), nitro: true });
      assert.ok(race.speed * 3.6 <= 270 + 1e-8, vehicle.id);
    }
    assert.equal(race.speed * 3.6, 270, vehicle.id);
    assert.equal(race.boosting, false, 'tucking cannot bypass the downhill limit');
  }
});

test('board choices change live handling, physical deck geometry and catalogue artwork', () => {
  const previews = new Set<string>();
  for (const vehicle of LONGBOARDS) {
    assert.equal(getVehicle(vehicle.id), vehicle);
    const model = createPlayerVehicle(vehicle);
    assert.equal(model.vehicle, vehicle);
    assert.equal(model.wheels.length, 4);
    const deck = model.group.getObjectByName(`${vehicle.board!.shape}-deck`)!;
    assert.ok(deck);
    const size = new THREE.Box3().setFromObject(deck).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - vehicle.board!.width) < 1e-6);
    assert.ok(Math.abs(size.z - vehicle.board!.length) < 1e-6);
    previews.add(vehicleThumbnail(vehicle)); disposeObject(model.group);
  }
  assert.equal(previews.size, LONGBOARDS.length);
  const ride = (id: string, controls: ReturnType<typeof idleControls>, speed: number) => {
    const race = new Race(new Track(DOWNHILL_STAGE), getVehicle(id)); race.phase = 'racing'; race.speed = speed;
    for (let i = 0; i < 30; i++) race.update(1 / 60, controls);
    return race;
  };
  assert.ok(ride('needle', { ...idleControls(), throttle: true }, 0).speed > ride('endurance', { ...idleControls(), throttle: true }, 0).speed);
  assert.ok(ride('endurance', { ...idleControls(), brake: true }, 20).speed < ride('carbon', { ...idleControls(), brake: true }, 20).speed);
  assert.ok(Math.abs(ride('needle', { ...idleControls(), steering: 1 }, 15).heading) > Math.abs(ride('carbon', { ...idleControls(), steering: 1 }, 15).heading));
  assert.ok(ride('switchblade', { ...idleControls(), drift: true, steering: .2 }, 20).speed < ride('breeze', { ...idleControls(), drift: true, steering: .2 }, 20).speed);
  for (const vehicle of LONGBOARDS) {
    assert.ok(ride(vehicle.id, { ...idleControls(), nitro: true }, 40).speed * 3.6 <= vehicle.topSpeed + 1e-8);
  }
});

test('downhill selection survives mode changes and does not overwrite the motor vehicle preferences', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const track = new Track(); const race = new Race(track);
  const ui = { setSelection() {}, closeDialog() {}, toast() {} };
  const view = { contextAvailable: true, track, vehicle: race.vehicle, setStage(next: Track) { this.track = next; }, setVehicle(next: typeof LONGBOARD) { this.vehicle = next; }, reset() {} };
  const context = vm.createContext({ Track, Race, RaceTimeline, getVehicle, raceSelection, track, race, timeline: new RaceTimeline(race), ui, view,
    settings: { ...settings, mode: 'classic', stageId: 'pine', vehicleId: 'falcon' }, input: { clear() {} }, audio: { reset() {} },
    saveSettings() {}, performance: { now: () => 1 }, lastFrame: 0, dirty: false });
  const callback = source.slice(source.indexOf('function setRaceMode('), source.indexOf('ui.onAction ='))
    + source.slice(source.indexOf('ui.onSelect ='), source.indexOf('input.onCommand ='));
  vm.runInContext(ts.transpile(callback, { target: ts.ScriptTarget.ES2022 }), context);
  context.setRaceMode('downhill');
  context.ui.onSelect('stage', 'mist-descent'); context.ui.onSelect('vehicle', 'carbon');
  assert.equal(context.race.stageId, 'mist-descent'); assert.equal(context.race.vehicleId, 'carbon');
  assert.equal(view.track, context.race.track); assert.equal(view.vehicle, context.race.vehicle);
  assert.deepEqual(context.timeline.pose.position, context.race.position);
  assert.equal(context.settings.stageId, 'pine'); assert.equal(context.settings.vehicleId, 'falcon');
  context.setRaceMode('classic'); assert.equal(context.race.stageId, 'pine'); assert.equal(context.race.vehicleId, 'falcon');
  context.ui.onSelect('stage', 'depot'); context.ui.onSelect('vehicle', 'trail');
  context.setRaceMode('downhill'); assert.equal(context.race.stageId, 'mist-descent'); assert.equal(context.race.vehicleId, 'carbon');
  const active = context.race; active.start(); context.ui.onSelect('stage', 'bamboo-descent');
  active.pause(); context.ui.onSelect('vehicle', 'breeze'); assert.equal(context.race, active);
  active.phase = 'menu'; context.setRaceMode('classic');
  assert.equal(context.race.stageId, 'depot'); assert.equal(context.race.vehicleId, 'trail');
  const invalid = raceSelection('downhill', 'bad-save', 'falcon');
  assert.equal(invalid.stage, DOWNHILL_STAGE); assert.equal(invalid.vehicle, LONGBOARD);
});

test('settings reload both selections and records remain isolated by map and board', () => {
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  values.set('dustline-settings', JSON.stringify({ mode: 'downhill', stageId: 'depot', vehicleId: 'trail', downhillStageId: 'maple-descent', downhillVehicleId: 'needle' }));
  const source = readFileSync(new URL('../src/settings.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const context = vm.createContext({ exports: {}, localStorage, getStage, getVehicle, DOWNHILL_STAGE, LONGBOARD, parseDifficulty });
  vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  assert.equal(context.exports.settings.downhillStageId, 'maple-descent'); assert.equal(context.exports.settings.downhillVehicleId, 'needle');
  assert.equal(context.exports.settings.stageId, 'depot'); assert.equal(context.exports.settings.vehicleId, 'trail');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  try {
    let score = 100;
    for (const stage of DOWNHILL_STAGES) for (const vehicle of LONGBOARDS) {
      const category = { ...settings, mode: 'downhill' as const, stageId: stage.id, vehicleId: vehicle.id };
      assert.equal(bestTime(category), null); assert.equal(saveRecord(score, category), true); assert.equal(bestTime(category), score++);
    }
    assert.equal(values.size, DOWNHILL_STAGES.length * LONGBOARDS.length + 1);
  } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('downhill menus list selectable models and routes, then disable selection during a race', () => {
  const race = new Race(new Track(getStage('mist-descent')), getVehicle('carbon'));
  const formatTime = (time: number | null) => time === null ? '—' : time.toFixed(2);
  const stages = longboardCatalog('stage', race, formatTime); const garage = longboardCatalog('garage', race, formatTime);
  for (const stage of DOWNHILL_STAGES) assert.ok(stages.includes(`data-stage="${stage.id}"`));
  for (const vehicle of LONGBOARDS) assert.ok(garage.includes(`data-vehicle="${vehicle.id}"`));
  assert.match(stages, /落差 480 M/); assert.match(stages, /海拔剖面/); assert.match(garage, /上限 270 KM\/H/);
  assert.doesNotMatch(stages + garage, / disabled/);
  assert.match(longboardDialog('controls', race, formatTime)!, /速度上限 270 km\/h/);
  race.start(); race.pause();
  for (const [type, count] of [['stage', DOWNHILL_STAGES.length], ['garage', LONGBOARDS.length]] as const) {
    const content = longboardCatalog(type, race, formatTime);
    assert.equal((content.match(/ disabled /g) ?? []).length, count);
  }
});
