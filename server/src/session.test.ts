import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SERVER_OWNED } from './bundle';
import {
  BIND_VAR,
  HOST_PORT_VAR,
  LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
  PASSWORD_VAR,
  PORT_VAR,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  attemptLogin,
  clearedCookie,
  gateEnabled,
  isExempt,
  listenPolicy,
  lockoutRefusal,
  lockoutRemaining,
  mintToken,
  newLoginGate,
  noteLoginFailure,
  noteLoginSuccess,
  passwordAccepted,
  readCookie,
  listenRefusal,
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

describe('the login rate limit', () => {
  it('opens with the door unlocked', () => {
    expect(lockoutRemaining(newLoginGate(), NOW)).toBe(0);
  });

  it('tolerates typos right up to the allowance, then locks', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS - 1; i++) noteLoginFailure(gate, NOW);
    expect(lockoutRemaining(gate, NOW)).toBe(0);
    noteLoginFailure(gate, NOW);
    expect(lockoutRemaining(gate, NOW)).toBe(LOGIN_LOCKOUT_MS / 1000);
  });

  it('opens again once the lockout expires', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) noteLoginFailure(gate, NOW);
    expect(lockoutRemaining(gate, NOW + LOGIN_LOCKOUT_MS - 1)).toBe(1);
    expect(lockoutRemaining(gate, NOW + LOGIN_LOCKOUT_MS + 1)).toBe(0);
  });

  it('does not stack: a locked door re-locks from the same allowance, not sooner', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) noteLoginFailure(gate, NOW);
    // The counter resets when it fires, so the next lockout costs the full
    // allowance again rather than one wrong guess locking it forever.
    noteLoginFailure(gate, NOW);
    expect(gate.failures).toBe(1);
  });

  it('forgives the count on a correct password, so a typo before it costs nothing', () => {
    const gate = newLoginGate();
    noteLoginFailure(gate, NOW);
    noteLoginFailure(gate, NOW);
    noteLoginSuccess(gate);
    expect(gate.failures).toBe(0);
    expect(lockoutRemaining(gate, NOW)).toBe(0);
  });

  it('refuses the RIGHT password while locked, or the lockout is theatre', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) attemptLogin(gate, 'wrong', NOW, ON);
    const right = attemptLogin(gate, 'correct horse', NOW, ON);
    expect(right).toEqual({ ok: false, status: 429, error: lockoutRefusal(LOGIN_LOCKOUT_MS / 1000) });
  });

  it('says how long in whole minutes, and gets the plural right', () => {
    expect(lockoutRefusal(300)).toContain('5 minutes');
    expect(lockoutRefusal(60)).toContain('1 minute.');
    expect(lockoutRefusal(1)).toContain('1 minute.');
  });
});

/**
 * The whole login decision, which lives here rather than in the route so that
 * a test can reach it at all. A mutation pass is what forced this: deleting
 * the lockout check from `index.ts` survived every test, because `serve()`
 * runs at import and no test can mount that route. A source-text assertion was
 * tried first and was worse than nothing — the mutation left both identifiers
 * in place, so it passed while the check did nothing.
 */
describe('attemptLogin — the decision the route only adapts', () => {
  it('lets anyone in with no token when the gate is off', () => {
    expect(attemptLogin(newLoginGate(), undefined, NOW, OFF)).toEqual({ ok: true, token: null });
  });

  it('refuses a wrong password 401 and counts it', () => {
    const gate = newLoginGate();
    expect(attemptLogin(gate, 'nope', NOW, ON)).toEqual({
      ok: false,
      status: 401,
      error: 'That password was not accepted.',
    });
    expect(gate.failures).toBe(1);
  });

  it('mints a token for the right one and clears the count', () => {
    const gate = newLoginGate();
    attemptLogin(gate, 'nope', NOW, ON);
    const result = attemptLogin(gate, 'correct horse', NOW, ON);
    expect(result.ok).toBe(true);
    expect(result.ok && tokenValid(result.token, 'correct horse', NOW)).toBe(true);
    expect(gate.failures).toBe(0);
  });

  it('locks out after the allowance, with 429 and not 401', () => {
    const gate = newLoginGate();
    const codes = Array.from(
      { length: LOGIN_ATTEMPTS + 1 },
      () => (attemptLogin(gate, 'nope', NOW, ON) as { status: number }).status,
    );
    expect(codes.slice(0, LOGIN_ATTEMPTS)).toEqual(Array(LOGIN_ATTEMPTS).fill(401));
    expect(codes[LOGIN_ATTEMPTS]).toBe(429);
  });

  it('checks the lockout BEFORE the password, so a locked door reveals nothing', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) attemptLogin(gate, 'nope', NOW, ON);
    // Both answers are the same 429 with the same text: a locked door cannot
    // be used as an oracle for whether the guess was right.
    const wrong = attemptLogin(gate, 'nope', NOW, ON);
    const right = attemptLogin(gate, 'correct horse', NOW, ON);
    expect(wrong).toEqual(right);
    expect(right).toMatchObject({ status: 429 });
  });

  it('opens again once the lockout expires', () => {
    const gate = newLoginGate();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) attemptLogin(gate, 'nope', NOW, ON);
    expect(attemptLogin(gate, 'correct horse', NOW + LOGIN_LOCKOUT_MS + 1, ON).ok).toBe(true);
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

  /**
   * Checked against `SERVER_OWNED` itself rather than against a second copy of
   * those prefixes, because since #29 this test carries a second job. The
   * bundle middleware runs *before* the routes, so a top-level registration
   * outside these prefixes — `/healthz`, `/metrics` — has no extension, takes
   * the deep-link fall-through, and is answered with the shell: a 200 of HTML
   * where a route was meant to be, and nothing failing anywhere to say so.
   * One list, so `bundle.ts` and the router cannot drift apart.
   */
  it('registers nothing outside the prefixes the bundle refuses to claim', () => {
    const stray = paths.filter((p) => !SERVER_OWNED.some((owned) => p.startsWith(`${owned}/`)));
    expect(stray).toEqual([]);
    expect(SERVER_OWNED).toContain('/api');
    expect(SERVER_OWNED).toContain('/internal');
  });

  it('leaves every /api/ route gated except the two named exemptions', () => {
    const open = [...new Set(paths.filter((p) => p.startsWith('/api/') && isExempt(p)))];
    expect(open.sort()).toEqual(['/api/oauth/google/callback', '/api/session']);
  });

  /**
   * #29 put one handler in front of that gate: the built web bundle, which is
   * product — the same bytes for every install, already public in the
   * repository — while the operator's data stays behind `/api`, a prefix
   * `bundleFile` refuses to claim under any spelling.
   *
   * The order is the whole of it being right, and it is invisible to every
   * other test here: move the static middleware below the gate and a hosted
   * install answers a browser `{"error":"Sign in to reach this"}` with no
   * screen to sign in on — the shell has to arrive before it can ask
   * `/api/session` and draw the password box. Read from the source text,
   * which is weak; `scripts/prove-hosted.mjs --local` fetches the title screen
   * with the gate on and no cookie, which is not.
   */
  it('serves the bundle before the gate, so the sign-in can be reached (#29)', () => {
    const bundle = source.indexOf('bundleFile(new URL(');
    const gate = source.indexOf('requestAllowed(new URL(');
    expect(bundle).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(bundle).toBeLessThan(gate);
  });
});

/**
 * #28 — *no password, no public interface*.
 *
 * The gate above ships off when nothing sets a password, and that is safe on
 * this machine for exactly one reason: the bind is loopback, so the only
 * caller who can reach an ungated server is already sitting at it (D-127, *the
 * loopback bind is the security*). An install that binds every interface has
 * spent that reason, and an off-by-default gate there is a server anyone with
 * the URL can drive. So the two facts are joined here rather than left as a
 * habit: the bind decides whether the password is optional.
 *
 * These are the whole test of it, because the policy is a pure function and the
 * server's entry file starts listening at import — there is no seam there and
 * none was added. `scripts/prove-hosted.mjs --local` is what proves the boot
 * path actually calls this.
 */
describe('the listen policy', () => {
  it('listens on loopback with the gate off when nothing is set, which is today', () => {
    // The maintainer's install, unchanged: no variable of this ticket exists
    // in its environment (#28's rule, and user story 18).
    expect(listenPolicy({})).toEqual({
      listen: true,
      hostname: '127.0.0.1',
      port: 4600,
      gate: false,
    });
  });

  it('listens on loopback with the gate on when a password is set', () => {
    expect(listenPolicy({ [PASSWORD_VAR]: 'correct horse' })).toEqual({
      listen: true,
      hostname: '127.0.0.1',
      port: 4600,
      gate: true,
    });
  });

  /**
   * The branch this ticket exists for. It is also the shape the repository has
   * been bitten by three times in one day — a guard that passes because no test
   * input ever reaches it (D-246) — so the input is here and the reason is
   * asserted rather than the boolean alone.
   *
   * **This test is what kills the mutant**, measured rather than asserted:
   * replacing the refuse branch with `{ listen: true, … }` fails this and the
   * `'refuses on any address that is not this machine'` case below, and nothing
   * else in the suite. The `describe('the refusal sentence')` block further
   * down is *not* that check — it pins what the sentence has to contain, and
   * would stay green if the branch that produces it vanished.
   */
  it('refuses to listen on a public interface with no password, and says why', () => {
    const refused = listenPolicy({ [BIND_VAR]: '0.0.0.0' });
    expect(refused.listen).toBe(false);
    if (refused.listen) throw new Error('unreachable');
    // The reason has to name the variable, because it is the only line the
    // operator gets: a container that exits prints this and nothing else.
    expect(refused.reason).toContain(PASSWORD_VAR);
    expect(refused.reason).toContain('0.0.0.0');
  });

  it('refuses on any address that is not this machine, not just 0.0.0.0', () => {
    for (const bind of ['0.0.0.0', '::', '[::]', '192.168.1.20', 'horde.example.com']) {
      expect(listenPolicy({ [BIND_VAR]: bind }).listen).toBe(false);
    }
    // And accepts every form of loopback, so an operator who writes the bind
    // out explicitly is not refused for agreeing with the default.
    for (const bind of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.0.0.2']) {
      expect(listenPolicy({ [BIND_VAR]: bind }).listen).toBe(true);
    }
  });

  it('listens on a public interface once there is a password, with the gate on', () => {
    expect(listenPolicy({ [BIND_VAR]: '0.0.0.0', [PASSWORD_VAR]: 'correct horse' })).toEqual({
      listen: true,
      hostname: '0.0.0.0',
      port: 4600,
      gate: true,
    });
  });

  it('treats a blank bind as unset, so a stray "AGENTLINGS_BIND=" is not a refusal', () => {
    // The same failure direction as AGENTLINGS_HOME and the password: an empty
    // value is a line somebody left in a template, not an instruction.
    expect(listenPolicy({ [BIND_VAR]: '' })).toEqual(listenPolicy({}));
    expect(listenPolicy({ [BIND_VAR]: '   ' })).toEqual(listenPolicy({}));
  });

  /**
   * Two names for the port on purpose. `PORT` is what every host that could
   * run this template injects; `AGENTLINGS_PORT` is what an operator writes
   * when the host guessed wrong, and it wins because a variable somebody typed
   * beats one a platform assumed.
   */
  it('takes the port from the host, and lets the operator overrule it', () => {
    expect(listenPolicy({ [HOST_PORT_VAR]: '8080' })).toMatchObject({ port: 8080 });
    expect(listenPolicy({ [PORT_VAR]: '8081' })).toMatchObject({ port: 8081 });
    expect(listenPolicy({ [HOST_PORT_VAR]: '8080', [PORT_VAR]: '8081' })).toMatchObject({
      port: 8081,
    });
  });

  it('falls back to 4600 for a value that is not a port, rather than binding something else', () => {
    for (const bad of ['', '  ', 'eight thousand', '0', '-1', '70000', '80.5']) {
      expect(listenPolicy({ [HOST_PORT_VAR]: bad })).toMatchObject({ port: 4600 });
    }
  });

  it('reads the real environment when it is given none', () => {
    // The signature every other function in this file has, and the one boot
    // uses. It is here so that a refactor which drops the default is caught.
    expect(typeof listenPolicy().listen).toBe('boolean');
  });
});

/**
 * What the refusal has to say, separately from whether it is reached. A
 * container that exits prints this line and nothing else, so a sentence
 * reduced to "refused" would leave an operator with nowhere to go.
 */
describe('the refusal sentence', () => {
  it('names both the address it refused and the variable that fixes it', () => {
    const reason = listenRefusal('0.0.0.0');
    expect(reason).toContain('0.0.0.0');
    expect(reason).toContain(PASSWORD_VAR);
    expect(reason).toContain(BIND_VAR);
  });
});
