import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Wave 0's credential: a password the user types once, exchanged for an
 * `HttpOnly` session cookie that rides every later request.
 *
 * **Why a cookie and not a bearer token.** `web/src/useWorld.ts` opens a bare
 * `new WebSocket(...)`, and the browser gives page script no way to set a
 * header on a handshake — so a `Authorization: Bearer` scheme would have to
 * grow a second, different mechanism for `/ws` alone, and the socket is the
 * surface that matters: it is handed `sim.state()` and the whole event log the
 * moment it opens, measured at 946 KB (D-240). A cookie rides the upgrade with
 * no special case at all. A gate that closed HTTP and left the socket open
 * would be worse than none.
 *
 * **This is not `origin.ts` and does not replace it.** D-239 asks *which site
 * sent this*, which a browser answers honestly and a non-browser client can
 * lie about freely. This asks *who are you*, and nothing but the password
 * answers it. They stack: the origin check still runs first and still refuses
 * a hostile page before any of this is reached.
 *
 * **This is not a widening of the network boundary.** The loopback bind and
 * `serve`-never-`funnel` (D-127, D-175) are exactly as they were. Wave 0 adds
 * a lock to a door that is still inside the house.
 */

/** The cookie's name. `__Host-` is deliberately not used: that prefix demands
 * `Secure`, and the app is reached over plain http on loopback. */
export const SESSION_COOKIE = 'agentlings_session';

/** How long a login lasts. Long, because the alternative is a password prompt
 * between the user and their own machine several times a day. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The env var that both sets the password and switches the gate on. */
export const PASSWORD_VAR = 'AGENTLINGS_PASSWORD';

/**
 * The configured password, or null when there is none.
 *
 * **An unset password means the gate is off**, and that is the deliberate
 * failure direction. A gate that defaults to closed would lock the user out of
 * a server that is already running — possibly with paid jobs in flight, which
 * is the incident class R-07 exists to avoid — on the strength of a commit
 * they had not read yet. So this ships inert, and `.env` is what arms it. The
 * server says which state it booted in.
 */
export function sessionPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[PASSWORD_VAR];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether requests are gated at all. */
export function gateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return sessionPassword(env) !== null;
}

/**
 * The signing key, derived from the password rather than being it.
 *
 * Derived, so the password itself is never the thing HMAC'd with; and keyed by
 * the password, so **changing the password invalidates every outstanding
 * cookie** without needing anywhere to record that it did. The token is
 * therefore self-contained: nothing is stored server-side, and a restart —
 * which this project does often, because a role edit needs one — does not sign
 * the user out.
 */
function signingKey(password: string): Buffer {
  return createHmac('sha256', 'agentlings:session:v1').update(password).digest();
}

/** Constant-time equality that does not leak length through an early return. */
function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would be the leak. Hash
  // both to a fixed width first: unequal lengths then compare in constant time
  // like any other unequal pair.
  const ah = createHmac('sha256', 'agentlings:compare').update(ab).digest();
  const bh = createHmac('sha256', 'agentlings:compare').update(bb).digest();
  return timingSafeEqual(ah, bh);
}

/** Whether a typed password is the configured one. */
export function passwordAccepted(
  supplied: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const actual = sessionPassword(env);
  if (actual === null) return false;
  if (typeof supplied !== 'string') return false;
  return sameSecret(supplied, actual);
}

/**
 * A token: the expiry in plain sight, signed. `exp.sig`.
 *
 * The expiry is readable because it is not a secret — what stops a client
 * moving it is that the signature covers it. Nothing else is carried: there is
 * one user, so a subject would be a field with one possible value.
 */
export function mintToken(password: string, now: number, ttlMs: number = SESSION_TTL_MS): string {
  const exp = String(now + ttlMs);
  const sig = createHmac('sha256', signingKey(password)).update(exp).digest('base64url');
  return `${exp}.${sig}`;
}

/** Whether a token is well-formed, correctly signed for this password, and unexpired. */
export function tokenValid(
  token: string | null | undefined,
  password: string,
  now: number,
): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  const expected = createHmac('sha256', signingKey(password)).update(exp).digest('base64url');
  // Signature before expiry: an unsigned token's expiry is not worth reading,
  // and checking in this order means an attacker learns nothing from timing
  // about whether a forged token's date was plausible.
  if (!sameSecret(sig, expected)) return false;
  return Number(exp) > now;
}

/**
 * Parse a `Cookie` header.
 *
 * Written here rather than taken from `hono/cookie` because **both surfaces
 * must read the cookie the same way**: the HTTP gate has a Hono context and
 * the WebSocket gate has a bare `IncomingMessage`, and two parsers is how the
 * socket ends up disagreeing with the API about who is logged in — the exact
 * shape of every "it works everywhere except one place" bug in this repo.
 */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Paths that answer without a credential, and why each one has to.
 *
 * Matched on the path alone, so a route added later under a gated prefix is
 * gated by default — the direction a mistake should fall. `routesAreCovered`
 * in the tests enumerates the app's own registrations against this list so a
 * *future* route cannot quietly slip out (R-05).
 */
export function isExempt(path: string): boolean {
  // The doors the spawned runner calls. Left uncredentialed on purpose: the
  // credential here is a cookie a browser earns by typing a password, and the
  // runner has no browser — so no session is ever handed anything, which is
  // R-01 dissolved rather than mitigated. The doors are read-shaped and
  // already gated per connection by `connection.tools` (D-158), the origin
  // check already refuses a hostile page's POST, and what protects them is the
  // network boundary, unchanged.
  if (path === '/internal' || path.startsWith('/internal/')) return true;
  // Logging in cannot require being logged in.
  if (path === '/api/session') return true;
  // Google redirects the browser here and the callback carries no cookie of
  // ours — a `SameSite` cookie is withheld on a cross-site navigation, which
  // is exactly what this is. Its own `state` check is the credential (R-06).
  if (path === '/api/oauth/google/callback') return true;
  return false;
}

/** Whether this request may proceed. The one function both surfaces call. */
export function requestAllowed(
  path: string,
  cookieHeader: string | null | undefined,
  now: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const password = sessionPassword(env);
  if (password === null) return true; // gate off
  if (isExempt(path)) return true;
  return tokenValid(readCookie(cookieHeader, SESSION_COOKIE), password, now);
}

/**
 * The `Set-Cookie` value for a fresh login.
 *
 * `secure` is decided by the caller from the request's own protocol, not
 * hardcoded, because the app is reached over three origins and only one of
 * them is https: Vite dev on `:5173`, the API direct on `:4600`, and the
 * `.ts.net` name where `tailscale serve` terminates TLS and forwards plain
 * http to loopback. A hardcoded `Secure` would be silently dropped by the
 * browser on the two http origins and the user would type a password into a
 * form that never logs them in (R-04).
 *
 * `SameSite=Lax` rather than `Strict`. Strict withholds the cookie on any
 * cross-site *navigation*, so opening the tailnet URL from a link in a chat
 * app — the way the phone is actually reached (D-175) — would land on the
 * login screen every time. Lax still withholds it from every cross-site
 * `fetch`, form POST and iframe, which is the CSRF case, and D-239's
 * same-origin check on unsafe methods is the second lock on that same door
 * (R-03).
 */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** The `Set-Cookie` value that ends a session. */
export function clearedCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Whether the browser reached us over https, from the proxy's own account of
 * it. `tailscale serve` terminates TLS and sets `X-Forwarded-Proto`; nothing
 * else fronts this server. Trusting a header sounds wrong and is not: a client
 * that lies here can only make its own cookie *more* restrictive.
 */
export function requestIsSecure(
  forwardedProto: string | null | undefined,
  url: string,
): boolean {
  if (forwardedProto) return forwardedProto.split(',')[0]!.trim().toLowerCase() === 'https';
  return url.startsWith('https:');
}

export const loginRefusal = 'That password was not accepted.';
export const gateRefusal = 'Sign in to reach this.';

/**
 * How many wrong passwords before the door stops answering, and for how long.
 *
 * Small numbers on purpose. There is one user and they know their own
 * password, so a handful of tries is the whole legitimate need — while an
 * attacker's whole method is volume. Six is generous for a typo and useless
 * for a guess.
 */
export const LOGIN_ATTEMPTS = 6;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

/**
 * A fixed-window counter of failed logins.
 *
 * **Not per-IP.** Every request arrives on loopback — the runner's, the
 * browser's, and a phone's through `tailscale serve`, which proxies into the
 * same 127.0.0.1 (the measurement that killed Wave 0's option C). So an
 * address here would be one bucket wearing a disguise, and per-IP would read
 * as a stronger claim than the code can keep. One counter, honestly named.
 *
 * The cost of that: a wrong guess from anywhere locks the door for everyone,
 * which for a one-user app on a private tailnet is the right trade — five
 * minutes of waiting versus an unbounded guessing rate.
 *
 * In memory, so a restart clears it. That is a real limit and is written down
 * rather than defended: an attacker who can restart the server has already won
 * by a shorter route.
 */
export interface LoginGate {
  failures: number;
  until: number;
}

export function newLoginGate(): LoginGate {
  return { failures: 0, until: 0 };
}

/** Seconds left on a lockout, or 0 when the door is open. */
export function lockoutRemaining(gate: LoginGate, now: number): number {
  return gate.until > now ? Math.ceil((gate.until - now) / 1000) : 0;
}

/** Records a wrong password, locking the door once the allowance is spent. */
export function noteLoginFailure(gate: LoginGate, now: number): void {
  gate.failures += 1;
  if (gate.failures >= LOGIN_ATTEMPTS) {
    gate.until = now + LOGIN_LOCKOUT_MS;
    gate.failures = 0;
  }
}

/** A correct password clears the count — a typo before it must not still cost. */
export function noteLoginSuccess(gate: LoginGate): void {
  gate.failures = 0;
  gate.until = 0;
}

/**
 * The whole login decision, so that the route is an adapter and nothing more.
 *
 * It lives here because `index.ts` cannot be imported by a test without
 * starting a listener — and a mutation pass proved that is not a theoretical
 * cost: deleting the lockout check from the route survived every test, because
 * no test could see the route. Logic in a testable module and a route that
 * only translates it is the answer; a source-text assertion was tried first
 * and was worse than useless, since the mutation left both identifiers in
 * place and it passed.
 */
export type LoginResult =
  | { ok: true; token: string | null }
  | { ok: false; status: 401 | 429; error: string };

export function attemptLogin(
  gate: LoginGate,
  supplied: unknown,
  now: number,
  env: NodeJS.ProcessEnv = process.env,
): LoginResult {
  const password = sessionPassword(env);
  // No gate, nothing to log in to — and no cookie either, so an unarmed
  // server never hands out a credential it would not later check.
  if (password === null) return { ok: true, token: null };
  // Before the password is even looked at, so a locked door costs a request
  // and tells an attacker nothing about the guess they just made.
  const waiting = lockoutRemaining(gate, now);
  if (waiting > 0) return { ok: false, status: 429, error: lockoutRefusal(waiting) };
  if (!passwordAccepted(supplied, env)) {
    noteLoginFailure(gate, now);
    return { ok: false, status: 401, error: loginRefusal };
  }
  noteLoginSuccess(gate);
  return { ok: true, token: mintToken(password, now) };
}

export const lockoutRefusal = (seconds: number): string =>
  `Too many wrong passwords. Try again in ${Math.ceil(seconds / 60)} minute${
    Math.ceil(seconds / 60) === 1 ? '' : 's'
  }.`;
