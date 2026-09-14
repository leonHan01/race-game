import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../src/content/stages.ts';
import { TOURING_CIRCUITS } from '../src/content/touring-circuits.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { buildIndoorVenue } from '../src/render/venue.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { routeThumbnail } from '../src/ui/route-thumbnail.ts';
import { ribbon } from '../src/render/road.ts';

const venues = STAGES.filter(stage => stage.venue);
const circuits = STAGES.filter(stage => stage.closed);

test('circuit centre lines and both road edges close smoothly and wrap across the finish', () => {
  assert.equal(TOURING_CIRCUITS.length, 4);
  assert.ok(TOURING_CIRCUITS.every(stage => circuits.includes(stage) && !stage.venue && !stage.downhill));
  for (const stage of circuits) {
    const track = new Track(stage);
    for (const lane of [-track.roadWidth / 2, 0, track.roadWidth / 2]) {
      const start = track.position(0, lane); const finish = track.position(track.length, lane);
      assert.ok(Math.hypot(start.x - finish.x, start.z - finish.z) < 1e-8, `${stage.id}: open seam at lane ${lane}`);
      assert.ok(Math.abs(start.y - finish.y) < 1e-8, `${stage.id}: elevation step at finish`);
      for (const distance of [-20, -0.1, 0.1, 20]) {
        const a = track.position(distance, lane); const b = track.position(distance + track.length, lane);
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-8, `${stage.id}: sampling must wrap`);
      }
    }
    const before = track.sample(track.length - 0.1); const after = track.sample(0.1);
    assert.ok(before.tx * after.tx + before.tz * after.tz > 0.999, `${stage.id}: kink at finish`);
    for (let distance = 0.1; distance < track.length; distance += 4) {
      const p = track.position(distance); const projection = track.project(p.x, p.z);
      assert.ok(Math.abs(projection.distance - distance) < 0.001, `${stage.id}: ambiguous route at ${distance}`);
    }
  }
});

test('indoor road and painted edges form one ribbon with coincident end vertices', () => {
  for (const stage of venues) {
    const track = new Track(stage); const scene = new THREE.Group();
    const venue = buildIndoorVenue(scene, track);
    const ribbons = venue.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh && 'uv' in object.geometry.attributes
      && object.geometry.attributes.position.count > 24 && !(object instanceof THREE.InstancedMesh));
    assert.equal(ribbons.length, 3);
    for (const mesh of ribbons) {
      const position = mesh.geometry.getAttribute('position');
      assert.equal(position.count, (Math.ceil(track.length / 2) + 1) * 2, `${stage.id}: overlapping road extensions`);
      for (const side of [0, 1]) for (const axis of [0, 1, 2]) {
        assert.equal(position.getComponent(side, axis), position.getComponent(position.count - 2 + side, axis), `${stage.id}: mesh seam`);
      }
    }
    assert.match(routeThumbnail(track), /Z" fill="none"/);
    assert.match(routeThumbnail(track), /START \/ FINISH/);
    disposeObject(scene);
  }
});

test('outdoor circuit road ribbons and map previews close at the shared start and finish', () => {
  for (const stage of circuits.filter(stage => !stage.venue)) {
    const track = new Track(stage);
    const mesh = ribbon(track, -track.roadWidth / 2, track.roadWidth / 2, 0.04, new THREE.MeshBasicMaterial());
    const position = mesh.geometry.getAttribute('position');
    assert.equal(position.count, (Math.ceil(track.length / (track.hasJumps ? 2 : 5)) + 1) * 2);
    for (const side of [0, 1]) for (const axis of [0, 1, 2]) {
      assert.equal(position.getComponent(side, axis), position.getComponent(position.count - 2 + side, axis), `${stage.id}: open road ribbon`);
    }
    assert.match(routeThumbnail(track), /Z" fill="none"/);
    assert.match(routeThumbnail(track), /START \/ FINISH/);
    disposeObject(mesh);
  }
});

test('crossing the circuit start backwards keeps progress near zero and cannot finish', () => {
  for (const stage of circuits) {
    const track = new Track(stage); const race = new Race(track); race.phase = 'racing';
    race.placeOnTrack(0.1, 0, track.sample(0.1).heading + Math.PI); race.speed = 20;
    race.update(1 / 60, idleControls());
    assert.ok(race.distance < 0 && race.distance > -1, `${stage.id}: progress jumped to the end`);
    assert.equal(race.progress, 0); assert.equal(race.phase, 'racing'); assert.equal(race.splits.length, 0);
  }
});

test('one circuit lap requires ordered gates and finishes back at the start', () => {
  for (const stage of circuits) {
    const track = new Track(stage); const race = new Race(track); race.phase = 'racing';
    race.placeOnTrack(track.length - 0.1); race.speed = 20;
    race.update(1 / 60, idleControls());
    assert.equal(race.phase, 'racing'); assert.equal(race.splits.length, 0);
    assert.ok(race.distance > track.length, `${stage.id}: missed gates must not reset progress`);
    race.reset(); race.phase = 'racing';
    for (let gate = 1; gate <= SECTORS; gate++) {
      race.placeOnTrack(track.length * gate / SECTORS - 0.1); race.speed = 20;
      race.update(1 / 60, idleControls());
      assert.equal(race.splits.length, gate, `${stage.id}: gate ${gate}`);
    }
    assert.equal(race.phase, 'finished'); assert.equal(race.progress, 1);
    const start = track.position(0);
    assert.ok(Math.hypot(race.position.x - start.x, race.position.z - start.z) < 0.01);
  }
});
