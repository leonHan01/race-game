import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RallyRenderer } from '../src/render/renderer.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { settings } from '../src/settings.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { STAGES, getStage } from '../src/content/stages.ts';

// Exercise the production scene/camera update with GPU submission and assets omitted.
// No browser, canvas, WebGL context, or game server is created.
function cameraHarness(track: Track): RallyRenderer {
  return Object.assign(Object.create(RallyRenderer.prototype), {
    track, contextAvailable: true,
    camera: new THREE.PerspectiveCamera(64, 1, 0.12, 6500),
    car: { group: new THREE.Group(), update() {}, setLivery() {} },
    rivals: { update() {} },
    rearLeft: new THREE.Vector3(), rearRight: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(), targetLook: new THREE.Vector3(),
    sky: new THREE.Object3D(), skidMarks: { update() {} }, updateDust() {},
    renderer: { render() {} },
  });
}

test('both cameras face the road ahead while the car can turn independently in the frame', () => {
  const track = new Track(); const distance = 720;
  const a = track.sample(distance - 10); const b = track.sample(distance + 24);
  const roadHeading = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  for (const camera of [0, 1]) {
    settings.camera = camera;
    const view = cameraHarness(track);
    const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(distance);
    for (const offset of [-0.4, 0, 0.4]) {
      race.heading = roadHeading + offset;
      view.render(race, idleControls(), 1 / 60);
      view.camera.updateMatrixWorld();
      const direction = view.camera.getWorldDirection(new THREE.Vector3());
      const heading = Math.atan2(-direction.x, -direction.z);
      assert.ok(Math.abs(heading - roadHeading) < 1e-9, 'steering must not rotate the camera away from the road');
      assert.ok(Math.abs(view.car.group.rotation.y - heading - offset) < 1e-9, 'car yaw remains visible relative to the road');
    }
  }
  settings.camera = 0;
});

test('camera remains at a fixed distance from the car as frame times change', () => {
  const track = new Track();
  for (const camera of [0, 1]) {
    settings.camera = camera;
    const view = cameraHarness(track);
    const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(-2000); race.speed = 250 / 3.6;
    const distances: number[] = [];
    for (let i = 0; i < 180; i++) {
      const dt = [1 / 60, 1 / 30, 1 / 120, 1 / 75][i % 4];
      race.update(dt, { ...idleControls(), throttle: true });
      view.render(race, idleControls(), dt);
      const behind = (view.camera.position.x - view.car.group.position.x) * Math.sin(race.heading)
        + (view.camera.position.z - view.car.group.position.z) * Math.cos(race.heading);
      if (i > 60) distances.push(behind);
    }
    const swing = Math.max(...distances) - Math.min(...distances);
    assert.ok(swing < 0.001, `camera ${camera}: relative distance jumps by ${swing.toFixed(3)} m`);
    assert.ok(Math.abs(distances[0] - (camera === 0 ? 9.5 : -1.55)) < 0.001);
  }
  settings.camera = 0;
});

test('crossing the gravel shoulder does not introduce a height step', () => {
  const track = new Track();
  for (const side of [-1, 1]) {
    const inside = track.position(200, side * (track.shoulderEdge - 0.001));
    const outside = track.position(200, side * (track.shoulderEdge + 0.001));
    const jump = Math.abs(track.surfaceHeight(inside.x, inside.z) - track.surfaceHeight(outside.x, outside.z));
    assert.ok(jump < 0.02, `2 mm of sideways movement changes height by ${jump.toFixed(3)} m`);
  }
});

test('the production renderer uses the shared interpolated pose for both car and cameras', () => {
  const track = new Track();
  const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(-2000); race.speed = 250 / 3.6;
  const timeline = new RaceTimeline(race);
  timeline.advance(1 / 40, { ...idleControls(), throttle: true, steering: 1 });
  assert.notEqual(timeline.pose.position.z, race.position.z);
  for (const camera of [0, 1]) {
    settings.camera = camera;
    const view = cameraHarness(track);
    view.render(race, idleControls(), 1 / 40, timeline.pose);
    assert.equal(view.car.group.position.z, timeline.pose.position.z);
    assert.equal(view.car.group.rotation.y, timeline.pose.heading + timeline.pose.driftAngle);
    view.camera.updateMatrixWorld();
    const direction = view.camera.getWorldDirection(new THREE.Vector3());
    const expectedPitch = camera === 0 ? -2.8 / Math.hypot(29.5, 2.8) : 0;
    assert.ok(Math.abs(direction.y - expectedPitch) < 1e-9, 'horizon pitch stays fixed');
  }
  settings.camera = 0;
});

test('pause freezes the displayed pose and resume does not jump back a physical tick', () => {
  const race = new Race(new Track()); race.phase = 'racing'; race.placeOnTrack(-2000); race.speed = 30;
  const timeline = new RaceTimeline(race);
  timeline.advance(0.025, { ...idleControls(), throttle: true });
  race.pause(); const frozen = JSON.stringify(timeline.pose);
  timeline.advance(10, idleControls());
  assert.equal(JSON.stringify(timeline.pose), frozen);
  const before = { ...timeline.pose.position };
  race.resume(); timeline.advance(1 / 144, idleControls());
  assert.ok(timeline.pose.position.z < before.z);
  assert.ok(Math.abs(timeline.pose.position.z - before.z) < 0.3);
});

test('rescue and restart discard the old interpolation path', () => {
  const race = new Race(new Track()); race.phase = 'racing'; race.speed = 40;
  const timeline = new RaceTimeline(race);
  timeline.advance(0.025, { ...idleControls(), throttle: true, steering: 1 });
  race.recover(); timeline.reset();
  assert.deepEqual(timeline.pose.position, race.position);
  timeline.advance(0.001, idleControls());
  assert.deepEqual(timeline.pose.position, race.position);
  race.start(); timeline.reset();
  assert.equal(timeline.pose.speed, 0);
  assert.deepEqual(timeline.pose.position, race.position);
});

test('heading interpolation crosses the angle seam without a full camera spin', () => {
  const race = new Race(new Track()); race.phase = 'racing';
  race.placeOnTrack(-2000, 0, Math.PI - 0.001); race.speed = 30;
  const timeline = new RaceTimeline(race);
  timeline.advance(0.025, { ...idleControls(), throttle: true, steering: -1 });
  assert.ok(Math.abs(timeline.pose.heading - Math.PI) < 0.01);
});

test('road camera turns smoothly through bends at all paint rates without steering the car', () => {
  const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  for (const stage of STAGES) {
    const track = new Track(stage);
    const bend = [...track.notes].sort((a, b) => Math.abs(track.curvature(b.distance)) - Math.abs(track.curvature(a.distance)))[0];
    const finalHeadings: number[] = [];
    for (const hz of [30, 60, 90, 144]) {
      const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(bend.distance - 25); race.speed = 35;
      const original = race.heading; const timeline = new RaceTimeline(race);
      const initialCamera = timeline.pose.roadHeading;
      for (let i = 0; i < hz * 2; i++) {
        const previous = timeline.pose.roadHeading;
        timeline.advance(1 / hz, { ...idleControls(), throttle: true });
        assert.ok(Math.abs(angleDifference(timeline.pose.roadHeading, previous)) <= 1.4 / hz + 1e-9);
        assert.ok(Math.abs(angleDifference(race.heading, original)) < 1e-9);
      }
      assert.ok(Math.abs(angleDifference(timeline.pose.roadHeading, initialCamera)) > 0.03, 'camera follows the bending road');
      finalHeadings.push(timeline.pose.roadHeading);
    }
    for (const heading of finalHeadings) assert.ok(Math.abs(angleDifference(heading, finalHeadings[0])) < 1e-8);
  }
});

test('crossing the finish freezes the road camera without snapping its heading', () => {
  // A short fixture ends just after a bend, while the camera is still easing out.
  const points = [[0, 22, 100], [0, 22, 40], [10, 22, 0], [35, 22, -10], [40, 22, -35]].map(([x, y, z]) => ({ x, y, z }));
  const track = new Track({ ...getStage('pine'), points }); const race = new Race(track); race.phase = 'racing';
  race.placeOnTrack(track.length - 8); race.speed = 30;
  race.splits = [1, 2, 3, 4].map(total => ({ time: 1, total, delta: 0 })); race.elapsed = 4;
  const timeline = new RaceTimeline(race);
  let before = timeline.pose.roadHeading;
  for (let i = 0; i < 60 && race.phase === 'racing'; i++) {
    before = timeline.pose.roadHeading; timeline.advance(1 / 60, idleControls());
  }
  assert.equal(race.phase, 'finished');
  assert.ok(Math.abs(timeline.pose.roadHeading - before) < 0.003);
  const frozen = JSON.stringify(timeline.pose); timeline.advance(1, idleControls());
  assert.equal(JSON.stringify(timeline.pose), frozen);
});
