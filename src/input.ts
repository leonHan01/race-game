import { idleControls, type Controls } from './simulation/race';

const drivingCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, string>();
  private buttonKeys = new Map<string, string>();
  enabled = false;
  onCommand: (command: string) => void = () => {};

  constructor() {
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
      if (this.enabled && drivingCodes.has(event.code)) event.preventDefault();
      if (event.code === 'Escape') event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && ['Escape', 'KeyP', 'KeyC', 'KeyR', 'Enter'].includes(event.code)) this.onCommand(event.code);
    });
    window.addEventListener('keyup', event => {
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
        this.buttonKeys.set(event.code, button.dataset.control!);
        this.updatePressedButtons();
      });
      button.addEventListener('blur', () => {
        for (const [code, control] of this.buttonKeys) if (control === button.dataset.control) this.buttonKeys.delete(code);
        this.updatePressedButtons();
      });
    });
  }
  clear() {
    this.keys.clear(); this.touches.clear(); this.buttonKeys.clear();
    document.querySelectorAll('[data-control].pressed').forEach(button => button.classList.remove('pressed'));
  }
  private updatePressedButtons() {
    const controls = [...this.touches.values(), ...this.buttonKeys.values()];
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => button.classList.toggle('pressed', controls.includes(button.dataset.control!)));
  }
  read(): Controls {
    if (!this.enabled) return idleControls();
    const buttons = [...this.touches.values(), ...this.buttonKeys.values()];
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code) || buttons.includes(code));
    return { throttle: held('KeyW', 'ArrowUp'), brake: held('KeyS', 'ArrowDown'), steering: Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft')), drift: held('Space'), nitro: held('ShiftLeft', 'ShiftRight', 'Nitro') };
  }
}
