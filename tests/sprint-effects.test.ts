import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES } from '../src/content/vehicles.ts';
import { ExhaustFlames } from '../src/render/exhaust-flames.ts';
import { SprintView } from '../src/render/sprint-view.ts';
import { CAR_EXHAUST_PORTS, buildVehicleBody, createVehicleMaterials } from '../src/render/vehicle-model.ts';
import { Motorcycle, motorcycleExhaustPort } from '../src/render/motorcycle.ts';
import { disposeObject } from '../src/render/dispose.ts';

// Inspect geometry and effect state in Node. No canvas, browser or GPU is started.
test('twin flame origins meet the bent exhaust outlets on every car body', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'car')) {
    const materials = createVehicleMaterials('#eeeeee', '#555555');
    const body = buildVehicleBody(vehicle, materials); body.updateMatrixWorld(true);
    const trim = body.getObjectByName('vehicle-trim')!;
    for (const port of CAR_EXHAUST_PORTS) {
      const ray = new THREE.Raycaster(new THREE.Vector3(...port).add(new THREE.Vector3(0, 0, 0.1)), new THREE.Vector3(0, 0, -1), 0, 0.15);
      const hit = ray.intersectObject(trim)[0];
      assert.ok(hit, `${vehicle.id} has a physical outlet under its flame`);
      assert.ok(hit.point.distanceTo(new THREE.Vector3(...port)) < 0.002);
    }
    disposeObject(body);
  }
});

test('motorcycle flames follow the actual silencer through lean, pitch, yaw and vehicle scale', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'motorcycle')) {
    const bike = new Motorcycle(vehicle); const exhaust = bike.exhaust!;
    bike.group.position.set(12, 3, -20); bike.group.rotation.set(0.15, 0.6, 0, 'YXZ');
    bike.update(70, 1, 0, false, false, 1 / 60); exhaust.update(true, 70, 0.1);
    bike.group.updateMatrixWorld(true);
    const jet = exhaust.group.children[0];
    const expected = new THREE.Vector3(...motorcycleExhaustPort(vehicle)).applyMatrix4(bike.suspension.matrixWorld);
    assert.ok(jet.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-9);
    const outletDirection = new THREE.Vector3(0, 0, 1).transformDirection(bike.suspension.matrixWorld);
    const flameDirection = new THREE.Vector3(0, 0, 1).transformDirection(jet.matrixWorld);
    assert.ok(flameDirection.distanceTo(outletDirection) < 1e-9);
    disposeObject(bike.group);
  }
});

test('flames pulse behind fixed ports, fade on release and share one geometry and material', () => {
  const flames = new ExhaustFlames(CAR_EXHAUST_PORTS);
  assert.equal(flames.group.visible, false);
  const meshes: THREE.Mesh[] = [];
  flames.group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const geometries = new Set(meshes.map(mesh => mesh.geometry));
  const materials = new Set(meshes.map(mesh => mesh.material as THREE.ShaderMaterial));
  assert.equal(meshes.length, 2); assert.equal(geometries.size, 1); assert.equal(materials.size, 1);
  const geometry = meshes[0].geometry;
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox!.min.z) < 1e-6 && geometry.boundingBox!.max.z > 1);
  for (const attribute of ['position', 'normal', 'uv']) assert.ok(Array.from(geometry.getAttribute(attribute).array).every(Number.isFinite));
  for (const material of materials) { assert.equal(material.depthWrite, false); assert.equal(material.blending, THREE.AdditiveBlending); }
  const lengths = new Set<number>();
  for (let i = 0; i < 90; i++) {
    flames.update(true, 85, 1 / 60); lengths.add(flames.group.children[0].scale.z);
    flames.group.children.forEach((jet, index) => assert.deepEqual(jet.position.toArray(), CAR_EXHAUST_PORTS[index]));
  }
  assert.ok(flames.group.visible && lengths.size > 80);
  const frozen = [...materials].map(material => material.uniforms.time.value);
  flames.update(true, 85, 0);
  assert.deepEqual([...materials].map(material => material.uniforms.time.value), frozen);
  flames.update(false, 85, 1 / 60); assert.equal(flames.group.visible, true, 'short flame tail on release');
  for (let i = 0; i < 60; i++) flames.update(false, 85, 1 / 60);
  assert.equal(flames.group.visible, false);
  flames.update(true, 85, 0.1); flames.reset(); assert.equal(flames.group.visible, false);
  let releasedGeometry = 0; let releasedMaterials = 0;
  geometry.addEventListener('dispose', () => releasedGeometry++);
  materials.forEach(material => material.addEventListener('dispose', () => releasedMaterials++));
  disposeObject(flames.group);
  assert.equal(releasedGeometry, 1); assert.equal(releasedMaterials, 1);
});

test('sprint camera easing agrees at different refresh rates and reduced motion disables distortion', () => {
  const levels = [30, 60, 144].map(hz => {
    const view = new SprintView();
    for (let i = 0; i < hz / 2; i++) view.update(true, true, 1 / hz);
    const attack = view.intensity;
    for (let i = 0; i < hz / 2; i++) view.update(false, true, 1 / hz);
    const release = view.intensity;
    view.update(true, true, 0.1, true);
    assert.equal(view.fovIncrease, 0); assert.equal(view.horizontalScale, 1);
    return [attack, release];
  });
  for (const level of levels) level.forEach((value, i) => assert.ok(Math.abs(value - levels[0][i]) < 1e-9));
});
