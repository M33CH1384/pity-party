/** V3: one card renderer (cards/cardArt.ts) for the 2D SVG faces and the later 3D canvas textures. */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type PpState, type TkState } from '@pp/game';
import { type CardLike, type Ctx2D, type Prim, FACE_FILL, SUIT_INK, backModel, cardModel, drawBack, drawCard } from '../src/cards/cardArt';
import { courtArt } from '../src/cards/courtArt';
import { localLegal, localResults, localToAct, localView, newLocalGame } from '../src/modes/localGame';
import { ModeScreen } from '../src/modes/ModeScreen';

const SUITS = ['S', 'H', 'D', 'C'] as const;
const deck: CardLike[] = [...SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: s }))), { rank: 0, suit: null }];
const texts = (ps: Prim[]) => ps.filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text');
const name = (c: CardLike) => (c.suit ? `${c.rank}${c.suit}` : 'JK');

describe('card faces (full 640×896 layout)', () => {
  it('snapshot: every rank × suit + joker, full and compact', () => {
    const line = (ps: Prim[]) => ps.map((p) => (p.k === 'text' ? `${p.t}@${p.x},${p.y}/${p.size}${p.rot ? 'r' : ''}${p.sx ? `x${p.sx}` : ''}:${p.fill}` : p.k === 'rect' ? `[${p.x},${p.y},${p.w},${p.h}]${p.fill}` : `img:${p.src}`)).join(' ');
    const snap = deck.flatMap((c) => [`${name(c)}: ${line(cardModel(c))}`, `${name(c)}-c: ${line(cardModel(c, { compact: true }))}`]).join('\n');
    expect(snap).toMatchSnapshot();
  });
  it('white, untinted faces; indices at both corners; 2–10 draw exactly `rank` pips; 10 condensed to 66%', () => {
    for (const c of deck) {
      const m = cardModel(c);
      expect(m[0]).toMatchObject({ k: 'rect', fill: FACE_FILL });
      expect(FACE_FILL).toBe('#FFFFFF');
      if (!c.suit) continue;
      const glyph = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit];
      const idx = texts(m).filter((t) => t.size === 160);
      expect(idx.length, name(c)).toBe(2);
      expect(idx.every((t) => t.weight === 700)).toBe(true);
      if (c.rank === 10) expect(idx[0]!.sx).toBe(0.66);
      if (c.rank >= 2 && c.rank <= 10) expect(texts(m).filter((t) => t.size === 104 && t.t === glyph).length, name(c)).toBe(c.rank);
      if (c.rank === 1) expect(texts(m).some((t) => t.size === 360)).toBe(true);
    }
  });
  it('suit inks: 4-colour by default, Classic is black/red; never themed', () => {
    const ink = (c: CardLike, suits?: 'four' | 'classic') => texts(cardModel(c, { suits }))[0]!.fill;
    expect(SUITS.map((s) => ink({ rank: 5, suit: s }))).toEqual(['#111114', '#D1123F', '#0066CC', '#0E6E78']);
    expect(SUITS.map((s) => ink({ rank: 5, suit: s }, 'classic'))).toEqual(['#111114', '#D1123F', '#D1123F', '#111114']);
    expect(SUIT_INK.four.H).toBe(SUIT_INK.classic.H);
  });
  it('wild W corner tag only when the rule makes the card wild, in the accent', () => {
    const plain = texts(cardModel({ rank: 2, suit: 'C' })).some((t) => t.t === 'W');
    const wild = cardModel({ rank: 2, suit: 'C' }, { wild: true, accent: 'var(--pp-accent)', accentOn: 'var(--pp-accent-on)' });
    expect(plain).toBe(false);
    expect(texts(wild).find((t) => t.t === 'W')!.fill).toBe('var(--pp-accent-on)');
    expect(wild.find((p) => p.k === 'rect' && p.fill === 'var(--pp-accent)')).toBeTruthy();
  });
  it('compact (phones) keeps a big index: rank 250/896 of the height → ≥ 14px on an 80px-tall card', () => {
    const r = texts(cardModel({ rank: 10, suit: 'H' }, { compact: true }))[0]!;
    expect((r.size / 896) * 80 * 0.7).toBeGreaterThanOrEqual(13.5); // cap height ≈ .7em
  });
});

describe('court art manifest (typographic until the licence clears)', () => {
  it('ships with no art: courts are lettered J/Q/K in a suit-colour frame', () => {
    for (const r of [11, 12, 13]) {
      const m = cardModel({ rank: r, suit: 'H' });
      expect(m.some((p) => p.k === 'img')).toBe(false);
      expect(texts(m).some((t) => t.size === 300 && t.t === ['J', 'Q', 'K'][r - 11])).toBe(true);
      expect(m.some((p) => p.k === 'rect' && p.stroke === '#D1123F' && p.sw === 10)).toBe(true);
    }
  });
  it('a licensed same-origin entry swaps the art in; unlicensed or off-site entries are ignored', () => {
    const ok = { K: { src: '/court/K.webp', licence: 'CC-BY 4.0, Jane Doe' } };
    expect(cardModel({ rank: 13, suit: 'S' }, { courts: ok }).some((p) => p.k === 'img' && p.src === '/court/K.webp')).toBe(true);
    expect(courtArt('K', { K: { src: '/court/K.webp', licence: ' ' } })).toBeNull();
    expect(courtArt('K', { K: { src: 'https://cdn.example/K.webp', licence: 'x' } })).toBeNull();
    expect(readFileSync(join(__dirname, '../src/cards/courtArt.ts'), 'utf8')).not.toMatch(/^\s*[JQK]: \{ src/m);
  });
});

describe('backs + the shared canvas path', () => {
  const colors = { base: '#15151B', accent: '#FF2EB8', accent2: '#33E6FF', ink: '#F4F4F8' };
  it('backModel takes no card and draws no rank or suit', () => {
    expect(backModel.length).toBe(1);
    expect(texts(backModel(colors)).map((t) => t.t)).toEqual(['PP']);
  });
  it('drawCard paints exactly the model (same code path the 3D texture uses)', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => { if (k === 'fillText') calls.push(String(a[0])); }),
      set: (t, k, v) => { t[k as string] = v; return true; },
    }) as unknown as Ctx2D;
    drawCard(ctx, { rank: 7, suit: 'D' }, {}, 0.4);
    expect(calls).toEqual(texts(cardModel({ rank: 7, suit: 'D' })).map((t) => t.t));
    calls.length = 0; drawBack(ctx, colors);
    expect(calls).toEqual(['PP']);
  });
});

describe('no hand leaks: faces only for what the viewer may see', () => {
  const render = (modeId: 'pitty-pat' | 'tonk', g: ReturnType<typeof newLocalGame>, seat: number | null) => renderToStaticMarkup(createElement(ModeScreen, {
    modeId, view: localView(g, seat ?? 'spectator'), legal: seat === null ? [] : localLegal(g, seat), toAct: localToAct(g), results: localResults(g), mySeat: seat, names: ['You', 'Ana', 'Bo', 'Cy'], onMove: () => {}, onLeave: () => {},
  }));
  const faces = (html: string) => [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]);
  it('Pitty Pat: seat 0 sees its 5 + the upcard; a spectator only the upcard; the stock is a back', () => {
    const g = newLocalGame('pitty-pat', { dealtWinAuto: false }, 4, 'v3a');
    const st = g.state as PpState;
    expect(faces(render('pitty-pat', g, 0)).length).toBe(st.hands[0]!.length + 1);
    expect(faces(render('pitty-pat', g, null)).length).toBe(1);
    expect(render('pitty-pat', g, 0)).toContain('class="card-back"');
  });
  it('Tonk: seat 0 sees its hand + discard top; nobody else\'s hand is ever drawn', () => {
    const g = newLocalGame('tonk', { handSize: '5' }, 3, 'v3b');
    const st = g.state as TkState;
    const html = render('tonk', g, 0);
    expect(faces(html).length).toBe(st.hands[0]!.length + (st.discards.length ? 1 : 0));
    expect(faces(render('tonk', g, null)).length).toBe(st.discards.length ? 1 : 0);
  });
});
