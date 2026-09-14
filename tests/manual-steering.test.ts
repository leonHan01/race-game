import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { vehicleClearance } from '../src/content/vehicles.ts';

const track = new Track();
const STEP = 1 / 60;
const throttle = { ...idleControls(), throttle: true };
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('projecting a position onto the road preserves signed offsets and stage distance', () => {
  for (let distance = 20; distance < track.length - 20; distance += 37) {
    for (const lane of [-6, 0, 6]) {
      const point = track.position(distance, lane);
      const result = track.project(point.x, point.z);
      // At a polyline bend an offset point may be closer to the adjacent segment;
      // require the true closest foot and a local result, not an exact inverse normal.
      const end = track.distances.findIndex(d => d >= distance);
      const segmentLength = track.distances[end] - track.distances[end - 1];
      assert.ok(Math.abs(result.distance - distance) < (lane === 0 ? 1e-8 : segmentLength));
      assert.ok(Math.hypot(point.x - result.x, point.z - result.z) <= Math.abs(lane) + 1e-7);
      assert.ok(Math.abs(result.lane - lane) < 0.02);
    }
  }
});

test('without steering a car keeps a straight heading until the bend boundary blocks its path', () => {
  const bend = [...track.notes].sort((a, b) => Math.abs(track.curvature(b.distance)) - Math.abs(track.curvature(a.distance)))[0];
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const autoThrottle of [false, true]) {
      const race = new Race(track); race.phase = 'racing'; race.speed = 32;
      race.difficulty = difficulty; race.autoThrottle = autoThrottle;
      race.placeOnTrack(bend.distance - 30);
      const start = { ...race.position }; const heading = race.heading;
      const rightX = Math.cos(heading); const rightZ = -Math.sin(heading);
      let contacted = false;
      for (let i = 0; i < 120; i++) {
        race.update(STEP, { ...idleControls(), throttle: !autoThrottle });
        assert.ok(Math.abs(angleDifference(race.heading, heading)) < 1e-10);
        const sideways = (race.position.x - start.x) * rightX + (race.position.z - start.z) * rightZ;
        contacted ||= race.integrity < 100;
        if (!contacted) assert.ok(Math.abs(sideways) < 1e-8, `road must not bend the path before contact: ${sideways}`);
        assert.ok(Math.abs(race.lane) + vehicleClearance(race.vehicle) <= track.boundaryEdge + 1e-7);
      }
      assert.ok(contacted, 'continuing straight through a sharp bend should hit the barrier');
    }
  }
});

test('direction keys steer left and right; after steering settles the chosen world heading is preserved', () => {
  for (const steering of [-1, 1]) {
    const race = new Race(track); race.phase = 'racing'; race.speed = 15;
    const initialHeading = race.heading;
    for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, steering });
    assert.equal(Math.sign(angleDifference(race.heading, initialHeading)), -steering);
    assert.ok(Math.abs(angleDifference(race.heading, initialHeading)) > 0.2);
    const released = race.heading;
    for (let i = 0; i < 30; i++) race.update(STEP, throttle);
    assert.ok(Math.abs(angleDifference(race.heading, released)) < 0.07, 'release has only a short steering tail');
    const chosen = race.heading;
    for (let i = 0; i < 60; i++) race.update(STEP, throttle);
    assert.ok(Math.abs(angleDifference(race.heading, chosen)) < 1e-10);
  }
  const parked = new Race(track); parked.phase = 'racing';
  const heading = parked.heading;
  for (let i = 0; i < 60; i++) parked.update(STEP, { ...idleControls(), steering: 1 });
  assert.equal(parked.heading, heading);
});

test('steering builds progressively and reversing the key does not snap the yaw rate', () => {
  const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(-1000); race.speed = 30;
  const initial = race.heading;
  race.update(STEP, { ...throttle, steering: 1 });
  const first = Math.abs(angleDifference(race.heading, initial));
  for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, steering: 1 });
  const before = race.heading;
  race.update(STEP, { ...throttle, steering: 1 });
  const established = Math.abs(angleDifference(race.heading, before));
  assert.ok(first < established * 0.35, 'a new key press should not instantly apply full steering');
  const reversing = race.heading;
  race.update(STEP, { ...throttle, steering: -1 });
  assert.ok(angleDifference(race.heading, reversing) < 0, 'steering should pass smoothly through neutral');
  for (let i = 0; i < 20; i++) race.update(STEP, { ...throttle, steering: -1 });
  const reversed = race.heading;
  race.update(STEP, { ...throttle, steering: -1 });
  assert.ok(angleDifference(race.heading, reversed) > 0);
});

test('an outside placement returns inside the barrier with damage but without changing its heading', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 35;
  race.placeOnTrack(450, 18);
  const heading = race.heading;
  race.update(STEP, throttle);
  assert.ok(Math.abs(race.lane) + vehicleClearance(race.vehicle) <= track.boundaryEdge + 1e-7);
  assert.ok(race.speed < 35); assert.ok(race.integrity < 100);
  assert.ok(Math.abs(angleDifference(race.heading, heading)) < 1e-10);
  race.recover();
  assert.equal(race.lane, 0); assert.equal(race.penalty, 5);
  assert.ok(Math.abs(angleDifference(race.heading, track.sample(race.distance).heading)) < 1e-10);
});

test('driving the wrong way reduces stage progress rather than automatically turning the car around', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 18;
  race.placeOnTrack(600, 0, track.sample(600).heading + Math.PI);
  const heading = race.heading;
  for (let i = 0; i < 30; i++) race.update(STEP, throttle);
  assert.ok(race.distance < 595); assert.equal(race.wrongWay, true);
  assert.ok(Math.abs(angleDifference(race.heading, heading)) < 1e-10);
  assert.equal(race.splits.length, 0);
});

test('only a forward, on-road gate crossing awards a checkpoint', () => {
  const gate = track.length / SECTORS;
  const backwards = new Race(track); backwards.phase = 'racing'; backwards.speed = 20;
  backwards.placeOnTrack(gate + 0.1, 0, track.sample(gate).heading + Math.PI);
  backwards.update(STEP, throttle);
  assert.equal(backwards.splits.length, 0);
  const outside = new Race(track); outside.phase = 'racing'; outside.speed = 20;
  outside.placeOnTrack(gate - 0.1, 20, track.sample(gate).heading);
  outside.update(STEP, throttle);
  assert.equal(outside.splits.length, 0);
  const onRoad = new Race(track); onRoad.phase = 'racing'; onRoad.speed = 20;
  onRoad.placeOnTrack(gate - 0.1, 0, track.sample(gate).heading);
  onRoad.update(STEP, throttle);
  assert.equal(onRoad.splits.length, 1);
});

test('skipping gates cannot finish the stage and explicit rescue restores the missed gate approach', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 20;
  race.placeOnTrack(track.length - 0.1);
  race.update(STEP, throttle);
  assert.equal(race.phase, 'racing'); assert.equal(race.splits.length, 0);
  assert.equal(race.missedCheckpoint, true);
  race.recover();
  assert.ok(race.distance < track.length / SECTORS);
  assert.equal(race.missedCheckpoint, false); assert.equal(race.penalty, 5);
  assert.equal(race.splits.length, 0);
});
