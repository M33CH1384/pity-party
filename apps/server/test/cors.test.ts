import { describe, expect, it } from 'vitest';
import { allowedOrigin } from '../src/cors';

const WORKER = 'https://pity-party-server.example.workers.dev/api/x';
const LIST = 'https://pity-party.pages.dev,http://localhost:5173,http://localhost:4173,http://127.0.0.1:4173';
const req = (origin?: string) => new Request(WORKER, { headers: origin ? { Origin: origin } : {} });

describe('allowedOrigin', () => {
  it.each([
    'https://pity-party.pages.dev',
    'https://abc123.pity-party.pages.dev',
    'https://fix-audit-ts-cors.pity-party.pages.dev',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'https://pity-party-server.example.workers.dev',
  ])('allows %s', (o) => expect(allowedOrigin(req(o), { ALLOWED_ORIGINS: LIST })).toBe(o));

  it.each([
    'https://evil.example',
    'https://bid-wit-me.pages.dev',
    'https://abc123.bid-wit-me.pages.dev',
    'https://pity-party.pages.dev.evil.example',
    'https://a.b.pity-party.pages.dev',
    'http://abc.pity-party.pages.dev',
    'null',
  ])('denies %s', (o) => expect(allowedOrigin(req(o), { ALLOWED_ORIGINS: LIST })).toBeNull());

  it('no Origin header: no CORS header', () => expect(allowedOrigin(req(), { ALLOWED_ORIGINS: LIST })).toBeNull());

  it('fails closed when ALLOWED_ORIGINS is unset', () => {
    expect(allowedOrigin(req('https://evil.example'), {})).toBeNull();
    expect(allowedOrigin(req('http://localhost:5173'), {})).toBeNull();
    expect(allowedOrigin(req('https://abc.pity-party.pages.dev'), {})).toBe('https://abc.pity-party.pages.dev');
  });

  it('ignores a literal * entry', () => {
    expect(allowedOrigin(req('https://evil.example'), { ALLOWED_ORIGINS: '*' })).toBeNull();
    expect(allowedOrigin(req('https://evil.example'), { ALLOWED_ORIGINS: `${LIST}, *` })).toBeNull();
  });
});
