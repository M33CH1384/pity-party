/** 5c: push settings list only what Pity Party really sends; story_callback and the Spades/cred types are gone. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeD1 } from './d1';
import { sha256b64 } from '../src/auth/providers';
import { allPrefs, NOTIF_LABELS, NOTIF_TYPES } from '../src/push/send';
import { handlePushHttp } from '../src/push/routes';
import { NOTIF_TYPES as WEB_TYPES } from '../../web/src/push/push';

const ORIGIN = 'https://pity-party.pages.dev';
const NOW = 1_800_000_000_000;
let db: D1Database;
beforeEach(async () => {
  db = await makeD1();
  await db.prepare("INSERT INTO users (id, username, username_key, created_at) VALUES ('u1', 'Pat', 'pat', 1)").run();
  await db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, 1, ?)').bind(await sha256b64('tok'), 'u1', NOW + 1e7).run();
});
const put = (body: unknown) => {
  const url = new URL('/api/push/prefs', ORIGIN);
  return handlePushHttp(new Request(url, { method: 'PUT', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: '__Host-pp_sid=tok' }, body: JSON.stringify(body) }), { DB: db, PUBLIC_ORIGIN: ORIGIN } as never, url, ['api', 'push', 'prefs'], NOW);
};

describe('push types (5c)', () => {
  it('server and web offer the same, Pity Party-only list', () => {
    expect([...NOTIF_TYPES].sort()).toEqual(WEB_TYPES.map((t) => t.type).sort());
    expect(NOTIF_TYPES).toEqual(['turn', 'invite', 'friend_online', 'daily', 'season', 'dm', 'mention']);
    for (const gone of ['story_callback', 'rankup', 'wager', 'achievement', 'challenge']) expect(NOTIF_TYPES as string[]).not.toContain(gone);
    expect(Object.keys(NOTIF_LABELS)).not.toContain('story_callback');
    expect(JSON.stringify(WEB_TYPES)).not.toMatch(/bid|story|rating|Big Bank|on the block/i);
  });
  it('prefs API refuses removed types and returns only live ones', async () => {
    expect((await put({ type: 'story_callback', enabled: false })).status).toBe(400);
    expect((await put({ type: 'rankup', enabled: false })).status).toBe(400);
    expect((await put({ type: 'tonk', enabled: false })).status).toBe(400);
    expect((await put({ type: 'invite', enabled: false })).status).toBe(200);
    await db.prepare("INSERT INTO push_prefs (user_id, type, enabled) VALUES ('u1', 'story_callback', 0)").run(); // legacy row
    const prefs = await allPrefs(db, 'u1');
    expect(Object.keys(prefs).sort()).toEqual([...NOTIF_TYPES].sort());
    expect(prefs.invite).toBe(false);
  });
});
