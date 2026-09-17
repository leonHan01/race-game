import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FreeCamera, idleCameraControls } from '../src/render/free-camera.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';

const track = new Track({ ...getStage('pine'), points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -200 }] });
function setup() {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 80, 10); camera.lookAt(0, 0, -20);
  const flight = new FreeCamera(); flight.enter(camera); return { camera, flight };
}

test('entering free flight preserves the camera pose; forward motion stays horizontal', () => {
  const { camera, flight } = setup(); const direction = camera.getWorldDirection(new THREE.Vector3());
  flight.apply(camera);
  assert.ok(direction.distanceTo(camera.getWorldDirection(new THREE.Vector3())) < 1e-9);
  const y = flight.position.y;
  flight.update(0.1, { ...idleCameraControls(), forward: 1 }, track);
  assert.equal(flight.position.y, y); assert.equal(flight.position.z, 5);
  flight.update(0.1, { ...idleCameraControls(), forward: -1 }, track);
  assert.equal(flight.position.z, 10);
});

test('elevation, strafe, speed modifier and wheel have separate, bounded effects', () => {
  const { flight } = setup();
  flight.update(0.1, { ...idleCameraControls(), up: 1 }, track); assert.equal(flight.position.y, 85);
  flight.update(0.1, { ...idleCameraControls(), right: 1, fast: true }, track); assert.equal(flight.position.x, 15);
  flight.update(0.1, { ...idleCameraControls(), lift: -10000 }, track); assert.equal(flight.height(track), 3);
  flight.update(0.1, { ...idleCameraControls(), lift: 10000 }, track); assert.equal(flight.height(track), 500);
  const distance = flight.position.clone();
  flight.update(0.1, { ...idleCameraControls(), forward: 1, right: 1 }, track);
  assert.ok(Math.abs(Math.hypot(flight.position.x - distance.x, flight.position.z - distance.z) - 5) < 1e-9);
});

test('rotation changes forward direction, pitch cannot flip, and reset releases the camera', () => {
  const { flight } = setup();
  flight.update(0.1, { ...idleCameraControls(), lookX: Math.PI / 2 / 0.004, lookY: -10000 }, track);
  assert.ok(flight.direction.y < 1); assert.ok(flight.direction.y > 0.99);
  const start = flight.position.clone(); flight.update(0.1, { ...idleCameraControls(), forward: 1 }, track);
  assert.ok(Math.abs(flight.position.x - start.x - 5) < 1e-9);
  assert.equal(flight.position.y, start.y);
  flight.reset(); const stopped = flight.position.clone();
  assert.equal(flight.update(0.1, { ...idleCameraControls(), forward: 1 }, track), false);
  assert.deepEqual(flight.position, stopped);
});

test('free flight movement is independent of display frame rate', () => {
  const positions = [30, 60, 120].map(fps => {
    const { flight } = setup();
    for (let i = 0; i < fps; i++) flight.update(1 / fps, { ...idleCameraControls(), forward: 1, up: 1 }, track);
    return flight.position;
  });
  assert.ok(positions[0].distanceTo(positions[1]) < 1e-8);
  assert.ok(positions[1].distanceTo(positions[2]) < 1e-8);
});
