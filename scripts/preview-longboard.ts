/** CPU-only model export. No game, browser, canvas or WebGL is started. */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { LongboardRider } from '../src/render/longboard.ts';
import { idleLongboardPose, type LongboardPose } from '../src/simulation/longboard-motion.ts';
import { disposeObject } from '../src/render/dispose.ts';

const samples: { name: string; detail: string; pose: Partial<LongboardPose>; drift?: number; steer?: number }[] = [
  { name: '01 / FREE RIDE', detail: 'Relaxed knees / open shoulders', pose: {} },
  { name: '02 / AERO TUCK', detail: 'Low chest / hands behind the back', pose: { tuck: 1 } },
  { name: '03 / HEELSIDE', detail: 'Planted puck / leading free arm', pose: { slide: 1, handsDown: 1 }, drift: -1.05, steer: .7 },
  { name: '04 / TOESIDE', detail: 'Deep crouch / opposite hand', pose: { slide: 1, handsDown: 1 }, drift: 1.05, steer: -.7 },
  { name: '05 / STAND-UP', detail: 'Counter rotation / arms balance', pose: { slide: 1 }, drift: -.6, steer: .5 },
  { name: '06 / SWITCH 180', detail: 'Shoulder lead / board pivots below', pose: { stanceYaw: -Math.PI * .65, switchWeight: .89, slide: .6 } },
  { name: '07 / FOOTBRAKE', detail: 'Weight over the supporting foot', pose: { footbrake: 1 } },
  { name: '08 / PUSH', detail: 'Ground stroke / bent support knee', pose: { push: 1, pushPhase: Math.PI * 1.2 } },
];
const views = samples.map(sample => {
  const rider = new LongboardRider();
  const pose = { ...idleLongboardPose(), ...sample.pose };
  rider.update(20, sample.steer ?? 0, sample.drift ?? 0, false, false, 0, false, false, pose);
  rider.group.rotation.y = pose.stanceYaw + (sample.drift ?? 0);
  rider.group.updateMatrixWorld(true);
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
  return { name: sample.name, detail: sample.detail, triangles, meshes };
});
writeFileSync(process.argv[2] ?? '/tmp/longboard-preview.json', JSON.stringify(views));
console.log(views.map(view => `${view.name}: ${view.triangles.length} triangles, ${view.meshes} meshes`).join('\n'));
