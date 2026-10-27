/** The CSP is script-src 'self' (no 'unsafe-inline'): index.html carries no inline script, and the pre-paint
 *  theme lives in /theme-boot.js, loaded blocking in <head>. V1: four themes, default C, BWM-key migration. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { pagesHeadersSource } from '../vite.config';

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const boot = readFileSync(join(root, 'public', 'theme-boot.js'), 'utf8');

function run(seed: Record<string, string>) {
  const ls = new Map(Object.entries(seed));
  const meta = { content: '#0C0C10', setAttribute(_: string, v: string) { this.content = v; } };
  const documentElement = { dataset: {} as Record<string, string> };
  runInNewContext(boot, { localStorage: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v); } }, document: { documentElement, querySelector: () => meta }, JSON });
  return { ds: { ...documentElement.dataset }, color: meta.content, stored: ls.get('pp.theme.v1') ?? null };
}

describe('pre-paint theme under a strict CSP', () => {
  it('index.html has no inline <script> body and loads /theme-boot.js blocking in <head>', () => {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) expect(m[2]!.trim(), `inline script: ${m[0].slice(0, 60)}`).toBe('');
    const head = html.slice(0, html.indexOf('</head>'));
    const tag = head.match(/<script\b[^>]*src="\/theme-boot\.js"[^>]*>/)?.[0];
    expect(tag).toBeTruthy();
    expect(tag).not.toMatch(/\b(async|defer|type="module")/);
  });
  it('the shipped CSP stays strict: script-src self, no unsafe-inline', () => {
    const csp = pagesHeadersSource('https://pity-party-server.example').match(/Content-Security-Policy: (.*)/)![1]!;
    const script = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(script).toContain("'self'");
    expect(script).not.toContain('unsafe-inline');
  });
  it('fresh visitor → C (Neon Lounge + neon fx), nothing written', () => {
    expect(run({})).toEqual({ ds: { theme: 'C', fx: 'neon' }, color: '#0C0C10', stored: null });
  });
  it('new key applies A / B / K with their chrome colours', () => {
    expect(run({ 'pp.theme.v1': '{"theme":"A"}' })).toMatchObject({ ds: { theme: 'A' }, color: '#141233' });
    expect(run({ 'pp.theme.v1': '{"theme":"B"}' })).toMatchObject({ ds: { theme: 'B' }, color: '#F3E9DA' });
    expect(run({ 'pp.theme.v1': '{"theme":"K"}' })).toMatchObject({ ds: { theme: 'K' }, color: '#0C0712' });
  });
  it('migrates BWM\'s old key before first paint: neon → C, classic → K, corrupt → C (and writes the new key)', () => {
    expect(run({ 'bwm.theme.v1': '{"theme":"neon"}' })).toEqual({ ds: { theme: 'C', fx: 'neon' }, color: '#0C0C10', stored: '{"theme":"C"}' });
    expect(run({ 'bwm.theme.v1': '{"theme":"classic"}' })).toEqual({ ds: { theme: 'K' }, color: '#0C0712', stored: '{"theme":"K"}' });
    expect(run({ 'bwm.theme.v1': '{nope' })).toMatchObject({ ds: { theme: 'C' }, stored: '{"theme":"C"}' });
  });
});
