import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIVERIES } from '../settings';

type Pigment = 'suit' | 'paint' | 'accent' | 'rubber' | 'trim';
type Ring = readonly [height: number, width: number, depth: number];
const palette = { suit: '#25333c', paint: LIVERIES[0].color, accent: LIVERIES[0].accent, rubber: '#121c25', trim: '#7c909c' };

/** Rounded cross sections give the leather a fitted silhouette, with sewn color panels. */
function contour(rings: readonly Ring[], segments = 16, from = -Math.PI, arc = Math.PI * 2) {
  const positions: number[] = [], indices: number[] = [];
  rings.forEach(([y, x, z]) => {
    for (let j = 0; j <= segments; j++) {
      const angle = from + j / segments * arc;
      positions.push(Math.sin(angle) * x, y, -Math.cos(angle) * z);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function oval(x: number, y: number, z: number, at: readonly [number, number, number] = [0, 0, 0]) {
  return new THREE.SphereGeometry(1, 12, 8).scale(x, y, z).translate(...at);
}

/** One vertex-colored draw per articulated part, instead of a draw for every seam. */
export class RiderModel {
  readonly root = new THREE.Group();
  readonly pelvis: THREE.Mesh;
  readonly torso: THREE.Mesh;
  readonly neck: THREE.Mesh;
  readonly helmet = new THREE.Group();
  readonly legs: THREE.Mesh[] = [];
  readonly arms: THREE.Mesh[] = [];
  readonly knees: THREE.Mesh[] = [];
  readonly elbows: THREE.Mesh[] = [];
  readonly shoes: THREE.Mesh[] = [];
  readonly gloves: THREE.Mesh[] = [];
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: .06 });
  private colored: { attribute: THREE.BufferAttribute; roles: Pigment[] }[] = [];
  private colors = { ...palette };
  private liveryIndex = -1;

  constructor(color?: string) {
    if (color) this.colors.paint = color;
    this.root.name = 'downhill-athlete';
    const part = (name: string, pieces: [THREE.BufferGeometry, Pigment][], parent: THREE.Object3D = this.root) => {
      const roles: Pigment[] = [];
      const geometries = pieces.map(([source, pigment]) => {
        const geometry = source.toNonIndexed(); source.dispose();
        geometry.deleteAttribute('uv');
        const color = new THREE.Color(this.colors[pigment]);
        const values = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < values.length; i += 3) { color.toArray(values, i); roles.push(pigment); }
        geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
        return geometry;
      });
      const geometry = mergeGeometries(geometries)!; geometries.forEach(item => item.dispose());
      const mesh = new THREE.Mesh(geometry, this.material); mesh.name = name; parent.add(mesh);
      this.colored.push({ attribute: geometry.getAttribute('color') as THREE.BufferAttribute, roles });
      return mesh;
    };
    this.pelvis = part('rider-pelvis', [
      [contour([[-.12, .09, .075], [-.075, .15, .1], [.02, .145, .104], [.065, .125, .092]]), 'suit'],
      [contour([[.038, .143, .104], [.06, .127, .096]], 16), 'rubber'],
      [oval(.024, .065, .075, [-.139, -.024, .008]), 'suit'],
      [oval(.024, .065, .075, [.139, -.024, .008]), 'suit'],
    ]);
    this.torso = part('rider-torso', [
      [contour([[0, .126, .092], [.075, .13, .092], [.21, .178, .102], [.31, .205, .096], [.355, .178, .087], [.395, .073, .06], [.41, .063, .056]]), 'suit'],
      [contour([[.09, .136, .095], [.21, .181, .105], [.31, .208, .1], [.345, .186, .092]], 12, -1.23, 2.46), 'paint'],
      [contour([[.125, .148, .098], [.21, .181, .105], [.31, .208, .1], [.345, .186, .092]], 12, Math.PI - 1.15, 2.3), 'paint'],
      [contour([[.255, .196, .106], [.282, .204, .104]], 16), 'accent'],
      [new THREE.BoxGeometry(.012, .235, .01).translate(0, .225, -.104), 'rubber'],
      [new THREE.BoxGeometry(.008, .03, .01).translate(0, .327, -.105), 'trim'],
      [oval(.087, .148, .032, [0, .23, .105]), 'rubber'],
      [contour([[.105, .136, .096], [.14, .149, .10]], 10, Math.PI - .9, 1.8), 'accent'],
      ...[.17, .21, .25, .29].map(y => [oval(.052, .007, .009, [0, y, .137]), 'trim'] as [THREE.BufferGeometry, Pigment]),
      [contour([[.396, .074, .061], [.412, .065, .057]]), 'rubber'],
    ]);
    this.neck = part('rider-neck', [
      [contour([[0, .055, .05], [.035, .049, .045], [.09, .047, .043], [.12, .051, .047]], 12), 'suit'],
    ]);
    // Full-face shell: swept brow, wrap-around visor and a rounded integrated chin bar.
    this.helmet.name = 'full-face-helmet'; this.root.add(this.helmet);
    part('helmet-shell', [
      [oval(.126, .149, .142, [0, .01, .006]), 'paint'],
      [contour([[-.13, .079, .085], [-.105, .116, .147], [-.076, .124, .155], [-.045, .122, .145]], 20, -1.34, 2.68), 'paint'],
      [contour([[-.117, .095, .113], [-.106, .115, .15]], 20, -1.3, 2.6), 'accent'],
      [oval(.062, .021, .031, [0, -.09, -.135]), 'rubber'],
      [new THREE.BoxGeometry(.008, .028, .006).translate(-.019, -.083, -.162), 'trim'],
      [new THREE.BoxGeometry(.008, .028, .006).translate(.019, -.083, -.162), 'trim'],
      [oval(.013, .027, .037, [-.125, -.019, -.017]), 'rubber'],
      [oval(.013, .027, .037, [.125, -.019, -.017]), 'rubber'],
      [oval(.034, .15, .143, [0, .015, .008]), 'accent'],
      [oval(.015, .01, .029, [-.061, .132, -.028]), 'rubber'],
      [oval(.015, .01, .029, [.061, .132, -.028]), 'rubber'],
      [oval(.07, .015, .012, [0, -.039, .138]), 'rubber'],
    ], this.helmet);
    const visorGeometry = contour([[-.048, .123, .146], [-.012, .131, .151], [.035, .126, .145], [.064, .109, .127]], 24, -1.4, 2.8);
    const visor = new THREE.Mesh(visorGeometry, new THREE.MeshStandardMaterial({ color: '#193747', metalness: .65, roughness: .16 }));
    visor.name = 'smoked-wraparound-visor'; this.helmet.add(visor);
    part('visor-seal', [
      [contour([[.061, .111, .13], [.072, .108, .126]], 24, -1.41, 2.82), 'rubber'],
      [contour([[-.052, .125, .148], [-.043, .128, .152]], 24, -1.4, 2.8), 'rubber'],
      [contour([[.04, .125, .148], [.047, .122, .144]], 10, -.87, 1.5), 'trim'],
    ], this.helmet);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 'left' : 'right';
      this.legs.push(part(`${side}-thigh`, [
        [contour([[0, .079, .083], [.07, .089, .094], [.20, .082, .084], [.34, .062, .067], [.41, .057, .06]]), 'suit'],
        [contour([[.025, .085, .09], [.09, .092, .097], [.25, .078, .08], [.34, .065, .07]], 4, i ? 1.1 : -2.0, .85), 'paint'],
        [oval(.081, .085, .085, [0, .025, 0]), 'suit'],
      ]));
      this.legs.push(part(`${side}-shin`, [
        [contour([[0, .061, .064], [.08, .07, .074], [.20, .063, .066], [.32, .045, .049], [.39, .04, .043]]), 'suit'],
        [contour([[.08, .073, .077], [.22, .063, .066], [.30, .048, .054]], 5, -1.15, 2.3), 'paint'],
        [contour([[.27, .055, .061], [.292, .051, .056]], 8, -1.2, 2.4), 'accent'],
      ]));
      this.knees.push(part(`${side}-knee`, [
        [oval(.068, .069, .069), 'rubber'],
        [oval(.061, .068, .027, [0, 0, -.06]), 'paint'],
        [oval(.031, .009, .008, [0, .005, -.086]), 'accent'],
      ]));
      this.arms.push(part(`${side}-upper-arm`, [
        [contour([[0, .055, .059], [.055, .065, .068], [.14, .055, .057], [.24, .042, .044], [.29, .039, .042]]), 'paint'],
        [oval(.064, .065, .067, [0, .02, 0]), 'paint'],
        [oval(.045, .055, .016, [0, .035, -.055]), 'suit'],
        [contour([[.078, .065, .068], [.107, .062, .065]]), 'accent'],
        [contour([[.15, .056, .059], [.24, .044, .046], [.29, .041, .044]], 6, 1.4, 2.9), 'suit'],
      ]));
      this.arms.push(part(`${side}-forearm`, [
        [contour([[0, .042, .044], [.075, .052, .054], [.16, .043, .045], [.25, .029, .033], [.28, .028, .031]]), 'suit'],
        [contour([[.035, .05, .052], [.085, .054, .057], [.19, .041, .044]], 7, -1.25, 2.5), 'paint'],
        [contour([[.216, .034, .038], [.246, .031, .035]]), 'accent'],
      ]));
      this.elbows.push(part(`${side}-elbow`, [[oval(.046, .047, .047), 'rubber'], [oval(.038, .03, .047, [0, -.012, .008]), 'suit']]));
      this.shoes.push(part(`${side}-foot`, [
        [oval(.057, .035, .129, [0, -.018, -.024]), 'paint'],
        [oval(.054, .041, .12, [0, .002, -.021]), 'rubber'],
        [oval(.046, .051, .049, [0, .026, .039]), 'suit'],
        [oval(.045, .027, .055, [0, .031, -.031]), 'suit'],
        ...[-.004, -.026, -.048].map(z => [new THREE.BoxGeometry(.062, .005, .009).translate(0, .055, z), 'trim'] as [THREE.BufferGeometry, Pigment]),
        [oval(.004, .014, .047, [-.053, .004, -.026]), 'accent'],
        [oval(.004, .014, .047, [.053, .004, -.026]), 'accent'],
        [oval(.038, .024, .029, [0, .01, -.122]), 'suit'],
        [oval(.043, .014, .014, [0, -.019, .095]), 'rubber'],
      ]));
      this.gloves.push(part(`${side}-slide-glove`, [
        [oval(.043, .031, .058), 'suit'],
        [oval(.041, .026, .029, [0, -.001, -.046]), 'suit'],
        [oval(.015, .019, .038, [i ? -.039 : .039, -.002, .005]), 'suit'],
        [oval(.04, .012, .03, [0, .028, -.011]), 'accent'],
        ...[-.02, 0, .02].map(x => [oval(.006, .003, .017, [x, .024, -.047]), 'rubber'] as [THREE.BufferGeometry, Pigment]),
        [new THREE.CylinderGeometry(.041, .042, .014, 12).translate(0, -.038, -.012), 'paint'],
        [new THREE.CylinderGeometry(.026, .026, .008, 12).rotateX(Math.PI / 2).translate(0, 0, .057), 'rubber'],
      ]));
    }
  }

  setLivery(index: number) {
    if (this.liveryIndex === index) return;
    this.liveryIndex = index;
    this.colors.paint = LIVERIES[index].color; this.colors.accent = LIVERIES[index].accent;
    const colors = Object.fromEntries(Object.entries(this.colors).map(([key, value]) => [key, new THREE.Color(value)])) as Record<Pigment, THREE.Color>;
    for (const { attribute, roles } of this.colored) {
      roles.forEach((role, i) => { const c = colors[role]; attribute.setXYZ(i, c.r, c.g, c.b); });
      attribute.needsUpdate = true;
    }
  }
}
