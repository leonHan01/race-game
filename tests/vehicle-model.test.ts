import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES } from '../src/content/vehicles.ts';
import { buildVehicleBody, buildWheelGeometry, createVehicleMaterials } from '../src/render/vehicle-model.ts';
import { createVehicleEnvironment } from '../src/render/vehicle-environment.ts';
import { disposeObject } from '../src/render/dispose.ts';

// Pure geometry/material checks: no browser, game loop or WebGL context.
test('all vehicle silhouettes leave open wheel wells and face their glazing outward', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'car')) for (const detail of ['player', 'rival'] as const) {
    const materials = createVehicleMaterials('#dedbd0', '#d77c35', detail);
    const body = buildVehicleBody(vehicle, materials, detail); body.updateMatrixWorld(true);
    const paint = body.getObjectByName('vehicle-paint')!;
    const glass = body.getObjectByName('vehicle-glass')!;
    for (const side of [-1, 1]) {
      for (const z of [-1.3, 1.29]) for (const offset of [-0.25, 0, 0.25]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * 1.5, 0.77, z + offset), new THREE.Vector3(-side, 0, 0), 0, 0.7);
        assert.equal(ray.intersectObject(paint).length, 0, `${vehicle.id}/${detail}: blocked wheel well`);
      }
      const window = new THREE.Raycaster(new THREE.Vector3(side * 1.5, 1.4, 0), new THREE.Vector3(-side, 0, 0), 0, 1);
      assert.ok(window.intersectObject(glass).length > 0, `${vehicle.id}/${detail}: inward-facing side glass`);
      const door = new THREE.Raycaster(new THREE.Vector3(side * 1.5, 0.8, 0), new THREE.Vector3(-side, 0, 0), 0, 1);
      assert.ok(door.intersectObject(paint).length > 0, `${vehicle.id}/${detail}: missing door skin`);
    }
    const roof = new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0));
    assert.ok(roof.intersectObject(paint)[0].point.y > 1.58);
    disposeObject(body); Object.values(materials).forEach(material => material.dispose());
  }
});

test('rounded models keep bounded geometry, vehicle clearance and the original tyre contact radius', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'car')) for (const detail of ['player', 'rival'] as const) {
    const materials = createVehicleMaterials('#dedbd0', '#d77c35', detail);
    const body = buildVehicleBody(vehicle, materials, detail);
    const wheels = buildWheelGeometry(detail);
    const geometries = [...body.children.map(child => (child as THREE.Mesh).geometry), wheels.tyre, wheels.rim];
    let triangles = 0;
    for (const geometry of geometries) {
      for (const attribute of ['position', 'normal', 'uv']) assert.ok(Array.from(geometry.getAttribute(attribute).array).every(Number.isFinite));
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 * (geometry === wheels.tyre || geometry === wheels.rim ? 4 : 1);
    }
    assert.ok(triangles < (detail === 'player' ? 18000 : 4800), `${vehicle.id}/${detail}: triangle budget`);
    assert.ok(body.children.length <= (detail === 'player' ? 8 : 5));
    const bounds = new THREE.Box3().setFromObject(body);
    assert.ok(bounds.min.x > -1.3 && bounds.max.x < 1.3, 'body must fit existing race spacing');
    assert.ok(bounds.min.z > -2.4 && bounds.max.z < 2.4);
    wheels.tyre.computeBoundingBox();
    assert.ok(Math.abs(wheels.tyre.boundingBox!.min.y + 0.46) < 1e-6);
    assert.ok(Math.abs(wheels.tyre.boundingBox!.max.y - 0.46) < 1e-6);
    disposeObject(body); wheels.tyre.dispose(); wheels.rim.dispose(); Object.values(materials).forEach(material => material.dispose());
  }
});

test('vehicle swaps own their materials and reflection sources can be released independently', () => {
  const first = createVehicleMaterials('#dedbd0', '#d77c35');
  const second = createVehicleMaterials('#ae4133', '#efebe0');
  const body = buildVehicleBody(VEHICLES[1], first);
  let disposed = 0; let replacementDisposed = false;
  first.paint.addEventListener('dispose', () => { disposed++; });
  second.paint.addEventListener('dispose', () => { replacementDisposed = true; });
  disposeObject(body);
  assert.equal(disposed, 1); assert.equal(replacementDisposed, false);
  const outdoor = createVehicleEnvironment('#8bafc4', '#e1e3d9', '#536348');
  const indoor = createVehicleEnvironment('#273040', '#818690', '#3c4147', true);
  assert.equal(outdoor.image.data.length, 256 * 128 * 4);
  assert.notDeepEqual(outdoor.image.data, indoor.image.data);
  assert.equal(outdoor.mapping, THREE.EquirectangularReflectionMapping);
  assert.equal(outdoor.colorSpace, THREE.SRGBColorSpace);
  outdoor.dispose(); indoor.dispose(); Object.values(second).forEach(material => material.dispose());
});
