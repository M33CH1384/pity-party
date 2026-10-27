/**
 * V10d Pitty Pat on the 3D felt: stock with a count, the upcard, shelves per seat (top pair face-up, older pairs stacked
 * under it), the opponents' card backs, and 3D seat plates (the DOM seat strip stays as the a11y / test layer).
 * Everything comes from the PUBLIC table snapshot (`data-t3d`), so no hand face can reach the felt.
 * Animations come from the snapshot diff: flip-from-stock, pair-to-shelf flight, shed-to-upcard flight, and the
 * ~700ms gather/reshuffle beat when a new hand is dealt. Reduced motion: everything snaps, no beat.
 * Ported from BWM Card3D table poses (flat felt card + flight lerp with a lift arc).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, type Texture, Vector3 } from 'three';
import type { TableSnap } from './handMirror';
import { backTexture, badgeTexture, cardFontsReady, plateTexture, tableFaceTexture } from './cardTextures';
import { faceGeometry } from './cardGeometry';
import { CASPECT, CH, CW, pairX, ppLayout, type XZ } from './ppLayout';
import { FELTY } from './table';
import type { ThemeUniforms } from './themeUniforms';

export const FLIGHT_MS = 480, GATHER_MS = 700;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const plateGeo = new PlaneGeometry(1, 1);
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

interface Flight { obj: Group; from: Vector3; to: Vector3; q0: Quaternion; q1: Quaternion; t0: number; ms: number; hideAtEnd?: boolean }
const evKey = (s: TableSnap | null) => (s?.ev ? s.ev.join(':') : '');

export function PPTable3D({ snap, u, cz, aspect, onDrawn }: { snap: TableSnap | null; u: ThemeUniforms; cz: number; aspect: number; onDrawn: (on: boolean) => void }) {
  const { camera, invalidate } = useThree();
  const [fonts, setFonts] = useState(false);
  useEffect(() => { let live = true; void cardFontsReady().then(() => { if (live) setFonts(true); }); return () => { live = false; }; }, []);
  const group = useMemo(() => new Group(), []);
  const flights = useRef<Flight[]>([]);
  const prev = useRef<TableSnap | null>(null);
  const lastPos = useRef(new Map<string, Vector3>());
  const [gather, setGather] = useState<TableSnap | null>(null);

  // the gather/reshuffle beat: a fresh deal (engine 'deal' event) shows the OLD table collecting into the stock for ~700ms
  useEffect(() => {
    const was = prev.current;
    if (snap && was && snap.ev?.[0] === 'deal' && evKey(was) !== evKey(snap) && (was.up || was.sh.some((x) => x.length) || was.sp?.some((x) => x.length)) && !reduced()) {
      setGather(was);
      const w = window as unknown as { __pp3dGather?: number }; w.__pp3dGather = (w.__pp3dGather ?? 0) + 1;
      const t = window.setTimeout(() => setGather(null), GATHER_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [snap]);

  useEffect(() => {
    group.clear(); flights.current = [];
    const s = gather ?? snap;
    if (!fonts || !s) { onDrawn(false); invalidate(); return; }
    const L = ppLayout(s.n, s.me, aspect, cz);
    const y = FELTY + 0.002;
    const ink = u.theme === 'B' ? u.trim : null;
    const mats: MeshBasicMaterial[] = []; const texs: CanvasTexture[] = [];
    const mat = (o: ConstructorParameters<typeof MeshBasicMaterial>[0]) => { const m = new MeshBasicMaterial({ toneMapped: false, ...o }); mats.push(m); return m; };
    const backM = mat({ map: backTexture() });
    const edgeM = ink ? mat({ color: ink }) : null;
    const camQ = camera.quaternion.clone();
    const at = (xz: XZ, lift = 0) => new Vector3(xz[0], y + lift, xz[1]);

    /** a flat card on the felt (face texture or the back), B ink edge under it */
    const keyed: [string, Group][] = [];
    const card = (tex: Texture | null, pos: Vector3, scale = 1, name = 'table-card', key?: string) => {
      const g = new Group(); g.name = name; if (key) keyed.push([key, g]); g.position.copy(pos); g.quaternion.copy(FLAT);
      const geo = faceGeometry(CASPECT);
      if (edgeM) { const e = new Mesh(geo, edgeM); const k = CW * scale + 0.009; e.scale.set(k, k * 0.995, 1); e.position.z = -0.0006; g.add(e); }
      const f = new Mesh(geo, tex ? mat({ map: tex }) : backM); f.scale.set(CW * scale, CW * scale, 1); g.add(f);
      group.add(g); return g;
    };
    const billboard = (tex: CanvasTexture, pos: Vector3, w: number, h: number, name: string) => {
      texs.push(tex); const m = new Mesh(plateGeo, mat({ map: tex, transparent: true, depthWrite: false })); m.name = name;
      m.position.copy(pos); m.quaternion.copy(camQ); m.scale.set(w, h, 1); m.renderOrder = 10; group.add(m); return m;
    };
    const fly = (obj: Group, from: Vector3, faceDown = false, ms = FLIGHT_MS, hideAtEnd = false) => {
      if (reduced()) { if (hideAtEnd) obj.visible = false; return; }
      if (faceDown) { const bk = new Mesh(faceGeometry(CASPECT), backM); bk.scale.set(CW, CW, 1); bk.rotation.y = Math.PI; bk.position.z = -0.0004; obj.add(bk); }
      const q1 = obj.quaternion.clone(); const q0 = faceDown ? q1.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)) : q1.clone();
      flights.current.push({ obj, from, to: obj.position.clone(), q0, q1, t0: performance.now(), ms, hideAtEnd });
      obj.position.copy(from);
    };

    // stock: a short stack of backs + the count badge
    const stockN = Math.max(0, s.st);
    for (let k = 0; k < Math.min(3, Math.ceil(stockN / 8)); k++) card(null, at(L.stock, k * 0.004).add(new Vector3(-k * 0.003, 0, -k * 0.003)), 1, 'stock');
    if (stockN === 0) card(null, at(L.stock), 1, 'stock').visible = false;
    billboard(badgeTexture(String(stockN)), at(L.stock, 0.04).add(new Vector3(-CW * 0.95, 0, 0)), 0.15, 0.1, 'stock-count');

    // upcard
    const upObj = s.up ? card(tableFaceTexture(s.up[0], s.up[1]), at(L.up, 0.003), 1, 'upcard', `up:${s.up[0]}`) : null;

    // shelves + opponents' backs + plates
    const shelfTop = new Map<number, Group[]>();
    for (let seat = 0; seat < s.n; seat++) {
      const slot = L.seats.get(seat);
      const cards = s.sh[seat] ?? [];
      const pairs = Math.floor(cards.length / 2);
      const rows = s.sp?.[seat] ?? [];
      const cc = `${s.hc[seat] ?? 0} card${s.hc[seat] === 1 ? '' : 's'}`;
      // Tonk hand end (public): the drop / caught / stock-out reveal is each seat's count; winner + caught dropper ringed
      const end = s.end ?? null; const endCount = end ? end[3][seat] : undefined;
      const sub = end && endCount !== undefined
        ? `${seat === end[1] ? 'Won' : seat === end[2] ? (end[0] === 'caught' ? 'Caught!' : 'Dropped') : end[0] === 'stockOut' && end[1] === null ? 'Tie' : 'Count'} · ${endCount}`
        : s.k === 'tk' ? `${cc} · ${rows.length} spread${rows.length === 1 ? '' : 's'}${s.lk?.[seat] ? ' · locked' : ''}` : `${cc} · ${pairs} pair${pairs === 1 ? '' : 's'}`;
      const plate = { name: s.nm[seat] ?? `Seat ${seat + 1}`, pts: `${s.pt[seat] ?? 0}${s.tg !== null ? `/${s.tg}` : ''}`, sub, turn: !end && s.turn === seat, out: s.on[seat] === false, me: seat === s.me,
        hi: !!end && (seat === end[1] || (end[0] === 'caught' && seat === end[2])) };
      if (!slot) { // my seat: plate only (my own pairs are listed on the DOM side, never on the near felt)
        if (L.me && seat === s.me) billboard(plateTexture(plate), at(L.me.plate, 0.14), L.portrait ? 0.36 : 0.5, L.portrait ? 0.126 : 0.175, `plate-${seat}`);
        continue;
      }
      billboard(plateTexture(plate), at(slot.plate, 0.17), 0.5, 0.175, `plate-${seat}`);
      // opponent hand: backs only, a small fan (count capped at 5) under the plate
      const nb = Math.min(5, s.hc[seat] ?? 0);
      for (let k = 0; k < nb; k++) { const g = card(null, at(slot.backs, 0.001 + k * 0.0008).add(new Vector3((k - (nb - 1) / 2) * 0.035, 0, 0)), 0.55, `backs-${seat}`); g.rotateZ(((k - (nb - 1) / 2) * 6 * Math.PI) / 180); }
      // Tonk: spread rows, newest nearest the centre; a row fans at the spec step and compresses past the slot width
      if (rows.length) {
        const sc = 0.72, cw = CW * sc, slotW = L.portrait ? (s.n >= 4 ? 0.46 : 0.6) : 0.62;
        rows.slice(-3).forEach(([id, texts], r, shown) => {
          const step = Math.min(L.portrait ? 0.068 : 0.085, texts.length > 1 ? (slotW - cw) / (texts.length - 1) : 1);
          const z = slot.shelf[1] - CH * sc * 0.42 * (shown.length - 1 - r);
          texts.forEach((t, i) => card(tableFaceTexture(t, false, true), at([slot.shelf[0] + (i - (texts.length - 1) / 2) * step, z], 0.002 + r * 0.002 + i * 0.0006), sc, `spread-${seat}`, `sp${id}:${t}:${i}`));
        });
      }
      if (!pairs) continue;
      // older pairs: up to 3 stacked layers under the top pair
      for (let k = Math.min(3, pairs - 1); k >= 1; k--) for (const i of [0, 1]) card(null, at(slot.shelf, 0.0008 * (4 - k)).add(new Vector3(pairX(i, 2), 0, -k * 0.018)), 1, `shelf-under-${seat}`);
      const top = cards.slice(-2);
      shelfTop.set(seat, top.map((t, i) => card(tableFaceTexture(t, false), at(slot.shelf, 0.004 + i * 0.0008).add(new Vector3(pairX(i, top.length), 0, 0)), 1, `shelf-${seat}`, `sh${seat}:${t}:${i}`)));
    }

    // flights from the snapshot diff (not during the gather beat)
    const was = prev.current;
    if (!gather && was && snap && evKey(was) !== evKey(snap) && snap.ev) {
      const [e, seat] = snap.ev;
      const seatFrom = (st: number | null): Vector3 => { const sl = st !== null ? L.seats.get(st) : undefined; return sl ? at(sl.backs, 0.08) : at([0, cz + 0.7], 0.12); };
      if (e === 'flip' && upObj) fly(upObj, at(L.stock, 0.06), true);
      else if (e === 'discard' && upObj) fly(upObj, seatFrom(seat));
      else if (e === 'pair' && seat !== null) for (const g of shelfTop.get(seat) ?? []) fly(g, at(L.up, 0.08));
      else if (e === 'deal' && upObj) fly(upObj, at(L.stock, 0.06), true);
      // Tonk: a new spread / a hit flies in from the seat (a slap from the discard); cards already down re-fan from where they were
      if (s.k === 'tk' && (e === 'spread' || e === 'hit' || e === 'slap')) {
        const from = e === 'slap' ? at(L.up, 0.08) : seatFrom(seat);
        for (const [k, g] of keyed) if (k.startsWith('sp') && !lastPos.current.has(k)) fly(g, from);
      }
      for (const [k, g] of keyed) { const old = lastPos.current.get(k); if (old && old.distanceTo(g.position) > 0.005 && !flights.current.some((f) => f.obj === g)) fly(g, old, false, 300); }
    }
    if (!gather) lastPos.current = new Map(keyed.map(([k, g]) => [k, flights.current.find((f) => f.obj === g)?.to ?? g.position.clone()]));
    if (gather) {
      // collect every table card into the stock
      group.children.forEach((o) => { if (o instanceof Group && /^(upcard|shelf|backs|spread)/.test(o.name)) { const to = at(L.stock, 0.01); const from = o.position.clone(); o.position.copy(to); fly(o, from, false, GATHER_MS - 80, true); } });
    }
    prev.current = snap;
    (window as unknown as { __pp3dFlights?: number }).__pp3dFlights = flights.current.length;
    onDrawn(true); invalidate();
    return () => { mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose()); };
  }, [snap, gather, fonts, u, aspect, cz, camera, group, invalidate, onDrawn]);
  useEffect(() => () => onDrawn(false), [onDrawn]);

  useFrame(() => {
    const fl = flights.current; if (!fl.length) return;
    const now = performance.now();
    for (const f of fl) {
      const t = Math.min(1, (now - f.t0) / f.ms); const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      f.obj.position.lerpVectors(f.from, f.to, e); f.obj.position.y += Math.sin(Math.PI * e) * 0.12;
      f.obj.quaternion.slerpQuaternions(f.q0, f.q1, e);
      if (t === 1 && f.hideAtEnd) f.obj.visible = false;
    }
    flights.current = fl.filter((f) => now - f.t0 < f.ms);
    (window as unknown as { __pp3dFlights?: number }).__pp3dFlights = flights.current.length;
    invalidate();
  });
  return <primitive object={group} />;
}
