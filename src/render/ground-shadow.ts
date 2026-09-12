import * as THREE from 'three';
import type { TrackPoint } from '../simulation/track';

const bindings = new WeakMap<THREE.Object3D, { shadow: THREE.Mesh; rotation: THREE.Matrix4 } | null>();
const frame = new THREE.Matrix4(); const inverse = new THREE.Matrix4();
const position = new THREE.Vector3(); const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion(); const angles = new THREE.Euler(0, 0, 0, 'YXZ');

/** Project the existing cheap contact shadow onto the road while the body flies. */
export function placeGroundShadow(group: THREE.Group, p: TrackPoint, height: number, heading: number, roadPitch: number) {
  let binding = bindings.get(group);
  if (binding === undefined) {
    const shadow = group.getObjectByName('rally-contact-shadow') ?? group.getObjectByName('motorcycle-shadow');
    binding = shadow instanceof THREE.Mesh ? { shadow, rotation: new THREE.Matrix4().makeRotationFromQuaternion(shadow.quaternion) } : null;
    bindings.set(group, binding);
  }
  if (!binding) return;
  const { shadow } = binding;
  const spread = 1 + Math.min(10, height) * 0.035;
  position.set(p.x, p.y - height + 0.1, p.z);
  scale.copy(group.scale).multiplyScalar(spread);
  rotation.setFromEuler(angles.set(roadPitch, heading, 0));
  frame.compose(position, rotation, scale).multiply(binding.rotation);
  inverse.copy(group.matrixWorld).invert();
  shadow.matrixAutoUpdate = false;
  shadow.matrix.copy(inverse.multiply(frame)); shadow.matrixWorldNeedsUpdate = true;
  (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 1 - height / 16);
}
