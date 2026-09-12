/** Presentation-only easing; never changes steering, car pose or camera heading. */
export class SprintView {
  intensity = 0;
  update(boosting: boolean, racing: boolean, dt: number, reducedMotion = false) {
    if (!racing || reducedMotion) { this.reset(); return; }
    const step = Math.min(0.1, Math.max(0, dt));
    this.intensity += ((boosting ? 1 : 0) - this.intensity) * (1 - Math.exp(-step * (boosting ? 9 : 6)));
    if (this.intensity < 0.0001) this.intensity = 0;
  }
  get fovIncrease() { return this.intensity * 18; }
  get horizontalScale() { return 1 - this.intensity * 0.06; }
  reset() { this.intensity = 0; }
}
