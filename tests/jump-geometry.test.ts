import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../src/content/stages.ts';
import { Track } from '../src/simulation/track.ts';
import { buildWorld } from '../src/render/world.ts';
import { disposeObject } from '../src/render/dispose.ts';
import { placeGroundShadow } from '../src/render/ground-shadow.ts';

test('rendered ramps match collision height, remain above terrain and have warning signs', () => {
  // Only CPU geometry and ray intersections: no browser, WebGL or running game.
  const original = globalThis.document;
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
  try {
    for (const stage of STAGES.filter(stage => stage.jumps)) {
      const track = new Track(stage); const scene = new THREE.Group(); buildWorld(scene, track); scene.updateMatrixWorld(true);
      const road = scene.getObjectByName('rally-road')!; const terrain = scene.getObjectByName('rally-terrain')!;
      assert.equal((scene.getObjectByName('jump-warning-boards') as THREE.InstancedMesh).count, stage.jumps!.length * 2);
      for (const crest of stage.jumps!) for (const offset of [-crest.approach, -crest.approach / 2, 0, crest.landing / 2, crest.landing]) {
        for (const lane of [-track.roadWidth / 2 + 0.8, 0, track.roadWidth / 2 - 0.8]) {
          const p = track.position(crest.distance + offset, lane);
          const ray = new THREE.Raycaster(new THREE.Vector3(p.x, p.y + 100, p.z), new THREE.Vector3(0, -1, 0));
          const roadHit = ray.intersectObject(road)[0]; const terrainHit = ray.intersectObject(terrain)[0];
          assert.ok(roadHit && terrainHit, `${stage.id}: missing road or ground`);
          assert.ok(Math.abs(roadHit.point.y - track.surfaceHeight(p.x, p.z) - 0.04) < 0.09, `${stage.id}/${crest.distance}: visual/collision mismatch`);
          assert.ok(roadHit.point.y > terrainHit.point.y + 0.04, `${stage.id}/${crest.distance}/${offset}/${lane}: terrain covers jump`);
        }
      }
      disposeObject(scene);
    }
  } finally { globalThis.document = original; }
});

test('contact shadow stays on the road when a scaled, pitched car takes off and lands', () => {
  const group = new THREE.Group(); group.scale.set(1.08, 1.16, 1.17); group.rotation.order = 'YXZ';
  const material = new THREE.MeshBasicMaterial({ transparent: true });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), material);
  shadow.name = 'rally-contact-shadow'; shadow.rotation.x = -Math.PI / 2; group.add(shadow);
  for (const clearance of [0, 1, 6, 12, 4, 0]) {
    const p = { x: 12, y: 30 + clearance, z: -50 };
    group.position.set(p.x, p.y + 0.065, p.z); group.rotation.set(0.2, 0.7, 0); group.updateWorldMatrix(true, false);
    placeGroundShadow(group, p, clearance, 0.7, 0.08); group.updateMatrixWorld(true);
    const center = shadow.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(center.x - p.x) < 1e-8 && Math.abs(center.z - p.z) < 1e-8);
    assert.ok(Math.abs(center.y - 30.1) < 1e-8, 'shadow must not follow the car into the air');
    assert.ok(material.opacity > 0 && material.opacity <= 1);
  }
  assert.equal(material.opacity, 1); disposeObject(group);
});
