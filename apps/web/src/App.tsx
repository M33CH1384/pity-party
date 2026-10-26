import { useEffect, useState } from 'react';

import Setup from './Setup';
import SettingsSheetHost from './SettingsSheetHost';
import { usePresence } from './social/Social';
import { NowPlaying } from './SoundControls';
import { sound } from './audio';
import { holdIdleExemption } from './inactivity';
import LocalModeGame from './modes/LocalModeGame';
import type { ModeChoice } from './modes/catalog';

/** Offline app: the start screens, or a registry-mode game vs bots. */
export default function App() {
  const [modeGame, setModeGame] = useState<{ choice: ModeChoice; seed: string } | null>(null);
  usePresence(modeGame ? { kind: 'table', mode: modeGame.choice.modeId, offline: true } : { kind: 'online' });
  // Offline bot games never idle-log-out
  useEffect(() => { if (!modeGame) return; return holdIdleExemption(); }, [modeGame !== null]);
  useEffect(() => { sound.enterContext(modeGame ? 'game' : 'menu'); }, [modeGame === null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <NowPlaying />
      {modeGame
        ? <LocalModeGame key={modeGame.seed} choice={modeGame.choice} seed={modeGame.seed} onLeave={() => { history.replaceState({ wiz: 'home', d: 0 }, '', location.pathname); setModeGame(null); }} />
        : <Setup onStart={(choice) => setModeGame({ choice, seed: crypto.randomUUID() })} />}
      <SettingsSheetHost />
    </>
  );
}
