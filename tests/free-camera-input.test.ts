import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setMaxListeners } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';
import type { FreeCameraInput } from '../src/free-camera-input.ts';
import { idleCameraControls } from '../src/render/free-camera.ts';

class Element extends EventTarget {
  dataset = { cameraKey: 'KeyE' };
  classes = new Set<string>();
  classList = { add: (key: string) => this.classes.add(key), remove: (key: string) => this.classes.delete(key),
    toggle: (key: string, value: boolean) => value ? this.classes.add(key) : this.classes.delete(key) };
  setPointerCapture(_id: number) {}
  closest() { return null; }
}
const source = ts.transpileModule(readFileSync(new URL('../src/free-camera-input.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup() {
  const window = new EventTarget(); const document = Object.assign(new EventTarget(), { hidden: false, querySelectorAll: () => [button] });
  const canvas = new Element(); const button = new Element();
  class Events extends AbortController { constructor() { super(); setMaxListeners(100, this.signal); } }
  const context = vm.createContext({ window, document, HTMLElement: Element, AbortController: Events, exports: {}, require: () => ({ idleCameraControls }) });
  vm.runInContext(source, context);
  const input: FreeCameraInput = new context.exports.FreeCameraInput(canvas);
  return { input, window, document, canvas, button };
}
function dispatch(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
}

test('free-flight keyboard is gated, combines movement and clears on blur, disable and dispose', () => {
  const { input, window } = setup();
  assert.equal(dispatch(window, 'keydown', { code: 'KeyW' }).defaultPrevented, false);
  assert.equal(input.read().forward, 0); input.setEnabled(true);
  for (const code of ['KeyW', 'KeyD', 'KeyE', 'ShiftLeft']) dispatch(window, 'keydown', { code });
  assert.equal(input.read().forward, 1); assert.equal(input.read().right, 1); assert.equal(input.read().up, 1); assert.equal(input.read().fast, true);
  dispatch(window, 'blur'); assert.deepEqual({ ...input.read() }, idleCameraControls());
  dispatch(window, 'keydown', { code: 'KeyW' }); input.setEnabled(false); input.setEnabled(true);
  assert.equal(input.read().forward, 0);
  input.dispose(); assert.equal(dispatch(window, 'keydown', { code: 'KeyW' }).defaultPrevented, false);
});

test('canvas drag and wheel are consumed once; pointer cancellation stops rotation', () => {
  const { input, canvas } = setup(); input.setEnabled(true);
  dispatch(canvas, 'pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 120, clientY: 90 });
  dispatch(canvas, 'wheel', { deltaY: -50, deltaMode: 0 });
  const controls = input.read(); assert.equal(controls.lookX, 20); assert.equal(controls.lookY, -10); assert.equal(controls.lift, 7.5);
  assert.equal(input.read().lookX, 0); assert.equal(input.read().lift, 0);
  dispatch(canvas, 'pointercancel', { pointerId: 1 }); dispatch(canvas, 'pointermove', { pointerId: 1, clientX: 180, clientY: 90 });
  assert.equal(input.read().lookX, 0); input.dispose();
});

test('touch elevation holds release on capture loss and native keyboard activation works', () => {
  const { input, button } = setup(); input.setEnabled(true);
  dispatch(button, 'pointerdown', { button: 0, pointerId: 2 }); assert.equal(input.read().up, 1);
  dispatch(button, 'lostpointercapture', { pointerId: 2 }); assert.equal(input.read().up, 0);
  dispatch(button, 'keydown', { code: 'Enter' }); assert.equal(input.read().up, 1);
  dispatch(button, 'keyup', { code: 'Enter' }); assert.equal(input.read().up, 0); input.dispose();
});
