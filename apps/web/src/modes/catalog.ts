/**
 * Web side of the mode registry: what the Setup picker lists. Rules come from @pp/game;
 * a mode is selectable only once its engine is registered there (Mode A/B show as "coming soon").
 */
import { type ModeId, type OptionDef, type OptionValues, PITTY_PAT_OPTIONS, TONK_OPTIONS, defaultsOf, getRules, listModes, validateOptions } from '@pp/game';

export interface ModeEntry {
  modeId: ModeId;
  title: string;
  blurb: string;
  seats: string;
  schema: readonly OptionDef[];
  /** false = engine not built yet: visible, disabled, "coming soon" */
  available: boolean;
}

const BLURB: Record<ModeId, { title: string; blurb: string; seats: string }> = {
  placeholder: { title: 'High Card', blurb: 'Test mode: highest card takes the round', seats: '2–5 players' },
  'pitty-pat': { title: 'Pitty Pat', blurb: 'Belize pairs: shed your hand in pairs', seats: '2–4 players' },
  tonk: { title: 'Tonk', blurb: 'Spreads, hits and drops, lowest hand wins', seats: '2–4 players' },
};
const FUTURE_SCHEMA: Partial<Record<ModeId, readonly OptionDef[]>> = { 'pitty-pat': PITTY_PAT_OPTIONS, tonk: TONK_OPTIONS };
/** Picker order: Mode A, Mode B, then the placeholder (until the real modes land it is the only playable one). */
const ORDER: ModeId[] = ['pitty-pat', 'tonk', 'placeholder'];

export function modeCatalog(): ModeEntry[] {
  const live = new Set(listModes().map((m) => m.modeId));
  return ORDER.map((modeId) => {
    const available = live.has(modeId);
    const schema = available ? getRules(modeId).optionsSchema : FUTURE_SCHEMA[modeId] ?? [];
    return { modeId, ...BLURB[modeId], schema, available };
  });
}

export function modeEntry(id: ModeId): ModeEntry {
  return modeCatalog().find((m) => m.modeId === id)!;
}

export interface ModeChoice { modeId: ModeId; options: OptionValues }

const KEY = 'pp.modeChoice';

/** The saved pick, falling back to the first available mode, with options validated against the schema. */
export function loadModeChoice(storage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): ModeChoice {
  let raw: { modeId?: string; options?: unknown } = {};
  try { raw = JSON.parse(storage?.getItem(KEY) ?? '{}') as typeof raw; } catch { /* corrupt: defaults */ }
  const cat = modeCatalog();
  const pick = cat.find((m) => m.modeId === raw.modeId && m.available) ?? cat.find((m) => m.available)!;
  return { modeId: pick.modeId, options: validateOptions(pick.schema, raw.options) };
}

export function saveModeChoice(c: ModeChoice, storage: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null): void {
  try { storage?.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ }
}

export function defaultChoice(id: ModeId): ModeChoice {
  return { modeId: id, options: defaultsOf(modeEntry(id).schema) };
}

/** Seats an online table can offer for a mode: the registry range capped at the table's 4 seats. Coming-soon modes parse their "2–4 players" label. */
export const MAX_TABLE_SEATS = 4;
export function tableSeatRange(id: ModeId): { min: number; max: number } {
  const e = modeEntry(id);
  let min = 2, max = MAX_TABLE_SEATS;
  if (e?.available) { const r = getRules(id); min = r.minSeats; max = r.maxSeats; }
  else { const m = /(\d+)\D+(\d+)/.exec(e?.seats ?? ''); if (m) { min = Number(m[1]); max = Number(m[2]); } }
  return { min: Math.min(min, MAX_TABLE_SEATS), max: Math.min(max, MAX_TABLE_SEATS) };
}
