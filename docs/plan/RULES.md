# Pity Party rules spec – two modes (draft)
Demetrius: both modes ship, chosen in Setup; each is its own rule set with its own options. Tags: **[V]** = verified (source cited), **[UNVERIFIED]** = house/assumed → ask Demetrius.
Sources: PAGAT-PP pagat.com/rummy/pittypat.html · RRB-PP rummyrulebook.com/pages/pitty-pat · DNX-PP denexa.com/blog/pitty-pat · GR-PP gamerules.com/rules/pitty-pat-card-game · BLZ belizeans.com/pittypat.htm · PAGAT-T pagat.com/rummy/tonk.html · RRB-T rummyrulebook.com/pages/tonk · DNX-T denexa.com/blog/tonk · TT tallyandtable.com/tonk · LCG lovecardgames.com/blog/how-to-play-tonk
Shared: 52-card deck, no jokers by default; seeded shuffle; dealer rotates left; play clockwise; real money never – stakes are play coins only.

---
## Mode A – "Pitty Pat (Belize pairs)"
### Setup
- Players 2–4 [V PAGAT-PP, RRB-PP]; 5 allowed [V DNX-PP]. Default 4.
- Deal 5 each, one at a time from dealer's left [V RRB-PP, DNX-PP]. Rest = stock; flip top card = upcard (starts discard pile) [V all].
- Suits irrelevant; only rank matters [V RRB-PP].
- **Deuces wild** (Demetrius 2026-10-26, default on, option `deucesWild`): a 2 pairs with any card — a 2 in hand pairs with any upcard, and any card pairs with a 2 upcard. Goal unchanged: get to zero cards first.
### Turn flow (state machine)
```
DEAL → [CHECK_DEALT_WIN] → TURN(seat)
TURN: hasMatch(upcard)? → AWAIT_PAIR : AWAIT_FLIP
AWAIT_PAIR --pair(c)--> AWAIT_SHED --discard(x)--> CHECK_OUT
AWAIT_FLIP --flip()--> hasMatch? AWAIT_PAIR : AWAIT_PASS --pass()--> NEXT_SEAT
CHECK_OUT: hand empty → HAND_OVER (payout) else NEXT_SEAT
stock empty on flip → RESHUFFLE (discards minus top) → flip
HAND_OVER → NEXT_DEAL | GAME_OVER
```
### Actions & legality
- `pair(card)`: card.rank == upcard.rank. Pair removed from play (shown face-up in front of player – display choice [UNVERIFIED]).
- `discard(card)`: required right after a pair, any card; becomes new upcard [V RRB-PP, DNX-PP]. If pairing empties the hand (or leaves 0), no discard needed → out.
- `flip()`: only when no match; exactly 1 flip per turn [V GR-PP, RRB-PP].
- `pass()`: only after an unmatched flip [V RRB-PP].
- Must pair if able: default **must** [V GR-PP "must"]; option "may" [V DNX-PP/RRB-PP wording "can"].
### Ending
- First to empty hand wins the hand [V all]. Effectively 3 pairs from 5 cards + 1 card from pile.
- Dealt pair(s) held; player with pairs wins once they shed non-matching cards [V BLZ, RRB-PP]. Auto-win when dealt 2 pairs + matching upcard? [UNVERIFIED].
- Stock empty: shuffle discard pile (keep none face-up), flip new upcard [V RRB-PP].
### Scoring / pot
- No points [V RRB-PP]. Default: each player antes 1 chip/hand; winner takes pot [V RRB-PP "chips… pay the winning player"]. Players out of chips drop; last with chips wins [V RRB-PP]. Alt: most hands won after N hands/time [V RRB-PP].
- "Pity" per-pair payouts, double for dealt win [UNVERIFIED].
### Options (default first)
| Option | Default | Choices | Tag |
|---|---|---|---|
| players | 4 | 2–5 | V |
| handSize | 5 | 5 / 7 | 7 [UNVERIFIED] |
| mustPair | must | must / may | V (sources differ) |
| flipsPerTurn | 1 | 1 / until match | until-match [UNVERIFIED] |
| tripsAsOne (3-of-kind shed together) | off | on | [UNVERIFIED] DNX-PP comment |
| deadCardSteal (out-of-turn match on first upcard) | off | on | [UNVERIFIED] DNX-PP comment |
| stockEmpty | reshuffle | reshuffle / void hand | void [UNVERIFIED] |
| scoring | pot | pot / hands-won race | V |
| ante | 1 | 0–10 coins | V (chips) |
| pityPayouts | off | on | [UNVERIFIED] |
| gameEnd | last with chips | last with chips / first to N wins / N hands | V |
### Bots
- Info used: own hand, upcard, all discards/flips (public). Tell-free: fixed think time + jitter, no talk keyed to hidden cards.
- Easy: pair if possible; shed random non-paired card.
- Normal: shed card whose rank is most "dead" (most copies seen) – least likely to be matched by next seat; keep pairs.
- Hard: track remaining-rank counts; minimise P(next seat matches) using their observed passes (a pass on rank R ⇒ they lack R); with mustPair=may, decline pairs that would expose a needed rank.
### Edge cases
Upcard matches two hand cards (only one pairs unless tripsAsOne). 2 players: stock cycles fast → reshuffle often. Multiple dealt-win claims → first in turn order [UNVERIFIED]. Disconnect → bot (BWM behavior). Deck exhaustion with no discards (impossible ≤5 players at 5 cards).
### Chosen readings (M6, 2026-10-26: Demetrius "use defaults, everything a setup option")
Each reading below is the default of a setup option in `PITTY_PAT_OPTIONS` (packages/game/src/modes/schemas.ts); changing the option changes the rule, no code change needed.
| # | Question | Reading (default) | Option | Other choices |
|---|---|---|---|---|
| 1 | Starting coins (not given by RRB-PP) | 10 coins per player per game | `stack` | 1–100 |
| 2 | How "pity" is paid (when `pityPayouts` on) | each loser pays one extra ante, two on a dealt win, never more than they hold | `pityStyle` = perHand | perPair: one ante per pair the winner laid (×2 on a dealt win) |
| 3 | Dealt win with 7 cards | counts (3 pairs + upcard matching the 7th card) | `dealtWin7` = on | off |
| 4 | Dead-card steal | window on the hand's first upcard only, for seats (other than the first player) holding a match, asked in turn order; after the steal + shed, play continues from the stealer's left | `stealResume` = stealerLeft | firstPlayer: the first player then takes their normal turn |
| 5 | Hands-won game coins | game winner gets ante × (players − 1), everyone else pays the ante; a tie pays nothing | `handsWonPayout` = antePerOpponent | none |
| 6 | Hands won + "last with coins" (no coins in play) | ends at first to N wins | `handsWonEnd` = firstToWins | fixedHands: after N hands |
| 7 | may-pair: declining before any flip | you flip instead (after a flip, declining = pass) | `declineAction` = flip | pass |
| W1 | Deuces wild | on | `deucesWild` | off (a 2 is just a 2) |
| W2 | Can a 2 pair with another 2 | yes | `deuceOnDeuce` | no (a 2 still pairs with any natural) |
| W3 | Do deuces count for a win on the deal (and for held pairs going out) | yes, for the deal | `dealtWinWild` | no: the deal check uses natural pairs only (held pairs going out mid-hand still use wilds when `deucesWild` is on) |
| W4 | Trips with wilds (`tripsAsOne` on) | only two naturals of the upcard's rank shed as trips; a 2 always pairs one card; a 2 upcard never makes trips | — (follows `tripsAsOne`) | — |
| 8 | Max players / hand size | engine 2–5 (online tables seat 4); 5 cards | table seats, `handSize` = 5 | 7 |
Table pacing (not a rule): `pauseBetweenHands` (default off) holds each hand's result until the winner (or the next dealer after a void) taps Next hand.
Engine bounds (keep every option combination finite): 200 hands per game, 2000 moves per hand (then void), 60 flips per turn in until-match, 5 redeals on a dealt-win tie.

### Open questions (ranked)
1. Must you pair when you can? 2. Pot/ante and "pity" payouts – amounts, per-pair pay, double for dealt win? 3. Hand size 5 or 7? 4. Does three of a kind shed together? 5. Out-of-turn dead-card steal on the first upcard – real? 6. One flip per turn or flip until match? 7. Stock empty: reshuffle or void? 8. Max players 4 or 5?

---
## Mode B – "Tonk (spreads)"
Base assumed: **Pagat Tonk** [PAGAT-T] as cross-checked by RRB-T, TT, LCG. Where sources differ, Pagat wins by default and alternatives become options.
### Setup
- Players 2–4 default 4 (5 allowed) [V PAGAT-T 2–4; 5 = UNVERIFIED].
- Deal 5 each; next card face-up = discard; rest stock [V PAGAT-T, TT]. (7 cards for 2p [UNVERIFIED]).
- Values: A=1, 2–10 face, J/Q/K=10 [V TT, DNX-T].
- Dealt 49 or 50 → show, wins double; 2+ such hands = misdeal/redeal [V PAGAT-T, TT]. (Denexa: 50 or ≤11 [V DNX-T, alt option]).
### Turn flow
```
DEAL → CHECK_TONK(49/50) → TURN(seat)
TURN_START --drop()--> SHOWDOWN
TURN_START --drawStock()/drawDiscard()--> MELD_PHASE
MELD_PHASE --spread(cards)* / hit(card,spreadId)*--> (hand empty? TONK_OUT) --discard(c)--> (hand empty? OUT) → NEXT_SEAT
stock empty → STOCK_OUT (lowest count wins) [V TT]
```
### Actions & legality
- `drop()`: only at turn start, before drawing [V RRB-T, TT].
- `drawStock()` | `drawDiscard()`: top discard only; no browsing the pile [V RRB-T, TT].
- `spread(cards)`: book 3–4 same rank, or run ≥3 same suit consecutive [V all]; ace low only (A-2-3 ok, Q-K-A no) [V PAGAT-T/TT]; option ace high-or-low no wrap [V DNX-T].
- `hit(card, spread)`: extend any spread on table, own or opponents' [V all]. No rearranging spreads [V DNX-T].
- `discard(card)`: ends turn; required unless hand already empty [V RRB-T].
- Can't discard the card just drawn from discard pile [UNVERIFIED, common rummy rule; default off].
### Ending & scoring (1 stake = 1 point) [V TT table, PAGAT-T]
| Event | Payout |
|---|---|
| Dealt 49/50 | +2 from each |
| Tonk: empty without final discard | +2 from each |
| Out by discarding last card | +1 from each |
| Drop, dropper strictly lowest | +1 from each |
| Drop caught (someone ≤ dropper) | dropper pays 2 to each ≤; lowest also gets 1 from rest |
| Stock runs out | lowest count +1 from each |
Count = cards still in hand (spreads excluded) [V LCG]. Game end: first to N points / last with coins [UNVERIFIED choice; default first to 10].
### Options
| Option | Default | Choices | Tag |
|---|---|---|---|
| players | 4 | 2–5 | 5 [UNVERIFIED] |
| handSize | 5 | 5 / 7 | 7 [UNVERIFIED] |
| instantWin | 49–50 | 49–50 / 50 or ≤11 / off | V PAGAT-T / DNX-T |
| aces | low | low / high-or-low | V |
| allowDrop | on | on/off | V |
| caughtPenalty | 2× | 1× / 2× | V (TT/LCG "commonly double") |
| hitLock (hit player can't spread/drop next turn) | off | on | V DNX-T / LCG "house" |
| slap (out-of-turn grab of a playable discard) | off | on | V DNX-T only |
| wilds | none | none / jokers / deuces | [UNVERIFIED] |
| minSpreadToDrop / must spread before drop | off | on | [UNVERIFIED] |
| stockOut | lowest wins | lowest wins / void | V TT |
| gameTarget | 10 pts | 5–50 / coins | [UNVERIFIED] |
| stake | 1 coin | 0–10 | V (played for stakes) |
### Bots
- Easy: draw discard only if it completes a spread; spread/hit greedily; discard highest deadwood; drop at count ≤5.
- Normal: evaluate draw by Δ(minimum deadwood) via meld solver (sets+runs partition, ≤7 cards → brute force); hit whenever legal; drop when count ≤ threshold scaled by turn number and opponents' visible card counts.
- Hard: track discards/spreads; estimate opponents' counts (cards held × expected value given picks); drop on EV > 0 of caught risk; avoid discarding cards that fit opponents' spreads or the rank they just picked; Tonk out preference over discard-out.
- Tell-free as Mode A.
### Edge cases
Spreading all cards ⇒ Tonk (no discard). Hit makes hand empty ⇒ Tonk. Drop tie ⇒ caught [V TT]. Multiple 49/50 ⇒ redeal [V]. Stock empty mid-turn ⇒ STOCK_OUT before draw. Discard pile reshuffle never (stock-out ends hand). Hitting a run past A or K invalid (ace low).
### Open questions (ranked)
1. Instant win: 49/50, or 50 or ≤11, or none? 2. Caught penalty 1× or 2×, and does the lowest player also collect? 3. Hit lock rule on? 4. Ace low only, or high too? 5. How many points/coins wins the game? 6. Any wild cards? 7. Slap rule? 8. Must you have a spread down before dropping? 9. 7 cards for 2 players? 10. Can you discard the card you just took from the pile?

## Global questions
1. Mode names shown in Setup ("Pitty Pat" vs "Tonk")? 2. Teams/partners ever? 3. Coins tie into Street Cred economy or separate?
