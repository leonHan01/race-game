import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, DOWNHILL_STAGE, DOWNHILL_STAGES, getStage } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { Race } from '../src/simulation/race.ts';

// Metres measured before the requested 100% increase, including the closed indoor circuits.
const originalLengths: Record<string, number> = {
  valley: 1971.3632149367247,
  pine: 4093.8350337075017,
  canyon: 4536.624722144405,
  alpine: 5415.029528587961,
  hangar: 1308.8255378666715,
  dome: 1560.335619432014,
  depot: 1382.605195064009,
  meadow: 2390.298122251487,
  quarry: 3203.7137352181376,
  skyline: 3349.0432830950076,
  'ridge-descent': 2620.48945644463,
  'bamboo-descent': 2044.2800817948876,
  'sunset-descent': 2937.145722819863,
  'maple-descent': 2869.4781661513384,
  'canyon-descent': 2981.2305490498734,
  'mist-descent': 4032.026996777672,
};

test('the original routes retain twice their original physical distance and target time', () => {
  const stages = [...STAGES, ...DOWNHILL_STAGES];
  assert.equal(DOWNHILL_STAGE, DOWNHILL_STAGES[0]);
  for (const id of Object.keys(originalLengths)) {
    const stage = stages.find(stage => stage.id === id)!;
    assert.ok(stage, `${id}: original route missing`);
    assert.equal(getStage(stage.id), stage);
    const track = new Track(stage); const race = new Race(track);
    assert.ok(Math.abs(track.length - originalLengths[stage.id] * 2) < 1e-7, `${stage.id}: must grow by exactly 100%`);
    assert.ok(Math.abs(race.targetTime - originalLengths[stage.id] * 2 / stage.goldSpeed) < 1e-7);
    // Measure the sampled world geometry as well as the reported race distance.
    const length = track.points.slice(1).reduce((sum, point, i) => sum
      + Math.hypot(point.x - track.points[i].x, point.z - track.points[i].z), 0);
    assert.ok(Math.abs(length - originalLengths[stage.id] * 2) < 1e-7);
  }
});

test('jump centres remain at the same fraction of the extended routes', () => {
  const originalCentres: Record<string, number[]> = { meadow: [300, 1070, 1810], quarry: [300, 1110, 1940, 2670], skyline: [280, 1240, 2110, 2990] };
  for (const [id, centres] of Object.entries(originalCentres)) {
    const track = new Track(getStage(id));
    assert.equal(track.definition.jumps!.length, centres.length);
    track.definition.jumps!.forEach((crest, i) => {
      assert.ok(Math.abs(crest.distance / track.length - centres[i] / originalLengths[id]) < 1e-10);
    });
  }
});
