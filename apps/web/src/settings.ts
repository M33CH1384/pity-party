/**
 * Device table preferences (milestone 3b): only what every mode shares.
 * The Spades settings (deck, venue, house rules, trash talk, camera, slams,
 * set animations…) were removed with @pp/rules / @pp/bots; game rules are
 * now each mode's own options (modes/catalog.ts). Rebuild items: docs/plan/REBUILD.md.
 */
import { BOT_LEVELS, type BotLevel, DEFAULT_TABLE_RULES, TURN_TIMER_LIMITS, type TableRules } from '@pp/protocol';

export interface Settings {
  /** Seconds per turn at tables this player hosts. */
  turnTimerSec: number;
  /** Bot skill at hosted tables: mixed (default) or one fixed level. */
  botLevel: BotLevel;
  /** Graphics quality: low trims effects (the ink layer reads it). */
  quality: 'high' | 'low';
}

/**
 * The load-time graphics-quality heuristic. Exported for the ink layer
 * (src/ink/mode.ts `inkLowQuality`), which compares a stored quality
 * against a fresh heuristic read to tell an explicit user pick apart from
 * this default. Weak on WebKit (no deviceMemory, clamped cores).
 */
export function defaultQuality(): 'high' | 'low' {
  if (typeof navigator === 'undefined') return 'high';
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (mem !== undefined && mem <= 3) || (navigator.hardwareConcurrency ?? 8) <= 3 ? 'low' : 'high';
}

export const DEFAULT_SETTINGS: Settings = { turnTimerSec: DEFAULT_TABLE_RULES.turnTimerSec, botLevel: 'mixed', quality: defaultQuality() };

/** Turn-timer choices offered at a table (seconds). */
export const TURN_TIMER_CHOICES = [15, 30, 45, 60, 90] as const;

const KEY = 'pp.settings.v1';
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function normalizeSettings(j: unknown): Settings {
  const o = (j && typeof j === 'object' ? j : {}) as Partial<Record<keyof Settings, unknown>>;
  const t = typeof o.turnTimerSec === 'number' && Number.isFinite(o.turnTimerSec)
    ? Math.min(TURN_TIMER_LIMITS.max, Math.max(TURN_TIMER_LIMITS.min, Math.round(o.turnTimerSec)))
    : DEFAULT_SETTINGS.turnTimerSec;
  const botLevel = typeof o.botLevel === 'string' && (BOT_LEVELS as readonly string[]).includes(o.botLevel) ? o.botLevel as BotLevel : 'mixed';
  const quality = o.quality === 'low' || o.quality === 'high' ? o.quality : DEFAULT_SETTINGS.quality;
  return { turnTimerSec: t, botLevel, quality };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** The generic table rules a host sends with `config`. */
export function settingsToRules(s: Settings, playerCount: number = DEFAULT_TABLE_RULES.playerCount): TableRules {
  return { playerCount, turnTimerSec: s.turnTimerSec };
}
