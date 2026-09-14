import { clamp } from './track';

export type LongboardStance = 'regular' | 'switch';
export type SlideStyle = 'none' | 'hands-down' | 'standup';
export interface LongboardPose {
  stanceYaw: number; switchWeight: number; slide: number; handsDown: number;
  switchCompression: number; switchLead: number; supportSide: number;
  carve: number;
  tuck: number; footbrake: number; push: number; pushPhase: number;
}
export const longboardPoseKeys = ['stanceYaw', 'switchWeight', 'switchCompression', 'switchLead', 'supportSide', 'carve', 'slide', 'handsDown', 'tuck', 'footbrake', 'push', 'pushPhase'] as const;
export const idleLongboardPose = (): LongboardPose => ({ stanceYaw: 0, switchWeight: 0, switchCompression: 0, switchLead: 0, supportSide: -1, carve: 0, slide: 0, handsDown: 0, tuck: 0, footbrake: 0, push: 0, pushPhase: 0 });
/** A visual weight shift only: ordinary cornering never engages the brake. */
export const longboardCarve = (speed: number, steering: number) => clamp(steering, -1, 1) * smooth((speed - 4) / 14);
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Fixed-step stance and slide choreography. The renderer only reads its pose. */
export class LongboardMotion {
  readonly pose = idleLongboardPose();
  stance: LongboardStance = 'regular';
  style: SlideStyle = 'none';
  direction = 1;
  angle = 0;
  heldTime = 0;
  private switchTime = 0;
  private switchStart = 0;
  private switchTarget = 0;
  private switchHands = 0;
  private baseYaw = 0;
  private pendingSwitch = false;
  private switchDirection = 1;

  get switching() { return this.pendingSwitch || this.switchTime > 0; }
  get heelside() { return this.direction * (this.stance === 'regular' ? 1 : -1) > 0; }
  get brakingStrength() { return this.switching ? 0.55 : this.style === 'standup' ? 0.48 + this.pose.slide * 0.2 : 0.75 + this.pose.slide * 0.4; }
  get label() {
    if (this.switching) return this.stance === 'regular' ? '180° → SWITCH' : '180° → REGULAR';
    if (this.style === 'none') return this.pose.slide > 0.08 ? '收板回正' : '';
    return `${this.heelside ? '脚跟侧' : '脚尖侧'} · ${this.style === 'standup' ? '站立刹滑' : '扶地刹滑'}`;
  }

  requestSwitch(speed: number, steering: number) {
    if (this.switching || speed < 3) return false;
    this.pendingSwitch = true;
    this.switchDirection = Math.abs(steering) > 0.1 ? -Math.sign(steering) : -this.direction;
    return true;
  }

  reset(preserveStance = false) {
    if (!preserveStance) { this.stance = 'regular'; this.baseYaw = 0; }
    this.style = 'none'; this.angle = 0; this.heldTime = 0;
    this.pendingSwitch = false; this.switchTime = 0;
    this.switchHands = 0;
    this.direction = this.stance === 'regular' ? 1 : -1;
    Object.assign(this.pose, idleLongboardPose(), { stanceYaw: this.baseYaw });
  }

  update(dt: number, input: { speed: number; steering: number; slide: boolean; standup: boolean; brake: boolean; tuck: boolean; push: boolean }) {
    if (dt <= 0) return;
    const { speed, steering, brake } = input;
    if (this.pendingSwitch) {
      this.pendingSwitch = false; this.switchTime = 0.001;
      this.switchStart = this.baseYaw + this.angle;
      this.switchTarget = this.baseYaw + this.switchDirection * Math.PI;
      this.switchHands = this.pose.handsDown;
      this.pose.stanceYaw = this.switchStart; this.angle = 0;
    }
    if (this.switchTime > 0) {
      // Shift weight, unweight through the pivot, then bend into the new stance.
      this.switchTime = Math.min(0.9, this.switchTime + dt);
      const progress = this.switchTime / 0.9;
      this.pose.stanceYaw = this.switchStart + (this.switchTarget - this.switchStart) * smooth((progress - .12) / .78);
      this.pose.switchWeight = Math.sin(progress * Math.PI);
      this.pose.switchCompression = Math.sin(progress * Math.PI * 2) ** 2;
      this.pose.switchLead = this.switchDirection * Math.sin(progress * Math.PI * 2) * .24;
      this.style = 'none'; this.heldTime = 0;
      if (progress >= 1) {
        this.stance = this.stance === 'regular' ? 'switch' : 'regular';
        this.baseYaw = this.switchTarget; this.pose.stanceYaw = this.baseYaw;
        this.switchTime = 0; this.pose.switchWeight = 0;
        this.pose.switchCompression = 0; this.pose.switchLead = 0;
      }
    } else {
      const sliding = input.slide && speed > 0.5 && !brake;
      if (sliding) {
        if (this.style === 'none') {
          this.direction = Math.abs(steering) > 0.1 ? Math.sign(steering) : this.stance === 'regular' ? 1 : -1;
          this.pose.supportSide = -this.direction * (this.stance === 'regular' ? 1 : -1);
        }
        this.style = input.standup ? 'standup' : 'hands-down'; this.heldTime += dt;
        const countersteer = Math.max(0, -steering * this.direction);
        const amplitude = (this.style === 'standup' ? 0.62 : 1.18) * smooth(this.heldTime / 0.3)
          * clamp(speed / 12, 0, 1) * (1 - countersteer * 0.5);
        const target = -this.direction * amplitude;
        this.angle += (target - this.angle) * (1 - Math.exp(-dt * 9));
      } else {
        this.style = 'none'; this.heldTime = 0;
        // Recover progressively, including after a stopped slide; never spin in place.
        this.angle *= Math.exp(-dt * 7);
        if (Math.abs(this.angle) < 0.0001) this.angle = 0;
      }
    }
    const slide = this.style !== 'none' ? smooth(this.heldTime / 0.28) : this.switching ? this.pose.switchWeight * 0.7 : 0;
    const hands = this.style === 'hands-down' ? smooth((this.heldTime - 0.06) / 0.24)
      : this.switching ? this.switchHands * (1 - smooth(this.switchTime / .26)) : 0;
    const busy = input.slide || brake || this.switching;
    const carve = busy || input.push ? 0 : longboardCarve(speed, steering);
    const carveResponse = carve * this.pose.carve < 0 ? 3 : 7;
    this.pose.carve += (carve - this.pose.carve) * (1 - Math.exp(-dt * carveResponse));
    const targets = { slide, handsDown: hands, tuck: Number(input.tuck && !busy), footbrake: Number(brake), push: Number(input.push && !busy) };
    for (const key of ['slide', 'handsDown', 'tuck', 'footbrake', 'push'] as const) {
      if (key === 'handsDown' && this.switching) { this.pose[key] = hands; continue; }
      // Give the arms time to fold, while keeping tuck and footbrake foot placement in step.
      const response = key === 'push' ? 7 : key === 'tuck' && this.pose.footbrake < .01 ? 8 : 11;
      this.pose[key] += (targets[key] - this.pose[key]) * (1 - Math.exp(-dt * response));
    }
    if (this.pose.push > 0.01) this.pose.pushPhase += dt * 7;
  }
}
