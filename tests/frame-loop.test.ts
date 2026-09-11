import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { PaintClock, RaceTimeline } from '../src/presentation.ts';

// Run the real frame callback with DOM/GPU/audio sinks replaced. No app is booted.
function runFrames(hz: number, quality = 'standard') {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const callback = main.slice(main.indexOf('function frame(now:'), main.indexOf('// Let the lightweight'));
  const race = new Race(new Track()); race.phase = 'racing'; race.speed = 250 / 3.6; race.placeOnTrack(-2000);
  let now = 1000;
  const paints: { time: number; z: number }[] = [];
  const context = vm.createContext({
    race, input: { read: () => ({ ...idleControls(), throttle: true }), clear() {} },
    settings: { quality }, document: { hidden: false },
    requestAnimationFrame() { return 1; }, animationFrame: 0, lastFrame: now, lastPaint: now,
    timeline: new RaceTimeline(race), paintClock: new PaintClock(), dirty: false,
    ui: { update() {}, toast() {} }, audio: { update() {}, silence() {} }, recordResult() {},
    view: { render: (state: Race, _controls: unknown, _dt: number, pose = state) => paints.push({ time: now, z: pose.position.z }) },
  });
  vm.runInContext(ts.transpile(callback, { target: ts.ScriptTarget.ES2022 }), context);
  for (let i = 0; i < hz * 3; i++) {
    now = 1000 + (i + 1) * 1000 / hz;
    context.frame(now);
  }
  return paints;
}

test('the actual frame loop sustains the intended paint rate across display refresh rates', () => {
  for (const hz of [60, 90, 120, 144, 165]) for (const quality of ['standard', 'low']) {
    const paints = runFrames(hz, quality);
    const expected = quality === 'standard' ? 180 : 90;
    assert.ok(Math.abs(paints.length - expected) <= 1, `${hz} Hz / ${quality}: ${paints.length} paints in three seconds`);
  }
});

test('rendered position advances continuously instead of alternating physical tick sizes', () => {
  for (const hz of [60, 90, 120, 144, 165]) for (const quality of ['standard', 'low']) {
    const paints = runFrames(hz, quality).filter(paint => paint.time > 1100);
    const speeds = paints.slice(1).map((paint, i) => -(paint.z - paints[i].z) / ((paint.time - paints[i].time) / 1000));
    const variation = Math.max(...speeds) - Math.min(...speeds);
    assert.ok(variation < 0.01, `${hz} Hz / ${quality}: motion varies by ${variation.toFixed(3)} m/s`);
  }
});
