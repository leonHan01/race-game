import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDURANCE_STAGES, ENDURANCE_DOWNHILL_STAGES } from '../src/content/endurance-stages.ts';
import { ADVENTURE_STAGES } from '../src/content/adventure-stages.ts';
import { STAGES, DOWNHILL_STAGES, getStage } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { stageElevation } from '../src/ui/stage-elevation.ts';

const stages = [...ENDURANCE_STAGES, ...ENDURANCE_DOWNHILL_STAGES];

test('fourteen distinct long courses are selectable with frequent corners throughout every sector', () => {
  assert.equal(stages.length, 14);
  const catalogue = [...STAGES, ...DOWNHILL_STAGES];
  assert.equal(new Set(catalogue.map(stage => stage.id)).size, catalogue.length);
  assert.equal(new Set(catalogue.map(stage => stage.number)).size, catalogue.length);
  assert.equal(new Set(stages.map(stage => JSON.stringify(stage.points))).size, stages.length);
  for (const stage of stages) {
    assert.equal(getStage(stage.id), stage);
    assert.ok((stage.downhill ? DOWNHILL_STAGES : STAGES).includes(stage));
    const track = new Track(stage);
    assert.ok(track.length >= 14000 && track.length <= 18000, `${stage.id}: insufficient endurance distance`);
    assert.ok(track.notes.length >= 30, `${stage.id}: too few corner callouts`);
    for (let sector = 0; sector < 5; sector++) {
      const notes = track.notes.filter(note => note.distance >= track.length * sector / 5 && note.distance < track.length * (sector + 1) / 5);
      assert.ok(notes.length >= 4, `${stage.id}: sector ${sector + 1} needs linked corners`);
      assert.ok(notes.some(note => note.direction === 'left') && notes.some(note => note.direction === 'right'));
    }
  }
});

test('long routes have unambiguous progress, usable road edges and clearance between distant sections', () => {
  for (const stage of [...stages, ...ADVENTURE_STAGES]) {
    const track = new Track(stage);
    const clearance = track.shoulderEdge * 2 + 6;
    const cells = new Map<string, { x: number; z: number; distance: number }[]>();
    for (let d = 0; d < track.length; d += 10) {
      const p = track.position(d);
      // A bend tighter than the road half-width folds the road ribbon over itself.
      assert.ok(Math.abs(track.curvature(d)) * track.shoulderEdge < 0.75, `${stage.id}: folded road edge at ${d}`);
      for (const lane of [-track.roadWidth / 2, 0, track.roadWidth / 2]) {
        const edge = track.position(d, lane); const projected = track.project(edge.x, edge.z, d);
        // Offset lanes can project onto a neighbouring chord of the sampled spline.
        assert.ok(Math.abs(projected.distance - d) < (lane === 0 ? 0.01 : 1.5), `${stage.id}: ambiguous lane at ${d}/${lane}`);
      }
      const x = Math.floor(p.x / clearance); const z = Math.floor(p.z / clearance);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const other of cells.get(`${x + dx},${z + dz}`) ?? []) {
          const separation = d - other.distance;
          if (separation < 80 || (track.closed && track.length - separation < 80)) continue;
          assert.ok(Math.hypot(p.x - other.x, p.z - other.z) > clearance, `${stage.id}: overlapping sections at ${d}/${other.distance}`);
        }
      }
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push({ ...p, distance: d });
    }
  }
});

test('endurance jumps leave a nearly straight approach, flight path and landing runout', () => {
  for (const stage of [...ENDURANCE_STAGES, ...ADVENTURE_STAGES].filter(stage => stage.jumps)) {
    const track = new Track(stage);
    for (const crest of stage.jumps!) {
      const entry = track.sample(crest.distance - crest.approach - 25);
      for (let d = crest.distance - crest.approach - 25; d < crest.distance + crest.landing + 120; d += 5) {
        const frame = track.sample(d);
        assert.ok(Math.abs(track.curvature(d)) < 0.002, `${stage.id}/${crest.distance}: jump on a corner`);
        const cross = (frame.x - entry.x) * entry.rx + (frame.z - entry.z) * entry.rz;
        assert.ok(Math.abs(cross) < track.roadWidth / 4, `${stage.id}/${crest.distance}: landing leaves the flight path`);
      }
    }
  }
});

test('five adventure courses add distinct long layouts, three circuits and a circuit with jumps', () => {
  assert.equal(ADVENTURE_STAGES.length, 5);
  assert.equal(ADVENTURE_STAGES.filter(stage => stage.closed).length, 3);
  assert.equal(ADVENTURE_STAGES.filter(stage => stage.closed && stage.jumps?.length === 3).length, 1);
  assert.equal(new Set(ADVENTURE_STAGES.map(stage => JSON.stringify(stage.points))).size, 5);
  for (const stage of ADVENTURE_STAGES) {
    assert.equal(getStage(stage.id), stage);
    assert.ok(STAGES.includes(stage));
    const track = new Track(stage);
    assert.ok(track.length >= 14000 && track.length <= 18000, stage.id);
    assert.ok(track.notes.length >= 30, `${stage.id}: too few corner callouts`);
  }
});

test('the spiral climbs through multiple full turns and tall courses show their elevation', () => {
  const track = new Track(getStage('corkscrew-pass'));
  let rotation = 0;
  for (let i = 1; i < track.points.length; i++) {
    const a = track.points[i - 1]; const b = track.points[i];
    rotation += Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
    assert.ok(b.y > a.y, 'spiral must keep climbing');
  }
  assert.ok(rotation > Math.PI * 4.5, 'spiral needs more than two complete coils');
  assert.equal(track.points.at(-1)!.y - track.points[0].y, 410);
  for (const id of ['corkscrew-pass', 'canyon-staircase']) {
    const preview = stageElevation(new Track(getStage(id)));
    assert.match(preview, /山路起伏 · 海拔剖面/);
    assert.doesNotMatch(preview, /NaN|undefined|处跳台/);
  }
});

test('endpoint rays cannot steal spiral road positions and explicit runout poses still project', () => {
  const track = new Track(getStage('corkscrew-pass'));
  for (const distance of [3880, 3890, 7800, 11000]) for (const lane of [-10.8, 0, 10.8]) {
    const p = track.position(distance, lane);
    for (const reference of [undefined, distance]) {
      const projected = track.project(p.x, p.z, reference);
      assert.ok(Math.abs(projected.distance - distance) < 1.5);
      assert.ok(projected.distance >= 0 && projected.distance <= track.length);
    }
  }
  for (const distance of [-3000, -1000, -40, -0.1, track.length + 0.1, track.length + 40]) {
    const p = track.position(distance);
    assert.ok(Math.abs(track.project(p.x, p.z, distance).distance - distance) < 0.01, `runout ${distance}`);
  }
});
