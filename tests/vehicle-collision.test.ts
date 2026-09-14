import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehicle, LONGBOARDS, VEHICLES, vehicleClearance } from '../src/content/vehicles.ts';
import { getStage } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { resolveVehicleCollisions, vehicleBody, type VehicleMovement } from '../src/simulation/vehicle-collision.ts';

const STEP = 1 / 60;
const close = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function movement(id: string, x: number, z: number, vx = 0, vz = 0, dt = STEP, vehicle = getVehicle('falcon'), heading = 0): VehicleMovement {
  return { id, vehicle, heading, before: { x, y: 0, z }, after: { x: x + vx * dt, y: 0, z: z + vz * dt } };
}

test('a fast rear-end collision transfers momentum without crossing through the leading car', () => {
  const dt = 0.2;
  const result = resolveVehicleCollisions([movement('a', 0, 10, 0, -90, dt), movement('b', 0, 0, 0, -10, dt)], dt);
  const [a, b] = result.bodies;
  assert.ok(a.collided && b.collided);
  assert.ok(a.position.z - b.position.z >= 4.7);
  assert.ok(a.vz > -90 && b.vz < -10);
  close(a.vz + b.vz, -100);
  assert.ok(a.vz ** 2 + b.vz ** 2 < 90 ** 2 + 10 ** 2, 'impact must dissipate energy');
});

test('head-on impacts are swept even when the endpoints are completely past one another', () => {
  const dt = 0.15;
  const result = resolveVehicleCollisions([movement('a', 0, 6, 0, -90, dt), movement('b', 0, -6, 0, 90, dt, getVehicle('falcon'), Math.PI)], dt);
  const [a, b] = result.bodies;
  assert.ok(a.position.z > b.position.z + 4.69);
  assert.ok(a.vz > 0 && b.vz < 0, 'low restitution produces a small rebound');
  close(a.vz + b.vz, 0);
});

test('side contact preserves forward motion and gives both cars a lateral impulse', () => {
  const dt = 0.1;
  const result = resolveVehicleCollisions([movement('a', -4, 0, 25, -40, dt), movement('b', 0, 0, 0, -40, dt)], dt);
  const [a, b] = result.bodies;
  assert.ok(a.vx > 0 && a.vx < 25 && b.vx > 0);
  close(a.vz, -40); close(b.vz, -40);
  assert.ok(b.position.x - a.position.x >= 2.5);
});

test('heavier vehicles receive less velocity change and existing overlap adds no energy or damage', () => {
  const dt = 0.1;
  const a = movement('a', -3, 0, 20, 0, dt, getVehicle('swift'));
  const b = movement('b', 0, 0, 0, 0, dt, getVehicle('nomad'));
  const [light, heavy] = resolveVehicleCollisions([a, b], dt).bodies;
  assert.ok(light.impact > heavy.impact);
  close(light.vx * a.vehicle.weight + heavy.vx * b.vehicle.weight, 20 * a.vehicle.weight);
  const overlapping = resolveVehicleCollisions([movement('a', 0, 0), movement('b', 0, 0)], STEP).bodies;
  assert.ok(Math.hypot(overlapping[0].position.x - overlapping[1].position.x, overlapping[0].position.z - overlapping[1].position.z) >= 2.5);
  for (const body of overlapping) { close(body.vx, 0); close(body.vz, 0); close(body.impact, 0); }
});

test('parallel neighbours and vehicles passing at separate heights stay untouched', () => {
  const parallel = [movement('a', -1.4, 0, 0, -70), movement('b', 1.4, 0, 0, -70)];
  const flying = movement('b', 0, 0, 0, 50, 0.2);
  flying.before.y = flying.after.y = 4;
  for (const [inputs, dt] of [[parallel, STEP], [[movement('a', 0, 10, 0, -80, 0.2), flying], 0.2]] as const) {
    const result = resolveVehicleCollisions([...inputs], dt);
    for (const body of result.bodies) {
      assert.equal(body.collided, false); assert.equal(body.impact, 0);
      assert.deepEqual(body.position, inputs.find(input => input.id === body.id)!.after);
    }
  }
});

test('rotated bodies collide at their sides and every car, motorcycle and board has a working footprint', () => {
  for (const vehicle of [...VEHICLES, ...LONGBOARDS]) {
    const bounds = vehicleBody(vehicle); const dt = 0.1;
    const distance = bounds.halfWidth + bounds.halfLength + 0.1;
    const result = resolveVehicleCollisions([
      movement('a', -distance, 0, 8, 0, dt, vehicle), movement('b', 0, 0, 0, 0, dt, vehicle, Math.PI / 2),
    ], dt);
    assert.ok(result.bodies.every(body => body.collided), vehicle.id);
    assert.ok(result.bodies[1].position.x - result.bodies[0].position.x >= distance - 0.1 - 1e-6);
    if (vehicle.mode !== 'car') assert.ok(bounds.mass >= vehicle.weight + 75);
  }
});

test('multi-car pile-ups are deterministic and propagate a push through the queue', () => {
  const dt = 0.2;
  const cars = [movement('a', 0, 10, 0, -80, dt), movement('b', 0, 4.8, 0, 0, dt), movement('c', 0, 0, 0, 0, dt)];
  const result = resolveVehicleCollisions(cars, dt);
  assert.deepEqual(result, resolveVehicleCollisions([...cars].reverse(), dt));
  const [a, b, c] = result.bodies;
  assert.ok(a.position.z - b.position.z >= 4.6999);
  assert.ok(b.position.z - c.position.z >= 4.6999);
  assert.ok(c.vz < -1);
  for (const body of result.bodies) assert.ok(Number.isFinite(body.vx + body.vz + body.position.x + body.position.z));
});

const straight = () => new Track({ ...getStage('pine'), closed: false, venue: undefined, jumps: [], points: [
  { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -500 }, { x: 0, y: 0, z: -1000 },
] });
function running(vehicle = getVehicle('falcon')) {
  const race = new Race(straight(), vehicle); race.phase = 'racing';
  for (const car of race.opponents.cars) car.finishTime = 0;
  return race;
}
function rival(race: Race, index: number, distance: number, lane = 0, speed = 0) {
  const car = race.opponents.cars[index];
  Object.assign(car, { distance, lane, targetLane: lane, speed, planIn: 100, finishTime: null,
    vehicle: { ...car.vehicle, acceleration: 0 }, heading: race.track.sample(distance).heading });
  Object.assign(car.position, race.track.position(distance, lane)); car.vertical.reset(car.position.y);
  return car;
}

test('the race applies player/rival impact, damage and persistent AI displacement in classic and item modes', () => {
  for (const mode of ['classic', 'items'] as const) {
    const race = running(); race.mode = mode; race.placeOnTrack(40); race.speed = 80;
    const car = rival(race, 0, 45.1); const heading = race.heading;
    race.update(STEP, idleControls());
    assert.ok(race.speed < 55 && car.speed > 10);
    assert.ok(race.integrity < 100 && race.integrity >= 0); assert.equal(race.penalty, 0);
    close(race.heading, heading);
    assert.ok(car.distance - race.distance >= 4.6999);
    const distance = car.distance;
    race.update(STEP, idleControls());
    assert.ok(car.distance > distance, 'AI retains momentum after contact');
  }
});

test('AI-to-AI overlap is separated even when the player is far away', () => {
  const race = running(); race.placeOnTrack(5);
  const a = rival(race, 0, 50); const b = rival(race, 1, 50);
  race.update(STEP, idleControls());
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= 2.5);
  assert.equal(race.integrity, 100); assert.equal(race.speed, 0);
});

test('AI keeps a sideways impact across ticks and gradually regains its chosen lane', () => {
  const race = running(); race.placeOnTrack(50, -4, -Math.PI / 2); race.speed = 70;
  const car = rival(race, 0, 50);
  race.update(STEP, idleControls());
  assert.ok(car.collisionVelocity.x > 1);
  const lane = car.lane; const impulse = car.collisionVelocity.x;
  race.placeOnTrack(5); race.speed = 0;
  race.update(STEP, idleControls());
  assert.ok(car.lane > lane, 'the next AI plan must not discard the sideways impulse');
  assert.ok(car.collisionVelocity.x > 0 && car.collisionVelocity.x < impulse);
});

test('a side impact remains inside either barrier and leaves the player heading under control', () => {
  for (const side of [-1, 1]) {
    const race = running();
    const edge = race.track.boundaryEdge - vehicleClearance(race.vehicle);
    race.placeOnTrack(50, side * (edge - 2.6), -side * Math.PI / 2); race.speed = 70;
    const car = rival(race, 0, 50, side * edge);
    const heading = race.heading;
    for (let tick = 0; tick < 12; tick++) {
      race.update(STEP, { ...idleControls(), throttle: true });
      for (const actor of [race, car]) {
        const road = race.track.project(actor.position.x, actor.position.z, actor.distance);
        assert.ok(Math.hypot(actor.position.x - road.x, actor.position.z - road.z) + vehicleClearance(actor.vehicle) <= race.track.boundaryEdge + 1e-6);
      }
    }
    close(race.heading, heading);
    assert.ok(Math.abs(car.lane - race.lane) >= 3.5999, 'a pinned car must not allow sustained overlap');
    assert.equal(race.penalty, 0);
  }
});

test('a collision before the finish prevents a false player crossing', () => {
  const race = running(); const length = race.track.length;
  race.placeOnTrack(length - 5); race.speed = 80;
  race.splits = [1, 2, 3, 4].map(total => ({ time: 1, total, delta: 0 }));
  const car = rival(race, 0, length - 0.2);
  race.update(0.1, idleControls());
  assert.equal(race.phase, 'racing'); assert.ok(race.distance < length);
  assert.equal(race.splits.length, 4); close(race.elapsed, 0.1);
  assert.ok(car.finishTime !== null && car.finishTime < race.elapsed);
});

test('simultaneous finishes share a crossing time and exclude all movement after the player finishes', () => {
  const dt = 0.1; const frame = straight().sample(1000);
  const inputs = [movement('player', -3, frame.z + 1, 0, -20, dt), movement('rival', 3, frame.z + 1, 0, -20, dt)];
  for (const input of inputs) { input.canFinish = true; input.endsRace = input.id === 'player'; }
  const result = resolveVehicleCollisions(inputs, dt, undefined, { frame, halfWidth: 10 });
  close(result.elapsed, 0.05);
  for (const body of result.bodies) { close(body.finishTime!, 0.05); close(body.position.z, frame.z); }
});

test('finished opponents do not form an invisible roadblock and pause/reset freeze or clear collision motion', () => {
  const race = running(); race.placeOnTrack(40); race.speed = 70;
  const car = rival(race, 0, 45); car.finishTime = 1;
  race.update(STEP, idleControls()); assert.equal(race.integrity, 100); assert.ok(race.speed > 60);
  car.finishTime = null; car.collisionVelocity.x = 4; car.collisionVelocity.z = -3;
  race.pause(); const before = JSON.stringify(race);
  race.update(1, idleControls()); assert.equal(JSON.stringify(race), before);
  race.start();
  for (const other of race.opponents.cars) assert.deepEqual(other.collisionVelocity, { x: 0, z: 0 });
  assert.equal(race.integrity, 100);
});
