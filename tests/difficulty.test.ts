import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as difficulties from '../src/content/difficulties.ts';
import * as stages from '../src/content/stages.ts';
import * as vehicles from '../src/content/vehicles.ts';
import { difficultySetting } from '../src/ui/ui.ts';
import { Race, idleControls } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';

const settingsCode = ts.transpileModule(readFileSync(new URL('../src/settings.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function storedSettings(saved: unknown, values = new Map<string, string>()) {
  values.set('dustline-settings', JSON.stringify(saved));
  const imports: Record<string, unknown> = {
    './content/difficulties': difficulties, './content/stages': stages, './content/vehicles': vehicles,
  };
  const context = vm.createContext({ exports: {}, require: (id: string) => imports[id], localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  vm.runInContext(settingsCode, context);
  return { module: context.exports as typeof import('../src/settings.ts'), values };
}

test('three difficulty choices load, save and describe the selected level, including old preferences', () => {
  for (const [saved, expected] of [
    ['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard'], ['club', 'medium'], ['pro', 'hard'],
    ['invalid', 'medium'], [null, 'medium'],
  ] as const) {
    const { module, values } = storedSettings({ difficulty: saved });
    assert.equal(module.settings.difficulty, expected);
    module.saveSettings();
    assert.equal(JSON.parse(values.get('dustline-settings')!).difficulty, expected);
    const markup = difficultySetting(module.settings.difficulty);
    assert.equal((markup.match(/<option /g) ?? []).length, 3);
    assert.equal((markup.match(/ selected/g) ?? []).length, 1);
    assert.match(markup, new RegExp(`value="${expected}" selected`));
    for (const label of ['简单', '中等', '困难']) assert.ok(markup.includes(label));
    assert.ok(markup.includes(difficulties.difficultyProfile(expected).description));
  }
  assert.equal(storedSettings(null).module.settings.difficulty, 'medium');
  assert.equal(new Race(new Track()).difficulty, 'medium');
});

test('legacy records map only to their matching difficulty and retain mode, vehicle and stage separation', () => {
  const { module, values } = storedSettings({});
  const medium = { difficulty: 'medium' as const, autoThrottle: false };
  const hard = { ...medium, difficulty: 'hard' as const };
  const easy = { ...medium, difficulty: 'easy' as const };
  values.set('dustline-best-v2-club-manual', '130');
  values.set('dustline-best-v2-pro-manual', '140');
  assert.equal(module.bestTime(medium), 130); assert.equal(module.bestTime(hard), 140);
  assert.equal(module.bestTime(easy), null);
  values.set('dustline-best-v3-pine-falcon-club-manual', '125');
  assert.equal(module.bestTime(medium), 125);
  assert.equal(module.bestTime({ ...medium, autoThrottle: true }), null);
  for (const [mode, stageId, vehicleId] of [
    ['items', 'alpine', 'apex'], ['downhill', stages.DOWNHILL_STAGE.id, 'longboard'],
  ] as const) {
    const category = { ...hard, mode, stageId, vehicleId };
    values.set(`dustline-best-v3-${stageId}-${vehicleId}-pro-manual-${mode}`, '190');
    assert.equal(module.bestTime(category), 190);
    assert.equal(module.bestTime({ ...category, difficulty: 'medium' }), null);
    assert.equal(module.bestTime({ ...category, difficulty: 'easy' }), null);
    assert.ok(module.saveRecord(180, category));
    assert.equal(module.bestTime(category), 180);
  }
  assert.ok(module.saveRecord(120, medium));
  assert.ok(module.saveRecord(160, easy));
  assert.equal(module.bestTime(medium), 120); assert.equal(module.bestTime(easy), 160);
  assert.equal(module.bestTime(hard), 140);
  assert.equal(values.get('dustline-best-v3-pine-falcon-club-manual'), '125');
});

test('higher difficulty reduces grip without adding steering assistance', () => {
  const slip = difficulties.DIFFICULTIES.map(({ id }) => {
    const race = new Race(new Track()); race.difficulty = id; race.phase = 'racing';
    race.placeOnTrack(-1000); race.speed = 30;
    for (let tick = 0; tick < 25; tick++) race.update(1 / 60, { ...idleControls(), steering: 1 });
    return Math.abs(race.heading - race.travelHeading);
  });
  assert.ok(slip[0] < slip[1] && slip[1] < slip[2]);
});
