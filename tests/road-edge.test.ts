import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { getStage } from '../src/content/stages.ts';
import { getVehicle, VEHICLES, LONGBOARDS, vehicleClearance, type VehicleDefinition } from '../src/content/vehicles.ts';

const STEP = 1 / 60;
const throttle = { ...idleControls(), throttle: true };

function prepare(track: Track, vehicle: VehicleDefinition, lane: number, speed = 40) {
  const race = new Race(track, vehicle); race.phase = 'racing';
  // The straight start extension keeps bends and traffic out of the comparison.
  race.placeOnTrack(-2000, lane); race.speed = speed;
  return race;
}

test('driving along either road edge preserves the same speed and integrity as the centre', () => {
  const track = new Track();
  const drive = (lane: number) => {
    const race = prepare(track, getVehicle('falcon'), lane);
    for (let i = 0; i < 120; i++) race.update(STEP, throttle);
    return race;
  };
  const centre = drive(0);
  for (const side of [-1, 1]) {
    const edge = drive(side * (track.roadWidth / 2 - 0.5));
    assert.ok(Math.abs(edge.speed - centre.speed) < 1e-9,
      `edge ${side}: ${edge.speed * 3.6} km/h, centre: ${centre.speed * 3.6} km/h`);
    assert.equal(edge.integrity, 100);
  }
});

test('all vehicles keep road-centre performance at both usable edges on wide, narrow and indoor roads', () => {
  for (const stageId of ['pine', 'alpine', 'hangar'] as const) {
    // Keep each venue's width, surface and barriers; use a straight road to isolate lane position.
    const track = new Track({ ...getStage(stageId), closed: false, points: [
      { x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: -500 }, { x: 0, y: 10, z: -1000 },
    ] });
    for (const vehicle of [...VEHICLES, ...LONGBOARDS]) {
      const edgeLane = Math.min(track.roadWidth / 2, track.boundaryEdge - vehicleClearance(vehicle) - 0.01);
      const centre = prepare(track, vehicle, 0);
      const edges = [-1, 1].map(side => prepare(track, vehicle, side * edgeLane));
      for (let i = 0; i < 120; i++) {
        centre.update(STEP, throttle);
        for (const edge of edges) {
          edge.update(STEP, throttle);
          const context = `${stageId}/${vehicle.id}/${Math.sign(edge.lane)}`;
          assert.ok(Math.abs(edge.speed - centre.speed) < 1e-9, `${context}: road edge must not reduce speed`);
          assert.ok(Math.abs(edge.distance - centre.distance) < 1e-8, `${context}: progress must match the centre`);
          assert.equal(edge.integrity, 100, `${context}: road edge must not cause damage`);
        }
      }
    }
  }
});

test('road edges preserve top speed, nitro acceleration and reverse speed', () => {
  const track = new Track(); const vehicle = getVehicle('falcon');
  for (const scenario of [
    { speed: vehicle.topSpeed / 3.6, controls: throttle },
    { speed: vehicle.topSpeed / 3.6, controls: { ...throttle, nitro: true } },
    { speed: -6, controls: { ...idleControls(), brake: true } },
  ]) {
    const centre = prepare(track, vehicle, 0, scenario.speed); centre.nitro = 100;
    const edges = [-1, 1].map(side => {
      const race = prepare(track, vehicle, side * (track.roadWidth / 2 - 0.5), scenario.speed);
      race.nitro = 100; return race;
    });
    for (let i = 0; i < 120; i++) {
      centre.update(STEP, scenario.controls);
      for (const edge of edges) {
        edge.update(STEP, scenario.controls);
        assert.ok(Math.abs(edge.speed - centre.speed) < 1e-9);
        assert.equal(edge.nitro, centre.nitro);
        assert.equal(edge.integrity, 100);
      }
    }
  }
});

test('crossing onto the shoulder introduces drag gradually and symmetrically', () => {
  const track = new Track(); const vehicle = getVehicle('apex');
  const drive = (lane: number) => {
    const race = prepare(track, vehicle, lane);
    race.update(STEP, throttle);
    return race;
  };
  const centre = drive(0);
  for (const side of [-1, 1]) {
    const atEdge = drive(side * track.roadWidth / 2);
    const barelyOutside = drive(side * (track.roadWidth / 2 + 0.001));
    const onShoulder = drive(side * (track.roadWidth / 2 + 0.5));
    assert.equal(atEdge.speed, centre.speed);
    assert.equal(atEdge.integrity, 100);
    assert.ok(centre.speed - barelyOutside.speed < 0.01, 'crossing by 1 mm must not cause a sudden speed drop');
    assert.ok(barelyOutside.speed < centre.speed);
    assert.ok(onShoulder.speed < barelyOutside.speed);
    assert.ok(onShoulder.integrity < barelyOutside.integrity && barelyOutside.integrity < 100);
  }
});
