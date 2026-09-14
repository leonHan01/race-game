/** Export actual vehicle geometry for offline inspection; no game, DOM or WebGL. */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { VEHICLES } from '../src/content/vehicles.ts';
import { buildVehicleBody, buildWheelGeometry, createVehicleMaterials, WHEEL_RADIUS } from '../src/render/vehicle-model.ts';
import { Motorcycle } from '../src/render/motorcycle.ts';
import { disposeObject } from '../src/render/dispose.ts';

const views = VEHICLES.map(vehicle => {
  const root = new THREE.Group();
  if (vehicle.mode === 'motorcycle') root.add(new Motorcycle(vehicle).group);
  else {
    const materials = createVehicleMaterials('#dedbd0', '#d77c35');
    root.scale.set(...vehicle.scale);
    root.add(buildVehicleBody(vehicle, materials));
    const wheel = buildWheelGeometry('player', vehicle.body);
    for (const z of [-1.3, 1.29]) for (const side of [-1, 1]) {
      for (const [geometry, material] of [[wheel.tyre, materials.rubber], [wheel.rim, materials.alloy]] as const) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(side * 1.035, WHEEL_RADIUS, z); root.add(mesh);
      }
    }
  }
  root.updateMatrixWorld(true);
  const triangles: number[][] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  let meshes = 0;
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const material = node.material as THREE.MeshStandardMaterial;
    if (material.transparent) return;
    meshes++;
    const geometry = node.geometry;
    geometries.add(geometry);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    for (let start = 0; start < (geometry.index?.count ?? positions.count); start += 3) {
      const triangle: number[] = [];
      for (let corner = 0; corner < 3; corner++) {
        const index = geometry.index ? geometry.index.getX(start + corner) : start + corner;
        const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
        const normal = new THREE.Vector3().fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize();
        const color = material.color.clone();
        if (material.vertexColors && colors) color.multiply(new THREE.Color().fromBufferAttribute(colors, index));
        triangle.push(...point.toArray(), ...normal.toArray(), ...color.toArray());
      }
      triangle.push(material.roughness, material.metalness, material.emissiveIntensity ?? 0);
      triangles.push(triangle);
    }
  });
  const geometryBytes = [...geometries].reduce((sum, geometry) => sum + (geometry.index?.array.byteLength ?? 0)
    + Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0), 0);
  disposeObject(root);
  return { name: vehicle.name, mode: vehicle.mode, meshes, geometryBytes, triangles };
});
writeFileSync(process.argv[2] ?? '/tmp/vehicle-preview.json', JSON.stringify(views));
console.log(views.map(view => `${view.name}: ${view.triangles.length} triangles / ${view.meshes} meshes / ${(view.geometryBytes / 1024).toFixed(1)} KiB geometry`).join('\n'));
