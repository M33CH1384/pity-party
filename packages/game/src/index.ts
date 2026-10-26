export * from './cards';
export * from './rng';
export * from './options';
export * from './registry';
export * from './modes/placeholder';
export * from './modes/schemas';
export * from './modes/pittyPat';
export * from './names';

import { registerMode } from './registry';
import { placeholderBot, placeholderRules } from './modes/placeholder';
import { pittyPatBot, pittyPatRules } from './modes/pittyPat';
registerMode(placeholderRules, placeholderBot);
// Mode A engine (milestone 6): registered but unlisted, so Setup keeps Pitty Pat "coming soon" and the server
// opens no tables for it until the table view + bots land (milestone 7).
registerMode(pittyPatRules, pittyPatBot, { listed: false });
