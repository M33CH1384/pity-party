export * from './cards';
export * from './rng';
export * from './options';
export * from './registry';
export * from './modes/placeholder';
export * from './modes/schemas';
export * from './modes/pittyPat';
export * from './modes/tonk';
export * from './modes/tonkSolver';
export * from './names';

import { registerMode } from './registry';
import { placeholderBot, placeholderRules } from './modes/placeholder';
import { pittyPatBot, pittyPatRules } from './modes/pittyPat';
import { tonkBot, tonkRules } from './modes/tonk';
registerMode(placeholderRules, placeholderBot);
// Mode A (milestones 6–7): engine, bot tiers and the web table are in, so Pitty Pat is listed and playable.
registerMode(pittyPatRules, pittyPatBot);
// Mode B engine (milestone 8): registered but unlisted until its table view + bots land (milestone 9).
registerMode(tonkRules, tonkBot);
