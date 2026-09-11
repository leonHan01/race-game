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
    Track, Race, RaceTimeline, getStage, getVehicle, track, race, timeline: new RaceTimeline(race), view, ui,
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
  const active = context.race; active.start();
  context.ui.onSelect('stage', 'valley'); active.pause(); context.ui.onSelect('vehicle', 'swift');
  assert.equal(context.race, active); assert.equal(saved, 2); assert.equal(resets, 2);
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
