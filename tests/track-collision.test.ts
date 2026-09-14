import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES, DOWNHILL_STAGES, getStage } from '../src/content/stages.ts';
import { VEHICLES, LONGBOARDS, getVehicle, vehicleClearance } from '../src/content/vehicles.ts';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { moveWithinTrack } from '../src/simulation/track-collision.ts';
import { buildTrackBarriers } from '../src/render/track-barriers.ts';
import { disposeObject } from '../src/render/dispose.ts';

const STEP = 1 / 60;
const throttle = { ...idleControls(), throttle: true };
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const assertContained = (race: Race) => {
  const road = race.track.project(race.position.x, race.position.z, race.distance);
  const offset = Math.hypot(race.position.x - road.x, race.position.z - road.z);
  assert.ok(offset + vehicleClearance(race.vehicle) <= race.track.boundaryEdge + 1e-7,
    `${race.stageId}/${race.vehicleId}: footprint crossed the course boundary`);
  assert.ok(Math.abs(road.lane - race.lane) < 1e-8);
  assert.ok(Math.abs(road.distance - race.distance) < 1e-8);
};

test('both course edges contain every vehicle at full boost speed on indoor, outdoor and downhill stages', () => {
  for (const stage of [...STAGES, ...DOWNHILL_STAGES]) {
    const track = new Track(stage);
    const vehicles = stage.downhill ? LONGBOARDS : VEHICLES;
    for (const vehicle of vehicles) for (const side of [-1, 1]) {
      const race = new Race(track, vehicle); race.phase = 'racing';
      const distance = 40; const limit = track.boundaryEdge - vehicleClearance(vehicle);
      race.placeOnTrack(distance, side * (limit - 0.05), track.sample(distance).heading - side * Math.PI / 2);
      const heading = race.heading; race.speed = vehicle.topSpeed / 3.6; race.nitro = 100;
      for (let i = 0; i < 30; i++) {
        race.update(STEP, { ...throttle, nitro: true });
        assertContained(race);
        assert.ok(Math.abs(angleDifference(race.heading, heading)) < 1e-8, 'collision must not steer the body');
      }
      assert.ok(race.speed < 12, 'driving into a barrier must lose speed, even under boost');
      assert.ok(race.integrity < 100 && race.integrity >= 0);
      assert.equal(race.penalty, 0, 'contact is not an automatic rescue');
    }
  }
});

test('glancing contact preserves progress and loses less speed than a head-on impact', () => {
  const track = new Track();
  const drive = (angle: number) => {
    const race = new Race(track); race.phase = 'racing';
    race.placeOnTrack(-200, track.boundaryEdge - vehicleClearance(race.vehicle) - 0.01, -angle);
    race.speed = 40; race.update(STEP, throttle); assertContained(race);
    assert.ok(Math.abs(race.lateralVelocity) < 1, 'blocked outward movement must not remain in lateral velocity');
    return race;
  };
  const scrape = drive(0.15); const headOn = drive(Math.PI / 2);
  assert.ok(scrape.distance > -199.4, 'a scrape must allow movement along the barrier');
  assert.ok(scrape.speed > headOn.speed + 2);
  assert.ok(scrape.integrity > headOn.integrity);
});

test('steering away from either barrier restores free movement without rescue', () => {
  for (const side of [-1, 1]) {
    const track = new Track(); const race = new Race(track); race.phase = 'racing';
    const limit = track.boundaryEdge - vehicleClearance(race.vehicle);
    race.placeOnTrack(-200, side * (limit - 0.01), -side * 0.3); race.speed = 25;
    race.update(STEP, throttle);
    for (let i = 0; i < 180 && side * race.lane > limit - 2; i++) {
      race.update(STEP, { ...throttle, steering: -side }); assertContained(race);
    }
    assert.ok(side * race.lane < limit - 2, 'countersteering should move the car clear of the wall');
    assert.ok(race.speed > 8); assert.equal(race.penalty, 0);
  }
});

test('a swept movement cannot cut through a hairpin to another road segment', () => {
  const track = new Track({ ...getStage('pine'), roadWidth: 12, points: [
    { x: 0, y: 0, z: 30 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -80 },
    { x: 60, y: 0, z: -80 }, { x: 60, y: 0, z: 0 }, { x: 60, y: 0, z: 30 },
  ] });
  const position = track.position(15); const clearance = vehicleClearance(getVehicle('falcon'));
  const across = track.project(position.x + 60, position.z);
  assert.ok(Math.abs(across.lane) < 0.01, 'the unchecked endpoint lies on the opposite road');
  const collision = moveWithinTrack(track, position, 60, 0, 1, clearance, 15);
  assert.equal(collision.blocked, true); assert.equal(collision.correctedStart, false);
  assert.ok(position.x < 10 && collision.road.distance < 30, 'must stay on the original side of the hairpin');
});

test('sharp bends contain an unsteered car while preserving its chosen heading', () => {
  for (const stage of [...STAGES, ...DOWNHILL_STAGES]) {
    const track = new Track(stage); const race = new Race(track, getVehicle(stage.downhill ? 'longboard' : 'nomad'));
    const bend = [...track.notes].sort((a, b) => Math.abs(track.curvature(b.distance)) - Math.abs(track.curvature(a.distance)))[0];
    race.phase = 'racing'; race.placeOnTrack(bend.distance - 15); race.speed = 45;
    const heading = race.heading;
    for (let i = 0; i < 180; i++) {
      race.update(STEP, throttle); assertContained(race);
      assert.ok(Math.abs(angleDifference(race.heading, heading)) < 1e-8);
    }
  }
});

test('course boundaries also contain airborne vehicles without snapping their height to the ground', () => {
  const track = new Track(getStage('meadow')); const race = new Race(track); race.phase = 'racing';
  race.placeOnTrack(100, track.boundaryEdge - vehicleClearance(race.vehicle) - 0.01, -Math.PI / 2);
  race.speed = 70; race.position.y += 8; race.vertical.height = race.position.y;
  race.vertical.clearance = 8; race.vertical.airborne = true; race.vertical.velocity = 0;
  race.update(STEP, throttle); assertContained(race);
  assert.equal(race.airborne, true); assert.ok(race.airHeight > 7.9);
  assert.ok(race.speed > 60 && race.speed < 65); assert.ok(race.integrity < 100);
});

test('correcting an out-of-bounds placement cannot award a checkpoint', () => {
  const track = new Track(); const race = new Race(track); race.phase = 'racing';
  race.placeOnTrack(race.nextCheckpointDistance - 0.1, 30); race.speed = 40;
  race.update(STEP, throttle); assertContained(race);
  assert.equal(race.splits.length, 0); assert.equal(race.phase, 'racing');
});

test('outdoor guardrails follow both collision edges and cost only two draw calls', () => {
  for (const stage of [...STAGES.filter(stage => !stage.venue), ...DOWNHILL_STAGES]) {
    const track = new Track(stage); const scene = new THREE.Group(); buildTrackBarriers(scene, track);
    scene.updateMatrixWorld(true);
    assert.equal(scene.children.length, 2);
    const rails = scene.getObjectByName('track-guardrails')!;
    const ray = new THREE.Raycaster();
    for (let d = 0; d < track.length; d += 73) for (const side of [-1, 1]) {
      const frame = track.sample(d);
      ray.set(new THREE.Vector3(frame.x, frame.y + 0.62, frame.z), new THREE.Vector3(side * frame.rx, 0, side * frame.rz));
      const hit = ray.intersectObject(rails)[0];
      assert.ok(hit && Math.abs(hit.distance - track.boundaryEdge) < 0.16, `${stage.id}: rail does not match collision at ${d}`);
    }
    disposeObject(scene);
  }
});
