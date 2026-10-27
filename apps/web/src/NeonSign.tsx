/**
 * Pity Party wordmark: Desi's option C "sign cabinet" neon (logo-v3, approved by Demetrius).
 * Pre-rendered from Desi's app/header SVGs (no live SVG filters on phones) as small self-hosted WebPs in
 * /public/logo, one per colour pair; only the active theme's file is fetched, and it never touches the JS bundle.
 *   C Neon Lounge → the Lounge colour (6 presets; a custom hue uses the nearest preset's render)
 *   A / K → their own accent pair · B (light, no lit mock yet) → the unlit "off" layer, as Desi suggests.
 * The image carries the accessible name "Pity Party".
 */
import { nearestPreset, resolveAccent, useAccent } from './accent';
import { useReduceEffects } from './fx';
import { useTheme } from './theme';

export type SignKind = 'home' | 'header' | 'loading';
const SIZE = { home: [640, 464], header: [440, 134], loading: [640, 464] } as const;

export function signPair(theme: string, accent: ReturnType<typeof resolveAccent>): string {
  if (theme === 'A' || theme === 'K' || theme === 'B') return theme;
  return accent.id === 'custom' ? nearestPreset(accent.hue).id : accent.id;
}

export function NeonSign({ kind, className = '' }: { kind: SignKind; className?: string }) {
  const theme = useTheme();
  const pair = signPair(theme, resolveAccent(useAccent()));
  const reduce = useReduceEffects();
  const [w, h] = SIZE[kind];
  const file = (k: string) => `/logo/${kind === 'header' ? 'header' : 'home'}-${k}.webp`;
  if (kind === 'loading' && pair !== 'B') {
    // off layer underneath, lit layer flickers on (CSS); a plain fade under reduced motion / Reduce effects
    return (
      <span className={`neon-sign neon-loading${reduce ? ' calm' : ''} ${className}`} role="img" aria-label="Pity Party" data-testid="neon-sign" data-sign={pair}>
        <img src={file('off')} alt="" width={w} height={h} decoding="async" />
        <img className="on" src={file(pair)} alt="" width={w} height={h} decoding="async" />
      </span>
    );
  }
  return <img className={`neon-sign ns-${kind} ${className}`} src={file(pair)} alt="Pity Party" width={w} height={h} decoding="async" data-testid="neon-sign" data-sign={pair} />;
}
