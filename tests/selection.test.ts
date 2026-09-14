import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { Track } from '../src/simulation/track.ts';
import { Race } from '../src/simulation/race.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { getStage } from '../src/content/stages.ts';
import { getVehicle } from '../src/content/vehicles.ts';
import { settings } from '../src/settings.ts';
import { raceSelection } from '../src/content/modes.ts';
import { disposeObject } from '../src/render/dispose.ts';

test('menu selections update the real race, timeline, renderer and HUD together; active runs reject swaps', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('ui.onSelect ='), source.indexOf('input.onCommand ='));
  const track = new Track(); const race = new Race(track);
  let saved = 0; let resets = 0;
  const view = {
    contextAvailable: true, track, vehicle: race.vehicle,
    setStage(next: Track) { this.track = next; }, setVehicle(next: ReturnType<typeof getVehicle>) { this.vehicle = next; }, reset() { resets++; },
  };
  const ui = { race, track, setSelection(next: Race) { this.race = next; this.track = next.track; }, closeDialog() {}, toast() {} };
  const context = vm.createContext({
    Track, Race, RaceTimeline, getStage, getVehicle, raceSelection, track, race, timeline: new RaceTimeline(race), view, ui,
    settings: { ...settings, stageId: 'pine', vehicleId: 'falcon' }, saveSettings() { saved++; },
    input: { clear() {} }, audio: { reset() {} }, performance: { now: () => 1000 }, dirty: false, lastFrame: 0,
  });
  vm.runInContext(ts.transpile(callback, { target: ts.ScriptTarget.ES2022 }), context);
  context.ui.onSelect('stage', 'alpine'); context.ui.onSelect('vehicle', 'nomad');
  assert.equal(context.race.stageId, 'alpine'); assert.equal(context.race.vehicleId, 'nomad');
  assert.equal(ui.track, view.track); assert.equal(ui.track, context.race.track);
  assert.equal(ui.race, context.race); assert.equal(view.vehicle, context.race.vehicle);
  assert.deepEqual(context.timeline.pose.position, context.race.position);
  assert.equal(context.settings.stageId, 'alpine'); assert.equal(context.settings.vehicleId, 'nomad');
  assert.equal(saved, 2); assert.equal(resets, 2); assert.equal(context.dirty, true);
  context.ui.onSelect('stage', 'depot');
  assert.equal(context.race.stageId, 'depot'); assert.ok(context.race.track.venueBounds);
  assert.equal(context.race.opponents.cars.length, 5); assert.equal(ui.track, view.track);
  assert.equal(context.settings.stageId, 'depot');
  for (const id of ['thunder', 'vortex', 'summit']) {
    context.ui.onSelect('vehicle', id);
    assert.equal(context.race.vehicleId, id); assert.equal(context.settings.vehicleId, id);
    assert.equal(view.vehicle, getVehicle(id)); assert.equal(ui.race, context.race);
    assert.equal(context.race.stageId, 'depot');
    assert.deepEqual(context.timeline.pose.position, context.race.position);
  }
  const active = context.race; active.start();
  context.ui.onSelect('stage', 'valley'); active.pause(); context.ui.onSelect('vehicle', 'swift');
  assert.equal(context.race, active); assert.equal(saved, 6); assert.equal(resets, 6);
});

test('replaced scenes release instance buffers and shared geometry, materials and textures exactly once', () => {
  const root = new THREE.Group(); const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture(); const material = new THREE.MeshBasicMaterial({ map: texture });
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  root.add(instances, new THREE.Mesh(geometry, material));
  const counts = { geometry: 0, material: 0, texture: 0, instances: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  instances.addEventListener('dispose', () => counts.instances++);
  disposeObject(root);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, instances: 1 });
});

test('shared starting-grid lines release their geometry and material exactly once', () => {
  const root = new THREE.Group(); const geometry = new THREE.BufferGeometry(); const material = new THREE.LineBasicMaterial();
  for (let i = 0; i < 6; i++) root.add(new THREE.LineSegments(geometry, material));
  let geometries = 0; let materials = 0;
  geometry.addEventListener('dispose', () => geometries++); material.addEventListener('dispose', () => materials++);
  disposeObject(root);
  assert.equal(geometries, 1); assert.equal(materials, 1);
});

test('garage switches motorcycle classes and cars while preserving race rules and saved selection', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('ui.onSelect ='), source.indexOf('input.onCommand ='));
  const track = new Track(); const race = new Race(track); race.mode = 'items';
  let reopened = 0;
  const ui = {
    dialog: { open: true, dataset: { page: 'garage' } },
    setSelection() {}, closeDialog() { this.dialog.open = false; }, toast() {},
    openDialog(page: string, selected: Race) {
      assert.equal(page, 'garage'); assert.equal(selected.vehicleMode, 'motorcycle');
      this.dialog.open = true; reopened++;
    },
  };
  const context = vm.createContext({
    Track, Race, RaceTimeline, getStage, getVehicle, raceSelection, track, race, timeline: new RaceTimeline(race), ui,
    view: { contextAvailable: true, setVehicle() {}, setStage() {}, reset() {} },
    settings: { ...settings, stageId: 'pine', vehicleId: 'falcon', mode: 'items' }, saveSettings() {},
    input: { clear() {} }, audio: { reset() {} }, performance: { now: () => 1000 }, dirty: false, lastFrame: 0,
  });
  vm.runInContext(ts.transpile(callback, { target: ts.ScriptTarget.ES2022 }), context);
  context.ui.onSelect('vehicle', 'apex');
  assert.equal(reopened, 1); assert.equal(ui.dialog.open, true);
  for (const id of ['apex', 'trail', 'falcon']) {
    context.ui.onSelect('vehicle', id);
    assert.equal(context.settings.vehicleId, id); assert.equal(context.race.vehicleId, id);
    assert.equal(context.race.mode, 'items'); assert.equal(context.race.stageId, 'pine');
    assert.ok(context.race.opponents.cars.every((car: { vehicle: { mode: string } }) => car.vehicle.mode === getVehicle(id).mode));
    assert.deepEqual(context.timeline.pose.position, context.race.position);
  }
  context.ui.onSelect('vehicle', 'trail');
  const active = context.race; active.start(); active.pause();
  context.ui.onSelect('vehicle', 'falcon');
  assert.equal(context.race, active); assert.equal(context.settings.vehicleId, 'trail');
  active.start(); assert.equal(active.vehicleMode, 'motorcycle'); assert.equal(active.mode, 'items');
});
