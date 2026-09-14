import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getVehicle, VEHICLES, vehicleClearance } from '../src/content/vehicles.ts';
import { STAGES } from '../src/content/stages.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { Motorcycle, motorcycleLean } from '../src/render/motorcycle.ts';
import { createPlayerVehicle } from '../src/render/car.ts';
import { RivalCars } from '../src/render/rivals.ts';
import { SkidMarks } from '../src/render/skid-marks.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { capturePose } from '../src/presentation.ts';
import { vehicleModePicker } from '../src/ui/ui.ts';
import { vehicleThumbnail } from '../src/ui/vehicle-thumbnail.ts';

const bikes = VEHICLES.filter(vehicle => vehicle.mode === 'motorcycle');
const step = 1 / 60;

// CPU-only state and geometry checks: no game server, browser or WebGL context.
test('motorcycle factory builds two road-contact wheels, a rider and bounded shared geometry', () => {
  assert.equal(bikes.length, 2);
  for (const vehicle of bikes) for (const detail of ['player', 'rival'] as const) {
    const model = detail === 'player' ? createPlayerVehicle(vehicle) : new Motorcycle(vehicle, detail);
    assert.ok(model instanceof Motorcycle);
    assert.equal(model.wheels.length, 2);
    const size = new THREE.Box3().setFromObject(model.suspension);
    assert.ok(size.max.y > 1.8, 'helmeted rider above the tank');
    assert.ok(size.max.x - size.min.x < 1.2, 'handlebars fit a narrow motorcycle footprint');
    assert.ok(size.max.z - size.min.z < 3.1);
    assert.ok(size.min.y > -0.015 && size.min.y < 0.015, 'tyres touch the road');
    let triangles = 0; let meshes = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++; geometries.add(object.geometry);
      const positions = object.geometry.getAttribute('position');
      triangles += (object.geometry.index?.count ?? positions.count) / 3;
      assert.ok(Array.from(positions.array).every(Number.isFinite));
      assert.ok(Array.from(object.geometry.getAttribute('normal').array).every(Number.isFinite));
      if (object.material instanceof THREE.MeshStandardMaterial && object.material.vertexColors) {
        const colors = object.geometry.getAttribute('color');
        assert.equal(colors?.count, positions.count, 'tinted metal batches supply a color for every vertex');
        assert.ok(Array.from(colors.array).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      }
    });
    assert.ok(meshes <= 15, `draw budget: ${meshes}`);
    assert.ok(triangles < (detail === 'player' ? 12000 : 5000), `${vehicle.id}/${detail}: ${triangles} triangles`);
    let released = 0;
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => released++));
    disposeObject(model.group);
    assert.equal(released, geometries.size, 'shared front/rear wheel resources released exactly once');
  }
});

test('motorcycles lean into both turns, stand upright at rest and lock only the rear wheel', () => {
  const model = new Motorcycle(getVehicle('apex'));
  model.update(30, 1, 0, false, false, step);
  assert.ok(model.suspension.rotation.z < -0.3, 'right turn leans rider to the right');
  const rear = model.wheels[1].rotation.x; const front = model.wheels[0].rotation.x;
  model.update(30, -1, -0.2, false, true, step);
  assert.ok(model.suspension.rotation.z > 0.3, 'countersteering can lean to the left');
  assert.equal(model.wheels[1].rotation.x, rear);
  assert.ok(model.wheels[0].rotation.x < front);
  model.update(30, -1, -0.2, false, true, 0);
  assert.equal(model.wheels[1].rotation.x, rear, 'paused wheels remain frozen');
  model.update(0, 1, 0.4, false, false, 0);
  assert.equal(model.suspension.rotation.z, 0);
  assert.equal(motorcycleLean(70, 1), -motorcycleLean(70, -1));
  assert.ok(Math.abs(motorcycleLean(70, 1, -1)) <= 0.68);
  model.setLivery(2);
  assert.equal((model.suspension.getObjectByName('motorcycle-paint') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHexString(), 'ae4133');
  disposeObject(model.group);
});

test('motorcycle headlamps remain visible in front of their sculpted housings', () => {
  for (const vehicle of bikes) for (const detail of ['player', 'rival'] as const) {
    const bike = new Motorcycle(vehicle, detail); bike.suspension.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const enduro = vehicle.id === 'trail';
      const ray = new THREE.Raycaster(new THREE.Vector3(enduro ? side * 0.04 : side * 0.205, enduro ? 1.22 : 1.233, -2), new THREE.Vector3(0, 0, 1));
      assert.equal(ray.intersectObject(bike.suspension)[0]?.object.name, 'motorcycle-light', `${vehicle.id}/${detail}: headlight obscured`);
    }
    disposeObject(bike.group);
  }
});

test('motorcycle races use matching AI and render their interpolated positions on every stage', () => {
  const models = new RivalCars('motorcycle');
  for (const stage of STAGES) for (const vehicle of bikes) {
    const race = new Race(new Track(stage), vehicle);
    assert.equal(race.standings.length, 6);
    assert.ok(race.opponents.cars.every(car => car.vehicle.mode === 'motorcycle'));
    race.phase = 'racing';
    race.opponents.update(0.5, race, 0);
    const pose = capturePose(race);
    models.update(race, pose.rivals, 0.5);
    models.group.children.forEach((object, i) => {
      assert.equal(object.name, `motorcycle-${race.opponents.cars[i].vehicle.id}`);
      assert.equal(object.position.x, pose.rivals[i].position.x);
      assert.equal(object.position.z, pose.rivals[i].position.z);
    });
    race.start();
    assert.ok(race.opponents.cars.every(car => car.speed === 0 && car.finishTime === null && car.vehicle.mode === 'motorcycle'));
  }
  disposeObject(models.group);
});

test('motorcycle handling accelerates faster, slides less and retains nitro and brake priorities', () => {
  const make = (id: string, lane = 0) => {
    const race = new Race(new Track(), getVehicle(id));
    race.phase = 'racing'; race.placeOnTrack(-1000, lane); return race;
  };
  const bike = make('apex'); const car = make('falcon');
  for (let i = 0; i < 30; i++) for (const race of [bike, car]) race.update(step, { ...idleControls(), throttle: true });
  assert.ok(bike.speed > car.speed * 1.4);
  bike.speed = car.speed = 35;
  for (let i = 0; i < 30; i++) for (const race of [bike, car]) race.update(step, { ...idleControls(), steering: 1, drift: true });
  assert.ok(Math.abs(bike.driftAngle) < Math.abs(car.driftAngle) * 0.6);
  assert.ok(bike.nitro > 0);
  const charge = bike.nitro;
  bike.update(step, { ...idleControls(), nitro: true });
  assert.ok(bike.boosting && bike.nitro < charge);
  const remaining = bike.nitro;
  bike.update(step, { ...idleControls(), nitro: true, brake: true });
  assert.equal(bike.boosting, false); assert.equal(bike.nitro, remaining);
  bike.recover(); assert.equal(bike.nitro, remaining); assert.equal(bike.penalty, 5);
  bike.start(); assert.equal(bike.nitro, 0); assert.equal(bike.vehicleId, 'apex');
  const enduro = make('trail', 12); const sport = make('apex', 12);
  enduro.speed = sport.speed = 30;
  for (let i = 0; i < 30; i++) for (const race of [enduro, sport]) race.update(step, idleControls());
  assert.ok(enduro.speed > sport.speed); assert.ok(enduro.integrity > sport.integrity);
  assert.ok(vehicleClearance(bike.vehicle) < vehicleClearance(car.vehicle));
});

test('a motorcycle makes one tyre trail and clears it on a vehicle reset', () => {
  const marks = new SkidMarks();
  marks.update(new THREE.Vector3(0, 0, 0), null, 1, 0);
  marks.update(new THREE.Vector3(0, 0, -1), null, 1, step);
  assert.equal(marks.mesh.geometry.drawRange.count, 6);
  marks.reset();
  marks.update(new THREE.Vector3(-1, 0, -20), new THREE.Vector3(1, 0, -20), 1, 0);
  assert.equal(marks.mesh.geometry.drawRange.count, 0, 'no segment bridges the mode switch');
  marks.update(new THREE.Vector3(-1, 0, -21), new THREE.Vector3(1, 0, -21), 1, step);
  assert.equal(marks.mesh.geometry.drawRange.count, 12);
  disposeObject(marks.mesh);
});

test('mode controls target actual vehicles and disable selection during a race', () => {
  assert.match(vehicleModePicker('car'), /data-vehicle-mode="motorcycle" data-vehicle="apex" aria-pressed="false"/);
  assert.match(vehicleModePicker('motorcycle'), /data-vehicle-mode="motorcycle" data-vehicle="apex" aria-pressed="true"/);
  assert.equal((vehicleModePicker('motorcycle', true).match(/ disabled/g) ?? []).length, 2);
  for (const vehicle of bikes) assert.match(vehicleThumbnail(vehicle), new RegExp(`bike-${vehicle.id}-paint`));
});
