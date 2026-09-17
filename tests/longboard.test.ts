import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { DOWNHILL_STAGE } from '../src/content/stages.ts';
import { LONGBOARD } from '../src/content/vehicles.ts';
import { raceSelection } from '../src/content/modes.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { longboardAcceleration } from '../src/simulation/longboard.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { LongboardRider } from '../src/render/longboard.ts';
import { RivalCars } from '../src/render/rivals.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { bestTime, saveRecord } from '../src/settings.ts';

const step = 1 / 60;
const boardRace = () => new Race(new Track(DOWNHILL_STAGE), LONGBOARD);
const riding = () => { const race = boardRace(); race.phase = 'racing'; return race; };

test('downhill tuning quintuples drive while reducing both brake styles by one fifth', () => {
  const grade = -.1;
  const gravity = -9.81 * grade / Math.sqrt(1 + grade * grade);
  const accelerating = longboardAcceleration(0, grade, true, false, false, false);
  assert.ok(Math.abs(accelerating - (gravity * 5 + LONGBOARD.acceleration * 5 - .13)) < 1e-12);
  const coast = longboardAcceleration(20, 0, false, false, false, false);
  const footbrake = longboardAcceleration(20, 0, false, false, true, false);
  const slide = longboardAcceleration(20, 0, false, false, false, true);
  assert.ok(Math.abs(footbrake - (coast - LONGBOARD.braking * .8)) < 1e-12);
  assert.ok(Math.abs(slide - (coast - 8 * .8)) < 1e-12);
  assert.equal(longboardAcceleration(20, -1, false, false, true, false), -.8);
});

test('downhill is continuous, entirely descending, and has a 260 m drop with physical gates', () => {
  const track = new Track(DOWNHILL_STAGE);
  assert.ok(track.length > 4800 && track.length < 6000);
  assert.equal(track.points[0].y - track.points.at(-1)!.y, 260);
  for (let i = 1; i < track.points.length; i++) assert.ok(track.points[i].y < track.points[i - 1].y);
  for (let distance = 0; distance < track.length; distance += 20) {
    assert.ok(track.grade(distance) < 0);
    const p = track.position(distance);
    assert.ok(Math.abs(track.project(p.x, p.z).distance - distance) < 0.01);
  }
  assert.ok(track.notes.length >= 4);
});

test('gravity rolls downhill without throttle, opposes uphill travel, and tuck reduces drag', () => {
  const coast = riding(); const tuck = riding(); const uphill = riding();
  for (const race of [coast, tuck, uphill]) { race.placeOnTrack(25); race.speed = 18; }
  uphill.heading += Math.PI; uphill.travelHeading += Math.PI;
  for (let i = 0; i < 60; i++) {
    coast.update(step, idleControls()); tuck.update(step, { ...idleControls(), nitro: true }); uphill.update(step, idleControls());
  }
  assert.ok(tuck.speed > coast.speed + 0.3);
  assert.ok(uphill.speed < 18);
  assert.equal(tuck.boosting, false); assert.equal(tuck.nitro, 0); assert.equal(tuck.tucking, true);
  const start = riding();
  for (let i = 0; i < 60; i++) start.update(step, idleControls());
  assert.ok(start.speed > 0.5); assert.ok(start.distance > 0);
  const flat = new Race(new Track({ ...DOWNHILL_STAGE, points: DOWNHILL_STAGE.points.map(p => ({ ...p, y: 0 })) }), LONGBOARD);
  flat.phase = 'racing'; flat.update(1, { ...idleControls(), nitro: true });
  assert.equal(flat.speed, 0, 'tucking alone is not a motor on flat ground');
  flat.update(step, { ...idleControls(), throttle: true }); assert.ok(flat.speed > 0, 'pushing can start on flat ground');
});

test('brakes override push, automatic push and tuck; slides never charge nitro', () => {
  for (const sliding of [false, true]) {
    const race = riding(); race.speed = 18; race.autoThrottle = true;
    for (let i = 0; i < 300; i++) race.update(step, { throttle: true, nitro: true, steering: sliding ? 0.3 : 0, brake: !sliding, drift: sliding });
    assert.equal(race.speed, 0); assert.equal(race.tucking, false); assert.equal(race.pushing, false);
    assert.equal(race.nitro, 0); assert.equal(race.nitroCharging, false);
  }
  const race = riding(); race.speed = 18;
  race.update(step, { ...idleControls(), steering: 1, drift: true });
  assert.ok(race.driftAngle < 0); assert.equal(race.drifting, true);
  const angle = Math.abs(race.driftAngle);
  race.update(step, idleControls()); assert.ok(Math.abs(race.driftAngle) < angle);
});

test('downhill keeps manual heading and offroad penalties, including recovery and lifecycle resets', () => {
  const race = riding(); race.placeOnTrack(400, 8); race.speed = 20;
  const heading = race.heading;
  race.update(step, { ...idleControls(), nitro: true });
  assert.ok(Math.abs(race.heading - heading) < 1e-12); assert.ok(race.integrity < 100); assert.ok(race.speed < 20);
  const timeline = new RaceTimeline(race); const time = race.elapsed;
  race.pause(); timeline.advance(0.1, { ...idleControls(), throttle: true });
  assert.equal(race.elapsed, time); assert.equal(race.tucking, false);
  race.resume(); race.recover(); timeline.reset();
  assert.equal(race.penalty, 5); assert.equal(race.lane, 0); assert.deepEqual(timeline.pose.position, race.position);
  race.start(); assert.equal(race.mode, 'downhill'); assert.equal(race.penalty, 0); assert.equal(race.speed, 0);
  assert.ok(race.opponents.cars.every(rival => rival.vehicle.mode === 'longboard' && rival.speed === 0));
});

test('all five ordered gates award a downhill finish; missed gates require recovery', () => {
  const race = riding();
  race.placeOnTrack(race.nextCheckpointDistance + 20); race.update(step, idleControls());
  assert.equal(race.splits.length, 0); assert.equal(race.missedCheckpoint, true);
  race.recover(); assert.ok(race.distance < race.nextCheckpointDistance);
  for (let gate = 1; gate <= SECTORS; gate++) {
    race.placeOnTrack(race.track.length * gate / SECTORS - 0.1); race.speed = 20;
    race.update(step, { ...idleControls(), nitro: true });
    assert.equal(race.splits.length, gate);
  }
  assert.equal(race.phase, 'finished'); assert.equal(race.progress, 1); assert.equal(race.tucking, false);
});

test('five longboard opponents finish the full descent within the board speed limit', () => {
  const race = boardRace(); race.lane = 30;
  for (let tick = 0; tick < 400 / step && race.opponents.cars.some(car => car.finishTime === null); tick++) {
    race.opponents.update(step, race, tick * step);
    assert.ok(race.opponents.cars.every(car => car.speed * 3.6 <= car.vehicle.topSpeed + 1e-8));
  }
  assert.ok(race.opponents.cars.every(car => car.finishTime !== null));
});

test('mode switch updates track, rider, opponents and timeline and restores the saved motorcycle', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('function setRaceMode('), source.indexOf('ui.onAction ='));
  const selection = raceSelection('classic', 'depot', 'trail'); const track = new Track(selection.stage); const race = new Race(track, selection.vehicle);
  const view = { contextAvailable: true, track, vehicle: race.vehicle, setStage(next: Track) { this.track = next; }, setVehicle(next: typeof LONGBOARD) { this.vehicle = next; }, reset() {} };
  const ui = { race, setSelection(next: Race) { this.race = next; } };
  const context = vm.createContext({ Track, Race, RaceTimeline, raceSelection, track, race, timeline: new RaceTimeline(race), view, ui,
    settings: { stageId: 'depot', vehicleId: 'trail', mode: 'classic', difficulty: 'medium', autoThrottle: false },
    input: { clear() {} }, audio: { reset() {} }, saveSettings() {}, performance: { now: () => 1 }, lastFrame: 0, dirty: false });
  vm.runInContext(ts.transpile(callback, { target: ts.ScriptTarget.ES2022 }), context);
  context.setRaceMode('downhill');
  assert.equal(context.race.vehicleId, 'longboard'); assert.equal(context.race.stageId, 'ridge-descent');
  assert.equal(view.vehicle, context.race.vehicle); assert.equal(view.track, context.race.track); assert.equal(ui.race, context.race);
  assert.deepEqual(context.timeline.pose.position, context.race.position);
  assert.ok(context.race.opponents.cars.every((car: { vehicle: typeof LONGBOARD }) => car.vehicle.mode === 'longboard'));
  assert.equal(context.settings.stageId, 'depot'); assert.equal(context.settings.vehicleId, 'trail');
  const active = context.race; active.start(); context.setRaceMode('classic'); assert.equal(context.race, active);
  active.phase = 'menu'; context.setRaceMode('classic');
  assert.equal(context.race.stageId, 'depot'); assert.equal(context.race.vehicleId, 'trail'); assert.equal(context.race.mode, 'classic');
  assert.ok(context.race.opponents.cars.every((car: { vehicle: typeof LONGBOARD }) => car.vehicle.mode === 'motorcycle'));
});

test('downhill records cannot read or overwrite classic or legacy records', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    const race = boardRace(); assert.ok(saveRecord(150, race)); assert.equal(bestTime(race), 150);
    assert.equal(bestTime({ ...race, mode: 'classic', stageId: race.stageId, vehicleId: race.vehicleId }), null);
    assert.equal(saveRecord(151, race), false); assert.equal(saveRecord(149, race), true);
    assert.equal(values.size, 1); assert.ok([...values.keys()][0].endsWith('-downhill'));
  } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('rider geometry supports tuck, footbrake and colored opponents without a browser or WebGL', () => {
  const rider = new LongboardRider();
  assert.equal(rider.wheels.length, 4); assert.ok(rider.group.getObjectByName('full-face-helmet'));
  rider.group.updateMatrixWorld(true); const standing = new THREE.Box3().setFromObject(rider.group, true);
  for (let i = 0; i < 30; i++) rider.update(20, 0, 0, false, false, step, true);
  rider.group.updateMatrixWorld(true); const tucked = new THREE.Box3().setFromObject(rider.group, true);
  assert.ok(tucked.max.y < standing.max.y - 0.3); assert.ok(tucked.min.y >= -0.01);
  const rivals = new RivalCars('longboard'); assert.equal(rivals.group.children.length, 5);
  assert.ok(rivals.group.children.every(child => child.name === 'longboard-rider'));
  disposeObject(rider.group); disposeObject(rivals.group);
});
