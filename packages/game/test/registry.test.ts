import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type HcMove, type HcState, PITTY_PAT_OPTIONS, RuleError, TONK_OPTIONS, defaultsOf, getBot, getRules, listModes, seededRng, validateOptions } from '../src';

describe('options schema', () => {
  it('fills defaults, clamps ints, rejects unknown enum values and drops unknown keys', () => {
    const v = validateOptions(PITTY_PAT_OPTIONS, { ante: 99, mustPair: 'nope', handSize: '7', junk: 1 });
    expect(v.ante).toBe(10);
    expect(v.mustPair).toBe('must');
    expect(v.handSize).toBe('7');
    expect('junk' in v).toBe(false);
    expect(validateOptions(TONK_OPTIONS, null)).toEqual(defaultsOf(TONK_OPTIONS));
  });
  it('every default is itself valid and keys are unique', () => {
    for (const schema of [PITTY_PAT_OPTIONS, TONK_OPTIONS]) {
      expect(validateOptions(schema, defaultsOf(schema))).toEqual(defaultsOf(schema));
      expect(new Set(schema.map((o) => o.key)).size).toBe(schema.length);
    }
  });
  it('house rules are flagged unverified (they are options, not fixed rules)', () => {
    const un = (s: typeof PITTY_PAT_OPTIONS) => s.filter((o) => !o.verified).map((o) => o.key);
    expect(un(PITTY_PAT_OPTIONS)).toEqual(expect.arrayContaining(['handSize', 'flipsPerTurn', 'tripsAsOne', 'deadCardSteal', 'stockEmpty', 'pityPayouts']));
    expect(un(TONK_OPTIONS)).toEqual(expect.arrayContaining(['hitLock', 'slap', 'wilds', 'spreadBeforeDrop', 'gameTarget']));
  });
});

describe('registry + placeholder mode', () => {
  const rules = getRules('placeholder');
  it('is registered with a bot', () => {
    expect(listModes().map((m) => m.modeId)).toContain('placeholder');
    expect(getBot('placeholder').modeId).toBe('placeholder');
    expect(() => getRules('tonk')).toThrow();
  });
  it('rejects out-of-turn and unheld cards', () => {
    const s = rules.newGame({}, 3, 'x') as HcState;
    expect(() => rules.applyMove(s, 1, { t: 'play', cardId: s.hands[1]![0]!.id })).toThrow(RuleError);
    expect(() => rules.applyMove(s, 0, { t: 'play', cardId: 'nope' })).toThrow(RuleError);
    expect(rules.legalMoves(s, 1)).toEqual([]);
  });
  it('view hides other hands', () => {
    const s = rules.newGame({}, 2, 'v') as HcState;
    const v = rules.view(s, 0) as { hand: unknown[]; handSizes: number[] };
    expect(v.hand).toHaveLength(3);
    expect(v.handSizes).toEqual([3, 3]);
    expect((rules.view(s, 'spectator') as { hand: unknown[] }).hand).toEqual([]);
  });
  it('property: seeded bot games always terminate, never make illegal moves, and replay identically', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 1, max: 5 }), fc.string(), fc.constantFrom('easy', 'normal', 'hard' as const), (seats, handSize, seed, tier) => {
      const play = () => {
        let s = rules.newGame({ handSize }, seats, seed);
        const rng = seededRng(seed + ':bot');
        const log: string[] = [];
        for (let steps = 0; steps < 100; steps++) {
          const who = rules.toAct(s);
          if (!who.length) break;
          const seat = who[0]!;
          const legal = rules.legalMoves(s, seat) as HcMove[];
          expect(legal.length).toBeGreaterThan(0);
          const m = getBot('placeholder').choose(rules.view(s, seat), legal, tier, rng) as HcMove;
          log.push(m.cardId);
          s = rules.applyMove(s, seat, m);
        }
        return { s: s as HcState, log };
      };
      const a = play();
      const b = play();
      expect(a.log).toEqual(b.log);
      const r = rules.results(a.s);
      expect(r.done).toBe(true);
      expect(a.s.wins.reduce((x, y) => x + y, 0)).toBe(handSize);
      expect(r.deltas.reduce((x, y) => x + y, 0)).toBe(0);
      expect([...r.placements].sort()).toEqual([...Array(seats).keys()]);
    }), { numRuns: 100 });
  });
});
