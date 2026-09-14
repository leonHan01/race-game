import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLES, getVehicle } from '../src/content/vehicles.ts';
import { buildVehicleBody, buildWheelGeometry, buildDoorDecalGeometry, createVehicleMaterials } from '../src/render/vehicle-model.ts';
import { createVehicleEnvironment } from '../src/render/vehicle-environment.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { vehicleThumbnail } from '../src/ui/vehicle-thumbnail.ts';
import { mergeVehicleGeometry, tintGeometry } from '../src/render/vehicle-geometry.ts';

// Pure geometry/material checks: no browser, game loop or WebGL context.
test('indexed material batches preserve triangle attributes, UV seams, tint and resource ownership', () => {
  const box = new THREE.BoxGeometry(), flatBox = box.toNonIndexed(); box.dispose();
  const parts = [new THREE.SphereGeometry(0.4, 12, 8), tintGeometry(flatBox, '#789ab0')];
  const attributes = ['position', 'normal', 'uv', 'color'];
  const expand = (geometry: THREE.BufferGeometry, name: string) => {
    const attribute = geometry.getAttribute(name), size = name === 'uv' ? 2 : 3;
    return Array.from({ length: geometry.index?.count ?? geometry.getAttribute('position').count }, (_, i) => {
      const vertex = geometry.index?.getX(i) ?? i;
      return Array.from({ length: size }, (_, c) => attribute ? attribute.array[vertex * size + c] : 1);
    }).flat();
  };
  const expected = attributes.map(name => parts.flatMap(part => expand(part, name)));
  let disposed = 0; parts.forEach(part => part.addEventListener('dispose', () => disposed++));
  const merged = mergeVehicleGeometry(parts);
  assert.equal(disposed, 2);
  assert.ok(merged.index && merged.getAttribute('position').count < merged.index.count / 2, 'shared vertices remain indexed');
  attributes.forEach((name, i) => assert.deepEqual(expand(merged, name), expected[i], `${name}: batching preserves every rendered triangle`));
  merged.dispose();
});

test('curved wings have visible upper and lower skins and supercar intake panels stay outside the body', () => {
  for (const detail of ['player', 'rival'] as const) {
    for (const id of ['comet', 'vortex']) {
      const vehicle = getVehicle(id), materials = createVehicleMaterials('#dedbd0', '#d77c35', detail);
      const body = buildVehicleBody(vehicle, materials, detail); body.updateMatrixWorld(true);
      const trim = body.getObjectByName('vehicle-trim')!;
      const wingY = id === 'comet' ? 1.52 : 1.76;
      const above = new THREE.Raycaster(new THREE.Vector3(0, wingY + 0.2, 1.85), new THREE.Vector3(0, -1, 0), 0, 0.4).intersectObject(trim)[0];
      const below = new THREE.Raycaster(new THREE.Vector3(0, wingY - 0.2, 1.85), new THREE.Vector3(0, 1, 0), 0, 0.4).intersectObject(trim)[0];
      assert.ok(above && below && above.point.y > below.point.y + 0.03, `${id}/${detail}: closed airfoil skins`);
      if (id === 'vortex') for (const side of [-1, 1]) for (const z of [0.4, 0.55, 0.7]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * 1.5, 1.035, z), new THREE.Vector3(-side, 0, 0), 0, 0.7);
        const intake = ray.intersectObject(trim)[0], shell = ray.intersectObject(body.getObjectByName('vehicle-paint')!)[0];
        assert.ok(intake && shell && intake.distance < shell.distance, `${detail}/${side}/${z}: intake buried in the side panel`);
        assert.ok(shell.distance - intake.distance < 0.035, 'intake follows the recessed body instead of floating');
      }
      disposeObject(body); Object.values(materials).forEach(material => material.dispose());
    }
  }
});

test('wheel spoke bevels face out on both sides of the wheel', () => {
  const wheel = buildWheelGeometry('player', 'muscle');
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(wheel.rim, material);
  mesh.updateMatrixWorld(true);
  for (const side of [-1, 1]) for (const edge of [-1, 1]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(side * 0.138, 0.18, edge * 0.08), new THREE.Vector3(0, 0, -edge), 0, 0.15);
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(hit && hit.point.z * edge > 0.015, 'visible bevel must be the near side, not the back of the opposite edge');
  }
  wheel.tyre.dispose(); wheel.rim.dispose(); material.dispose();
});

test('new cars keep distinct hood, cabin and roof silhouettes in player and opponent models', () => {
  for (const detail of ['player', 'rival'] as const) {
    const heights = new Map<string, number>();
    for (const id of ['thunder', 'vortex', 'summit']) {
      const vehicle = getVehicle(id), materials = createVehicleMaterials('#dedbd0', '#d77c35', detail);
      const body = buildVehicleBody(vehicle, materials, detail); body.updateMatrixWorld(true);
      const topAt = (z: number) => new THREE.Raycaster(new THREE.Vector3(0, 3, z), new THREE.Vector3(0, -1, 0)).intersectObject(body)[0].point.y;
      heights.set(id, topAt(0) * vehicle.scale[1]);
      if (id === 'thunder') assert.ok(topAt(-1.3) > 1.35, 'raised hood scoop is visible');
      if (id === 'summit') assert.ok(topAt(1.1) > 1.9, 'SUV has a full-height rear cabin');
      if (id === 'vortex') assert.ok(topAt(1.1) < 1.3, 'mid-engine coupe has a short cabin and low rear deck');
      disposeObject(body); Object.values(materials).forEach(material => material.dispose());
    }
    assert.ok(heights.get('thunder')! > heights.get('vortex')! + 0.25);
    assert.ok(heights.get('summit')! > heights.get('thunder')! + 0.4);
  }
  const previews = ['thunder', 'vortex', 'summit', 'comet', 'nomad'].map(id => {
    const svg = vehicleThumbnail(getVehicle(id));
    assert.ok(!/NaN|undefined/.test(svg));
    return svg.replaceAll(id, 'vehicle');
  });
  assert.equal(new Set(previews).size, previews.length, 'garage art distinguishes each body beyond its SVG ID');
});

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
    const wheels = buildWheelGeometry(detail, vehicle.body);
    const geometries = [...body.children.map(child => (child as THREE.Mesh).geometry), wheels.tyre, wheels.rim];
    for (const mesh of body.children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]) {
      if (mesh.material.vertexColors) assert.equal(mesh.geometry.getAttribute('color')?.count, mesh.geometry.getAttribute('position').count, 'alloy batch supplies a color for every vertex');
    }
    assert.equal(wheels.rim.getAttribute('color')?.count, wheels.rim.getAttribute('position').count);
    let triangles = 0, bytes = 0;
    for (const geometry of geometries) {
      assert.ok(geometry.index, `${vehicle.id}/${detail}: retain indexed geometry`);
      bytes += geometry.index!.array.byteLength + Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
      for (const attribute of ['position', 'normal', 'uv']) assert.ok(Array.from(geometry.getAttribute(attribute).array).every(Number.isFinite));
      if (geometry.hasAttribute('color')) assert.ok(Array.from(geometry.getAttribute('color').array).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 * (geometry === wheels.tyre || geometry === wheels.rim ? 4 : 1);
    }
    assert.ok(triangles < (detail === 'player' ? 18000 : 4800), `${vehicle.id}/${detail}: triangle budget`);
    assert.ok(bytes < (detail === 'player' ? 600000 : 180000), `${vehicle.id}/${detail}: shared geometry buffer budget`);
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

test('grilles and LED signatures stay ahead of the curved bumper on both sides', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'car')) for (const detail of ['player', 'rival'] as const) {
    const materials = createVehicleMaterials('#dedbd0', '#d77c35', detail);
    const body = buildVehicleBody(vehicle, materials, detail); body.updateMatrixWorld(true);
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.63, -3), new THREE.Vector3(0, 0, 1));
      const trim = ray.intersectObject(body.getObjectByName('vehicle-trim')!)[0];
      const paint = ray.intersectObject(body.getObjectByName('vehicle-paint')!)[0];
      assert.ok(trim && paint && trim.distance < paint.distance, `${vehicle.id}/${detail}: grille buried at x=${x}`);
    }
    for (const side of [-1, 1]) {
      const y = vehicle.body === 'muscle' ? 0.93 : ['truck', 'coupe', 'supercar', 'suv'].includes(vehicle.body) ? 0.99 : 0.965;
      const ray = new THREE.Raycaster(new THREE.Vector3(side * 0.74, y, -3), new THREE.Vector3(0, 0, 1));
      assert.equal(ray.intersectObject(body)[0]?.object.name, 'vehicle-light', `${vehicle.id}/${detail}: LED hidden by its housing`);
    }
    disposeObject(body); Object.values(materials).forEach(material => material.dispose());
  }
});

test('race number decals follow the door skin and read in the same direction on both sides', () => {
  for (const vehicle of VEHICLES.filter(vehicle => vehicle.mode === 'car')) {
    const materials = createVehicleMaterials('#dedbd0', '#d77c35');
    const body = buildVehicleBody(vehicle, materials); body.updateMatrixWorld(true);
    const paint = body.getObjectByName('vehicle-paint')!;
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(buildDoorDecalGeometry(vehicle, side), materials.paint); decal.updateMatrixWorld(true);
      for (const y of [0.76, 0.87, 0.98]) for (const z of [-0.19, 0, 0.16]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(side * 2, y, z), new THREE.Vector3(-side, 0, 0));
        const label = ray.intersectObject(decal)[0], panel = ray.intersectObject(paint)[0];
        assert.ok(label && panel && label.distance < panel.distance && panel.distance - label.distance < 0.014, `${vehicle.id}: decal sits just outside the door`);
      }
      const positions = decal.geometry.getAttribute('position');
      const uv = decal.geometry.getAttribute('uv');
      const left = new THREE.Vector3().fromBufferAttribute(positions, 0), right = new THREE.Vector3().fromBufferAttribute(positions, 8);
      assert.equal(uv.getX(0), 0); assert.equal(uv.getX(8), 1);
      assert.ok(right.sub(left).dot(new THREE.Vector3(0, 0, -side)) > 0, 'UV right points right when viewed from outside');
      decal.geometry.dispose();
    }
    disposeObject(body); Object.values(materials).forEach(material => material.dispose());
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
