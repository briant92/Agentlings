// The live proof Wave 0 (D-241) owes: W0.9, the three origins, and W0.10, a
// restarted server in both gate states.
//
//   node scripts/prove-wave0.mjs
//
// Run it TWICE, and both runs are the proof:
//
//   1. with AGENTLINGS_PASSWORD commented out in .env  -> the gate is off and
//      every probe below must answer exactly as it did before D-241;
//   2. with it set                                     -> the gate is on.
//
// The server must have been RESTARTED after the .env change either way, with
// the queue empty (R-07). It never prints the password.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// Proving the lockout necessarily LOCKS THE DOOR for five minutes, so it is
// opt-in rather than part of the routine run. A restart clears it.
const WANT_LOCKOUT = args.includes('--lockout');
const LEVEL = args.find((a) => !a.startsWith('--')) ?? 'training-ground';

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) failures += 1;
};

const password = (() => {
  const line = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m.exec(readFileSync(path.join(ROOT, '.env'), 'utf8'));
  return line?.[1].trim() || null;
})();

/** What the *server* thinks, which is what matters — .env can be ahead of a restart. */
const probe = await fetch(`${BASE}/api/session`).catch(() => null);
if (!probe) {
  console.error(`no server at ${BASE} — run "npm run serve" first`);
  process.exit(1);
}
if (probe.status === 404) {
  console.error('the running server predates D-241 (/api/session is unknown) — restart it first');
  process.exit(1);
}
const session = await probe.json();
const on = session.required;
console.log(`gate: ${on ? 'ON' : 'OFF'} (server)   .env has a password: ${password !== null}`);
if (on !== (password !== null)) {
  console.error('the running server disagrees with .env — restart it before reading anything below');
  process.exit(1);
}

/** Open /ws and report the close code and how many bytes it was handed. */
const socket = (cookie, origin) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:4600/ws?level=${LEVEL}`, {
      headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    });
    let bytes = 0;
    const done = (code) => resolve({ code, bytes });
    ws.on('message', (d) => {
      bytes += d.length;
      // Enough to know it was handed the level; do not sit on the feed.
      if (bytes > 0) setTimeout(() => ws.close(), 300);
    });
    ws.on('close', (code) => done(code));
    ws.on('error', () => done(-1));
    setTimeout(() => {
      ws.terminate();
      done(-2);
    }, 5000);
  });

// ── 1. reads, with no credential ────────────────────────────────────────────
const bare = await fetch(`${BASE}/api/levels`);
check(
  'GET /api/levels with no cookie',
  on ? bare.status === 401 : bare.ok,
  `${bare.status}${on ? ' (gated)' : ' (open)'}`,
);

// ── 2. the doors stay reachable either way (W0.5) ───────────────────────────
const door = await fetch(`${BASE}/internal/fetch`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({}),
});
check('POST /internal/fetch with no cookie is never 401', door.status !== 401, `${door.status}`);

// ── 3. the OAuth callback stays exempt (R-06) ───────────────────────────────
const cb = await fetch(`${BASE}/api/oauth/google/callback`, { redirect: 'manual' });
check('GET /api/oauth/google/callback is never 401', cb.status !== 401, `${cb.status}`);

// ── 4. the socket, no cookie ────────────────────────────────────────────────
const cold = await socket(null, 'http://localhost:5173');
check(
  on ? 'ungated /ws handshake closed 4401 with ZERO bytes' : '/ws opens as before',
  on ? cold.code === 4401 && cold.bytes === 0 : cold.bytes > 0,
  `code ${cold.code}, ${cold.bytes} bytes`,
);

// ── 5. a hostile origin is still refused (D-239 unbroken) ───────────────────
const hostile = await socket(null, 'https://evil.example');
check('hostile-origin /ws still closed 4403 with ZERO bytes', hostile.code === 4403 && hostile.bytes === 0, `code ${hostile.code}, ${hostile.bytes} bytes`);

if (!on) {
  console.log('\ngate is off — set AGENTLINGS_PASSWORD, restart, and run this again for the other half');
  process.exit(failures === 0 ? 0 : 1);
}

// ── 6. logging in ───────────────────────────────────────────────────────────
const wrong = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: `${password}x` }),
});
check('a wrong password is refused 401', wrong.status === 401, `${wrong.status}`);

const good = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
});
const setCookie = good.headers.get('set-cookie') ?? '';
const cookie = setCookie.split(';')[0];
check('the right password is accepted 200', good.status === 200, `${good.status}`);
check('the cookie is HttpOnly', /HttpOnly/i.test(setCookie));
check('the cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie));
// W0.9/R-04: this probe speaks plain http, so Secure MUST be absent or the
// browser would drop the cookie on the two http origins.
check('the cookie carries no Secure over plain http (R-04)', !/;\s*Secure/i.test(setCookie));

// ── 7. everything opens with it ─────────────────────────────────────────────
const warm = await fetch(`${BASE}/api/levels`, { headers: { cookie } });
check('GET /api/levels with the cookie', warm.ok, `${warm.status}`);

const live = await socket(cookie, 'http://localhost:5173');
check('/ws with the cookie is handed the level', live.bytes > 0, `${live.bytes} bytes`);

// The pair that is the whole point, as one number.
check(
  'signed out sees 0 bytes where signed in sees the level',
  cold.bytes === 0 && live.bytes > 0,
  `${cold.bytes} vs ${live.bytes}`,
);

// ── 8. a tailnet origin still works (W0.9, third origin) ────────────────────
const tailnet = await fetch(`${BASE}/api/levels`, {
  headers: { cookie, origin: 'https://desktop.tail1234.ts.net' },
});
check('a .ts.net origin is served', tailnet.ok, `${tailnet.status}`);
const tailnetSocket = await socket(cookie, 'https://desktop.tail1234.ts.net');
check('a .ts.net /ws handshake is served', tailnetSocket.bytes > 0, `${tailnetSocket.bytes} bytes`);

// ── 9. logging out ──────────────────────────────────────────────────────────
const out = await fetch(`${BASE}/api/session`, { method: 'DELETE', headers: { cookie } });
check('DELETE /api/session clears the cookie', /Max-Age=0/i.test(out.headers.get('set-cookie') ?? ''));

// ── 10. the lockout, last and opt-in, because proving it locks the door ─────
if (WANT_LOCKOUT) {
  const tries = [];
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: `wrong-${i}` }),
    });
    tries.push(r.status);
    if (r.status === 429) break;
  }
  check('repeated wrong passwords stop being answered 401', tries.includes(429), tries.join(','));
  // The right password must ALSO be refused while locked, or the lockout is
  // theatre: an attacker who guesses correctly on try seven still gets in.
  const locked = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  check('and the RIGHT password is refused too while locked', locked.status === 429, `${locked.status}`);
  console.log('\nNOTE: the door is now locked for 5 minutes. Restart the server to clear it.');
}

console.log(failures === 0 ? '\nPROVEN' : `\nNOT PROVEN — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
