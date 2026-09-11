import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SkidMarks } from '../src/render/skid-marks.ts';

// Geometry-only checks: no canvas, renderer, browser, or WebGL context is created.
test('gravel marks reuse a bounded buffer and fade out with race time', () => {
  const marks = new SkidMarks();
  const left = new Vector3(-1, 0, 0); const right = new Vector3(1, 0, 0);
  for (let i = 0; i < 1000; i++) {
    left.z = right.z = -i;
    marks.update(left, right, 1, i / 60);
  }
  assert.equal(marks.mesh.geometry.drawRange.count, 256 * 6);
  assert.equal(marks.mesh.geometry.getAttribute('position').count, 256 * 6);
  assert.ok(Array.from(marks.mesh.geometry.getAttribute('position').array).every(Number.isFinite));
  marks.update(left, right, 0, 1000 / 60 + 8);
  const colors = marks.mesh.geometry.getAttribute('color');
  for (let i = 0; i < colors.count; i++) assert.equal(colors.getW(i), 0);
  marks.reset(); assert.equal(marks.mesh.geometry.drawRange.count, 0);
  marks.mesh.geometry.dispose(); marks.mesh.material.dispose();
});

test('paused contacts and rescue jumps do not create connecting tyre marks', () => {
  const marks = new SkidMarks();
  marks.update(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), 1, 0);
  marks.update(new Vector3(-1, 0, -1), new Vector3(1, 0, -1), 1, 0.1);
  const count = marks.mesh.geometry.drawRange.count;
  assert.equal(count, 12);
  marks.update(new Vector3(-1, 0, -2), new Vector3(1, 0, -2), 1, 0.1);
  assert.equal(marks.mesh.geometry.drawRange.count, count);
  marks.update(new Vector3(-1, 0, -100), new Vector3(1, 0, -100), 1, 0.2);
  assert.equal(marks.mesh.geometry.drawRange.count, count);
  marks.update(new Vector3(-1, 0, -101), new Vector3(1, 0, -101), 0, 0.3);
  marks.update(new Vector3(8, 0, -103), new Vector3(10, 0, -103), 1, 0.4);
  assert.equal(marks.mesh.geometry.drawRange.count, count);
  marks.mesh.geometry.dispose(); marks.mesh.material.dispose();
});
