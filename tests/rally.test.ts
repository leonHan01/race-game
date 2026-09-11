import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ROAD_WIDTH, SECTORS } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { bestTime, saveRecord, settings } from '../src/settings.ts';

const track = new Track();
const STEP = 1 / 60;
const driving = { ...idleControls(), throttle: true };

test('stage has continuous arc-length sampling and perpendicular road offsets', () => {
  assert.ok(track.length > 3000 && track.length < 5000);
  for (let d = 0; d < track.length - 1; d += 13) {
    const a = track.sample(d); const b = track.sample(d + 1);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 1) < 0.015);
    assert.ok(Math.abs(a.tx * a.rx + a.tz * a.rz) < 1e-9);
    assert.ok(Number.isFinite(a.y) && Number.isFinite(a.heading));
  }
  const finish = track.sample(track.length); const beyond = track.sample(track.length + 40);
  assert.ok(Math.abs(Math.hypot(beyond.x - finish.x, beyond.z - finish.z) - 40) < 0.01);
});

test('pace notes are ordered, useful, and agree with turn geometry', () => {
  assert.ok(track.notes.length >= 10);
  assert.ok(track.notes.some(note => note.direction === 'left'));
  assert.ok(track.notes.some(note => note.direction === 'right'));
  let previous = -1;
  for (const note of track.notes) {
    assert.ok(note.distance > previous);
    assert.ok(note.severity >= 2 && note.severity <= 5);
    assert.equal(note.direction, track.curvature(note.distance) < 0 ? 'right' : 'left');
    previous = note.distance;
  }
});

test('countdown prevents driving and pause freezes all simulation state', () => {
  const race = new Race(track); race.start();
  for (let i = 0; i < 60; i++) race.update(STEP, driving);
  assert.equal(race.distance, 0); assert.equal(race.elapsed, 0);
  race.pause(); const frozen = JSON.stringify(race);
  for (let i = 0; i < 120; i++) race.update(STEP, driving);
  assert.equal(JSON.stringify(race), frozen);
  race.resume(); assert.equal(race.phase, 'countdown');
  race.countdown = STEP / 2; race.update(STEP, driving);
  assert.equal(race.phase, 'racing');
  race.update(STEP, driving); assert.ok(race.speed > 0);
});

test('manual throttle, brake priority, and handbrake work without reverse speed', () => {
  const race = new Race(track); race.phase = 'racing';
  for (let i = 0; i < 30; i++) race.update(STEP, idleControls());
  assert.equal(race.speed, 0);
  race.speed = 30;
  race.update(STEP, { ...driving, brake: true });
  assert.ok(race.speed < 30);
  race.speed = 30;
  race.update(STEP, { ...driving, drift: true, steering: 1 });
  assert.ok(race.drifting); assert.ok(race.driftTime > 0);
  for (let i = 0; i < 150; i++) race.update(STEP, { ...idleControls(), brake: true });
  assert.equal(race.speed, 0);
});

test('manual and automatic throttle reach 250 km/h and sustain the speed limit', () => {
  for (const autoThrottle of [false, true]) {
    const race = new Race(track); race.phase = 'racing'; race.autoThrottle = autoThrottle;
    // The straight extension before the start gives acceleration room without steering.
    race.placeOnTrack(-2000);
    for (let i = 0; i < 20 / STEP; i++) {
      race.update(STEP, autoThrottle ? idleControls() : driving);
      assert.ok(race.speed * 3.6 <= 250 + 1e-9);
    }
    assert.equal(race.integrity, 100);
    assert.ok(Math.abs(race.speed * 3.6 - 250) < 1e-9);
    assert.ok(Math.abs(race.peakSpeed - 250) < 1e-9);
    assert.equal(race.gear, 6);
    assert.ok(Math.abs(race.engineRevs - 1) < 1e-9, 'top-gear revs stay full at the speed limit');
    race.update(STEP, { ...driving, drift: true });
    assert.ok(race.speed * 3.6 < 250, 'handbrake still overrides throttle at maximum speed');
  }
});

test('drifting produces a substantial, mirrored slip angle without rotating a stationary car', () => {
  for (const direction of [-1, 1]) {
    const race = new Race(track); race.phase = 'racing'; race.speed = 36;
    for (let i = 0; i < 45; i++) race.update(STEP, { ...driving, drift: true, steering: direction });
    assert.equal(Math.sign(race.driftAngle), -direction);
    assert.ok(Math.abs(race.driftAngle) > 0.45 && Math.abs(race.driftAngle) < 1.04);
    assert.ok(race.driftIntensity > 0.7 && race.driftIntensity <= 1);
  }
  const parked = new Race(track); parked.phase = 'racing';
  for (let i = 0; i < 30; i++) parked.update(STEP, { ...idleControls(), drift: true, steering: 1 });
  assert.equal(parked.driftAngle, 0); assert.equal(parked.driftIntensity, 0);
});

function holdHandbrake(seconds: number, speed = 36) {
  const race = new Race(track); race.phase = 'racing'; race.speed = speed;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    // Turn only to initiate the slide; keep Space held after letting go of steering.
    race.update(STEP, { ...driving, drift: true, steering: i < 6 ? 1 : 0 });
  }
  return race;
}

test('longer Space holds build larger angles and prolong grip recovery', () => {
  const tap = holdHandbrake(0.1);
  const medium = holdHandbrake(0.5);
  const long = holdHandbrake(1);
  assert.ok(Math.abs(medium.driftAngle) > Math.abs(tap.driftAngle) * 2);
  assert.ok(Math.abs(long.driftAngle) > Math.abs(medium.driftAngle) * 1.4);
  assert.ok(Math.abs(long.handbrakeHeldTime - 1) < 1e-9);
  const recoverFor = (race: Race) => {
    let steps = 0;
    while (Math.abs(race.driftAngle) > 0.001 && steps < 300) {
      race.update(STEP, driving); steps++;
    }
    assert.equal(race.handbrake, false); assert.equal(race.handbrakeHeldTime, 0);
    assert.ok(steps < 300);
    return steps;
  };
  const tapRecovery = recoverFor(tap); const mediumRecovery = recoverFor(medium); const longRecovery = recoverFor(long);
  assert.ok(mediumRecovery > tapRecovery);
  assert.ok(longRecovery > mediumRecovery);
});

test('Space sustains an initiated slide with neutral steering and below the old speed cutoff', () => {
  const race = holdHandbrake(1, 24);
  assert.ok(race.speed > 0.5 && race.speed < 12);
  assert.equal(race.handbrake, true); assert.equal(race.drifting, true);
  assert.ok(race.driftAngle < -0.1); assert.ok(race.lateralVelocity > 0);
  const angle = Math.abs(race.driftAngle);
  race.update(STEP, { ...driving, drift: true });
  assert.ok(Math.abs(race.driftAngle) >= angle);
  race.update(STEP, driving);
  assert.equal(race.handbrake, false); assert.equal(race.drifting, false);
  assert.ok(Math.abs(race.driftAngle) < angle + 0.02);
});

test('a held handbrake continuously overcomes manual and automatic throttle, then holds the car stopped', () => {
  for (const autoThrottle of [false, true]) {
    const race = new Race(track); race.phase = 'racing'; race.speed = 24; race.autoThrottle = autoThrottle;
    for (let i = 0; i < 120; i++) {
      const previousSpeed = race.speed;
      race.update(STEP, { ...idleControls(), throttle: !autoThrottle, drift: true });
      assert.ok(race.speed <= previousSpeed);
      assert.equal(race.handbrake, true);
    }
    assert.equal(race.speed, 0);
    const distance = race.distance; const lane = race.lane;
    for (let i = 0; i < 30; i++) race.update(STEP, { ...driving, drift: true, steering: 1 });
    assert.equal(race.distance, distance); assert.equal(race.lane, lane);
    assert.equal(race.driftAngle, 0);
    race.update(STEP, driving); assert.ok(race.speed > 0);
    assert.equal(race.handbrakeHeldTime, 0);
  }
});

test('holding Space through a stop freezes the existing angle instead of spinning the car', () => {
  const race = holdHandbrake(2, 24);
  assert.equal(race.speed, 0); assert.ok(Math.abs(race.driftAngle) > 0.1);
  const angle = race.driftAngle; const lane = race.lane;
  for (let i = 0; i < 60; i++) race.update(STEP, { ...driving, drift: true, steering: -1 });
  assert.equal(race.handbrake, true); assert.equal(race.drifting, false);
  assert.equal(race.driftAngle, angle); assert.equal(race.lane, lane);
  assert.equal(race.driftIntensity, 0);
});

test('straight-line handbraking produces rear tyre slip until release or a full stop', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 20;
  race.update(STEP, { ...driving, drift: true });
  assert.equal(race.driftAngle, 0); assert.equal(race.drifting, false);
  assert.ok(race.rearWheelSlip > 0.5);
  race.update(STEP, driving); assert.equal(race.rearWheelSlip, 0);
  for (let i = 0; i < 120; i++) race.update(STEP, { ...driving, drift: true });
  assert.equal(race.speed, 0); assert.equal(race.rearWheelSlip, 0);
});

test('releasing the handbrake preserves the slide briefly then smoothly regains grip', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 36;
  for (let i = 0; i < 18; i++) race.update(STEP, { ...driving, drift: true, steering: 1 });
  let previous = Math.abs(race.driftAngle);
  race.update(STEP, driving);
  assert.equal(race.drifting, false);
  assert.ok(Math.abs(race.driftAngle) > previous * 0.9);
  for (let i = 0; i < 150; i++) {
    previous = Math.abs(race.driftAngle);
    race.update(STEP, driving);
    assert.ok(Math.abs(race.driftAngle) <= previous);
  }
  assert.equal(race.driftAngle, 0);
});

test('pause freezes the slip angle while rescue and restart clear it immediately', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 36;
  for (let i = 0; i < 18; i++) race.update(STEP, { ...driving, drift: true, steering: 1 });
  const angle = race.driftAngle;
  race.pause();
  assert.equal(race.handbrake, false); assert.equal(race.handbrakeHeldTime, 0);
  for (let i = 0; i < 60; i++) race.update(STEP, driving);
  assert.equal(race.driftAngle, angle);
  assert.equal(race.handbrakeHeldTime, 0);
  race.resume(); race.recover();
  assert.equal(race.driftAngle, 0); assert.equal(race.driftIntensity, 0); assert.equal(race.drifting, false);
  assert.equal(race.handbrake, false); assert.equal(race.handbrakeHeldTime, 0);
  race.speed = 36;
  race.update(STEP, { ...driving, drift: true, steering: -1 });
  assert.ok(race.driftAngle > 0);
  assert.ok(Math.abs(race.handbrakeHeldTime - STEP) < 1e-9);
  race.start(); assert.equal(race.driftAngle, 0);
  assert.equal(race.handbrake, false); assert.equal(race.handbrakeHeldTime, 0);
});

test('shoulder damage stays bounded and recovery adds time without stage progress', () => {
  const race = new Race(track); race.phase = 'racing'; race.speed = 35;
  race.placeOnTrack(40, ROAD_WIDTH);
  race.update(STEP, driving);
  assert.ok(race.speed < 35); assert.ok(race.integrity < 100);
  assert.ok(Math.abs(race.lane) > ROAD_WIDTH / 2 + 1.4);
  const distance = race.distance; const time = race.totalTime;
  race.recover();
  assert.equal(race.distance, distance); assert.equal(race.lane, 0);
  assert.equal(race.totalTime, time + 5); assert.ok(race.speed <= 8);
  race.pause(); race.recover(); assert.equal(race.penalty, 5);
});

test('sector crossing is recorded once and carries the rescue penalty', () => {
  const race = new Race(track); race.phase = 'racing';
  race.placeOnTrack(track.length / SECTORS - 0.1); race.speed = 30; race.elapsed = 20; race.penalty = 5;
  race.update(STEP, driving);
  assert.equal(race.splits.length, 1);
  assert.ok(race.splits[0].total > 25 && race.splits[0].total < 25 + STEP);
  race.update(STEP, driving); assert.equal(race.splits.length, 1);
  assert.equal(race.sector, 2);
});

test('finish time interpolates the final crossing and cannot advance after finishing', () => {
  const race = new Race(track); race.phase = 'racing'; race.placeOnTrack(track.length - 0.1);
  race.elapsed = 120; race.speed = 40;
  race.splits = [24, 48, 72, 96].map(total => ({ time: 24, total, delta: 0 }));
  race.update(STEP, driving);
  assert.equal(race.phase, 'finished'); assert.equal(race.distance, track.length);
  assert.equal(race.splits.length, SECTORS); assert.equal(race.progress, 1);
  assert.ok(race.elapsed > 120 && race.elapsed < 120 + STEP / 2);
  assert.ok(Math.abs(race.splits.reduce((sum, split) => sum + split.time, 0) - race.totalTime) < 1e-9);
  const time = race.totalTime; race.update(STEP, driving); assert.equal(race.totalTime, time);
});

test('restart clears damage, penalties, splits, and motion while preserving driving preferences', () => {
  const race = new Race(track); race.difficulty = 'pro'; race.autoThrottle = true;
  race.integrity = 12; race.penalty = 15; race.distance = 200; race.speed = 44; race.elapsed = 23;
  race.splits.push({ time: 20, total: 20, delta: 4 });
  race.start();
  assert.equal(race.phase, 'countdown'); assert.equal(race.distance, 0); assert.equal(race.speed, 0);
  assert.equal(race.integrity, 100); assert.equal(race.penalty, 0); assert.equal(race.splits.length, 0);
  assert.equal(race.difficulty, 'pro'); assert.ok(race.autoThrottle);
});

test('best records stay separate by active difficulty and throttle mode', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  const manual = { difficulty: 'club' as const, autoThrottle: false };
  const auto = { difficulty: 'club' as const, autoThrottle: true };
  const professional = { difficulty: 'pro' as const, autoThrottle: false };
  settings.difficulty = 'pro';
  assert.ok(saveRecord(130, manual)); assert.equal(bestTime(manual), 130);
  assert.equal(bestTime(professional), null); assert.equal(bestTime(auto), null);
  assert.equal(saveRecord(145, manual), false); assert.equal(bestTime(manual), 130);
  assert.ok(saveRecord(123, manual)); assert.equal(bestTime(manual), 123);
  assert.equal(saveRecord(NaN, manual), false); assert.equal(saveRecord(-1, manual), false);
  values.set('dustline-best-v3-pine-falcon-club-manual', 'corrupt'); assert.equal(bestTime(manual), null);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
