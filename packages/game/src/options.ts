/**
 * Options schema: every rule variant is a setup option. The schema drives the
 * Setup UI and validates what the server accepts. `verified: false` marks a
 * rule from docs/plan/RULES.md tagged [UNVERIFIED] (house rule / assumed).
 */
interface OptionBase {
  key: string;
  label: string;
  /** source tag from RULES.md, e.g. "PAGAT-PP" or "house" */
  source: string;
  verified: boolean;
  help?: string;
}
export interface BoolOption extends OptionBase { type: 'bool'; default: boolean }
export interface IntOption extends OptionBase { type: 'int'; default: number; min: number; max: number }
export interface EnumOption extends OptionBase { type: 'enum'; default: string; choices: readonly { value: string; label: string }[] }
export type OptionDef = BoolOption | IntOption | EnumOption;
export type OptionValues = Record<string, boolean | number | string>;

export function defaultsOf(schema: readonly OptionDef[]): OptionValues {
  const out: OptionValues = {};
  for (const o of schema) out[o.key] = o.default;
  return out;
}

/** Fill defaults, coerce/clamp, drop unknown keys. Never throws: bad values fall back to the default. */
export function validateOptions(schema: readonly OptionDef[], input: unknown): OptionValues {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: OptionValues = {};
  for (const o of schema) {
    const v = src[o.key];
    if (o.type === 'bool') out[o.key] = typeof v === 'boolean' ? v : o.default;
    else if (o.type === 'int') out[o.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(o.max, Math.max(o.min, Math.round(v))) : o.default;
    else out[o.key] = typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : o.default;
  }
  return out;
}
