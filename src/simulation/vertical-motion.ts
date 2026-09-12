export const GRAVITY = 9.81;
export interface GroundMotion {
  height: number;
  /** Vertical component of the current horizontal velocity along the old surface. */
  launchVelocity: number;
  groundVelocity: number;
  pitch: number;
  speed: number;
}

/** Road contact and ballistic flight shared by player and opponents; no render state. */
export class VerticalMotion {
  height = 0;
  velocity = 0;
  pitch = 0;
  airborne = false;
  clearance = 0;
  airTime = 0;
  lastAirTime = 0;
  jumpCount = 0;
  private groundHeight = 0;
  private unsupportedTime = 0;

  reset(height: number, pitch = 0) {
    this.height = this.groundHeight = height;
    this.pitch = pitch; this.velocity = 0; this.airborne = false;
    this.clearance = 0; this.airTime = 0; this.lastAirTime = 0; this.jumpCount = 0;
    this.unsupportedTime = 0;
  }

  update(dt: number, ground: GroundMotion) {
    if (dt <= 0) return;
    const wasAirborne = this.airborne;
    const velocity = wasAirborne ? this.velocity : ground.launchVelocity;
    const nextHeight = this.height + velocity * dt - GRAVITY * dt * dt / 2;
    // Contact can push a car upward, but cannot pull it down faster than gravity.
    // A tiny tolerance rejects sampling noise without a scripted jump speed.
    const separating = nextHeight > ground.height + 0.0002;
    this.unsupportedTime = separating ? this.unsupportedTime + dt : 0;
    // A centimetre of tyre compliance absorbs isolated spline-sampling gaps.
    // Sustained loss of support still releases the car at a rounded crest.
    const detached = wasAirborne || nextHeight > ground.height + 0.012 || this.unsupportedTime >= 0.045;
    if (separating && detached && (wasAirborne || ground.speed > 1)) {
      this.height = nextHeight; this.velocity = velocity - GRAVITY * dt;
      this.airborne = true; this.airTime += dt;
      if (!wasAirborne) this.jumpCount++;
    } else {
      if (wasAirborne) {
        const previousGap = Math.max(0, this.height - this.groundHeight);
        const fraction = Math.min(1, previousGap / Math.max(1e-9, previousGap + ground.height - nextHeight));
        this.lastAirTime = this.airTime + dt * fraction;
      }
      this.height = ground.height; this.velocity = ground.groundVelocity;
      this.airborne = false; this.airTime = 0;
    }
    this.groundHeight = ground.height;
    this.clearance = Math.max(0, this.height - ground.height);
    const desiredPitch = this.airborne ? Math.atan2(this.velocity, Math.max(8, ground.speed)) : ground.pitch;
    const target = Math.max(-0.48, Math.min(0.48, desiredPitch));
    const change = (target - this.pitch) * (1 - Math.exp(-dt * 9));
    this.pitch += Math.max(-dt * 0.9, Math.min(dt * 0.9, change));
  }
}
