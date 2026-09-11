import { idleControls, type Controls } from './simulation/race';

const drivingCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, string>();
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
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.touches.set(event.pointerId, button.dataset.control!);
        button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => { this.touches.delete(event.pointerId); button.classList.remove('pressed'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }
  clear() {
    this.keys.clear(); this.touches.clear();
    document.querySelectorAll('[data-control].pressed').forEach(button => button.classList.remove('pressed'));
  }
  read(): Controls {
    if (!this.enabled) return idleControls();
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code) || [...this.touches.values()].includes(code));
    return { throttle: held('KeyW', 'ArrowUp'), brake: held('KeyS', 'ArrowDown'), steering: Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft')), drift: held('Space') };
  }
}
