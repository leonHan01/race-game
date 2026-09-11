import * as THREE from 'three';
import { LIVERIES } from '../settings';
import { getVehicle, type VehicleDefinition } from '../content/vehicles';


function box(parent: THREE.Object3D, size: number[], position: number[], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
  mesh.position.set(...position as [number, number, number]); parent.add(mesh); return mesh;
}

/** A purpose-built widebody hatchback. Local forward is -Z; origin is the road contact point. */
export class RallyCar {
  readonly group = new THREE.Group();
  readonly suspension = new THREE.Group();
  readonly wheels: THREE.Group[] = [];
  private frontAxles: THREE.Group[] = [];
  private rearWheels = new Set<THREE.Group>();
  private paint = new THREE.MeshStandardMaterial({ color: LIVERIES[0].color, roughness: 0.46, metalness: 0.25 });
  private accent = new THREE.MeshStandardMaterial({ color: LIVERIES[0].accent, roughness: 0.62 });
  private brakeLights = new THREE.MeshBasicMaterial({ color: '#ab3324' });

  constructor(readonly vehicle: VehicleDefinition = getVehicle('falcon')) {
    // Each model owns its materials, so garage swaps can release the old model safely.
    const rubber = new THREE.MeshStandardMaterial({ color: '#252721', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#222b2c', roughness: 0.72, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: '#293b40', roughness: 0.24, metalness: 0.62 });
    const metal = new THREE.MeshStandardMaterial({ color: '#b6b6a7', roughness: 0.42, metalness: 0.6 });
    const headlight = new THREE.MeshBasicMaterial({ color: '#fff4d4' });
    const truck = vehicle.body === 'truck';
    const coupe = vehicle.body === 'coupe';
    this.group.scale.set(...vehicle.scale);
    this.group.add(this.suspension);
    const g = this.suspension;
    box(g, [2.02, 0.56, 4.12], [0, 0.77, 0], this.paint);
    box(g, [1.86, 0.16, 1.12], [0, 1.06, -1.46], this.paint).rotation.x = 0.055;
    box(g, [2.09, 0.2, 0.28], [0, 0.55, -2.09], dark);
    box(g, [2.11, 0.2, 0.25], [0, 0.55, 2.07], dark);
    // Roof and sloped glazing use a trapezoid extrusion, with body-coloured pillars.
    const profile = new THREE.Shape();
    profile.moveTo(-1.06, 1.02); profile.lineTo(-0.48, 1.76); profile.lineTo(truck ? 0.25 : coupe ? 0.8 : 1.04, 1.76); profile.lineTo(truck ? 0.48 : 1.65, 1.06); profile.closePath();
    const cabinGeometry = new THREE.ExtrudeGeometry(profile, { depth: 1.66, bevelEnabled: false });
    cabinGeometry.rotateY(-Math.PI / 2); cabinGeometry.translate(0.83, 0, 0);
    g.add(new THREE.Mesh(cabinGeometry, glass));
    box(g, [1.72, 0.10, truck ? 0.8 : coupe ? 1.35 : 1.6], [0, 1.79, truck ? -0.1 : coupe ? 0.12 : 0.26], this.paint);
    for (const side of [-1, 1]) {
      box(g, [0.09, 0.67, 0.11], [side * 0.87, 1.42, truck ? 0.3 : 0.38], this.paint);
      box(g, [0.09, 0.91, 0.09], [side * 0.86, 1.4, -0.78], this.paint).rotation.x = -0.65;
      if (!truck) box(g, [0.09, 0.91, 0.1], [side * 0.86, 1.4, 1.35], this.paint).rotation.x = 0.68;
      box(g, [0.08, 0.11, 2.75], [side * 0.99, 1.03, 0.1], this.paint);
      box(g, [0.035, 0.25, 3.87], [side * 1.024, 0.81, 0], this.accent);
      box(g, [0.32, 0.18, 0.3], [side * 1.08, 1.17, -0.68], this.paint);
      box(g, [0.07, 0.055, 0.21], [side * 1.049, 1.025, 0.32], dark);
      for (const z of [-1.3, 1.29]) {
        box(g, [0.2, 0.44, 1.12], [side * 1.04, 0.86, z], this.paint);
        box(g, [0.3, 0.4, 0.07], [side * 1.06, 0.4, z + 0.5], rubber);
        const axle = new THREE.Group(); axle.position.set(side * 1.035, 0.46, z);
        const wheel = new THREE.Group(); axle.add(wheel);
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 16), rubber);
        tyre.rotation.z = Math.PI / 2; wheel.add(tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.36, 12), metal);
        hub.rotation.z = Math.PI / 2; wheel.add(hub);
        for (let spoke = 0; spoke < 6; spoke++) {
          const bar = box(wheel, [0.38, 0.46, 0.055], [0, 0, 0], dark);
          bar.rotation.x = spoke / 6 * Math.PI;
        }
        this.wheels.push(wheel); this.group.add(axle);
        if (z < 0) this.frontAxles.push(axle);
        else this.rearWheels.add(wheel);
      }
      box(g, [0.58, 0.19, 0.04], [side * 0.64, 0.94, -2.08], headlight);
      box(g, [0.39, 0.26, 0.04], [side * 0.76, 0.98, 2.08], this.brakeLights);
      if (!truck) box(g, [0.12, 0.31, 0.16], [side * 0.69, 1.64, 1.67], dark);
    }
    if (truck) {
      box(g, [1.75, 0.09, 1.45], [0, 1.08, 1.27], dark);
      for (const side of [-1, 1]) {
        box(g, [0.14, 0.34, 1.5], [side * 0.94, 1.2, 1.25], this.paint);
        box(g, [0.1, 0.72, 0.1], [side * 0.75, 1.55, 0.69], dark);
      }
      box(g, [1.6, 0.1, 0.1], [0, 1.91, 0.69], dark);
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 16), rubber);
      spare.position.set(0, 1.27, 1.35); g.add(spare);
    } else {
      box(g, [coupe ? 2.25 : 2.06, 0.1, coupe ? 0.58 : 0.42], [0, 1.85, 1.72], dark);
      box(g, [0.58, 0.16, 0.58], [0, 1.91, -0.01], this.paint);
      box(g, [0.43, 0.07, 0.04], [0, 1.93, -0.32], dark);
    }
    box(g, [1.02, 0.23, 0.03], [0, 0.69, -2.245], dark);
    box(g, [0.11, 0.05, 1.31], [-0.47, 1.152, -1.34], this.accent);
    box(g, [0.11, 0.05, 1.31], [-0.28, 1.152, -1.34], this.accent);
    for (const x of [-0.58, -0.2, 0.2, 0.58]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.16, 0.14, 12), dark);
      lamp.rotation.x = Math.PI / 2; lamp.position.set(x, 1.12, -2.03); g.add(lamp);
      const light = new THREE.Mesh(new THREE.CircleGeometry(0.117, 12), headlight);
      light.rotation.y = Math.PI; light.position.set(x, 1.12, -2.106); g.add(light);
    }
    const antenna = box(g, [0.015, 0.65, 0.015], [0, 2.15, 0.94], dark); antenna.rotation.x = -0.14;
    // Racing number and sponsorship are native canvas textures, not downloaded assets.
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eeeade'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#252923'; ctx.font = '900 86px Arial'; ctx.textAlign = 'center'; ctx.fillText('07', 128, 88);
    ctx.font = 'bold 15px Arial'; ctx.fillText('DUSTLINE RACING', 128, 116);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.MeshBasicMaterial({ map: texture, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const side of [-1, 1]) {
      const number = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.44), decal);
      number.position.set(side * 1.049, 0.84, -0.05); number.rotation.y = side * Math.PI / 2; g.add(number);
    }
    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.22), decal);
    rearPlate.position.set(0, 0.81, 2.09); g.add(rearPlate);
    // Soft baked contact shadow, no expensive real-time shadow map.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const sc = shadowCanvas.getContext('2d')!;
    const gradient = sc.createRadialGradient(32, 32, 8, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(10,15,11,.6)'); gradient.addColorStop(1, 'rgba(10,15,11,0)');
    sc.fillStyle = gradient; sc.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; this.group.add(shadow);
  }

  setLivery(index: number) { this.paint.color.set(LIVERIES[index].color); this.accent.color.set(LIVERIES[index].accent); }
  update(speed: number, steering: number, driftAngle: number, brake: boolean, handbrake: boolean, dt: number) {
    this.wheels.forEach(wheel => {
      if (!handbrake || !this.rearWheels.has(wheel)) wheel.rotation.x -= speed * dt / (0.46 * this.vehicle.scale[1]);
    });
    const countersteer = THREE.MathUtils.clamp(-steering * 0.3 - driftAngle * 0.95, -0.52, 0.52);
    this.frontAxles.forEach(axle => { axle.rotation.y = countersteer; });
    this.brakeLights.color.set(brake || handbrake ? '#ff7051' : '#a12d24');
  }
}
