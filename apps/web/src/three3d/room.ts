/**
 * V10g room (table-v2 / BWM "sitting" scene): wood floor, low lounge walls, back bar with an instanced row of bottles and
 * an accent-2 shelf strip, a rug under the table and a pendant lamp. Every colour is derived from the theme uniforms
 * (no literals), so A / B / C / K re-tint it. High adds the back-bar glow light and a warm 1024 shadow pool.
 * Cheap: ~10 draw calls (bottles are one InstancedMesh). Lazy chunk only.
 */
import {
  BoxGeometry, Color, DoubleSide, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, SpotLight, type Texture,
} from 'three';
import { FELTY, type Quality } from './table';
import type { ThemeUniforms } from './themeUniforms';

export const RX = 3.6, ZF = -4.2, ZN = 4.2, RH = 3.4;
const NB = 22;

export interface Room { group: Group; applyTheme(u: ThemeUniforms): void; dispose(): void }

export function buildRoom(q: Quality, wood: Texture, cz: number): Room {
  const group = new Group(); group.name = 'pp-room';
  const ds: { dispose(): void }[] = [];
  const high = q === 'high';
  const mesh = <T extends Mesh>(m: T) => { group.add(m); ds.push(m.geometry, m.material as MeshStandardMaterial); return m; };
  const std = (o: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) => new MeshStandardMaterial({ roughness: 0.95, ...o });

  const floorTex = wood.clone(); floorTex.repeat.set(6, 7); floorTex.needsUpdate = true; ds.push(floorTex);
  const floor = mesh(new Mesh(new PlaneGeometry(RX * 2, ZN - ZF), std({ map: floorTex, roughness: 0.7 })));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = high;
  const far = mesh(new Mesh(new PlaneGeometry(RX * 2, RH), std())); far.position.set(0, RH / 2, ZF);
  const walls = [far.material as MeshStandardMaterial];
  for (const s of [-1, 1]) { const w = mesh(new Mesh(new PlaneGeometry(ZN - ZF, RH), std())); w.rotation.y = -s * Math.PI / 2; w.position.set(s * RX, RH / 2, 0); walls.push(w.material as MeshStandardMaterial); }
  const rug = mesh(new Mesh(new PlaneGeometry(4.6, 4.6), std({ roughness: 1 }))); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.004; rug.receiveShadow = high;

  // back bar + shelf + bottles (one instanced draw) + the accent-2 shelf strip
  const bar = mesh(new Mesh(new BoxGeometry(4.2, 1.05, 0.45), std({ roughness: 0.6 }))); bar.position.set(0, 0.525, ZF + 0.3);
  const shelf = mesh(new Mesh(new BoxGeometry(4.2, 0.03, 0.25), std({ roughness: 0.5 }))); shelf.position.set(0, 1.39, ZF + 0.14);
  const bottleM = new MeshPhysicalMaterial({ roughness: 0.1, clearcoat: 1, envMapIntensity: 1.5 });
  const bottles = new InstancedMesh(new CylinderGeometry(0.035, 0.04, 1, 10), bottleM, NB); group.add(bottles); ds.push(bottles.geometry, bottleM);
  const m4 = new Matrix4();
  for (let i = 0; i < NB; i++) { const h = 0.22 + ((i * 37) % 17) / 100; m4.makeScale(1, h, 1).setPosition(-1.9 + i * 0.18, 1.4 + h / 2, ZF + 0.18); bottles.setMatrixAt(i, m4); }
  const strip = mesh(new Mesh(new BoxGeometry(4.1, 0.012, 0.012), new MeshBasicMaterial({ toneMapped: false }))); strip.position.set(0, 1.375, ZF + 0.27);

  // pendant lamp over the clover: cord, shade, warm bulb
  const lampY = FELTY + 1.5;
  const cord = mesh(new Mesh(new CylinderGeometry(0.004, 0.004, RH - lampY, 6), std())); cord.position.set(0, (RH + lampY) / 2, cz - 0.1);
  const shade = mesh(new Mesh(new ConeGeometry(0.2, 0.16, 24, 1, true), new MeshPhysicalMaterial({ metalness: 0.8, roughness: 0.35, side: DoubleSide }))); shade.position.set(0, lampY, cz - 0.1);
  const bulb = mesh(new Mesh(new CylinderGeometry(0.05, 0.05, 0.01, 16), new MeshBasicMaterial({ toneMapped: false }))); bulb.position.set(0, lampY - 0.075, cz - 0.1);

  // High: back-bar glow + one warm shadow-casting pool on the felt (1024)
  const barLight = high ? new PointLight(0xffffff, 2.5, 3, 1.6) : null;
  if (barLight) { barLight.position.set(0, 1.6, ZF + 0.6); group.add(barLight); }
  const pool = high ? new SpotLight(0xffffff, 6, 0, 0.42, 0.85, 1.6) : null;
  if (pool) {
    pool.position.set(0, lampY - 0.05, cz); pool.target.position.set(0, FELTY, cz);
    pool.castShadow = true; pool.shadow.mapSize.set(1024, 1024); pool.shadow.bias = -0.0001; pool.shadow.radius = 6;
    group.add(pool, pool.target);
  }

  const applyTheme = (u: ThemeUniforms) => {
    const dark = (c: Color, k: number) => c.clone().multiplyScalar(k);
    // charcoal lounge: the theme backdrop pulled toward its own luminance grey, kept dark
    const grey = (c: Color, k: number) => { const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; return c.clone().lerp(new Color(l, l, l), 0.7).multiplyScalar(k); };
    for (const w of walls) w.color.copy(grey(u.bgOut, u.theme === 'B' ? 1 : 0.6));
    (floor.material as MeshStandardMaterial).color.copy(u.wood).multiplyScalar(u.theme === 'B' ? 0.9 : 0.55);
    (rug.material as MeshStandardMaterial).color.copy(u.theme === 'B' ? u.wood : dark(u.felt, 0.35));
    (bar.material as MeshStandardMaterial).color.copy(grey(u.bgOut, 0.5));
    (shelf.material as MeshStandardMaterial).color.copy(u.bgOut).multiplyScalar(1.8);
    const tints = [dark(u.felt, 0.6), dark(u.accent2, 0.25), dark(u.wood, 0.5), dark(u.accent, 0.25)];
    for (let i = 0; i < NB; i++) bottles.setColorAt(i, tints[i % 4]!);
    if (bottles.instanceColor) bottles.instanceColor.needsUpdate = true;
    const glow = u.glow ? 1 : 0.25;
    (strip.material as MeshBasicMaterial).color.copy(u.accent2).multiplyScalar(glow * 1.6);
    (cord.material as MeshStandardMaterial).color.copy(u.bgOut);
    (shade.material as MeshPhysicalMaterial).color.copy(u.theme === 'K' ? u.trim : dark(u.rail, 0.8));
    (bulb.material as MeshBasicMaterial).color.copy(u.key).multiplyScalar(1.5);
    if (barLight) { barLight.color.copy(u.accent2); barLight.intensity = 2.5 * glow; }
    if (pool) pool.color.copy(u.key).lerp(u.wood, 0.25);
  };
  return { group, applyTheme, dispose: () => ds.forEach((d) => d.dispose()) };
}
