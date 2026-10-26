/**
 * The modes the lobby surfaces offer (Open tables filters + names), derived from the
 * mode registry catalog (modes/catalog.ts → @pp/game). One list: add a mode to the
 * registry and it gets a filter chip and a display name here.
 */
import type { ModeId } from '@pp/game';
import { modeCatalog } from './modes/catalog';

export type OfferedMode = ModeId;

export const OFFERED_MODES: { key: OfferedMode; label: string; name: string }[] =
  modeCatalog().map((m) => ({ key: m.modeId, label: m.title, name: m.title }));

export const OFFERED_MODE_NAME = Object.fromEntries(OFFERED_MODES.map((o) => [o.key, o.name])) as Record<OfferedMode, string>;

export const isOfferedMode = (m: string): m is OfferedMode => OFFERED_MODES.some((o) => o.key === m);

/** Which registry mode a live open table belongs to (null = unknown / legacy id: listed under All only). */
export function offeredKindOf(t: { mode: string }): OfferedMode | null {
  return isOfferedMode(t.mode) ? t.mode : null;
}

/** Display name for an open table's mode. */
export function openTableModeName(t: { mode: string }): string {
  const k = offeredKindOf(t);
  return k ? OFFERED_MODE_NAME[k] : t.mode;
}
