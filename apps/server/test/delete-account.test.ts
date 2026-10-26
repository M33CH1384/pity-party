/**
 * Account delete must never be blocked by a foreign key (live 500 on 2026-10-26: presence + last_seen rows).
 * Signs up, goes online (presence report + last_seen), then puts a row in EVERY table whose foreign key points
 * at users(id) — found from the schema, so a future migration that adds one without a delete fails here — and
 * deletes the account: 200, and no row anywhere still points at the user.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeD1 } from './d1';
import { sha256b64 } from '../src/auth/providers';
import { handleSocialHttp } from '../src/social/routes';
import { handleAuth } from '../src/auth/routes';

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://pity-party.pages.dev';
type Raw = { exec(s: string, p?: unknown[]): { columns: string[]; values: unknown[][] }[] };
let db: D1Database;
let raw: Raw;
const rows = (sql: string, p: unknown[] = []) => { const r = raw.exec(sql, p)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; };

/** every (table, column) with a foreign key to users(id) */
function userRefs(): { table: string; col: string }[] {
  const out: { table: string; col: string }[] = [];
  for (const { name } of rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'")) {
    for (const fk of rows(`PRAGMA foreign_key_list(${name})`)) if (fk.table === 'users') out.push({ table: name as string, col: fk.from as string });
  }
  return out;
}

/** insert one row into `table` with `col` = uid, every other NOT NULL column a dummy (parents created as needed) */
function fill(table: string, col: string, uid: string, n: number) {
  const fks = rows(`PRAGMA foreign_key_list(${table})`);
  const vals: Record<string, unknown> = {};
  for (const c of rows(`PRAGMA table_info(${table})`)) {
    const name = c.name as string;
    const fk = fks.find((f) => f.from === name);
    if (fk?.table === 'users') vals[name] = uid;
    else if (fk) { const pid = `${table}-parent-${n}`; fill(fk.table as string, '', uid, n + 100); vals[name] = rows(`SELECT ${fk.to} v FROM ${fk.table} ORDER BY rowid DESC LIMIT 1`)[0]!.v ?? pid; }
    else if (c.notnull || c.pk) vals[name] = /INT/i.test(c.type as string) ? n : `${name}-${n}`;
  }
  if (col) vals[col] = uid;
  const keys = Object.keys(vals);
  raw.exec(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => vals[k]));
}

beforeEach(async () => { db = await makeD1(); raw = (db as unknown as { raw: Raw }).raw; });

describe('POST /api/auth/delete', () => {
  it('deletes an account that has presence, last_seen and a row in every users(id) FK table', async () => {
    const uid = 'u-del';
    await db.prepare('INSERT INTO users (id, username, username_key, created_at) VALUES (?, ?, ?, 1)').bind(uid, 'Deleter', 'deleter').run();
    const tok = 'del-session';
    await db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256b64(tok), uid, 1, NOW + 1e7).run();
    const cookie = `__Host-pp_sid=${tok}`;

    // going online the normal way writes presence
    const pu = new URL('/api/social/presence', ORIGIN);
    const pr = await handleSocialHttp(new Request(pu, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: JSON.stringify({ activity: 'online' }) }), { DB: db, PUBLIC_ORIGIN: ORIGIN }, pu, ['api', 'social', 'presence'], NOW);
    expect(pr.status).toBe(200);
    await db.prepare('INSERT INTO last_seen (user_id, at) VALUES (?, ?)').bind(uid, NOW).run();
    expect(rows('SELECT * FROM presence WHERE user_id = ?', [uid])).toHaveLength(1);

    const refs = userRefs();
    expect(refs.map((r) => r.table)).toEqual(expect.arrayContaining(['last_seen', 'presence', 'sessions']));
    let n = 1;
    for (const { table, col } of refs) if (!rows(`SELECT 1 FROM ${table} WHERE ${col} = ?`, [uid]).length) fill(table, col, uid, n++);
    for (const { table, col } of refs) expect(rows(`SELECT 1 FROM ${table} WHERE ${col} = ?`, [uid]).length, `${table}.${col} seeded`).toBeGreaterThan(0);

    const du = new URL('/api/auth/delete', ORIGIN);
    const res = await handleAuth(new Request(du, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: '{}' }), { DB: db, PUBLIC_ORIGIN: ORIGIN } as never, du, ['api', 'auth', 'delete'], { now: () => NOW } as never);
    expect(res.status).toBe(200);
    expect(rows('SELECT 1 FROM users WHERE id = ?', [uid])).toHaveLength(0);
    for (const { table, col } of refs) expect(rows(`SELECT 1 FROM ${table} WHERE ${col} = ?`, [uid]), `${table}.${col}`).toHaveLength(0);
  });
});
