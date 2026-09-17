import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RallyRenderer } from '../src/render/renderer.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { settings } from '../src/settings.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { STAGES, getStage } from '../src/content/stages.ts';
import { FreeCamera } from '../src/render/free-camera.ts';
import { SprintView } from '../src/render/sprint-view.ts';
import { ExhaustFlames } from '../src/render/exhaust-flames.ts';

// Exercise the production scene/camera update with GPU submission and assets omitted.
// No browser, canvas, WebGL context, or game server is created.
function cameraHarness(track: Track): RallyRenderer {
  return Object.assign(Object.create(RallyRenderer.prototype), {
    track, contextAvailable: true, spectatorOccluders: [], freeCamera: new FreeCamera(),
    camera: new THREE.PerspectiveCamera(64, 1, 0.12, 6500),
    sprintView: new SprintView(),
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

test('nitro widens and compresses both camera views smoothly without moving their anchors or horizon', () => {
  const track = new Track(); const race = new Race(track); race.phase = 'racing'; race.speed = 80;
  for (const camera of [0, 1]) {
    settings.camera = camera;
    const view = cameraHarness(track);
    race.boosting = false; view.render(race, idleControls(), 1 / 60);
    const position = view.camera.position.clone(); const rotation = view.camera.quaternion.clone();
    const baseFov = view.camera.fov;
    race.boosting = true; view.render(race, idleControls(), 1 / 60);
    assert.ok(view.camera.fov > baseFov && view.camera.fov < baseFov + 4, 'smooth attack');
    for (let i = 0; i < 60; i++) view.render(race, idleControls(), 1 / 60);
    assert.ok(view.camera.fov > baseFov + 17 && view.camera.fov <= baseFov + 18);
    assert.deepEqual(view.camera.position, position); assert.ok(view.camera.quaternion.equals(rotation));
    const uncompressed = new THREE.PerspectiveCamera(view.camera.fov, view.camera.aspect, view.camera.near, view.camera.far);
    assert.ok(view.camera.projectionMatrix.elements[0] < uncompressed.projectionMatrix.elements[0] * 0.95);
    const identity = view.camera.projectionMatrix.clone().multiply(view.camera.projectionMatrixInverse);
    identity.elements.forEach((value, i) => assert.ok(Math.abs(value - (i % 5 === 0 ? 1 : 0)) < 1e-9));
    race.boosting = false; view.render(race, idleControls(), 1 / 60);
    assert.ok(view.camera.fov > baseFov + 12, 'smooth release');
    for (let i = 0; i < 120; i++) view.render(race, idleControls(), 1 / 60);
    assert.equal(view.camera.fov, baseFov);
  }
  settings.camera = 0;
});

test('pause, finish, menu, reduced motion and airborne poses clear or suppress sprint presentation', () => {
  const race = new Race(new Track()); const view = cameraHarness(race.track);
  const exhaust = new ExhaustFlames([[0, 0.5, 2.2]]);
  Object.assign(view.car, { exhaust });
  for (const phase of ['paused', 'finished', 'menu', 'countdown'] as const) {
    race.phase = 'racing'; race.boosting = true; view.render(race, idleControls(), 0.1);
    assert.ok(exhaust.group.visible && view.camera.fov > 64);
    race.phase = phase; view.render(race, idleControls(), 0.1);
    assert.equal(exhaust.group.visible, false); assert.equal(view.camera.fov, phase === 'menu' ? 44 : 64);
  }
  race.phase = 'racing'; race.boosting = true;
  Object.assign(view, { motionPreference: { matches: true } });
  view.render(race, idleControls(), 0.1); assert.equal(view.camera.fov, 64);
  const timeline = new RaceTimeline(race); timeline.pose.airborne = true;
  view.render(race, idleControls(), 0.1, timeline.pose); assert.equal(exhaust.group.visible, false);
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

test('indoor cameras remain inside outer walls without rotating away from the road', () => {
  for (const stage of STAGES.filter(stage => stage.venue)) for (const camera of [0, 1]) {
    const track = new Track(stage); const race = new Race(track); race.phase = 'racing';
    const view = cameraHarness(track); const bounds = track.venueBounds!;
    race.position.z = bounds.maxZ - 3;
    settings.camera = camera;
    const timeline = new RaceTimeline(race);
    view.render(race, idleControls(), 1 / 60, timeline.pose); view.camera.updateMatrixWorld();
    assert.ok(view.camera.position.x >= bounds.minX + 0.39 && view.camera.position.x <= bounds.maxX - 0.39);
    assert.ok(view.camera.position.z >= bounds.minZ + 0.39 && view.camera.position.z <= bounds.maxZ - 0.39);
    const direction = view.camera.getWorldDirection(new THREE.Vector3());
    const heading = Math.atan2(-direction.x, -direction.z);
    assert.ok(Math.abs(heading - timeline.pose.roadHeading) < 1e-9);
  }
  settings.camera = 0;
});

test('jump cameras keep the horizon fixed and soften landing at all paint rates', () => {
  for (const stage of STAGES.filter(stage => stage.jumps)) {
    const endings: number[][] = [];
    for (const hz of [30, 60, 144]) {
      const race = new Race(new Track(stage)); race.phase = 'racing';
      const crest = stage.jumps![0]; race.placeOnTrack(crest.distance - crest.approach - 8); race.speed = 45;
      const timeline = new RaceTimeline(race); const view = cameraHarness(race.track);
      let flight = false; let landed = false; let landingBuffer = 0;
      for (let i = 0; i < 6 * hz; i++) {
        const wasAirborne = race.airborne;
        timeline.advance(1 / hz, { ...idleControls(), throttle: true });
        flight ||= race.airborne;
        if (wasAirborne && !race.airborne && !landed) { landed = true; landingBuffer = timeline.pose.cameraHeight - timeline.pose.position.y; }
        for (const camera of [0, 1]) {
          settings.camera = camera; view.render(race, idleControls(), 1 / hz, timeline.pose); view.camera.updateMatrixWorld();
          const direction = view.camera.getWorldDirection(new THREE.Vector3());
          const expected = camera === 0 ? -2.8 / Math.hypot(29.5, 2.8) : 0;
          assert.ok(Math.abs(direction.y - expected) < 1e-9, 'ramp pitch and landing must not rotate the horizon');
          assert.ok(view.camera.position.y >= race.track.surfaceHeight(view.camera.position.x, view.camera.position.z) + 0.79);
          assert.equal(view.car.group.rotation.x, timeline.pose.pitch);
        }
      }
      assert.ok(flight && landed);
      assert.ok(landingBuffer > 0.5, 'camera settles down after the car lands instead of inheriting the impact');
      endings.push([timeline.pose.position.y, timeline.pose.pitch, timeline.pose.cameraHeight]);
    }
    for (const values of endings) values.forEach((value, i) => assert.ok(Math.abs(value - endings[0][i]) < 1e-8));
  }
  settings.camera = 0;
});

test('the renderer disconnects tyre marks during flight and reconnects only on contact', () => {
  const race = new Race(new Track(getStage('meadow'))); race.phase = 'racing';
  const view = cameraHarness(race.track); const intensities: number[] = [];
  Object.assign(view, { skidMarks: { update(_left: unknown, _right: unknown, intensity: number) { intensities.push(intensity); } } });
  race.speed = 30; race.handbrake = true; race.driftAngle = 0.7;
  const timeline = new RaceTimeline(race);
  view.render(race, idleControls(), 0, timeline.pose);
  timeline.pose.airborne = true; timeline.pose.airHeight = 4; timeline.pose.position.y += 4;
  view.render(race, idleControls(), 0, timeline.pose);
  timeline.pose.airborne = false; timeline.pose.airHeight = 0; timeline.pose.position.y -= 4;
  view.render(race, idleControls(), 0, timeline.pose);
  assert.ok(intensities[0] > 0); assert.equal(intensities[1], 0); assert.ok(intensities[2] > 0);
});


test('aerial spectator camera follows the selected AI independently of the parked player', () => {
  const track = new Track(); const race = new Race(track); race.start(); race.phase = 'racing';
  race.spectating = true; race.spectatorTarget = 2;
  const car = race.opponents.cars[2]; Object.assign(car.position, track.position(700, 0));
  const view = cameraHarness(track); view.render(race, idleControls(), 1 / 60);
  assert.equal(view.car.group.visible, false);
  assert.equal(view.camera.position.y, car.position.y + 75);
  view.camera.updateMatrixWorld();
  const direction = view.camera.getWorldDirection(new THREE.Vector3());
  const expected = new THREE.Vector3(car.position.x, car.position.y, car.position.z).sub(view.camera.position).normalize();
  assert.ok(direction.distanceTo(expected) < 1e-8);
  race.spectating = false; view.render(race, idleControls(), 1 / 60);
  assert.equal(view.car.group.visible, true);
});

test('free spectator camera stays independent of racers, then returns to the selected car', () => {
  const track = new Track(); const race = new Race(track); race.start(); race.phase = 'racing';
  race.spectating = true; race.spectatorTarget = 0;
  const view = cameraHarness(track); view.render(race, idleControls(), 1 / 60);
  view.freeCamera.enter(view.camera); const fixedPosition = view.camera.position.clone();
  Object.assign(race.opponents.cars[0].position, track.position(1000, 0));
  view.render(race, idleControls(), 1 / 60);
  assert.deepEqual(view.camera.position, fixedPosition);
  race.phase = 'finished'; view.freeCamera.position.y += 10; view.render(race, idleControls(), 1 / 60);
  assert.equal(view.camera.position.y, fixedPosition.y + 10);
  view.freeCamera.reset(); view.render(race, idleControls(), 1 / 60);
  assert.equal(view.camera.position.x, race.opponents.cars[0].position.x + 20);
});
