import { LongboardRider } from './longboard';
import * as THREE from 'three';
import { LIVERIES } from '../settings';
import { getVehicle, type VehicleDefinition } from '../content/vehicles';
import { buildVehicleBody, buildWheelGeometry, createVehicleMaterials, WHEEL_RADIUS, CAR_EXHAUST_PORTS } from './vehicle-model';
import { Motorcycle } from './motorcycle';
import { ExhaustFlames } from './exhaust-flames';

export const createPlayerVehicle = (vehicle: VehicleDefinition) => vehicle.mode === 'longboard' ? new LongboardRider(undefined, vehicle) : vehicle.mode === 'motorcycle' ? new Motorcycle(vehicle) : new RallyCar(vehicle);

/** A sculpted rally car. Local forward is -Z; origin is the road contact point. */
export class RallyCar {
  readonly group = new THREE.Group();
  readonly suspension = new THREE.Group();
  readonly exhaust = new ExhaustFlames(CAR_EXHAUST_PORTS);
  readonly wheels: THREE.Group[] = [];
  private frontAxles: THREE.Group[] = [];
  private rearWheels = new Set<THREE.Group>();
  private materials = createVehicleMaterials(LIVERIES[0].color, LIVERIES[0].accent);

  constructor(readonly vehicle: VehicleDefinition = getVehicle('falcon')) {
    this.group.scale.set(...vehicle.scale);
    this.group.add(this.suspension);
    const g = this.suspension;
    g.add(buildVehicleBody(vehicle, this.materials));
    g.add(this.exhaust.group);
    // Four wheels share geometry and materials, but keep independent spin and steering.
    const geometry = buildWheelGeometry();
    for (const z of [-1.3, 1.29]) for (const side of [-1, 1]) {
      const axle = new THREE.Group(); axle.position.set(side * 1.035, WHEEL_RADIUS, z);
      const wheel = new THREE.Group(); axle.add(wheel);
      wheel.add(new THREE.Mesh(geometry.tyre, this.materials.rubber), new THREE.Mesh(geometry.rim, this.materials.alloy));
      this.wheels.push(wheel); this.group.add(axle);
      if (z < 0) this.frontAxles.push(axle);
      else this.rearWheels.add(wheel);
    }
    // Racing number and sponsorship are native canvas textures, not downloaded assets.
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eeeade'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#252923'; ctx.font = '900 86px Arial'; ctx.textAlign = 'center'; ctx.fillText('07', 128, 88);
    ctx.font = 'bold 15px Arial'; ctx.fillText('DUSTLINE RACING', 128, 116);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const side of [-1, 1]) {
      const number = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.27), decal);
      number.position.set(side * 1.026, 0.87, -0.05); number.rotation.y = side * Math.PI / 2; g.add(number);
    }
    const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 64;
    const pc = plateCanvas.getContext('2d')!;
    pc.fillStyle = '#e4e8e5'; pc.fillRect(0, 0, 256, 64);
    pc.fillStyle = '#243e63'; pc.fillRect(0, 0, 25, 64);
    pc.fillStyle = '#18212a'; pc.font = 'bold 43px Arial'; pc.textAlign = 'center'; pc.fillText('DL 007', 143, 48);
    const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace;
    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.135), new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.46 }));
    rearPlate.position.set(0, 0.77, 2.148); g.add(rearPlate);
    // Soft baked contact shadow, no expensive real-time shadow map.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const sc = shadowCanvas.getContext('2d')!;
    const gradient = sc.createRadialGradient(32, 32, 8, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(10,15,11,.6)'); gradient.addColorStop(1, 'rgba(10,15,11,0)');
    sc.fillStyle = gradient; sc.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    shadow.name = 'rally-contact-shadow';
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; this.group.add(shadow);
  }

  setLivery(index: number) {
    this.materials.paint.color.set(LIVERIES[index].color);
    this.materials.accent.color.set(LIVERIES[index].accent);
  }
  update(speed: number, steering: number, driftAngle: number, brake: boolean, handbrake: boolean, dt: number) {
    this.wheels.forEach(wheel => {
      if (!handbrake || !this.rearWheels.has(wheel)) wheel.rotation.x -= speed * dt / (WHEEL_RADIUS * this.vehicle.scale[1]);
    });
    const countersteer = THREE.MathUtils.clamp(-steering * 0.3 - driftAngle * 0.95, -0.52, 0.52);
    this.frontAxles.forEach(axle => { axle.rotation.y = countersteer; });
    this.materials.brake.emissiveIntensity = brake || handbrake ? 2.8 : 0.3;
  }
}
