import { THEMES, THEME_LABELS, themeStore, useTheme, type ThemeName } from './theme';

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

/** V1: Lounge colour is Neon Lounge only (Magenta for now; V2 builds presets + hue slider). */
function AccentRow({ theme }: { theme: ThemeName }) {
  return theme === 'C'
    ? <p className="theme-accent-row" data-testid="accent-row"><span className="theme-accent-dot" aria-hidden />Lounge colour: Magenta <small>(more colours coming)</small></p>
    : <p className="theme-accent-row off" data-testid="accent-row" aria-disabled="true">Lounge colour is only on Neon Lounge</p>;
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
