import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track, SECTORS } from '../src/simulation/track.ts';
import { STAGES, getStage } from '../src/content/stages.ts';
import { ITEM_KINDS, rollItem, type ItemKind } from '../src/content/items.ts';
import { MAX_PROJECTILES, MAX_TRAPS } from '../src/simulation/items.ts';
import { bestTime, saveRecord } from '../src/settings.ts';
import { RaceTimeline } from '../src/presentation.ts';

const track = new Track(getStage('valley'));
const STEP = 1 / 60;
function running() {
  const race = new Race(track); race.mode = 'items'; race.phase = 'racing';
  race.opponents.cars.forEach((_, i) => placeRival(race, i, 600 + i * 20, -4.2));
  return race;
}
function placeRival(race: Race, index: number, distance: number, lane: number) {
  const car = race.opponents.cars[index];
  car.distance = distance; car.lane = lane; car.targetLane = lane; car.speed = 20;
  Object.assign(car.position, track.position(distance, lane)); car.heading = track.sample(distance).heading;
  return car;
}
function equip(race: Race, kind: ItemKind, id = 'player') {
  const state = race.items.state(id); state.held = kind; state.roulette = 0;
  return state;
}
function cross(race: Race, from: number, to: number, lane: number) {
  race.placeOnTrack(from, lane); race.items.beginStep(STEP, race);
  race.placeOnTrack(to, lane); race.items.endStep(STEP, race);
}
function advanceItems(race: Race, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) { race.items.beginStep(STEP, race); race.items.endStep(STEP, race); }
}

test('all stages have three-lane supply rows and boost pads inside the road, away from timing gates', () => {
  for (const stage of STAGES) {
    const race = new Race(new Track(stage));
    assert.ok(race.items.boxes.length >= 12, stage.id);
    assert.equal(race.items.boxes.length % 3, 0);
    assert.ok(race.items.pads.length >= 3, stage.id);
    for (const point of [...race.items.boxes, ...race.items.pads]) {
      assert.ok(Math.abs(point.lane) + 2 < stage.roadWidth / 2);
      assert.ok(point.distance > 70 && point.distance < race.track.length - 40);
      assert.deepEqual(point.position, race.track.position(point.distance, point.lane));
      for (let i = 1; i <= SECTORS; i++) assert.ok(Math.abs(point.distance - race.track.length * i / SECTORS) > 24);
    }
  }
});

test('swept pickup catches a fast crossing, gives one item, locks roulette, and refills only after cooldown', () => {
  const race = running(); const box = race.items.boxes[1];
  cross(race, box.distance - 20, box.distance + 20, box.lane);
  assert.ok(race.items.player.held); assert.equal(race.items.player.roulette, 0.8); assert.equal(box.cooldown, 2.5);
  const item = race.items.player.held;
  assert.equal(race.items.use(race), false); assert.equal(race.items.player.held, item);
  advanceItems(race, 1);
  const untouched = race.items.boxes[4];
  cross(race, untouched.distance - 10, untouched.distance + 10, untouched.lane);
  assert.equal(race.items.player.held, item); assert.equal(untouched.cooldown, 0);
  race.items.player.held = null;
  cross(race, box.distance - 20, box.distance + 20, box.lane);
  assert.equal(race.items.player.held, null);
  advanceItems(race, 2);
  cross(race, box.distance - 20, box.distance + 20, box.lane);
  assert.ok(race.items.player.held);
});

test('off-road, backward, and remote projection changes cannot collect a box', () => {
  const race = running(); const box = race.items.boxes[1];
  cross(race, box.distance - 10, box.distance + 10, track.roadWidth);
  assert.equal(race.items.player.held, null);
  cross(race, box.distance + 10, box.distance - 10, box.lane);
  assert.equal(race.items.player.held, null);
  race.placeOnTrack(box.distance - 5); race.position.x += 100;
  race.items.beginStep(STEP, race); race.distance = box.distance + 5; race.position.z -= 10;
  race.items.endStep(STEP, race);
  assert.equal(race.items.player.held, null);
});

test('first physical contact wins a contested box, regardless of player iteration order', () => {
  const race = running(); const box = race.items.boxes[1]; const rival = placeRival(race, 0, 90, 0);
  race.placeOnTrack(85); race.items.beginStep(STEP, race);
  race.placeOnTrack(100); rival.distance = 100; Object.assign(rival.position, track.position(100, 0));
  race.items.endStep(STEP, race);
  assert.ok(race.items.state(rival.id).held); assert.equal(race.items.player.held, null); assert.ok(box.cooldown > 0);
});

test('item boost accelerates without spending nitro, obeys brake priority and respects vehicle speed limits', () => {
  const boosted = running(); const normal = running();
  for (const race of [boosted, normal]) { race.placeOnTrack(-1000); race.speed = 12; race.nitro = 40; }
  equip(boosted, 'boost'); assert.equal(boosted.items.use(boosted), true);
  for (let i = 0; i < 60; i++) {
    boosted.update(STEP, { ...idleControls(), throttle: true }); normal.update(STEP, { ...idleControls(), throttle: true });
    assert.ok(boosted.speed * 3.6 <= boosted.vehicle.topSpeed);
  }
  assert.ok(boosted.speed > normal.speed + 10); assert.equal(boosted.nitro, 40);
  for (const control of ['brake', 'drift']) {
    const before = boosted.speed; boosted.update(STEP, { ...idleControls(), throttle: true, [control]: true });
    assert.ok(boosted.speed < before); assert.equal(boosted.boosting, false);
  }
  assert.equal(boosted.items.player.held, null);
});

test('ground pads trigger for both player and AI, with a cooldown against repeated farming', () => {
  const race = running(); const pad = race.items.pads[0];
  cross(race, pad.distance - 10, pad.distance + 10, pad.lane);
  assert.equal(race.items.player.boost, 1.4); assert.equal(race.items.player.padCooldown, 2);
  cross(race, pad.distance - 10, pad.distance + 10, pad.lane);
  assert.ok(race.items.player.boost < 1.4);
  const rival = placeRival(race, 0, pad.distance - 10, pad.lane);
  race.items.beginStep(STEP, race);
  placeRival(race, 0, pad.distance + 10, pad.lane); race.items.endStep(STEP, race);
  assert.equal(race.items.state(rival.id).boost, 1.4);
});

test('straight discs hit an opponent, while protection prevents repeated stun and shield absorbs one hit', () => {
  const race = running(); race.placeOnTrack(100); race.speed = 30;
  const rival = placeRival(race, 0, 125, 0);
  equip(race, 'disc'); race.items.use(race); advanceItems(race, 0.3);
  const state = race.items.state(rival.id);
  assert.ok(state.stun > 0); assert.ok(rival.speed < 10); assert.equal(race.items.projectiles.length, 0);
  const speed = rival.speed;
  equip(race, 'lightning'); race.items.use(race); assert.equal(rival.speed, speed);
  state.immunity = 0; state.shield = 7; state.stun = 0; rival.speed = 25;
  equip(race, 'disc'); race.items.use(race); advanceItems(race, 0.3);
  assert.equal(state.shield, 0); assert.equal(state.stun, 0); assert.equal(rival.speed, 25);
  advanceItems(race, 1); equip(race, 'disc'); race.items.use(race); advanceItems(race, 0.3);
  assert.ok(state.stun > 0);
});

test('a homing disc keeps its slot without a target and follows the nearest eligible forward rival across lanes', () => {
  const race = running(); race.placeOnTrack(100);
  equip(race, 'homing'); assert.equal(race.items.use(race), false); assert.equal(race.items.player.held, 'homing');
  const rival = placeRival(race, 0, 140, 4.2);
  placeRival(race, 1, 130, 0).finishTime = 1;
  placeRival(race, 2, 80, 0);
  assert.equal(race.items.use(race), true); assert.equal(race.items.projectiles[0].target, rival.id);
  advanceItems(race, 0.5);
  assert.ok(race.items.state(rival.id).stun > 0); assert.equal(race.items.projectiles.length, 0);
});

test('bananas land behind their owner, spare the owner initially, and trip following cars', () => {
  const race = running(); race.placeOnTrack(110);
  equip(race, 'banana'); race.items.use(race);
  assert.equal(race.items.traps[0].distance, 103);
  const rival = placeRival(race, 0, 96, 0);
  race.items.beginStep(STEP, race); placeRival(race, 0, 108, 0); race.items.endStep(STEP, race);
  assert.equal(race.items.traps.length, 0); assert.ok(race.items.state(rival.id).stun > 0);
  assert.equal(race.items.player.stun, 0);
});

test('AI lightning affects player handling and nearby drivers, respects shields and excludes finished or distant cars', () => {
  const race = running(); race.placeOnTrack(100); race.speed = 40;
  const attacker = placeRival(race, 0, 120, 0);
  const finished = placeRival(race, 1, 110, 4.2); finished.finishTime = 1;
  const far = race.opponents.cars[2];
  equip(race, 'lightning', attacker.id); race.items.use(race, attacker.id);
  assert.equal(race.speed, 16.8); assert.ok(race.items.player.stun > 0);
  assert.equal(finished.speed, 20); assert.equal(far.speed, 20); assert.equal(attacker.speed, 20);
  const before = race.speed; race.update(STEP, { ...idleControls(), throttle: true, nitro: true });
  assert.ok(race.speed < before); assert.equal(race.boosting, false);
  race.items.player.immunity = 0; race.items.player.stun = 0; race.speed = 25;
  equip(race, 'shield'); race.items.use(race);
  equip(race, 'lightning', attacker.id); race.items.use(race, attacker.id);
  assert.equal(race.items.player.shield, 0); assert.equal(race.speed, 25); assert.equal(race.items.player.stun, 0);
});

test('AI collects boxes through the actual race loop and spends its inventory after the reveal delay', () => {
  const race = running(); race.placeOnTrack(-1000);
  const rival = placeRival(race, 0, 90, 0);
  for (let i = 0; i < 30; i++) race.update(STEP, idleControls());
  const state = race.items.state(rival.id); assert.ok(state.held); assert.ok(state.roulette > 0);
  state.held = 'shield';
  for (let i = 0; i < 180; i++) race.update(STEP, idleControls());
  assert.equal(state.held, null); assert.ok(state.shield > 0);
});

test('pause and countdown freeze items, active runs reject invalid use, recovery clears stun, and restart resets the entire field', () => {
  const race = running(); race.placeOnTrack(100); equip(race, 'disc'); race.items.use(race);
  equip(race, 'shield'); race.items.use(race); equip(race, 'boost');
  race.items.player.stun = 1; race.items.boxes[0].cooldown = 2;
  const snapshot = () => JSON.stringify({ player: race.items.player, box: race.items.boxes[0], projectiles: race.items.projectiles });
  race.pause(); const paused = snapshot(); race.update(1, idleControls());
  assert.equal(snapshot(), paused); assert.equal(race.items.use(race), false);
  race.resume(); assert.equal(race.items.use(race), false);
  race.recover(); assert.equal(race.items.player.stun, 0); assert.ok(race.items.player.immunity > 0);
  race.start(); assert.equal(race.items.projectiles.length, 0); assert.equal(race.items.traps.length, 0);
  assert.equal(race.items.boxes[0].cooldown, 0);
  for (const state of race.items.states.values()) { assert.equal(state.held, null); assert.equal(state.shield, 0); assert.equal(state.immunity, 0); }
  equip(race, 'boost'); const countdown = snapshot(); race.update(STEP, idleControls());
  assert.equal(snapshot(), countdown); assert.equal(race.items.use(race), false);
});

test('classic mode has no pickups, attacks, boost pads or item effects', () => {
  const race = running(); race.mode = 'classic';
  const box = race.items.boxes[1]; cross(race, box.distance - 10, box.distance + 10, 0);
  assert.equal(race.items.player.held, null);
  equip(race, 'boost'); assert.equal(race.items.use(race), false);
  race.items.player.boost = 3; race.items.player.stun = 1;
  const normal = new Race(track); normal.phase = 'racing';
  for (const car of [race, normal]) { car.placeOnTrack(-1000); car.speed = 12; car.update(STEP, { ...idleControls(), throttle: true }); }
  assert.equal(race.speed, normal.speed); assert.equal(race.boosting, false);
});

test('item objects have bounded counts and expire without leaving stale collisions', () => {
  const race = running(); race.placeOnTrack(100);
  for (let i = 0; i < 50; i++) {
    equip(race, 'disc'); race.items.use(race); equip(race, 'banana'); race.items.use(race);
  }
  assert.equal(race.items.projectiles.length, MAX_PROJECTILES); assert.equal(race.items.traps.length, MAX_TRAPS);
  race.items.beginStep(25, race); race.items.endStep(25, race);
  assert.equal(race.items.projectiles.length, 0); assert.equal(race.items.traps.length, 0);
});

test('rank-weighted lottery offers every item and gives trailing racers more recovery options', () => {
  const count = (rank: number) => {
    const totals = Object.fromEntries(ITEM_KINDS.map(kind => [kind, 0]));
    for (let i = 0; i < 1000; i++) totals[rollItem(rank, (i + 0.5) / 1000)]++;
    return totals;
  };
  const front = count(1); const rear = count(6);
  for (const kind of ITEM_KINDS) assert.ok(front[kind] > 0 && rear[kind] > 0);
  for (const kind of ['boost', 'homing', 'lightning']) assert.ok(rear[kind] > front[kind]);
  assert.ok(front.banana > rear.banana); assert.ok(front.shield > rear.shield);
});

test('item timers, collision and speed stay deterministic across paint rates', () => {
  const outcomes = [30, 60, 144].map(hz => {
    const race = running(); race.placeOnTrack(90); race.speed = 20;
    equip(race, 'boost'); race.items.use(race);
    const timeline = new RaceTimeline(race);
    for (let i = 0; i < hz * 2; i++) timeline.advance(1 / hz, { ...idleControls(), throttle: true });
    return { position: race.position, speed: race.speed, state: race.items.player, boxes: race.items.boxes };
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});

test('item records are isolated from classic and legacy records', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>([['dustline-best-v2-club-manual', '123']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const classic = new Race(new Track()); const items = new Race(classic.track); items.mode = 'items';
  assert.equal(bestTime(classic), 123); assert.equal(bestTime(items), null);
  assert.equal(saveRecord(140, items), true); assert.equal(bestTime(items), 140); assert.equal(bestTime(classic), 123);
  saveRecord(110, classic); assert.equal(bestTime(classic), 110); assert.equal(bestTime(items), 140);
  assert.equal(saveRecord(145, items), false);
});
