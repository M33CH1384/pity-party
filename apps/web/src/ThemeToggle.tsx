import { THEMES, THEME_LABELS, themeStore, useTheme, type ThemeName } from './theme';
import { PRESETS, accentStore, resolveAccent, useAccent, type AccentPick } from './accent';

/** Each tile previews its theme with a mini felt + accent swatch (fixed per-tile classes in theme.css). */
export default function ThemeToggle() {
  const v = useTheme();
  return (
    <div className="theme-picker">
      <div className="theme-tiles" role="radiogroup" aria-label="Theme" data-testid="theme-seg">
        {THEMES.map((k) => (
          <button key={k} type="button" role="radio" aria-label={THEME_LABELS[k]} aria-checked={v === k} className={`theme-tile tt-${k}${v === k ? ' on' : ''}`} data-testid={`theme-${k}`} onClick={() => themeStore.set(k)}>
            <span className="theme-tile-swatch" aria-hidden><i /></span>
            <span className="theme-tile-name">{THEME_LABELS[k]}</span>
          </button>
        ))}
      </div>
      <AccentRow theme={v} />
    </div>
  );
}

/** V2: Lounge colour (Neon Lounge only): 6 presets, a custom hue slider (greens snap to a preset),
 *  "Felt follows colour", and a live preview of the primary/secondary buttons. Greyed in A/B/K. */
function AccentRow({ theme }: { theme: ThemeName }) {
  const pick = useAccent();
  if (theme !== 'C') {
    return (
      <div className="theme-accent-row off" data-testid="accent-row" aria-disabled="true">
        <span>Lounge colour is only on Neon Lounge</span>
        <button type="button" className="accent-switch" data-testid="accent-switch" onClick={() => themeStore.set('C')}>Switch theme</button>
      </div>
    );
  }
  const r = resolveAccent(pick);
  const set = (p: Partial<AccentPick>) => accentStore.set({ ...pick, ...p }, theme);
  return (
    <div className="theme-accent-row" data-testid="accent-row">
      <div className="accent-head"><span className="theme-accent-dot" aria-hidden />Lounge colour: <b data-testid="accent-name">{r.id === 'custom' ? `Custom (${r.hue}°)` : PRESETS.find((x) => x.id === r.id)!.name}</b></div>
      <div className="accent-swatches" role="radiogroup" aria-label="Lounge colour">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={r.id === x.id} aria-label={x.name} title={x.name} data-testid={`accent-${x.id}`}
            className={`accent-swatch as-${x.id}${r.id === x.id ? ' on' : ''}`} onClick={() => set({ id: x.id, hue: undefined })}><i aria-hidden /></button>
        ))}
      </div>
      <label className="accent-hue">
        <span>Custom hue <small>(greens snap to a preset)</small></span>
        <input type="range" min={0} max={359} step={1} value={pick.hue ?? r.hue} data-testid="accent-hue" aria-label="Custom hue"
          onChange={(e) => set({ id: 'custom', hue: Number(e.target.value) })} />
      </label>
      <label className="accent-follow">
        <input type="checkbox" checked={pick.follow} data-testid="accent-follow" onChange={(e) => set({ follow: e.target.checked })} />
        <span>Felt follows colour</span>
      </label>
      <div className="accent-preview" aria-hidden data-testid="accent-preview">
        <span className="ap-pri">Pair 8♥</span><span className="ap-sec">Flip stock</span><span className="ap-felt" />
      </div>
    </div>
  );
}

/** Home quick-switch chip ("● Neon Lounge ▾"): a native select styled as a 44px chip. */
export function ThemeChip() {
  const v = useTheme();
  return (
    <label className="theme-chip" data-testid="theme-chip">
      <span className="theme-chip-dot" aria-hidden />
      <span className="sr-only">Theme</span>
      <select value={v} onChange={(e) => themeStore.set(e.target.value as ThemeName)} data-testid="theme-chip-select">
        {THEMES.map((k) => <option key={k} value={k}>{THEME_LABELS[k]}</option>)}
      </select>
      <span aria-hidden className="theme-chip-caret">▾</span>
    </label>
  );
}
