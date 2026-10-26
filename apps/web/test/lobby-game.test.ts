import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoomInfo } from '@pp/protocol';
import { defaultsOf, getRules } from '@pp/game';
import { tableSeatRange } from '../src/modes/catalog';
import { LobbyGame } from '../src/modes/LobbyGame';

const room = (o: Partial<RoomInfo> = {}) => ({
  code: 'ABCDE', hostId: 'h', phase: 'lobby', rules: { playerCount: 3, turnTimerSec: 45 }, botLevel: 'mixed', seats: [], members: [],
  modeId: 'placeholder', modeOptions: defaultsOf(getRules('placeholder').optionsSchema), ...o,
}) as unknown as RoomInfo;
const html = (editable: boolean, r = room()) => renderToStaticMarkup(createElement(LobbyGame, { room: r, editable, onMode: () => {}, onSeats: () => {} }));

describe('lobby GAME panel (3c)', () => {
  it('seat range comes from the registry, capped at the 4-seat table; coming-soon modes use their label', () => {
    expect(tableSeatRange('placeholder')).toEqual({ min: 2, max: 4 });
    expect(tableSeatRange('tonk')).toEqual({ min: 2, max: 4 });
  });

  it('host: mode picker, a seats select limited to the mode range, editable options, timer shown', () => {
    const h = html(true);
    expect(h).toContain('data-testid="mode-picker"');
    const seats = h.match(/data-testid="lobby-seats"[^>]*>(.*?)<\/select>/)![1]!;
    expect([...seats.matchAll(/value="(\d)"/g)].map((m) => m[1])).toEqual(['2', '3', '4']);
    expect(h).toContain('data-testid="mode-options"');
    expect(h).not.toMatch(/<fieldset[^>]*disabled/);
    expect(h).toMatch(/data-testid="lobby-timer-info".*45s/);
  });

  it('guest: same game, options and timer, read-only (no picker, no seats select, form disabled)', () => {
    const h = html(false);
    expect(h).not.toContain('data-testid="mode-picker"');
    expect(h).not.toContain('data-testid="lobby-seats"');
    expect(h).toContain('set by the host');
    expect(h).toMatch(/data-testid="lobby-seats-ro">3</);
    expect(h).toMatch(/<fieldset[^>]*disabled/);
    expect(h).toContain('High Card');
    expect(h).toMatch(/45s/);
  });
});
