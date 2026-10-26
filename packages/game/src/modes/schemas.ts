/**
 * Options schemas for the two real modes (engines land in milestones 6 and 8).
 * Source of truth: docs/plan/RULES.md option tables. Every rule tagged
 * [UNVERIFIED] there is an option here with verified: false; defaults follow
 * the best-sourced variant.
 */
import type { OptionDef } from '../options';

const choices = (...v: [string, string][]) => v.map(([value, label]) => ({ value, label }));

/** Mode A — Pitty Pat (Belize pairs). */
export const PITTY_PAT_OPTIONS: readonly OptionDef[] = [
  { key: 'handSize', label: 'Cards dealt', type: 'enum', default: '5', choices: choices(['5', '5 cards'], ['7', '7 cards']), source: 'PAGAT-PP / RRB-PP (5); 7 house', verified: false, help: '5 is verified; 7 is a house variant' },
  { key: 'mustPair', label: 'Must pair when able', type: 'enum', default: 'must', choices: choices(['must', 'Must pair'], ['may', 'May pair']), source: 'GR-PP must / DNX-PP may', verified: true },
  { key: 'flipsPerTurn', label: 'Flips when you can’t match', type: 'enum', default: 'one', choices: choices(['one', 'One flip'], ['untilMatch', 'Flip until a match']), source: 'RRB-PP / GR-PP (one); until-match house', verified: false },
  { key: 'tripsAsOne', label: 'Three of a kind sheds together', type: 'bool', default: false, source: 'DNX-PP reader comment', verified: false },
  { key: 'deadCardSteal', label: 'Out-of-turn steal on the first upcard', type: 'bool', default: false, source: 'DNX-PP reader comment', verified: false },
  { key: 'dealtWinAuto', label: 'Dealt pairs win after shedding', type: 'bool', default: true, source: 'BLZ / RRB-PP', verified: true },
  { key: 'stockEmpty', label: 'When the stock runs out', type: 'enum', default: 'reshuffle', choices: choices(['reshuffle', 'Reshuffle the discards'], ['void', 'Void the hand']), source: 'RRB-PP (reshuffle); void house', verified: false },
  { key: 'scoring', label: 'Scoring', type: 'enum', default: 'pot', choices: choices(['pot', 'Coin pot'], ['handsWon', 'Hands won']), source: 'RRB-PP', verified: true },
  { key: 'stack', label: 'Starting coins (per game)', type: 'int', default: 10, min: 1, max: 100, source: 'house (RRB-PP chips, amount not given)', verified: false, help: 'Play coins only; players who can’t cover the ante drop out' },
  { key: 'ante', label: 'Ante (coins)', type: 'int', default: 1, min: 0, max: 10, source: 'RRB-PP chips', verified: true },
  { key: 'pityPayouts', label: '"Pity" payouts (per pair, double for a dealt win)', type: 'bool', default: false, source: 'house', verified: false },
  { key: 'pityStyle', label: 'How "pity" is paid', type: 'enum', default: 'perHand', choices: choices(['perHand', 'One ante per loser (two on a dealt win)'], ['perPair', 'One ante per pair the winner laid (double on a dealt win)']), source: 'house (M6 reading, Q2)', verified: false },
  { key: 'dealtWin7', label: 'Dealt win also with 7 cards (3 pairs + match)', type: 'bool', default: true, source: 'house (M6 reading, Q3)', verified: false },
  { key: 'stealResume', label: 'After a dead-card steal, play continues', type: 'enum', default: 'stealerLeft', choices: choices(['stealerLeft', 'From the stealer’s left'], ['firstPlayer', 'With the first player as dealt']), source: 'house (M6 reading, Q4)', verified: false },
  { key: 'handsWonPayout', label: 'Hands-won game: coins to the winner', type: 'enum', default: 'antePerOpponent', choices: choices(['antePerOpponent', 'Ante from each other player'], ['none', 'None (bragging rights)']), source: 'house (M6 reading, Q5)', verified: false },
  { key: 'handsWonEnd', label: 'Hands-won game with "last with coins"', type: 'enum', default: 'firstToWins', choices: choices(['firstToWins', 'Ends at first to N wins'], ['fixedHands', 'Ends after N hands']), source: 'house (M6 reading, Q6)', verified: false },
  { key: 'declineAction', label: 'Declining a pair (may pair) before flipping', type: 'enum', default: 'flip', choices: choices(['flip', 'Flip instead'], ['pass', 'Pass the turn']), source: 'house (M6 reading, Q7)', verified: false },
  { key: 'pauseBetweenHands', label: 'Pause to show each hand’s result', type: 'bool', default: false, source: 'table pacing', verified: true },
  { key: 'gameEnd', label: 'Game ends', type: 'enum', default: 'lastWithChips', choices: choices(['lastWithChips', 'Last player with coins'], ['firstToWins', 'First to N hand wins'], ['fixedHands', 'After N hands']), source: 'RRB-PP', verified: true },
  { key: 'gameTarget', label: 'N (wins or hands)', type: 'int', default: 5, min: 1, max: 50, source: 'RRB-PP', verified: true },
  { key: 'dealtWinTie', label: 'Two dealt winners', type: 'enum', default: 'turnOrder', choices: choices(['turnOrder', 'First in turn order'], ['redeal', 'Redeal']), source: 'house', verified: false },
];

/** Mode B — Tonk (Pagat base). */
export const TONK_OPTIONS: readonly OptionDef[] = [
  { key: 'handSize', label: 'Cards dealt', type: 'enum', default: '5', choices: choices(['5', '5 cards'], ['7', '7 cards']), source: 'PAGAT-T (5); 7 house', verified: false },
  { key: 'instantWin', label: 'Instant win on the deal', type: 'enum', default: '49-50', choices: choices(['49-50', '49 or 50'], ['50-or-11', '50 or 11 and under'], ['off', 'Off']), source: 'PAGAT-T / DNX-T', verified: true },
  { key: 'aces', label: 'Aces in runs', type: 'enum', default: 'low', choices: choices(['low', 'Low only'], ['lowOrHigh', 'Low or high, no wrap']), source: 'PAGAT-T / DNX-T', verified: true },
  { key: 'allowDrop', label: 'Allow drop', type: 'bool', default: true, source: 'PAGAT-T', verified: true },
  { key: 'caughtPenalty', label: 'Caught drop penalty', type: 'enum', default: '2', choices: choices(['1', 'Single'], ['2', 'Double']), source: 'TT / LCG', verified: true },
  { key: 'hitLock', label: 'Hit player can’t spread or drop next turn', type: 'bool', default: false, source: 'DNX-T / LCG house', verified: false },
  { key: 'slap', label: 'Slap a playable discard out of turn', type: 'bool', default: false, source: 'DNX-T', verified: false },
  { key: 'wilds', label: 'Wild cards', type: 'enum', default: 'none', choices: choices(['none', 'None'], ['jokers', 'Jokers'], ['deuces', 'Deuces']), source: 'house', verified: false },
  { key: 'spreadBeforeDrop', label: 'Must have a spread down to drop', type: 'bool', default: false, source: 'house', verified: false },
  { key: 'noDiscardPickup', label: 'Can’t discard the card just taken from the pile', type: 'bool', default: false, source: 'house (common rummy rule)', verified: false },
  { key: 'stockOut', label: 'When the stock runs out', type: 'enum', default: 'lowestWins', choices: choices(['lowestWins', 'Lowest count wins'], ['void', 'Void the hand']), source: 'TT', verified: true },
  { key: 'stake', label: 'Stake (coins)', type: 'int', default: 1, min: 0, max: 10, source: 'PAGAT-T stakes', verified: true },
  { key: 'gameTarget', label: 'Points to win', type: 'int', default: 10, min: 5, max: 50, source: 'house', verified: false },
];
