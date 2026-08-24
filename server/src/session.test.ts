import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PASSWORD_VAR,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedCookie,
  gateEnabled,
  isExempt,
  mintToken,
  passwordAccepted,
  readCookie,
  requestAllowed,
  requestIsSecure,
  sessionCookie,
  sessionPassword,
  tokenValid,
} from './session';

/**
 * Wave 0's gate, pinned in a module with no listener in it.
 *
 * The separation is not tidiness: `index.ts` calls `serve()` at import, so a
 * test that reached the gate through the app would start a real server on
 * :4600 — beside the one the user is running.
 */

const ON: NodeJS.ProcessEnv = { [PASSWORD_VAR]: 'correct horse' };
const OFF: NodeJS.ProcessEnv = {};
const NOW = 1_700_000_000_000;

describe('the gate is off until a password is set', () => {
  it('reads no password from an empty env', () => {
    expect(sessionPassword(OFF)).toBeNull();
    expect(gateEnabled(OFF)).toBe(false);
  });

  it('treats blank and whitespace as unset, so a stray "AGENTLINGS_PASSWORD=" is not a lock', () => {
    expect(sessionPassword({ [PASSWORD_VAR]: '' })).toBeNull();
    expect(sessionPassword({ [PASSWORD_VAR]: '   ' })).toBeNull();
    expect(gateEnabled({ [PASSWORD_VAR]: '  ' })).toBe(false);
  });

  it('lets every request through when the gate is off — the whole app, unchanged', () => {
    expect(requestAllowed('/api/levels/hq/state', null, NOW, OFF)).toBe(true);
    expect(requestAllowed('/api/levels/hq/jobs/x/resolve', null, NOW, OFF)).toBe(true);
  });

  it('arms on a password and refuses a request with no cookie', () => {
    expect(gateEnabled(ON)).toBe(true);
    expect(requestAllowed('/api/levels/hq/state', null, NOW, ON)).toBe(false);
  });
});

describe('the password', () => {
  it('accepts the configured one and refuses everything else', () => {
    expect(passwordAccepted('correct horse', ON)).toBe(true);
    expect(passwordAccepted('correct hors', ON)).toBe(false);
    expect(passwordAccepted('correct horse ', ON)).toBe(false);
    expect(passwordAccepted('', ON)).toBe(false);
  });

  it('refuses a non-string, so a JSON body of `{"password": true}` is not a login', () => {
    expect(passwordAccepted(true, ON)).toBe(false);
    expect(passwordAccepted(undefined, ON)).toBe(false);
    expect(passwordAccepted({ toString: () => 'correct horse' }, ON)).toBe(false);
  });

  it('refuses everything when no password is configured — an off gate never logs anyone in', () => {
    expect(passwordAccepted('', OFF)).toBe(false);
    expect(passwordAccepted('anything', OFF)).toBe(false);
  });

  it('is compared without the length telling on it', () => {
    // Not a timing measurement — that is not testable here. What is testable
    // is that a wrong length is answered rather than thrown, which is what a
    // bare timingSafeEqual would do and how the comparison would leak.
    expect(() => passwordAccepted('x', ON)).not.toThrow();
    expect(passwordAccepted('x'.repeat(5000), ON)).toBe(false);
  });
});

describe('the token', () => {
  it('validates the one it just minted', () => {
    expect(tokenValid(mintToken('pw', NOW), 'pw', NOW)).toBe(true);
  });

  it('expires, and the expiry is what expires it rather than the signature', () => {
    const token = mintToken('pw', NOW, 1000);
    expect(tokenValid(token, 'pw', NOW + 999)).toBe(true);
    expect(tokenValid(token, 'pw', NOW + 1001)).toBe(false);
  });

  it('refuses a token whose expiry was moved forward — the signature covers it', () => {
    const token = mintToken('pw', NOW, 1000);
    const sig = token.slice(token.indexOf('.') + 1);
    const moved = `${NOW + 999_999_999}.${sig}`;
    expect(tokenValid(moved, 'pw', NOW)).toBe(false);
  });

  it('refuses a token signed for a different password, which is how a change logs everyone out', () => {
    const token = mintToken('old', NOW);
    expect(tokenValid(token, 'new', NOW)).toBe(false);
  });

  it('refuses malformed shapes rather than throwing on them', () => {
    expect(tokenValid('', 'pw', NOW)).toBe(false);
    expect(tokenValid(null, 'pw', NOW)).toBe(false);
    expect(tokenValid('nodot', 'pw', NOW)).toBe(false);
    expect(tokenValid('.sig', 'pw', NOW)).toBe(false);
    expect(tokenValid('notanumber.sig', 'pw', NOW)).toBe(false);
    expect(tokenValid('123.', 'pw', NOW)).toBe(false);
  });

  it('survives a restart, because nothing about it is stored', () => {
    // Two independent derivations of the key from the same password agree —
    // which is the property that means a role edit's restart does not sign the
    // user out (§5: roles are read once at boot).
    const before = mintToken('pw', NOW);
    expect(tokenValid(before, 'pw', NOW + 60_000)).toBe(true);
  });
});

describe('reading the cookie', () => {
  it('finds the session among others', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=tok; b=2`, SESSION_COOKIE)).toBe('tok');
    expect(readCookie(`${SESSION_COOKIE}=tok`, SESSION_COOKIE)).toBe('tok');
  });

  it('does not match a cookie whose name merely ends the same way', () => {
    expect(readCookie(`x_${SESSION_COOKIE}=wrong`, SESSION_COOKIE)).toBeNull();
  });

  it('answers null for absent, empty and malformed headers', () => {
    expect(readCookie(null, SESSION_COOKIE)).toBeNull();
    expect(readCookie('', SESSION_COOKIE)).toBeNull();
    expect(readCookie('novalue', SESSION_COOKIE)).toBeNull();
  });

  it('handles the value being percent-encoded, and a bad encoding without throwing', () => {
    expect(readCookie(`${SESSION_COOKIE}=a%2Eb`, SESSION_COOKIE)).toBe('a.b');
    expect(readCookie(`${SESSION_COOKIE}=100%`, SESSION_COOKIE)).toBe('100%');
  });
});

describe('what answers without a credential', () => {
  it('exempts /internal/*, the doors the runner calls with no browser', () => {
    expect(isExempt('/internal/fetch')).toBe(true);
    expect(isExempt('/internal/github')).toBe(true);
    expect(isExempt('/internal/mail')).toBe(true);
  });

  it('does not exempt a path that merely starts with the letters', () => {
    expect(isExempt('/internalish')).toBe(false);
    expect(isExempt('/api/internal/fetch')).toBe(false);
  });

  it('exempts logging in, because logging in cannot require being logged in', () => {
    expect(isExempt('/api/session')).toBe(true);
  });

  it('exempts the Google callback, which carries no cookie of ours (R-06)', () => {
    expect(isExempt('/api/oauth/google/callback')).toBe(true);
  });

  it('exempts nothing else — including the routes it would be tempting to', () => {
    expect(isExempt('/api/levels')).toBe(false);
    expect(isExempt('/api/settings')).toBe(false);
    expect(isExempt('/api/spend')).toBe(false);
    expect(isExempt('/api/oauth/google/start')).toBe(false);
    expect(isExempt('/ws')).toBe(false);
  });
});

describe('the request gate', () => {
  const cookie = `${SESSION_COOKIE}=${mintToken('correct horse', NOW)}`;

  it('admits a valid cookie', () => {
    expect(requestAllowed('/api/levels/hq/state', cookie, NOW, ON)).toBe(true);
  });

  it('refuses no cookie, a junk cookie and an expired one', () => {
    expect(requestAllowed('/api/levels/hq/state', null, NOW, ON)).toBe(false);
    expect(requestAllowed('/api/levels/hq/state', `${SESSION_COOKIE}=junk`, NOW, ON)).toBe(false);
    expect(requestAllowed('/api/levels/hq/state', cookie, NOW + SESSION_TTL_MS + 1, ON)).toBe(
      false,
    );
  });

  it('gates the socket path on the same cookie — the surface the choice was made for', () => {
    expect(requestAllowed('/ws', null, NOW, ON)).toBe(false);
    expect(requestAllowed('/ws', cookie, NOW, ON)).toBe(true);
  });

  it('lets the runner through to its doors with no cookie at all', () => {
    expect(requestAllowed('/internal/fetch', null, NOW, ON)).toBe(true);
  });
});

describe('the cookie flags', () => {
  it('is HttpOnly and Lax, so page script cannot read it and cross-site fetches do not carry it', () => {
    const set = sessionCookie('tok', false);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    expect(set).toContain('Path=/');
  });

  it('adds Secure only on https, because two of the three origins are plain http (R-04)', () => {
    expect(sessionCookie('tok', true)).toContain('Secure');
    expect(sessionCookie('tok', false)).not.toContain('Secure');
  });

  it('clears with the same flags, or the browser keeps the old one', () => {
    expect(clearedCookie(false)).toContain('Max-Age=0');
    expect(clearedCookie(true)).toContain('Secure');
    expect(clearedCookie(false)).not.toContain('Secure');
  });
});

describe('deciding https', () => {
  it('believes the proxy that terminated TLS', () => {
    expect(requestIsSecure('https', 'http://127.0.0.1:4600/api/levels')).toBe(true);
    expect(requestIsSecure('http', 'http://127.0.0.1:4600/api/levels')).toBe(false);
  });

  it('reads the first hop of a chained header', () => {
    expect(requestIsSecure('https, http', 'http://x/')).toBe(true);
    expect(requestIsSecure('http, https', 'http://x/')).toBe(false);
  });

  it('falls back to the URL when nothing fronts the server', () => {
    expect(requestIsSecure(null, 'https://x/api')).toBe(true);
    expect(requestIsSecure(undefined, 'http://127.0.0.1:4600/api')).toBe(false);
  });
});

/**
 * R-05: a route is missed among ~90 registrations, or — worse, because it
 * cannot be caught by reading this commit — a route added *later* lands
 * outside a gated prefix and nobody notices.
 *
 * Read from the source text rather than by importing the app, for the reason
 * at the top of this file. It is a weaker check than mounting the real router
 * and a far stronger one than none: it fails on the next registration that
 * does not fit the two prefixes.
 */
describe('every route the server registers is covered by a prefix (R-05)', () => {
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts'),
    'utf8',
  );
  const paths = [...source.matchAll(/^app\.(?:get|post|put|patch|delete|all)\('([^']+)'/gm)].map(
    (m) => m[1]!,
  );

  it('found the registrations, so a regex that stopped matching fails loudly', () => {
    expect(paths.length).toBeGreaterThan(80);
  });

  it('registers nothing outside /api/* and /internal/*', () => {
    const stray = paths.filter((p) => !p.startsWith('/api/') && !p.startsWith('/internal/'));
    expect(stray).toEqual([]);
  });

  it('leaves every /api/ route gated except the two named exemptions', () => {
    const open = [...new Set(paths.filter((p) => p.startsWith('/api/') && isExempt(p)))];
    expect(open.sort()).toEqual(['/api/oauth/google/callback', '/api/session']);
  });
});
