/** CPU-only model export. No game, browser, canvas or WebGL is started. */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { LongboardRider } from '../src/render/longboard.ts';
import { idleLongboardPose, LongboardMotion, type LongboardPose } from '../src/simulation/longboard-motion.ts';
import { disposeObject } from '../src/render/dispose.ts';

const samples: { name: string; detail: string; pose: Partial<LongboardPose>; drift?: number; steer?: number }[] = [
  { name: '01 / FREE RIDE', detail: 'Front-foot support / relaxed shoulders', pose: {} },
  { name: '02 / AERO TUCK', detail: 'Compact rear knee / hands at lower back', pose: { tuck: 1 } },
  { name: '03 / HEELSIDE', detail: 'Front leg loads / palm stays planted', pose: { slide: 1, handsDown: 1, supportSide: -1 }, drift: -1.05, steer: .7 },
  { name: '04 / TOESIDE', detail: 'Leading foot bears the low stance', pose: { slide: 1, handsDown: 1, supportSide: 1 }, drift: 1.05, steer: -.7 },
  { name: '05 / STAND-UP', detail: 'Counter rotation / arms balance', pose: { slide: 1 }, drift: -.6, steer: .5 },
  { name: '06 / SWITCH 180', detail: 'Shoulder lead / knees absorb the turn', pose: { stanceYaw: -Math.PI * .65, switchWeight: .89, switchCompression: .65, switchLead: .19, slide: .6 } },
  { name: '07 / FOOTBRAKE', detail: 'Supporting toes and hips face travel', pose: { footbrake: 1 } },
  { name: '08 / PUSH', detail: 'Recovery lift / arms follow the stroke', pose: { push: 1, pushPhase: Math.PI * 1.2 } },
];
if (process.argv.includes('--turns')) {
  samples.length = 0;
  for (const stanceYaw of [0, -Math.PI]) for (const carve of [1, -1]) {
    samples.push({ name: `${stanceYaw === 0 ? 'REGULAR' : 'SWITCH'} / ${carve > 0 ? 'RIGHT' : 'LEFT'}`,
      detail: 'Front-foot load / inside palm / free arm', pose: { stanceYaw, carve }, steer: carve });
  }
}
if (process.argv.includes('--balance')) {
  samples.length = 0;
  for (const stanceYaw of [0, -Math.PI]) for (const tuck of [1, 0]) {
    samples.push({ name: `${stanceYaw === 0 ? 'REGULAR' : 'SWITCH'} / ${tuck ? 'TUCK' : 'FOOTBRAKE'}`,
      detail: `${stanceYaw === 0 ? 'Left' : 'Right'} foot supports / hips stay forward`, pose: { stanceYaw, tuck, footbrake: 1 - tuck } });
  }
}
if (process.argv.includes('--push')) {
  samples.length = 0;
  for (const stanceYaw of [0, -Math.PI]) for (const phase of [0, .5, 1, 1.5]) {
    samples.push({ name: `${stanceYaw === 0 ? 'REGULAR' : 'SWITCH'} / ${['CONTACT', 'DRIVE', 'FINISH', 'RECOVER'][phase * 2]}`,
      detail: ['Foot plants / opposite arm leads', 'Support knee loads / arms counter-swing', 'Finish on the road / keep front support', 'Lift the foot / gather for next stroke'][phase * 2],
      pose: { stanceYaw, push: 1, pushPhase: phase * Math.PI } });
  }
}
if (process.argv.includes('--turn-transition')) {
  samples.length = 0;
  for (const switched of [false, true]) for (const seconds of [0, .10, .30, .90]) {
    const motion = new LongboardMotion();
    const input = { speed: 25, steering: 1, slide: false, standup: false, brake: false, tuck: false, push: false };
    if (switched) {
      motion.requestSwitch(25, 0);
      for (let tick = 0; tick < 60; tick++) motion.update(1 / 60, { ...input, steering: 0 });
    }
    for (let tick = 0; tick < 100; tick++) motion.update(1 / 60, input);
    for (let tick = 0; tick < Math.round(seconds * 60); tick++) motion.update(1 / 60, { ...input, steering: -1 });
    samples.push({ name: `${switched ? 'SWITCH' : 'REGULAR'} / ${seconds.toFixed(2)} S`,
      detail: ['Inside palm plants / free arm balances', 'Gather the arm / lift through the turn', 'Relax the wrists / change support side', 'Settle the palm / extend the other arm'][[0, .10, .30, .90].indexOf(seconds)],
      pose: { ...motion.pose }, steer: seconds === 0 ? 1 : -1 });
  }
}
if (process.argv.includes('--switch')) {
  samples.length = 0;
  for (const steering of [1, -1]) for (const seconds of [0, .15, .45, .9]) {
    const motion = new LongboardMotion();
    const input = { speed: 22, steering, slide: true, standup: false, brake: false, tuck: false, push: false };
    for (let tick = 0; tick < 40; tick++) motion.update(1 / 60, input);
    if (seconds > 0) {
      motion.requestSwitch(22, steering);
      for (let tick = 0; tick < Math.round(seconds * 60); tick++) motion.update(1 / 60, { ...input, slide: false });
    }
    samples.push({ name: `${steering > 0 ? 'HEEL' : 'TOE'} / ${seconds.toFixed(2)} S`,
      detail: ['Planted brake', 'Preload / lift the palm', 'Unweight / follow shoulders', 'Settle into Switch'][[0, .15, .45, .9].indexOf(seconds)],
      pose: { ...motion.pose }, drift: motion.angle });
  }
}
const views = samples.map(sample => {
  const rider = new LongboardRider();
  const pose = { ...idleLongboardPose(), ...sample.pose };
  rider.update(20, sample.steer ?? 0, sample.drift ?? 0, false, false, 0, false, false, pose);
  rider.group.rotation.y = pose.stanceYaw + (sample.drift ?? 0);
  rider.group.updateMatrixWorld(true);
  const supportFoot = rider.group.getObjectByName(Math.cos(pose.stanceYaw) >= 0 ? 'left-foot' : 'right-foot')!.getWorldPosition(new THREE.Vector3()).toArray();
  const pelvis = rider.group.getObjectByName('rider-pelvis')!.getWorldPosition(new THREE.Vector3()).toArray();
  const triangles: number[][] = [];
  let meshes = 0;
  rider.group.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    meshes++;
    const geometry = node.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    const index = geometry.index;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    for (let start = 0; start < (index?.count ?? positions.count); start += 3) {
      const group = geometry.groups.find(g => start >= g.start && start < g.start + g.count);
      const material = (Array.isArray(node.material) ? node.material[group?.materialIndex ?? 0] : node.material) as THREE.MeshStandardMaterial;
      if (material.transparent && material.opacity < .5) continue;
      const triangle: number[] = [];
      for (let corner = 0; corner < 3; corner++) {
        const id = index ? index.getX(start + corner) : start + corner;
        const point = new THREE.Vector3().fromBufferAttribute(positions, id).applyMatrix4(node.matrixWorld);
        const normal = new THREE.Vector3().fromBufferAttribute(normals, id).applyMatrix3(normalMatrix).normalize();
        const color = material.color.clone();
        if (material.vertexColors && colors) color.multiply(new THREE.Color().setRGB(colors.getX(id), colors.getY(id), colors.getZ(id)));
        triangle.push(...point.toArray(), ...normal.toArray(), ...color.toArray());
      }
      triangles.push(triangle);
    }
  });
  disposeObject(rider.group);
  return { name: sample.name, detail: sample.detail, triangles, meshes, supportFoot, pelvis };
});
writeFileSync(process.argv[2] ?? '/tmp/longboard-preview.json', JSON.stringify(views));
console.log(views.map(view => `${view.name}: ${view.triangles.length} triangles, ${view.meshes} meshes`).join('\n'));
