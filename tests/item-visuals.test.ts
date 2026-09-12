import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ItemVisuals } from '../src/render/items.ts';
import { Race } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';
import { capturePose } from '../src/presentation.ts';
import { disposeObject } from '../src/render/dispose.ts';

test('item props reuse bounded batches, hide in classic mode, follow slopes and release their resources without WebGL', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); });
  const race = new Race(new Track(getStage('pine'))); race.mode = 'items'; race.phase = 'racing';
  race.placeOnTrack(100); race.items.player.shield = 7; race.items.player.boost = 3;
  race.items.player.held = 'disc'; race.items.use(race);
  race.items.player.held = 'banana'; race.items.use(race);
  const visuals = new ItemVisuals(race); const batches = [...visuals.group.children];
  visuals.update(race, capturePose(race));
  assert.equal(batches.length, 8);
  for (const batch of batches) {
    assert.ok(batch instanceof THREE.InstancedMesh);
    assert.ok(batch.count >= 0 && batch.count <= batch.instanceMatrix.count);
    for (const value of batch.instanceMatrix.array) assert.ok(Number.isFinite(value));
  }
  const boxes = batches[0] as THREE.InstancedMesh;
  assert.ok(boxes.count > 0);
  const pads = batches[2] as THREE.InstancedMesh;
  assert.ok(pads.count > 0);
  const matrix = new THREE.Matrix4(); pads.getMatrixAt(0, matrix);
  const ahead = new THREE.Vector3(0, 0, -3).applyMatrix4(matrix);
  const behind = new THREE.Vector3(0, 0, 3).applyMatrix4(matrix);
  const distance = race.items.pads[0].distance;
  const rise = race.track.sample(distance + 3).y - race.track.sample(distance - 3).y;
  assert.ok(Math.abs((ahead.y - behind.y) - rise) < 0.03);
  race.items.boxes.forEach(box => box.cooldown = 2);
  visuals.update(race, capturePose(race)); assert.equal(boxes.count, 0);
  race.mode = 'classic'; visuals.update(race, capturePose(race)); assert.equal(visuals.group.visible, false);
  race.mode = 'items'; race.start(); visuals.update(race, capturePose(race)); assert.equal(visuals.group.visible, true);
  assert.deepEqual(visuals.group.children, batches);
  let geometries = 0; let materials = 0; let buffers = 0; let textures = 0;
  for (const batch of batches as THREE.InstancedMesh[]) {
    batch.addEventListener('dispose', () => buffers++);
    batch.geometry.addEventListener('dispose', () => geometries++);
    const material = batch.material as THREE.MeshBasicMaterial;
    material.addEventListener('dispose', () => materials++);
    material.map?.addEventListener('dispose', () => textures++);
  }
  disposeObject(visuals.group);
  assert.deepEqual({ geometries, materials, buffers, textures }, { geometries: 8, materials: 8, buffers: 8, textures: 2 });
});
