// The live proof for the publish line — an install that anybody can reach.
//
//   node scripts/prove-hosted.mjs --local
//
// `--local` is the half #28 owes, and it runs on this machine with no
// container anywhere: start the server on every interface with no password and
// watch it refuse; give it one and watch it listen with the gate on; then send
// it a POST from its own address and one from somebody else's. The other mode
// — this script with no flag, against the reference install — belongs to #24
// and is not written yet, which is why the flag is required rather than
// defaulted.
//
// Like `prove-install-paths.mjs`, it starts its OWN server rather than talking
// to a running one, and for the same reasons: the whole point is a different
// AGENTLINGS_BIND, a fresh AGENTLINGS_HOME has no levels so no armed schedule
// row can double-fire, and an empty secrets file means no door opens, no model
// is reachable and nothing costs money. It uses a port of its own and refuses
// to run if anything is answering there, so it can never be the thing that
// killed a live session.
//
// It binds 0.0.0.0 on purpose — that is the fact under test — so Windows may
// ask once about letting node accept connections. Answering no is fine:
// nothing below reaches the server from off this machine.
//
// The maintainer's own store is proven untouched by hashing `.env` and
// `.agentlings/server.log` before and after.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER = path.join(ROOT, 'server', 'scripts', 'dev-logged.mjs');

if (!process.argv.slice(2).includes('--local')) {
  console.error(
    'usage: node scripts/prove-hosted.mjs --local\n' +
      '(the hosted mode, against the reference install, is #24 and does not exist yet)',
  );
  process.exit(1);
}

// Not 4600: that is where the maintainer's install lives, and this must never
// be able to reach it, wake it, or be mistaken for it.
const PORT = 4611;
const BASE = `http://127.0.0.1:${PORT}`;
// A name that is not this machine and not the tailnet, so a request wearing it
// exercises the branch #28 added and nothing else. `.test` is reserved by
// RFC 6761 and resolves nowhere — we never look it up, we only say it.
const OWN_HOST = `horde.example.test:${PORT}`;
const PASSWORD = 'prove-hosted-throwaway';

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const hash = (file) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent';

const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
      .on('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .on('error', () => resolve(false));
  });

if (await listening(PORT)) {
  console.error(`something is already on ${PORT} — stop it first.`);
  process.exit(1);
}

// ── the maintainer's store, as it stands ────────────────────────────────────
const MINE = {
  env: path.join(ROOT, '.env'),
  log: path.join(ROOT, '.agentlings', 'server.log'),
};
const before = { env: hash(MINE.env), log: hash(MINE.log) };

// ── a home of its own, and an environment that carries nothing of this one ──
const HOME = mkdtempSync(path.join(os.tmpdir(), 'agentlings-hosted-'));
console.log(`AGENTLINGS_HOME=${HOME}\nAGENTLINGS_BIND=0.0.0.0  AGENTLINGS_PORT=${PORT}\n`);

/**
 * The child's environment. AGENTLINGS_PASSWORD is *deleted* rather than left
 * to chance: the maintainer keeps one in `.env`, and this process may have
 * been started by a shell that exported one. A refusal that only happened
 * because nobody happened to have set a variable would prove nothing.
 */
const childEnv = (password) => {
  const env = { ...process.env, AGENTLINGS_HOME: HOME, AGENTLINGS_BIND: '0.0.0.0' };
  delete env.PORT;
  env.AGENTLINGS_PORT = String(PORT);
  if (password === null) delete env.AGENTLINGS_PASSWORD;
  else env.AGENTLINGS_PASSWORD = password;
  return env;
};

/** Start the server and collect everything it said; resolve when it answers or dies. */
const start = async (password) => {
  let output = '';
  const child = spawn(process.execPath, [LAUNCHER, '--no-watch'], {
    env: childEnv(password),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => (output += c.toString()));
  child.stderr.on('data', (c) => (output += c.toString()));
  let exit = null;
  child.on('exit', (code) => (exit = code ?? 1));
  for (let i = 0; i < 120; i++) {
    if (exit !== null) return { child, exit, output: () => output };
    const res = await fetch(`${BASE}/api/session`).catch(() => null);
    if (res) return { child, exit: null, output: () => output, session: await res.json() };
    await sleep(500);
  }
  child.kill();
  return { child, exit: null, output: () => output, session: null };
};

/**
 * A POST that says where it came from.
 *
 * Written on `node:http` rather than `fetch` because the whole point is the
 * `Host` header, and `Host` is a forbidden header name in the Fetch standard —
 * undici silently replaces whatever is set with the address it dialled, which
 * made an earlier version of this script "prove" the refusal it was trying to
 * disprove. A browser sets `Host` the same way, honestly, which is exactly why
 * the origin check may trust it; here we have to be the browser by hand.
 */
const post = (pathname, body, { host, origin, cookie } = {}) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...(host === undefined ? {} : { host }),
          ...(origin === undefined ? {} : { origin }),
          ...(cookie === undefined ? {} : { cookie }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            setCookie: res.headers['set-cookie'] ?? null,
            json: () => {
              try {
                return JSON.parse(text);
              } catch {
                return {};
              }
            },
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });

let running = null;
try {
  // ── 1. refuse ─────────────────────────────────────────────────────────────
  // No password, every interface: the install must not exist.
  console.log('── on every interface, with no password ──');
  const refused = await start(null);
  check('the server exits instead of listening', refused.exit !== null && refused.exit !== 0, `exit=${refused.exit}`);
  check('nothing is answering on the port', !(await listening(PORT)));
  const said = refused.output();
  check('it names the variable that fixes it', said.includes('AGENTLINGS_PASSWORD'));
  check('it names the address it refused', said.includes('0.0.0.0'));
  check('it names the way back to loopback', said.includes('AGENTLINGS_BIND'));
  // One line, not a stack trace: this is all an operator watching a container
  // boot log will ever see.
  const reason = said.split('\n').filter((l) => l.includes('refusing to listen'));
  check('and says it once', reason.length === 1, JSON.stringify(reason[0]?.trim() ?? ''));

  // ── 2. accept ─────────────────────────────────────────────────────────────
  console.log('\n── the same bind, with a password ──');
  running = await start(PASSWORD);
  check('the server listens', running.exit === null && running.session !== null);
  check('and the gate is on', running.session?.required === true, JSON.stringify(running.session));
  check(
    'the boot line says both',
    /server on 0\.0\.0\.0:\d+ — gate on/.test(running.output()),
    JSON.stringify(
      running
        .output()
        .split('\n')
        .find((l) => l.includes('server on'))
        ?.trim() ?? '',
    ),
  );

  // The doors moved with the listener. The review of this ticket found they
  // had not: they were built from a `SERVER_PORT = 4600` constant, so on a
  // host injecting a port the server would have listened in one place and
  // every door dialled another. This is that, live — the runner's own way back
  // answering on the moved port, not on 4600.
  // The request is dialled at 4611 by address, so this says the door is
  // mounted where the listener was told to be — 4600's state is not part of
  // the claim, and asserting it was wrong: it made the proof fail whenever the
  // maintainer's own install happened to be up.
  const door = await post('/internal/fetch', {}, { host: `127.0.0.1:${PORT}` });
  check(
    `the runner doors are on ${PORT} too, where the listener was told to be`,
    door.status !== 404,
    `status=${door.status}`,
  );

  // ── 3. the install's own origin ───────────────────────────────────────────
  // A domain this repository never heard of, carried by the request itself.
  // Logging in is the POST used because it changes nothing that outlives this
  // process and it proves the gate is real in the same breath.
  console.log('\n── a POST from the install own address ──');
  const own = await post('/api/session', { password: PASSWORD }, {
    host: OWN_HOST,
    origin: `http://${OWN_HOST}`,
  });
  check('is not refused as cross-origin', own.status !== 403, `status=${own.status}`);
  check('and is accepted', own.status === 200);
  const cookie = own.setCookie?.[0]?.split(';')[0] ?? '';
  check('and hands back a session cookie', cookie.startsWith('agentlings_session='));

  // Loopback, on the same running server, still passes — the branch that was
  // there before this ticket has not been traded for the new one.
  const loopback = await post('/api/session', { password: PASSWORD }, {
    host: `127.0.0.1:${PORT}`,
    origin: `http://127.0.0.1:${PORT}`,
  });
  check('loopback still passes on the same server', loopback.status === 200, `status=${loopback.status}`);

  // ── 4. a foreign origin ───────────────────────────────────────────────────
  console.log('\n── a POST from somebody else ──');
  for (const [label, origin] of [
    ['another site entirely', 'https://evil.example'],
    // The trap: equality, never a suffix. This host merely *ends* in the
    // install's letters and is somebody else's domain.
    ['a host that ends in the same letters', 'https://evilhorde.example.test'],
    ['a host the install name is a prefix of', `https://horde.example.test.evil.example`],
  ]) {
    const res = await post('/api/session', { password: PASSWORD }, {
      host: OWN_HOST,
      origin,
    });
    const body = res.json();
    check(`${label} is refused`, res.status === 403, `status=${res.status}`);
    check(`  …with the cross-site sentence, not the password one`, String(body.error ?? '').includes('another site'));
    check(`  …and no cookie`, res.setCookie === null);
  }

  // ── 5. the redirect Google is given ───────────────────────────────────────
  // Not a network call: `begin` only builds the consent URL. What it proves is
  // that the route reached the request-derived redirect and not the constant
  // it replaced — the box #28 could otherwise only claim from a unit test.
  console.log('\n── the OAuth redirect follows the request ──');
  const started = await post(
    '/api/settings/connections/google/oauth/start',
    { clientId: 'prove.apps.googleusercontent.com', clientSecret: 'prove-secret' },
    { host: OWN_HOST, origin: `http://${OWN_HOST}`, cookie },
  );
  const consent = started.json();
  const redirect = consent.url ? new URL(consent.url).searchParams.get('redirect_uri') : null;
  check(
    'names the address the request arrived at',
    redirect === `https://${OWN_HOST}/api/oauth/google/callback`,
    JSON.stringify(redirect),
  );
  const localStart = await post(
    '/api/settings/connections/google/oauth/start',
    { clientId: 'prove.apps.googleusercontent.com', clientSecret: 'prove-secret' },
    { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, cookie },
  );
  const localConsent = localStart.json();
  const localRedirect = localConsent.url
    ? new URL(localConsent.url).searchParams.get('redirect_uri')
    : null;
  check(
    'and reproduces the old constant on loopback',
    localRedirect === `http://127.0.0.1:${PORT}/api/oauth/google/callback`,
    JSON.stringify(localRedirect),
  );
} finally {
  running?.child?.kill();
  await sleep(500);
  rmSync(HOME, { recursive: true, force: true });
}

// ── the maintainer's store, untouched ───────────────────────────────────────
console.log('\n── this machine own install ──');
check('.env is byte-identical', hash(MINE.env) === before.env);
// The log is only evidence while nobody else is writing it. Run this with the
// maintainer's own server up — which is the ordinary case once the app is
// being driven — and it grows on its own, so a byte comparison would report a
// FAIL that means nothing. Said out loud rather than quietly dropped: a check
// that cannot be made is not a check that passed.
if (await listening(4600)) {
  console.log("SKIP  server.log — the maintainer's own install is up and writing to it");
} else {
  check('server.log is byte-identical', hash(MINE.log) === before.log);
}
check('nothing is left on the proof port', !(await listening(PORT)));

console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
