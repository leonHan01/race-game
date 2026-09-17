import * as THREE from 'three';
import type { Track } from '../simulation/track';

export interface FreeCameraControls {
  forward: number; right: number; up: number; yaw: number; pitch: number;
  lookX: number; lookY: number; lift: number; fast: boolean;
}
export const idleCameraControls = (): FreeCameraControls => ({
  forward: 0, right: 0, up: 0, yaw: 0, pitch: 0, lookX: 0, lookY: 0, lift: 0, fast: false,
});

/** Presentation-only flight; never moves or drives any race participant. */
export class FreeCamera {
  active = false;
  readonly position = new THREE.Vector3();
  readonly direction = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;

  enter(camera: THREE.PerspectiveCamera) {
    this.position.copy(camera.position);
    camera.getWorldDirection(this.direction);
    this.yaw = Math.atan2(this.direction.x, -this.direction.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(this.direction.y, -1, 1));
    this.active = true;
  }
  reset() { this.active = false; }
  height(track: Track) { return this.position.y - track.surfaceHeight(this.position.x, this.position.z); }

  update(dt: number, controls: FreeCameraControls, track: Track) {
    if (!this.active) return false;
    const changed = controls.forward || controls.right || controls.up || controls.yaw || controls.pitch
      || controls.lookX || controls.lookY || controls.lift;
    if (!changed) return false;
    const seconds = THREE.MathUtils.clamp(dt, 0, 0.1);
    this.yaw += controls.yaw * seconds * 1.2 + controls.lookX * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch + controls.pitch * seconds * 1.2 - controls.lookY * 0.004, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
    this.direction.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // Forward/back stays horizontal; height is controlled separately even when looking down.
    const length = Math.max(1, Math.hypot(controls.forward, controls.right, controls.up));
    const step = seconds * (controls.fast ? 150 : 50) / length;
    this.position.x += (Math.sin(this.yaw) * controls.forward + Math.cos(this.yaw) * controls.right) * step;
    this.position.z += (-Math.cos(this.yaw) * controls.forward + Math.sin(this.yaw) * controls.right) * step;
    this.position.y += controls.up * step + controls.lift;
    const ground = track.surfaceHeight(this.position.x, this.position.z);
    this.position.y = THREE.MathUtils.clamp(this.position.y, ground + 3, ground + 500);
    return true;
  }

  apply(camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.position);
    camera.lookAt(this.position.x + this.direction.x, this.position.y + this.direction.y, this.position.z + this.direction.z);
  }
}
