import { idleControls, type Controls } from './simulation/race';

const drivingCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyX']);
const LONG_SPACE_SWITCH_DELAY = 600;
export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, string>();
  private buttonKeys = new Map<string, string>();
  private spaceDownAt: number | null = null;
  private spaceTapAt: number | null = null;
  private spaceHeld = false;
  private spaceConsumed = false;
  private spaceLongPressHandled = false;
  enabled = false;
  onCommand: (command: string) => void = () => {};
  /** Return true when the active mode consumes the gesture instead of a brake hold. */
  onDoubleSpace: () => boolean = () => false;
  onLongSpace: () => boolean = () => false;

  constructor() {
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
      const focusedCommand = event.target instanceof HTMLElement
        ? event.target.closest('[data-action="use-item"]') ? 'KeyE'
          : event.target.closest('[data-action="switch-stance"]') ? 'KeyQ' : null : null;
      if (focusedCommand && ['Space', 'Enter'].includes(event.code)) {
        event.preventDefault();
        if (this.enabled && !event.repeat) this.onCommand(focusedCommand);
        return;
      }
      if (this.enabled && drivingCodes.has(event.code)) event.preventDefault();
      if (event.code === 'Escape') event.preventDefault();
      if (event.code === 'Space' && this.enabled) this.pressSpace(event);
      this.keys.add(event.code);
      if (!event.repeat && ['Escape', 'KeyP', 'KeyC', 'KeyR', 'KeyE', 'KeyQ', 'Enter'].includes(event.code)) this.onCommand(event.code);
    });
    window.addEventListener('keyup', event => {
      if (event.code === 'Space') this.releaseSpace(event.timeStamp);
      this.keys.delete(event.code); this.buttonKeys.delete(event.code);
      this.updatePressedButtons();
    });
    window.addEventListener('blur', () => this.clear());
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        if (!this.enabled || button.disabled || event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.touches.set(event.pointerId, button.dataset.control!);
        button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => { this.touches.delete(event.pointerId); this.updatePressedButtons(); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('keydown', event => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault(); event.stopPropagation();
        if (!this.enabled || button.disabled) return;
        if (event.code === 'Space' && button.dataset.control === 'Space') {
          this.pressSpace(event);
          if (this.spaceConsumed) return;
        }
        this.buttonKeys.set(event.code, button.dataset.control!);
        this.updatePressedButtons();
      });
      button.addEventListener('blur', () => {
        if (button.dataset.control === 'Space') this.resetSpace();
        for (const [code, control] of this.buttonKeys) if (control === button.dataset.control) this.buttonKeys.delete(code);
        this.updatePressedButtons();
      });
    });
  }
  clear() {
    this.keys.clear(); this.touches.clear(); this.buttonKeys.clear();
    this.resetSpace();
    document.querySelectorAll('[data-control].pressed').forEach(button => button.classList.remove('pressed'));
  }
  /** Advance duration-based gestures with the same clock that advances the race. */
  advance(now: number) {
    if (!this.enabled || !this.spaceHeld || this.spaceDownAt === null || this.spaceLongPressHandled
      || now - this.spaceDownAt < LONG_SPACE_SWITCH_DELAY) return;
    this.spaceLongPressHandled = true;
    if (this.onLongSpace()) {
      this.spaceConsumed = true;
      this.spaceTapAt = null;
    }
  }
  private pressSpace(event: KeyboardEvent) {
    if (event.repeat || this.spaceHeld) return;
    this.spaceHeld = true;
    const gap = this.spaceTapAt === null ? Infinity : event.timeStamp - this.spaceTapAt;
    this.spaceTapAt = null; this.spaceDownAt = event.timeStamp; this.spaceLongPressHandled = false;
    if (gap >= 0 && gap <= 320 && this.onDoubleSpace()) {
      this.spaceConsumed = true; this.spaceDownAt = null; this.spaceLongPressHandled = true;
    }
  }
  private releaseSpace(now: number) {
    // A held slide cannot become the first tap of a switch gesture.
    const duration = this.spaceDownAt === null ? Infinity : now - this.spaceDownAt;
    this.spaceTapAt = this.enabled && duration >= 0 && duration <= 220 ? this.spaceDownAt : null;
    this.spaceDownAt = null; this.spaceHeld = false; this.spaceConsumed = false; this.spaceLongPressHandled = false;
  }
  private resetSpace() {
    this.spaceDownAt = null; this.spaceTapAt = null; this.spaceHeld = false; this.spaceConsumed = false; this.spaceLongPressHandled = false;
  }
  private updatePressedButtons() {
    const controls = [...this.touches.values(), ...this.buttonKeys.values()];
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => button.classList.toggle('pressed', controls.includes(button.dataset.control!)));
  }
  read(): Controls {
    if (!this.enabled) return idleControls();
    const buttons = [...this.touches.values(), ...this.buttonKeys.values()];
    const held = (...codes: string[]) => codes.some(code => (this.keys.has(code) && !(code === 'Space' && this.spaceConsumed)) || buttons.includes(code));
    return { throttle: held('KeyW', 'ArrowUp'), brake: held('KeyS', 'ArrowDown'), steering: Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft')), drift: held('Space'), nitro: held('ShiftLeft', 'ShiftRight', 'Nitro'), ...(held('KeyX', 'Standup') ? { standupSlide: true } : {}) };
  }
}
