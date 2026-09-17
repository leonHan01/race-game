import { idleCameraControls, type FreeCameraControls } from './render/free-camera';

const cameraKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight']);

/** Separate input ownership keeps free flight out of the driving controls. */
export class FreeCameraInput {
  private active = false;
  private readonly events = new AbortController();
  private readonly keys = new Set<string>();
  private readonly touches = new Map<number, string>();
  private drag?: { id: number; x: number; y: number };
  private lookX = 0;
  private lookY = 0;
  private lift = 0;
  private readonly buttons: HTMLButtonElement[];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const signal = this.events.signal;
    this.buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-camera-key]')];
    window.addEventListener('keydown', event => {
      if (!this.active || !cameraKeys.has(event.code) || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]'))) return;
      event.preventDefault(); this.keys.add(event.code);
    }, { signal });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); }, { signal });
    window.addEventListener('blur', () => this.clear(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0 || this.drag) return;
      event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!this.active || this.drag?.id !== event.pointerId) return;
      this.lookX += event.clientX - this.drag.x; this.lookY += event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
    }, { signal });
    const release = (event: PointerEvent) => { if (this.drag?.id === event.pointerId) this.drag = undefined; };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, release, { signal });
    canvas.addEventListener('wheel', event => {
      if (!this.active) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
      this.lift -= Math.max(-100, Math.min(100, pixels)) * 0.15;
    }, { signal, passive: false });
    for (const button of this.buttons) {
      button.addEventListener('pointerdown', event => {
        if (!this.active || event.button !== 0) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        this.touches.set(event.pointerId, button.dataset.cameraKey!); button.classList.add('pressed');
      }, { signal });
      const releaseButton = (event: PointerEvent) => {
        this.touches.delete(event.pointerId);
        button.classList.toggle('pressed', [...this.touches.values()].includes(button.dataset.cameraKey!));
      };
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(name, releaseButton, { signal });
      // Native keyboard activation makes the on-screen controls usable without a pointer.
      button.addEventListener('keydown', event => {
        if (!this.active || !['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault(); event.stopPropagation(); this.keys.add(button.dataset.cameraKey!);
      }, { signal });
      button.addEventListener('keyup', event => {
        if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); this.keys.delete(button.dataset.cameraKey!); }
      }, { signal });
      button.addEventListener('blur', () => this.keys.delete(button.dataset.cameraKey!), { signal });
    }
  }

  setEnabled(enabled: boolean) {
    if (this.active === enabled) return;
    this.active = enabled; this.clear();
    this.canvas.classList.toggle('free-camera-active', enabled);
  }
  clear() {
    this.keys.clear(); this.touches.clear(); this.drag = undefined;
    this.lookX = this.lookY = this.lift = 0;
    this.buttons.forEach(button => button.classList.remove('pressed'));
  }
  read(): FreeCameraControls {
    if (!this.active) return idleCameraControls();
    const held = (key: string) => Number(this.keys.has(key) || [...this.touches.values()].includes(key));
    const controls = {
      forward: held('KeyW') - held('KeyS'), right: held('KeyD') - held('KeyA'), up: held('KeyE') - held('KeyQ'),
      yaw: held('ArrowRight') - held('ArrowLeft'), pitch: held('ArrowUp') - held('ArrowDown'),
      lookX: this.lookX, lookY: this.lookY, lift: this.lift, fast: Boolean(held('ShiftLeft') || held('ShiftRight')),
    };
    this.lookX = this.lookY = this.lift = 0;
    return controls;
  }
  dispose() { this.setEnabled(false); this.clear(); this.events.abort(); }
}
