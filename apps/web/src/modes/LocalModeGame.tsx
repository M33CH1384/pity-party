import { useEffect, useState } from 'react';
import { BOT_NAMES, seededRng } from '@pp/game';
import { ModeScreen } from './ModeScreen';
import type { ModeChoice } from './catalog';
import { type LocalGame, botToAct, localApply, localBotMove, localLegal, localResults, localToAct, localView, newLocalGame } from './localGame';

const BOT_MS = 700;

function botNames(seed: string, n: number): string[] {
  const rng = seededRng(`${seed}:names`);
  const pool = [...BOT_NAMES];
  return Array.from({ length: n }, () => pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
}

/** Offline game of the picked registry mode: you in seat 0, bots in the rest. */
export default function LocalModeGame({ choice, seats = 4, seed, onLeave, botMs = BOT_MS }: { choice: ModeChoice; seats?: number; seed: string; onLeave: () => void; botMs?: number }) {
  const [g, setG] = useState<LocalGame>(() => newLocalGame(choice.modeId, choice.options, seats, seed));
  const [names] = useState(() => ['You', ...botNames(seed, seats - 1)]);
  const bot = botToAct(g);
  useEffect(() => {
    if (bot === null) return;
    const t = setTimeout(() => setG((cur) => (botToAct(cur) === bot ? localBotMove(cur, bot) : cur)), botMs);
    return () => clearTimeout(t);
  }, [g, bot, botMs]);
  return (
    <ModeScreen
      modeId={g.modeId} view={localView(g, 0)} legal={localLegal(g, 0)} toAct={localToAct(g)} results={localResults(g)}
      mySeat={0} names={names} status="vs bots"
      onMove={(m) => setG((cur) => localApply(cur, 0, m))}
      onLeave={onLeave}
      onAgain={() => setG(newLocalGame(choice.modeId, choice.options, seats, `${seed}:${g.moves}:again`))}
    />
  );
}
