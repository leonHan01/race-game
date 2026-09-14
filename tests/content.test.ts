import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, getStage } from '../src/content/stages.ts';
import { VEHICLES, getVehicle, vehicleClearance } from '../src/content/vehicles.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { bestTime, saveRecord } from '../src/settings.ts';
import { RaceTimeline } from '../src/presentation.ts';

const STEP = 1 / 60;
const throttle = { ...idleControls(), throttle: true };

test('all maps have continuous roads, useful pace notes and smoothly joined shoulders', () => {
  const lengths = new Set<number>();
  for (const stage of STAGES) {
    const track = new Track(stage); lengths.add(track.length);
    assert.ok(track.length > (stage.venue ? 1200 : 3000) && track.length < 18000);
    assert.ok(track.notes.length >= 2);
    for (let d = 30; d < track.length - 30; d += 37) {
      const p = track.position(d); const projection = track.project(p.x, p.z);
      assert.ok(Math.abs(projection.distance - d) < 0.01, `${stage.id}: route crosses itself at ${d}`);
      const next = track.sample(d + 1);
      assert.ok(Math.abs(Math.hypot(next.x - p.x, next.z - p.z) - 1) < 0.04);
      for (const side of [-1, 1]) {
        const a = track.position(d, side * (track.shoulderEdge - 0.001));
        const b = track.position(d, side * (track.shoulderEdge + 0.001));
        assert.ok(Math.abs(track.surfaceHeight(a.x, a.z) - track.surfaceHeight(b.x, b.z)) < 0.02);
      }
    }
  }
  assert.equal(lengths.size, STAGES.length);
  assert.equal(getStage('bad-save').id, 'pine');
  assert.equal(getVehicle('bad-save').id, 'falcon');
});

test('every map and vehicle combination keeps manual steering, handbraking and rescue', () => {
  for (const stage of STAGES) for (const vehicle of VEHICLES) {
    const race = new Race(new Track(stage), vehicle);
    race.phase = 'racing'; race.placeOnTrack(stage.venue ? 0 : -1000); race.speed = 35;
    const heading = race.heading;
    const timeline = new RaceTimeline(race);
    for (let i = 0; i < 45; i++) timeline.advance(1 / 90, throttle);
    assert.ok(Math.abs(race.heading - heading) < 1e-9, `${stage.id}/${vehicle.id}: automatic steering`);
    race.update(STEP, { ...throttle, steering: 1, drift: true });
    const angle = Math.abs(race.driftAngle); const speed = race.speed;
    for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, drift: true });
    assert.ok(Math.abs(race.driftAngle) > angle); assert.ok(race.speed < speed);
    race.recover(); timeline.reset();
    assert.equal(race.lane, 0); assert.equal(race.penalty, 5);
    assert.deepEqual(timeline.pose.position, race.position);
    race.start(); assert.equal(race.vehicleId, vehicle.id); assert.equal(race.stageId, stage.id);
  }
});

test('all vehicle speed limits are attainable, remain within 250 km/h and agree with top gear', () => {
  for (const vehicle of VEHICLES) {
    const race = new Race(new Track(getStage('valley')), vehicle);
    race.phase = 'racing'; race.placeOnTrack(-3000);
    for (let i = 0; i < 30 / STEP; i++) { race.update(STEP, throttle); assert.ok(race.speed * 3.6 <= 250 + 1e-9); }
    assert.ok(Math.abs(race.speed * 3.6 - vehicle.topSpeed) < 1e-8, vehicle.id);
    assert.equal(race.gear, 6); assert.ok(Math.abs(race.engineRevs - 1) < 1e-8);
  }
});

test('different vehicle types change actual acceleration, drift and collision durability', () => {
  function drive(id: string, mode: 'acceleration' | 'drift' | 'damage' | 'cruise') {
    const race = new Race(new Track(), getVehicle(id)); race.phase = 'racing';
    race.placeOnTrack(-1000, mode === 'damage' ? 12 : 0); race.speed = mode === 'acceleration' ? 0 : 35;
    for (let i = 0; i < 30; i++) race.update(STEP, { ...throttle, drift: mode === 'drift', steering: mode === 'drift' ? 1 : 0 });
    return race;
  }
  assert.ok(drive('comet', 'acceleration').speed > drive('nomad', 'acceleration').speed * 1.3);
  assert.ok(Math.abs(drive('comet', 'drift').driftAngle) > Math.abs(drive('swift', 'drift').driftAngle) * 1.5);
  assert.ok(drive('nomad', 'damage').integrity > drive('comet', 'damage').integrity);
  for (const id of ['thunder', 'vortex', 'summit']) assert.equal(getVehicle(id).id, id, 'new cars resolve without falling back to Falcon');
  assert.ok(drive('vortex', 'acceleration').speed > drive('summit', 'acceleration').speed * 1.5);
  assert.ok(Math.abs(drive('thunder', 'drift').driftAngle) > Math.abs(drive('vortex', 'drift').driftAngle) * 1.4);
  assert.ok(drive('summit', 'damage').integrity > drive('vortex', 'damage').integrity);
  for (const id of ['summit', 'vortex']) {
    assert.ok(drive(id, 'damage').speed < drive(id, 'cruise').speed, `${id}: barrier contact must reduce speed`);
  }
});

test('snow reduces grip and braking and narrower roads enforce their own boundaries', () => {
  const drive = (stage: string, lane = 0) => {
    const race = new Race(new Track(getStage(stage))); race.phase = 'racing'; race.placeOnTrack(-1000, lane); race.speed = 35;
    for (let i = 0; i < 20; i++) race.update(STEP, { ...idleControls(), steering: 1, brake: true });
    return race;
  };
  const snow = drive('alpine'); const valley = drive('valley');
  assert.ok(snow.speed > valley.speed, 'snow needs a longer braking distance');
  assert.ok(Math.abs(snow.heading - snow.travelHeading) > Math.abs(valley.heading - valley.travelHeading));
  // Lane 8 is still drivable on Alpine; cross its actual barrier for the damage comparison.
  const narrowTrack = new Track(getStage('alpine'));
  const outsideNarrowBarrier = narrowTrack.boundaryEdge - vehicleClearance(getVehicle('falcon')) + 0.5;
  assert.ok(drive('alpine', outsideNarrowBarrier).integrity < drive('valley', outsideNarrowBarrier).integrity);
});

test('each stage requires five ordered forward gates and can finish with every vehicle', () => {
  for (const stage of STAGES) for (const vehicle of VEHICLES) {
    const track = new Track(stage); const race = new Race(track, vehicle); race.phase = 'racing';
    for (let gate = 1; gate <= SECTORS; gate++) {
      race.placeOnTrack(track.length * gate / SECTORS - 0.1); race.speed = 25;
      race.update(STEP, throttle);
      assert.equal(race.splits.length, gate, `${stage.id}/${vehicle.id}/gate ${gate}`);
    }
    assert.equal(race.phase, 'finished'); assert.equal(race.progress, 1);
  }
});

test('records remain isolated across every stage, vehicle and driving mode and preserve old Pine Ridge times', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const original = new Race(new Track());
    values.set('dustline-best-v2-club-manual', '110');
    assert.equal(bestTime(original), 110);
    let score = 200;
    const entries: { race: Race; score: number }[] = [];
    for (const stage of STAGES) for (const vehicle of VEHICLES) for (const difficulty of ['easy', 'medium', 'hard'] as const) for (const auto of [false, true]) {
      const race = new Race(new Track(stage), vehicle); race.difficulty = difficulty; race.autoThrottle = auto;
      const legacy = race.stageId === 'pine' && race.vehicleId === 'falcon' && difficulty === 'medium' && !auto;
      assert.equal(bestTime(race), legacy ? 110 : null);
      const time = legacy ? 100 : score++;
      assert.ok(saveRecord(time, race)); entries.push({ race, score: time });
    }
    for (const entry of entries) assert.equal(bestTime(entry.race), entry.score);
    assert.equal(values.get('dustline-best-v2-club-manual'), '110');
  } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
});
