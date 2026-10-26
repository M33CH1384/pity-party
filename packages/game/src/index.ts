export * from './cards';
export * from './rng';
export * from './options';
export * from './registry';
export * from './modes/placeholder';
export * from './modes/schemas';
export * from './names';

import { registerMode } from './registry';
import { placeholderBot, placeholderRules } from './modes/placeholder';
registerMode(placeholderRules, placeholderBot);
