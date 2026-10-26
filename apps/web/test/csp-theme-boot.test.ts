/** The CSP is script-src 'self' (no 'unsafe-inline'): index.html must carry no inline script, and the pre-paint
 *  theme lives in /theme-boot.js, loaded blocking in <head> before any stylesheet/module, and still applies neon. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { pagesHeadersSource } from '../vite.config';

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const boot = readFileSync(join(root, 'public', 'theme-boot.js'), 'utf8');

function run(stored: string | null) {
  const meta = { content: '#111317', setAttribute(_: string, v: string) { this.content = v; } };
  const documentElement = { dataset: {} as Record<string, string> };
  runInNewContext(boot, { localStorage: { getItem: () => stored }, document: { documentElement, querySelector: () => meta }, JSON });
  return { theme: documentElement.dataset.theme, color: meta.content };
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
  it('applies neon + theme colour from storage, ignores classic/corrupt/absent', () => {
    expect(run(JSON.stringify({ theme: 'neon' }))).toEqual({ theme: 'neon', color: '#070914' });
    expect(run(JSON.stringify({ theme: 'classic' }))).toEqual({ theme: undefined, color: '#111317' });
    expect(run('{nope')).toEqual({ theme: undefined, color: '#111317' });
    expect(run(null)).toEqual({ theme: undefined, color: '#111317' });
  });
});
