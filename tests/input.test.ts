import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { Input } from '../src/input.ts';
import { idleControls } from '../src/simulation/race.ts';
import { Race } from '../src/simulation/race.ts';
import { Track } from '../src/simulation/track.ts';
import { DOWNHILL_STAGE } from '../src/content/stages.ts';
import { LONGBOARD, getVehicle } from '../src/content/vehicles.ts';

class Button extends EventTarget {
  disabled = false;
  dataset: { control: string };
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, active: boolean) => active ? this.classes.add(name) : this.classes.delete(name),
  };
  constructor(control: string) { super(); this.dataset = { control }; }
  setPointerCapture(_id: number) {}
  closest(_selector: string) { return null; }
}

const source = ts.transpileModule(readFileSync(new URL('../src/input.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  const window = new EventTarget();
  const nitro = new Button('Nitro'); const throttle = new Button('ArrowUp'); const steer = new Button('ArrowLeft');
  const standup = new Button('Standup'); const slide = new Button('Space');
  const buttons = [nitro, throttle, steer, standup, slide];
  const context = vm.createContext({
    window, HTMLElement: Button, exports: {}, require: () => ({ idleControls }),
    document: { querySelectorAll: (selector: string) => buttons.filter(button => !selector.includes('.pressed') || button.classes.has('pressed')) },
  });
  vm.runInContext(source, context);
  const input: Input = new context.exports.Input(); input.enabled = true;
  return { window, input, nitro, throttle, steer, standup, slide };
}

function dispatch(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

test('either Shift key holds boost, releasing one preserves the other, and blur clears input', () => {
  const { window, input } = setup();
  assert.equal(dispatch(window, 'keydown', { code: 'ShiftLeft' }).defaultPrevented, true);
  assert.equal(input.read().nitro, true);
  dispatch(window, 'keydown', { code: 'ShiftRight' });
  dispatch(window, 'keyup', { code: 'ShiftLeft' }); assert.equal(input.read().nitro, true);
  dispatch(window, 'keyup', { code: 'ShiftRight' }); assert.equal(input.read().nitro, false);
  dispatch(window, 'keydown', { code: 'ShiftLeft' }); dispatch(window, 'blur');
  assert.deepEqual({ ...input.read() }, idleControls());
});

test('nitro pointer holds combine with throttle and steering and release cleanly outside the button', () => {
  const { input, nitro, throttle, steer } = setup();
  for (const [button, pointerId] of [[nitro, 1], [throttle, 2], [steer, 3]] as const) {
    dispatch(button, 'pointerdown', { pointerId, button: 0 });
  }
  assert.deepEqual({ ...input.read() }, { ...idleControls(), nitro: true, throttle: true, steering: -1 });
  dispatch(nitro, 'lostpointercapture', { pointerId: 1 });
  assert.equal(input.read().nitro, false); assert.equal(input.read().throttle, true);
  assert.equal(nitro.classes.has('pressed'), false);
  dispatch(throttle, 'pointercancel', { pointerId: 2 }); dispatch(steer, 'pointerup', { pointerId: 3 });
  assert.deepEqual({ ...input.read() }, idleControls());
});

test('multiple touches on nitro retain the hold until the last release and clear removes all holds', () => {
  const { input, nitro } = setup();
  dispatch(nitro, 'pointerdown', { pointerId: 1, button: 0 });
  dispatch(nitro, 'pointerdown', { pointerId: 2, button: 0 });
  dispatch(nitro, 'pointerup', { pointerId: 1 });
  assert.equal(input.read().nitro, true); assert.equal(nitro.classes.has('pressed'), true);
  input.clear();
  assert.deepEqual({ ...input.read() }, idleControls()); assert.equal(nitro.classes.has('pressed'), false);
});

test('disabled controls, inactive input and secondary mouse clicks do not capture a boost hold', () => {
  const { input, nitro } = setup();
  nitro.disabled = true; dispatch(nitro, 'pointerdown', { pointerId: 1, button: 0 });
  nitro.disabled = false; input.enabled = false;
  dispatch(nitro, 'pointerdown', { pointerId: 2, button: 0 });
  input.enabled = true; dispatch(nitro, 'pointerdown', { pointerId: 3, button: 2 });
  assert.equal(input.read().nitro, false); assert.equal(nitro.classes.has('pressed'), false);
});

test('focused nitro supports Space and Enter holds without drifting or issuing menu commands', () => {
  for (const code of ['Space', 'Enter']) {
    const { input, nitro, window } = setup();
    let commands = 0; input.onCommand = () => commands++;
    assert.equal(dispatch(nitro, 'keydown', { code }).defaultPrevented, true);
    assert.equal(input.read().nitro, true); assert.equal(input.read().drift, false);
    dispatch(window, 'keyup', { code });
    assert.equal(input.read().nitro, false); assert.equal(nitro.classes.has('pressed'), false);
    dispatch(nitro, 'keydown', { code }); dispatch(nitro, 'blur');
    assert.equal(input.read().nitro, false); assert.equal(commands, 0);
  }
});

test('E issues a single item command per press, ignores key-repeat, and leaves driving controls untouched', () => {
  const { window, input } = setup(); const commands: string[] = [];
  input.onCommand = command => commands.push(command);
  assert.equal(dispatch(window, 'keydown', { code: 'KeyE', repeat: false }).defaultPrevented, true);
  dispatch(window, 'keydown', { code: 'KeyE', repeat: true });
  assert.deepEqual(commands, ['KeyE']); assert.deepEqual({ ...input.read() }, idleControls());
  dispatch(window, 'keyup', { code: 'KeyE' }); dispatch(window, 'keydown', { code: 'KeyE', repeat: false });
  assert.deepEqual(commands, ['KeyE', 'KeyE']);
});

test('Space and Enter activate a focused item slot once without engaging the handbrake', () => {
  const { window, input } = setup(); const commands: string[] = [];
  input.onCommand = command => commands.push(command);
  const item = new Button('Item');
  Object.assign(item, { closest: (selector: string) => selector === '[data-action="use-item"]' ? item : null });
  for (const code of ['Space', 'Enter']) {
    for (const repeat of [false, true]) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat });
      Object.defineProperty(event, 'target', { value: item }); window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true); assert.equal(input.read().drift, false);
    }
    dispatch(window, 'keyup', { code });
  }
  assert.deepEqual(commands, ['KeyE', 'KeyE']); assert.deepEqual({ ...input.read() }, idleControls());
});

test('Q requests one switch per press and focused switch accepts Space/Enter without braking', () => {
  const { window, input } = setup(); const commands: string[] = [];
  input.onCommand = command => commands.push(command);
  dispatch(window, 'keydown', { code: 'KeyQ', repeat: false });
  dispatch(window, 'keydown', { code: 'KeyQ', repeat: true });
  assert.deepEqual(commands, ['KeyQ']); assert.deepEqual({ ...input.read() }, idleControls());
  const button = new Button('Switch');
  Object.assign(button, { closest: (selector: string) => selector === '[data-action="switch-stance"]' ? button : null });
  for (const code of ['Space', 'Enter']) {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false });
    Object.defineProperty(event, 'target', { value: button }); window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(input.read().drift, false);
  }
  assert.deepEqual(commands, ['KeyQ', 'KeyQ', 'KeyQ']);
});

test('X and touch standing-slide holds combine with steering and clear on release, blur and capture loss', () => {
  const { window, input, standup, steer } = setup();
  dispatch(window, 'keydown', { code: 'KeyX' }); assert.equal(input.read().standupSlide, true);
  dispatch(standup, 'pointerdown', { pointerId: 4, button: 0 });
  dispatch(steer, 'pointerdown', { pointerId: 5, button: 0 });
  dispatch(window, 'keyup', { code: 'KeyX' });
  assert.equal(input.read().standupSlide, true); assert.equal(input.read().steering, -1);
  dispatch(standup, 'lostpointercapture', { pointerId: 4 }); assert.equal(Boolean(input.read().standupSlide), false);
  dispatch(standup, 'keydown', { code: 'Space' }); assert.equal(input.read().standupSlide, true);
  assert.equal(input.read().drift, false);
  dispatch(window, 'blur'); assert.deepEqual({ ...input.read() }, idleControls());
});

test('a released double-tap consumes only the second Space hold and cannot retrigger on repeat or a third tap', () => {
  const { input, window } = setup(); let switches = 0;
  input.onDoubleSpace = () => { switches++; return true; };
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 100 }); assert.equal(input.read().drift, true);
  dispatch(window, 'keyup', { code: 'Space', timeStamp: 155 });
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 260 });
  assert.equal(switches, 1); assert.equal(input.read().drift, false);
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 300, repeat: true });
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 315, repeat: false });
  assert.equal(switches, 1); assert.equal(input.read().drift, false);
  dispatch(window, 'keyup', { code: 'Space', timeStamp: 400 });
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 450 });
  assert.equal(switches, 1); assert.equal(input.read().drift, true);
});

test('slow taps, inactive input and cleared gestures do not trigger an immediate switch', () => {
  for (const variant of ['slow', 'disabled', 'clear', 'blur']) {
    const { input, window } = setup(); let switches = 0;
    input.onDoubleSpace = () => { switches++; return true; };
    dispatch(window, 'keydown', { code: 'Space', timeStamp: 100 });
    dispatch(window, 'keyup', { code: 'Space', timeStamp: 150 });
    if (variant === 'disabled') input.enabled = false;
    if (variant === 'clear') input.clear();
    if (variant === 'blur') dispatch(window, 'blur');
    dispatch(window, 'keydown', { code: 'Space', timeStamp: variant === 'slow' ? 450 : 260 });
    assert.equal(switches, 0, variant);
    assert.equal(input.read().drift, variant !== 'disabled');
  }
});

test('holding Space begins as a brake and transitions to one Switch after 0.6 seconds', () => {
  const { input, window } = setup(); let switches = 0;
  input.onLongSpace = () => { switches++; return true; };
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 100 });
  input.advance(699); assert.equal(switches, 0); assert.equal(input.read().drift, true);
  input.advance(700); assert.equal(switches, 1); assert.equal(input.read().drift, false);
  input.advance(1700); assert.equal(switches, 1, 'one held key cannot repeat a switch');
  dispatch(window, 'keyup', { code: 'Space', timeStamp: 1800 });
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 2000 }); input.advance(2600);
  assert.equal(switches, 2, 'release arms the next long switch');
});

test('a rejected long Space remains a brake until release and does not repeatedly request Switch', () => {
  const { input, window } = setup(); let attempts = 0;
  input.onLongSpace = () => { attempts++; return false; };
  dispatch(window, 'keydown', { code: 'Space', timeStamp: 100 }); input.advance(700); input.advance(1700);
  assert.equal(attempts, 1); assert.equal(input.read().drift, true);
  dispatch(window, 'keyup', { code: 'Space', timeStamp: 1800 }); assert.equal(input.read().drift, false);
});

test('Space on the focused slide button supports double-tap but other focused controls keep their own action', () => {
  const { input, window, slide, nitro } = setup(); let switches = 0;
  input.onDoubleSpace = () => { switches++; return true; };
  for (const [target, time] of [[nitro, 100], [nitro, 220], [slide, 500], [slide, 650]] as const) {
    dispatch(target, 'keydown', { code: 'Space', timeStamp: time });
    if (time === 650) { assert.equal(input.read().drift, false); assert.equal(switches, 1); }
    else assert.equal(switches, 0);
    dispatch(window, 'keyup', { code: 'Space', timeStamp: time + 50 });
  }
});

test('the app maps double or held Space from a brake into a persistent downhill 180 only', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const binding = main.slice(main.indexOf('input.onDoubleSpace ='), main.indexOf('input.onCommand ='));
  for (const vehicle of [LONGBOARD, getVehicle('falcon'), getVehicle('trail')]) {
    const { input, window } = setup();
    const race = new Race(new Track(DOWNHILL_STAGE), vehicle); race.phase = 'racing'; race.speed = 22;
    let actions = 0;
    const ui = { dialog: { open: false }, onAction(action: string) {
      assert.equal(action, 'switch-stance'); actions++; race.switchLongboardStance();
    } };
    vm.runInContext(ts.transpile(binding, { target: ts.ScriptTarget.ES2022 }), vm.createContext({ input, race, ui }));
    const doubleTap = (start: number) => {
      dispatch(window, 'keydown', { code: 'Space', timeStamp: start });
      dispatch(window, 'keyup', { code: 'Space', timeStamp: start + 55 });
      dispatch(window, 'keydown', { code: 'Space', timeStamp: start + 180 });
    };
    const heading = race.heading;
    doubleTap(100);
    assert.equal(input.read().drift, !race.isLongboard);
    for (let frame = 0; frame < 60; frame++) race.update(1 / 60, input.read());
    assert.equal(actions, race.isLongboard ? 1 : 0);
    assert.equal(race.longboard.stance, race.isLongboard ? 'switch' : 'regular');
    assert.equal(race.heading, heading);
    dispatch(window, 'keyup', { code: 'Space', timeStamp: 1300 });
    dispatch(window, 'keydown', { code: 'Space', timeStamp: 1500 });
    for (let frame = 0; frame < 36; frame++) race.update(1 / 60, input.read());
    if (!race.isLongboard) {
      input.advance(2100); assert.equal(actions, 0); assert.equal(input.read().drift, true);
      dispatch(window, 'keyup', { code: 'Space', timeStamp: 2200 });
      continue;
    }
    assert.equal(race.longboard.style, 'hands-down');
    input.advance(2100); assert.equal(actions, 2); assert.equal(input.read().drift, false);
    race.update(1 / 60, input.read()); assert.equal(race.longboard.switching, true);
    for (let frame = 0; frame < 60; frame++) race.update(1 / 60, input.read());
    assert.equal(race.longboard.stance, 'regular');
    dispatch(window, 'keyup', { code: 'Space', timeStamp: 2700 });
    ui.dialog.open = true; doubleTap(3000); assert.equal(actions, 2);
    dispatch(window, 'keyup', { code: 'Space', timeStamp: 3300 });
    ui.dialog.open = false; race.phase = 'paused'; doubleTap(3500); assert.equal(actions, 2);
  }
});
