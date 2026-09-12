import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { buildIndoorVenue } from '../src/render/venue.ts';
import { buildWorld } from '../src/render/world.ts';
import { disposeObject } from '../src/render/dispose.ts';

const venues = STAGES.filter(stage => stage.venue);

test('three distinct indoor stages retain fully flat floors as the outdoor catalogue grows', () => {
  assert.equal(venues.length, 3);
  assert.equal(new Set(STAGES.map(stage => stage.id)).size, STAGES.length);
  assert.equal(new Set(venues.map(stage => stage.venue!.kind)).size, 3);
  for (const stage of venues) {
    const track = new Track(stage); const bounds = track.venueBounds!;
    assert.ok(track.length > 800 && track.length < 1600);
    assert.equal(stage.theme.density, 0);
    for (let d = -24; d < track.length + 32; d += 11) for (const lane of [-track.shoulderEdge - 10, 0, track.shoulderEdge + 10]) {
      const p = track.position(d, lane);
      assert.equal(track.surfaceHeight(p.x, p.z), bounds.floor);
      assert.ok(p.x > bounds.minX + 10 && p.x < bounds.maxX - 10);
      assert.ok(p.z > bounds.minZ + 10 && p.z < bounds.maxZ - 10);
    }
  }
});

test('every indoor route is covered by a solid roof and surrounded by four walls', () => {
  const ray = new THREE.Raycaster();
  for (const stage of venues) {
    const track = new Track(stage); const scene = new THREE.Group(); const bounds = track.venueBounds!;
    const root = buildIndoorVenue(scene, track); scene.updateMatrixWorld(true);
    const roof = root.getObjectByName('venue-roof')!; const floor = root.getObjectByName('venue-floor')!;
    assert.ok(root.getObjectByName('ceiling-lamps'));
    for (let d = -20; d < track.length + 30; d += 17) for (const lane of [-track.roadWidth / 2, 0, track.roadWidth / 2]) {
      const p = track.position(d, lane); const start = new THREE.Vector3(p.x, bounds.floor + 1, p.z);
      ray.set(start, new THREE.Vector3(0, 1, 0));
      assert.ok(ray.intersectObject(roof).length > 0, `${stage.id}: roof gap at ${d}/${lane}`);
      ray.set(start, new THREE.Vector3(0, -1, 0));
      assert.ok(ray.intersectObject(floor).length > 0, `${stage.id}: floor gap`);
    }
    const middle = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, bounds.floor + 4, (bounds.minZ + bounds.maxZ) / 2);
    for (const [name, x, z] of [['wall-west', -1, 0], ['wall-east', 1, 0], ['wall-north', 0, -1], ['wall-south', 0, 1]] as const) {
      ray.set(middle, new THREE.Vector3(x, 0, z));
      assert.ok(ray.intersectObject(root.getObjectByName(name)!).length > 0, `${stage.id}: missing ${name}`);
    }
    assert.ok(root.getObjectByName(stage.id === 'dome' ? 'grandstand-seats' : stage.id === 'depot' ? 'storage-racks' : 'service-containers'));
    disposeObject(scene);
  }
});

test('outer walls prevent escape at speed without changing player heading or adding vertical movement', () => {
  for (const stage of venues) for (const direction of ['north', 'south', 'west', 'east']) {
    const track = new Track(stage); const race = new Race(track); race.phase = 'racing';
    const bounds = track.venueBounds!; const radius = Math.hypot(1.25, 2.35);
    race.position = { x: (bounds.minX + bounds.maxX) / 2, y: bounds.floor, z: (bounds.minZ + bounds.maxZ) / 2 };
    if (direction === 'north') { race.position.z = bounds.minZ + radius + 0.1; race.heading = 0; }
    if (direction === 'south') { race.position.z = bounds.maxZ - radius - 0.1; race.heading = Math.PI; }
    if (direction === 'west') { race.position.x = bounds.minX + radius + 0.1; race.heading = Math.PI / 2; }
    if (direction === 'east') { race.position.x = bounds.maxX - radius - 0.1; race.heading = -Math.PI / 2; }
    race.travelHeading = race.heading; const heading = race.heading; race.speed = 60;
    for (let tick = 0; tick < 30; tick++) {
      race.update(1 / 60, idleControls());
      assert.ok(race.position.x >= bounds.minX + radius - 1e-8 && race.position.x <= bounds.maxX - radius + 1e-8);
      assert.ok(race.position.z >= bounds.minZ + radius - 1e-8 && race.position.z <= bounds.maxZ - radius + 1e-8);
      assert.equal(race.position.y, bounds.floor);
      assert.ok(Math.abs(race.heading - heading) < 1e-9);
    }
    assert.ok(race.speed < 1);
    race.recover(); assert.equal(race.lane, 0); assert.equal(race.penalty, 5);
  }
});

test('indoor buildings keep a bounded draw budget and dispose shared resources once', () => {
  for (const stage of venues) {
    const scene = new THREE.Group(); buildIndoorVenue(scene, new Track(stage));
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    let draws = 0; let triangles = 0; let disposed = 0; let lights = 0;
    scene.traverse(object => {
      if (object instanceof THREE.Light) lights++;
      if (!(object instanceof THREE.Mesh)) return;
      draws++; resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3
        * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    assert.ok(draws <= 25, `${stage.id}: too many scene batches`); assert.ok(triangles < 60000);
    assert.equal(lights, 0, 'fixtures share the renderer lighting instead of adding hundreds of lights');
    resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
    disposeObject(scene); assert.equal(disposed, resources.size);
  }
});

test('the production world builder uses indoor scenery and still installs start, finish and split signs', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  // Race signs only need a 2D canvas; this stub never creates a browser or GPU context.
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() { return { width: 0, height: 0, getContext() { return { fillRect() {}, fillText() {} }; } }; },
  } });
  try {
    for (const stage of venues) {
      const scene = new THREE.Group(); const scenery = buildWorld(scene, new Track(stage));
      assert.equal(scenery.treeCount, 0); assert.equal(scenery.crowns, undefined); assert.equal(scenery.rocks, undefined);
      assert.ok(scene.getObjectByName(`venue-${stage.id}`));
      let signs = 0;
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if ('map' in material && material.map instanceof THREE.CanvasTexture) signs++;
        }
      });
      assert.ok(signs >= 10, 'start, finish and the eight split boards remain present');
      disposeObject(scene);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  }
});
