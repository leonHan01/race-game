import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, getStage } from '../src/content/stages.ts';
import { VEHICLES } from '../src/content/vehicles.ts';
import { Track } from '../src/simulation/track.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { GRAVITY, VerticalMotion } from '../src/simulation/vertical-motion.ts';
import { RaceTimeline } from '../src/presentation.ts';
import { stageElevation } from '../src/ui/stage-elevation.ts';

const STEP = 1 / 60;
const jumpStages = STAGES.filter(stage => stage.jumps?.length);
const throttle = { ...idleControls(), throttle: true };

function jumpRace(stage = jumpStages[0], vehicle = VEHICLES[1]) {
  const track = new Track(stage); const race = new Race(track, vehicle);
  race.phase = 'racing'; race.placeOnTrack(stage.jumps![0].distance - stage.jumps![0].approach - 8); race.speed = 45;
  return race;
}
function takeOff(race: Race) {
  for (let i = 0; i < 180 && !race.airborne; i++) race.update(STEP, throttle);
  assert.ok(race.airborne, `${race.stageId}/${race.vehicleId} never left the ramp`);
}

test('three new outdoor stages have complete, smooth crests and safe runouts before the finish', () => {
  assert.deepEqual(jumpStages.map(stage => stage.id), ['meadow', 'quarry', 'skyline']);
  for (const stage of jumpStages) {
    const track = new Track(stage); const base = new Track({ ...stage, jumps: [] });
    assert.ok(!stage.venue && track.length > 2000 && track.notes.length >= 2);
    const elevations = Array.from({ length: 301 }, (_, i) => track.sample(track.length * i / 300).y);
    assert.ok(Math.max(...elevations) - Math.min(...elevations) > 20);
    for (const crest of stage.jumps!) {
      assert.ok(crest.distance - crest.approach > 100);
      assert.ok(track.length - crest.distance - crest.landing > 250, 'leave braking space after landing');
      assert.ok(Math.abs(track.sample(crest.distance).y - base.sample(crest.distance).y - crest.height) < 1e-8);
      for (const d of [crest.distance - crest.approach, crest.distance, crest.distance + crest.landing]) {
        assert.ok(Math.abs(track.sample(d + 0.001).y - track.sample(d - 0.001).y) < 0.002);
      }
    }
    const preview = stageElevation(track);
    assert.ok(preview.includes(`${stage.jumps!.length} 处跳台`) && !preview.includes('NaN'));
    assert.equal((preview.match(/<circle /g) ?? []).length, stage.jumps!.length);
  }
  assert.equal(stageElevation(new Track()), '');
});

test('every crest is passable slowly, while greater entry speed increases airtime and height', () => {
  for (const stage of jumpStages) for (const crest of stage.jumps!) {
    const track = new Track(stage);
    const drive = (speed: number) => {
      const flight = new VerticalMotion(); let d = crest.distance - crest.approach - 12; let peak = 0;
      flight.reset(track.sample(d).y);
      while (d < crest.distance + 300) {
        const before = d; d += speed * STEP;
        flight.update(STEP, { height: track.sample(d).y, speed,
          launchVelocity: track.grade(before, 1.3) * speed, groundVelocity: track.grade(d, 1.3) * speed,
          pitch: Math.atan(track.grade(d, 1.3)) });
        peak = Math.max(peak, flight.clearance);
        assert.ok(flight.height >= track.sample(d).y - 1e-9);
      }
      return { flight, peak };
    };
    const slow = drive(8); const medium = drive(30); const fast = drive(45);
    assert.equal(slow.flight.jumpCount, 0, `${stage.id}/${crest.distance}: slow car must stay grounded`);
    assert.ok(medium.flight.lastAirTime > 0.8);
    assert.ok(fast.flight.lastAirTime > medium.flight.lastAirTime + 0.3);
    assert.ok(fast.peak > medium.peak + 1.5);
    assert.equal(fast.flight.jumpCount, 1, 'landing must not bounce into another jump');
    assert.equal(fast.flight.airborne, false);
  }
});

test('free flight follows gravity and lands without penetration or a second bounce', () => {
  const flight = new VerticalMotion(); flight.reset(0);
  const ground = { height: 0, launchVelocity: 6, groundVelocity: 0, pitch: 0, speed: 40 };
  for (let i = 1; i <= 60; i++) {
    flight.update(STEP, ground);
    assert.ok(Math.abs(flight.height - (6 * i * STEP - GRAVITY * (i * STEP) ** 2 / 2)) < 1e-9);
    assert.ok(Math.abs(flight.velocity - (6 - GRAVITY * i * STEP)) < 1e-9);
  }
  for (let i = 0; i < 240; i++) flight.update(STEP, { ...ground, launchVelocity: 0 });
  assert.equal(flight.airborne, false); assert.equal(flight.height, 0); assert.equal(flight.jumpCount, 1);
  assert.ok(Math.abs(flight.lastAirTime - 12 / GRAVITY) < STEP);
});

test('isolated millimetre sampling gaps do not flicker into airborne mode', () => {
  const flight = new VerticalMotion(); flight.reset(0);
  for (let i = 0; i < 180; i++) {
    flight.update(STEP, { height: 0, launchVelocity: i % 3 === 0 ? 0.13 : 0, groundVelocity: 0, pitch: 0, speed: 50 });
    assert.equal(flight.airborne, false); assert.equal(flight.height, 0);
  }
  assert.equal(flight.jumpCount, 0);
});

test('an airborne finish preserves height instead of snapping the vehicle onto the road', () => {
  const race = jumpRace(); const distance = race.track.length - 0.1;
  race.placeOnTrack(distance); race.speed = 45;
  race.splits = [1, 2, 3, 4].map(total => ({ time: 1, total, delta: 0 })); race.elapsed = 4;
  race.position.y += 5; race.vertical.height = race.position.y; race.vertical.clearance = 5;
  race.vertical.airborne = true; race.vertical.velocity = -1;
  const height = race.position.y; const timeline = new RaceTimeline(race);
  timeline.advance(STEP, idleControls());
  assert.equal(race.phase, 'finished'); assert.ok(Math.abs(race.position.y - height) < 0.02);
  const frozen = JSON.stringify(timeline.pose); timeline.advance(10, throttle);
  assert.equal(JSON.stringify(timeline.pose), frozen);
});

test('all cars and motorcycles take off and land through the production race simulation', () => {
  for (const stage of jumpStages) for (const vehicle of VEHICLES) {
    const race = jumpRace(stage, vehicle); const heading = race.heading;
    takeOff(race); let peak = 0;
    for (let i = 0; i < 360 && race.airborne; i++) {
      race.update(STEP, throttle); peak = Math.max(peak, race.airHeight);
      assert.ok(race.position.y >= race.track.surfaceHeight(race.position.x, race.position.z) - 1e-8);
      assert.ok(race.speed * 3.6 <= vehicle.topSpeed + 1e-9);
      assert.ok(Math.abs(race.heading - heading) < 1e-9, 'no automatic steering on jumps');
    }
    assert.ok(peak > 3, `${stage.id}/${vehicle.id}: jump should be visible`);
    assert.equal(race.airborne, false);
    assert.ok(race.vertical.lastAirTime > 1);
    assert.equal(race.integrity, 100, 'normal landings do not add damage or shake');
  }
});

test('airborne tyre inputs preserve flight momentum and cannot earn or spend drift nitro', () => {
  const race = jumpRace(); takeOff(race);
  for (let i = 0; i < 15; i++) race.update(STEP, throttle);
  assert.ok(race.airHeight > 0.5);
  race.nitro = 50;
  const heading = race.heading; const travel = race.travelHeading; const velocity = race.vertical.velocity; const speed = race.speed;
  race.update(STEP, { ...throttle, steering: 1, drift: true, nitro: true, brake: true });
  assert.equal(race.heading, heading); assert.equal(race.travelHeading, travel);
  assert.ok(Math.abs(race.vertical.velocity - velocity + GRAVITY * STEP) < 1e-9);
  assert.ok(Math.abs(race.speed - speed) < 0.05);
  assert.equal(race.rearWheelSlip, 0); assert.equal(race.nitro, 50); assert.equal(race.drifting, false);
});

test('airborne pause, rescue and restart keep the shared simulation and interpolated pose consistent', () => {
  const race = jumpRace(); takeOff(race); const timeline = new RaceTimeline(race);
  timeline.advance(0.025, throttle); race.pause();
  const flight = JSON.stringify(race.vertical); const pose = JSON.stringify(timeline.pose);
  timeline.advance(5, throttle); assert.equal(JSON.stringify(race.vertical), flight); assert.equal(JSON.stringify(timeline.pose), pose);
  race.resume(); timeline.advance(STEP, throttle); assert.notEqual(JSON.stringify(race.vertical), flight);
  race.recover(); timeline.reset();
  assert.equal(race.airborne, false); assert.equal(race.airHeight, 0); assert.equal(race.vertical.velocity, 0);
  assert.equal(race.penalty, 5); assert.deepEqual(timeline.pose.position, race.position);
  assert.equal(timeline.pose.cameraHeight, race.position.y);
  race.start(); timeline.reset(); assert.equal(race.vertical.jumpCount, 0); assert.equal(race.airborne, false);
  assert.ok(race.opponents.cars.every(car => !car.airborne && car.vertical.jumpCount === 0));
});

test('all five rivals jump and finish each new stage with cars and motorcycles', () => {
  for (const stage of jumpStages) for (const vehicle of [VEHICLES[1], VEHICLES.find(v => v.mode === 'motorcycle')!]) {
    const race = new Race(new Track(stage), vehicle); race.phase = 'racing'; race.placeOnTrack(-1000, 50);
    for (let i = 0; i < 180 * 60 && race.opponents.cars.some(car => car.finishTime === null); i++) race.update(STEP, idleControls());
    for (const car of race.opponents.cars) {
      assert.ok(car.vertical.jumpCount >= stage.jumps!.length, `${stage.id}/${car.id}: missed crests`);
      assert.ok(car.finishTime !== null, `${stage.id}/${car.id}: did not finish`);
      assert.equal(car.airborne, false, 'finish arch follows a safe landing runout');
    }
  }
});

test('existing outdoor and indoor stages retain their original grounded handling', () => {
  for (const stage of STAGES.filter(stage => !stage.jumps)) {
    const race = new Race(new Track(stage)); race.phase = 'racing'; race.speed = 65;
    for (let i = 0; i < 240; i++) race.update(STEP, throttle);
    assert.equal(race.airborne, false); assert.equal(race.pitch, 0);
    assert.equal(race.position.y, race.track.surfaceHeight(race.position.x, race.position.z));
  }
});

test('jumps above ground items do not collect pads or hit traps, and landing restores contact', () => {
  for (const height of [0, 5]) {
    const race = new Race(new Track(getStage('meadow'))); race.mode = 'items'; race.phase = 'racing';
    const pad = race.items.pads[0]; race.placeOnTrack(pad.distance - 3, pad.lane);
    race.vertical.clearance = height; race.vertical.airborne = height > 0; race.position.y += height;
    race.items.traps.push({ id: 987, owner: 'rival-1', distance: pad.distance, lane: pad.lane,
      life: 20, position: { ...pad.position } });
    race.items.beginStep(STEP, race);
    Object.assign(race.position, race.track.position(pad.distance + 3, pad.lane)); race.position.y += height;
    race.distance = pad.distance + 3;
    race.items.endStep(STEP, race);
    assert.equal(race.items.player.stun > 0, height === 0);
    assert.equal(race.items.player.padCooldown > 0, height === 0);
  }
});
