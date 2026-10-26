import { describe, expect, it } from 'vitest';
import { parseClientMsg } from '../src/index';

describe('the legacy Spades act message is gone (3b)', () => {
  it('act messages no longer pass client-message validation', () => {
    expect(parseClientMsg({ t: 'act', action: { type: 'misdeal' }, seq: 3 })).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'act', action: { type: 'bid', bid: 3 } }))).toBeNull();
  });

  it('config keeps only the generic table rules', () => {
    expect(parseClientMsg({ t: 'config', rules: { playerCount: 3, turnTimerSec: 20, targetScore: 500, deck: 'joker' } }))
      .toMatchObject({ t: 'config', rules: { playerCount: 3, turnTimerSec: 20 } });
    const m = parseClientMsg({ t: 'config', rules: { playerCount: 3, turnTimerSec: 20, targetScore: 500 } });
    expect(m && m.t === 'config' ? Object.keys(m.rules).sort() : []).toEqual(['playerCount', 'turnTimerSec']);
  });
});
