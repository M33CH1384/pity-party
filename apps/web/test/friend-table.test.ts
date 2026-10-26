import { describe, expect, it } from 'vitest';
import type { OpenTable } from '@pp/protocol';
import { playerTableAction } from '../src/social/tableActions';
import { MODE_NAME } from '../src/social/Social';
import { statusLabel } from '@pp/protocol';

const T = (o: Partial<OpenTable> = {}): OpenTable => ({ code: 'FRND1', host: 'Pal', mode: 'placeholder', playerCount: 3, target: 0, venue: 'classic', humans: 1, bots: 0, open: 2, status: 'waiting', spectators: 0, seat: 1, at: 1, ...o });

describe('join / spectate a friend on a registry table (5b)', () => {
  it('lobby with open seats: Join deep-links the first open seat; Spectate is offered too', () => {
    const a = playerTableAction({ kind: 'lobby', mode: 'placeholder', code: 'FRND1', open: 2, seat: 1 }, { FRND1: T() }, null)!;
    expect(a).toMatchObject({ code: 'FRND1', join: true, seat: 1, joinLabel: 'Join', spectate: true });
  });
  it('a full table (no open seat within playerCount) offers Spectate only', () => {
    const a = playerTableAction({ kind: 'table', mode: 'placeholder', code: 'FRND1', open: 0 }, { FRND1: T({ open: 0, status: 'playing', seat: undefined }) }, null)!;
    expect(a.join).toBe(false);
    expect(a.spectate).toBe(true);
  });
  it('mid-game, a takeable bot seat reads "Take seat"; spectators full disables Watch', () => {
    const a = playerTableAction({ kind: 'table', mode: 'tonk', code: 'FRND1' }, { FRND1: T({ status: 'playing', open: 1, seat: 2, watchFull: true }) }, null)!;
    expect(a).toMatchObject({ join: true, seat: 2, joinLabel: 'Take seat' });
    expect(a.spectateReason).toBeTruthy();
  });
  it('your own table shows no join/spectate for a friend sitting with you', () => {
    expect(playerTableAction({ kind: 'lobby', code: 'FRND1', mode: 'placeholder' }, { FRND1: T() }, 'FRND1')).toBeNull();
  });
  it('presence lines name the registry mode', () => {
    expect(MODE_NAME.placeholder).toBe('High Card');
    expect(statusLabel({ kind: 'lobby', mode: 'tonk', open: 2 }, (m) => MODE_NAME[m] ?? m)).toBe('In lobby · Tonk · 2 seats open');
    expect(statusLabel({ kind: 'table', mode: 'placeholder', code: 'FRND1' }, (m) => MODE_NAME[m] ?? m)).toContain('High Card');
  });
});
