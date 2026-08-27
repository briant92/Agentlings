// The live proof for the publish line — an install that anybody can reach.
//
//   node scripts/prove-hosted.mjs --local
//   node scripts/prove-hosted.mjs --hosted [--paid]
//
// Two modes, because there are two claims. `--local` is the half #28 and #29
// owe, and it runs on this machine with no container anywhere: start the
// server on every interface with no password and watch it refuse; give it one
// and watch it listen with the gate on; then send it a POST from its own
// address and one from somebody else's. `--hosted` is #30's, and it runs
// against the reference install #24 built — over the public internet, through
// a real Railway redeploy and a real process restart. Neither is defaulted to,
// because they do very different things to very different machines.
//
// Everything below the `--local` sections belongs to `--hosted`; its own
// header is down there with it.
//
// Since #29 it also proves the *one origin*: with `web/dist` built and no Vite
// running anywhere, the title screen, the sign-in, the API and the WebSocket
// all answer on that single port — which is a container's situation exactly.
// Run `npm run build` first; the last section says so rather than skipping if
// the bundle is not there.
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

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER = path.join(ROOT, 'server', 'scripts', 'dev-logged.mjs');

const MODE = process.argv.includes('--hosted')
  ? 'hosted'
  : process.argv.includes('--local')
    ? 'local'
    : null;
if (!MODE) {
  console.error(
    'usage: node scripts/prove-hosted.mjs --local\n' +
      '       node scripts/prove-hosted.mjs --hosted [--paid] [--service NAME]\n' +
      '\n' +
      '--local  the policy on this machine, with no container anywhere (#28, #29)\n' +
      '--hosted the reference install over the public internet (#30) — a real\n' +
      '         redeploy and a real restart; --paid also runs one small job\n' +
      '         for a few cents and takes the key back out afterwards',
  );
  process.exit(1);
}

/** The value after a flag, or undefined — `--service Agentlings`. */
const argFor = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

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

if (MODE === 'local' && (await listening(PORT))) {
  console.error(`something is already on ${PORT} — stop it first.`);
  process.exit(1);
}

// ── the maintainer's store, as it stands ────────────────────────────────────
const MINE = {
  env: path.join(ROOT, '.env'),
  log: path.join(ROOT, '.agentlings', 'server.log'),
};
const before = { env: hash(MINE.env), log: hash(MINE.log) };

/** Every deploy Railway has to finish before the install answers again. */
const DEPLOY_TIMEOUT_MS = 6 * 60_000;
/** How long one small paid job may take before this gives up on it. */
const JOB_TIMEOUT_MS = 8 * 60_000;
/** How far ahead the proof schedule is armed — over one sweep, under a wait. */
const ARM_AHEAD_MS = 150_000;

// The hosted mode talks to a machine that is not this one and starts no server
// here, so it forks off before any of the local scaffolding below — the temp
// home, the child process, the port. Its own section is at the foot of the
// file, and its three timings are up here rather than beside it because a
// `const` does not hoist: declared down there, the first live run died on a
// temporal-dead-zone error after setting a real key on a public install.
if (MODE === 'hosted') {
  try {
    await hostedMode();
  } catch (err) {
    // A thrown error here is the proof failing, not the script misbehaving:
    // the install did not answer, the CLI is not linked, a deploy never came
    // back. Said as a failure and counted, so the exit code is honest.
    check('the hosted run completed', false, err instanceof Error ? err.message : String(err));
  }
  console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
}

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

/**
 * A GET whose path is sent exactly as written.
 *
 * `fetch` normalises a URL before it dials — `/%2e%2e/.env` leaves as `/.env`
 * — so a traversal asked for through it is not the traversal that was asked
 * about. Same lesson as the `Host` header above, and the reason this file owns
 * two little clients rather than one convenient one.
 */
const rawRequest = (method, pathname, cookie) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: pathname,
        method,
        headers: cookie === undefined ? {} : { cookie },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on('error', reject);
    req.end();
  });

const rawGet = (pathname, cookie) => rawRequest('GET', pathname, cookie);

/**
 * Open `/ws` on the same port the screen came from and report what happened.
 *
 * A browser puts the cookie on the handshake by itself and cannot be made to
 * put anything else there; here it is by hand, which is the only difference.
 */
const socket = (levelId, cookie) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?level=${encodeURIComponent(levelId)}`, {
      headers: {
        origin: `http://127.0.0.1:${PORT}`,
        ...(cookie ? { cookie } : {}),
      },
    });
    let bytes = 0;
    ws.on('message', (d) => {
      bytes += d.length;
      // Enough to know it was handed the level; do not sit on the feed.
      setTimeout(() => ws.close(), 300);
    });
    ws.on('close', (code) => resolve({ code, bytes }));
    ws.on('error', () => resolve({ code: -1, bytes }));
    setTimeout(() => {
      ws.terminate();
      resolve({ code: -2, bytes });
    }, 5000);
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

  // ── 6. one origin ─────────────────────────────────────────────────────────
  // #29: the whole app on the API port — no Vite anywhere in this run, which
  // is the container's situation exactly. The bundle is the repository's own
  // `web/dist`, not the temp home's: it is product, rebuilt with the code.
  console.log('\n── one origin: the app on the API port, no Vite ──');
  if (!existsSync(path.join(ROOT, 'web', 'dist', 'index.html'))) {
    check('the web bundle is built', false, 'run "npm run build" first — nothing to serve');
  } else {
    // No cookie, and the gate is on. This is the acceptance criterion in one
    // request: what an unauthenticated browser gets is the screen it signs in
    // on, not a refusal it cannot act on.
    const root = await fetch(`${BASE}/`);
    const html = await root.text();
    check('the root serves the title screen with no cookie', root.status === 200, `status=${root.status}`);
    check(
      '  …as HTML, no-cache so a redeploy is not shadowed by yesterday shell',
      (root.headers.get('content-type') ?? '').startsWith('text/html') &&
        root.headers.get('cache-control') === 'no-cache',
      `${root.headers.get('content-type')} / ${root.headers.get('cache-control')}`,
    );
    check('  …and it is the app shell', html.includes('<div id="root">'));

    // The gate did not move: the shell is product, the world is the operator's.
    const world = await fetch(`${BASE}/api/levels`);
    check('the world on the same origin still needs a session', world.status === 401, `status=${world.status}`);

    // The asset the shell names, on that same port. A one-origin claim that
    // stopped at the HTML would be a white screen in a browser.
    const asset = /src="([^"]+\.js)"/.exec(html)?.[1] ?? '';
    const script = await fetch(`${BASE}${asset}`);
    check(
      `the script it names loads from the same port  — ${asset}`,
      script.status === 200 && (script.headers.get('content-type') ?? '').includes('javascript'),
      `status=${script.status} ${script.headers.get('content-type')}`,
    );
    check(
      '  …and is cached forever, because its name is its content',
      script.headers.get('cache-control') === 'public, max-age=31536000, immutable',
      String(script.headers.get('cache-control')),
    );
    // Byte for byte against the file on disk. A 200 with the right type would
    // pass on a truncated or over-long body just as happily — and a `Buffer`
    // handed to a writer that reads its backing `ArrayBuffer` instead of its
    // own window is exactly how a pooled read sends the wrong bytes.
    const sent = createHash('sha256')
      .update(Buffer.from(await script.arrayBuffer()))
      .digest('hex');
    const onDisk = hash(path.join(ROOT, 'web', 'dist', ...asset.slice(1).split('/')));
    check('  …and arrives byte for byte as it is on disk', sent === onDisk, `${sent.slice(0, 12)} vs ${onDisk.slice(0, 12)}`);

    // The half that makes `no-cache` mean revalidate rather than re-download.
    const stale = await fetch(`${BASE}/`, { headers: { 'if-none-match': root.headers.get('etag') } });
    check(
      '  …and a second visit revalidates to 304 instead of re-sending the shell',
      stale.status === 304 && (await stale.text()) === '',
      `status=${stale.status}`,
    );

    // A host's health check is often HEAD, and a 404 there reads as an install
    // that is down.
    const head = await rawRequest('HEAD', '/');
    check(
      'HEAD on the root answers like GET, with no body',
      head.status === 200 && head.text === '',
      `status=${head.status} bytes=${head.text.length}`,
    );

    const deep = await fetch(`${BASE}/level/whatever`);
    check(
      'a deep link the client owns falls through to the shell',
      deep.status === 200 && (await deep.text()).includes('<div id="root">'),
      `status=${deep.status}`,
    );

    // Sign in on this origin, then take the cookie onto the socket. The
    // browser does this by itself; here it is by hand, and it is the point of
    // the slice — one address for the screen, the API and the feed.
    const signIn = await post('/api/session', { password: PASSWORD }, {
      host: `127.0.0.1:${PORT}`,
      origin: `http://127.0.0.1:${PORT}`,
    });
    const oneOriginCookie = signIn.setCookie?.[0]?.split(';')[0] ?? '';
    check('signing in on that origin hands back a cookie', oneOriginCookie.startsWith('agentlings_session='));

    // `..%2f` and not `%2e%2e` or a plain `..`, and the difference is the whole
    // reason this check is worth anything. The server reads
    // `new URL(req.url).pathname`, and the WHATWG parser removes dot segments
    // *before* the bundle sees them: `/%2e%2e/.env` arrives as `/.env`, which
    // is refused for being a dotfile and proves nothing about traversal. `%2f`
    // survives the parse, so this spelling reaches the module as a live `..`.
    // The review of this ticket caught the earlier version asserting the first
    // and calling it the second — the third time in two slices that the
    // instrument was measuring something other than the claim.
    //
    // Sent raw rather than through `fetch`, which normalises it away too, and
    // sent *signed in*: without the cookie the gate answers 401 to anything the
    // bundle declined, so the check would pass whether the traversal was
    // refused or served, and the pass would be the gate's rather than this
    // slice's. With the cookie the only thing left to refuse it is the bundle.
    const escape = await rawGet('/..%2f.env', oneOriginCookie);
    check(
      'a traversal that survives URL parsing gets nothing, gate or no gate',
      escape.status === 404 && !escape.text.includes('AGENTLINGS_PASSWORD'),
      `status=${escape.status}`,
    );
    const backslash = await rawGet('/%5c..%5c.env', oneOriginCookie);
    check(
      '  …and so does the backslash spelling, which also survives it',
      backslash.status === 404 && !backslash.text.includes('AGENTLINGS_PASSWORD'),
      `status=${backslash.status}`,
    );

    const made = await post(
      '/api/levels',
      { name: 'one origin', project: 'Proof', theme: 'cave' },
      { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, cookie: oneOriginCookie },
    );
    const levelId = made.json().id ?? '';
    check('a level to watch exists', made.status === 201 && levelId !== '', `status=${made.status}`);

    const watched = await socket(levelId, oneOriginCookie);
    check(
      'the WebSocket opens on the same port and is handed the world',
      watched.bytes > 0,
      `close=${watched.code} bytes=${watched.bytes}`,
    );
    const bare = await socket(levelId, null);
    check(
      'and without the cookie it is closed as unauthenticated',
      bare.code === 4401 && bare.bytes === 0,
      `close=${bare.code} bytes=${bare.bytes}`,
    );
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// The hosted mode (#30) — the reference install, over the public internet.
// ═══════════════════════════════════════════════════════════════════════════
//
// `--local` above proves the policy on this machine. This proves the same app
// is an *install* when somebody else deploys it: that what they paste survives
// the redeploy their host performs on every push, that a run's money is on the
// volume and not in the container, that the desk says what this install cannot
// do, and that the scheduler — the one thing a host restarts constantly —
// fires each row once and not once per boot.
//
// Everything here is measured against the running install. The redeploy is a
// real Railway redeploy and appears in the deploy history; the restart is a
// real process restart. Nothing below asserts on a hash of the source or on a
// figure in a note: the whole ticket exists because #24's own premise about
// supervised acting turned out to be false when it was finally run.
//
// ── what it costs ──
// Free by default. `--paid` additionally lifts ANTHROPIC_API_KEY out of this
// machine's `.env`, sets it as a service variable, runs ONE small web-fetch
// summary, and removes the variable again — a few cents, and the flag exists
// so that never happens because somebody ran the script.
//
// ── why the model key is a variable and the door key is a paste ──
// The Settings drawer can only paste a *connection*'s secret; there is no
// field anywhere for the model key, and the drawer says so in words ("copy
// .env.example → .env"). So on a hosted install the model key can only be a
// host variable — which then beats `/data/.env` for good (D-270). That is the
// gap #31's README has to carry, and it is why check 1 is proven with a door
// key: a paste is the thing being tested, and only a door can be pasted.
//
// The pasted value is a well-formed throwaway and is never used to call
// anything. What is under test is that the bytes survive the redeploy, and
// they are checked by hashing that one line INSIDE the container — the value
// never crosses back over the network.
//
// ── running it ──
//   node scripts/prove-hosted.mjs --hosted            (checks 1, 3, 4)
//   node scripts/prove-hosted.mjs --hosted --paid     (all four)
//
// It needs the Railway CLI logged in and the project linked. It reads the
// install's address and password from the service's own variables, so nothing
// is typed and no password appears in the output.
//
// It leaves the install as it found it: keyless, with no proof level, no
// schedule row and no secret.

/**
 * The Railway CLI as a program, not as a shell line.
 *
 * npm installs it on Windows as a `.cmd` shim, and Node will only run one of
 * those through `cmd.exe` — which then splits our arguments on its own rules
 * and mangles the one that matters, the little script that hashes a line of
 * the store inside the container. Resolving the real executable means every
 * call below is an argv, with nothing between us and it.
 */
function railwayBin() {
  if (process.env.RAILWAY_CLI) return process.env.RAILWAY_CLI;
  if (process.platform !== 'win32') return 'railway';
  const found = execFileSync('where.exe', ['railway'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const exe = found.find((f) => f.toLowerCase().endsWith('.exe'));
  if (exe) return exe;
  for (const shim of found) {
    const beside = path.join(
      path.dirname(shim),
      'node_modules',
      '@railway',
      'cli',
      'bin',
      'railway.exe',
    );
    if (existsSync(beside)) return beside;
  }
  throw new Error('the Railway CLI is not on PATH — install it and `railway link` this project');
}

async function hostedMode() {
  const service = argFor('--service') ?? 'Agentlings';
  const paid = process.argv.includes('--paid');
  const BIN = railwayBin();

  /** One CLI call. Output is returned, never printed — variables come back through here. */
  const railway = (args) =>
    new Promise((resolve) => {
      const child = spawn(BIN, args);
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
      child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    });

  const railwayJson = async (args) => {
    const r = await railway([...args, '--json']);
    if (r.code !== 0) throw new Error(`railway ${args.join(' ')} failed: ${r.err.trim()}`);
    return JSON.parse(r.out);
  };

  /**
   * Runs a little program in the container and returns what it printed.
   *
   * Deliberately backslash-free at the call sites: the command crosses a shell
   * on the way in, which eats them — a `/\r?\n/` written here arrives as a
   * literal newline and the remote parse fails on an unterminated regexp. The
   * first version of this did exactly that.
   */
  const inContainer = async (source, ...args) => {
    const r = await railway(['ssh', '--service', service, 'node', '-e', source, ...args]);
    if (r.code !== 0) throw new Error(`ssh failed: ${r.err.trim().split('\n').pop()}`);
    return r.out.trim();
  };

  // ── who and where ─────────────────────────────────────────────────────────
  const vars = await railwayJson(['variables', '--service', service]);
  const domain = vars.RAILWAY_PUBLIC_DOMAIN;
  const password = vars.AGENTLINGS_PASSWORD;
  if (!domain) throw new Error(`${service} has no public domain`);
  if (!password) throw new Error(`${service} has no AGENTLINGS_PASSWORD — D-271 says it cannot listen`);
  const BASE_URL = `https://${domain}`;

  console.log(`install   ${BASE_URL}`);
  console.log(`service   ${service}`);
  console.log(`paid job  ${paid ? 'yes — one web-fetch summary' : 'no (pass --paid)'}\n`);

  /** The session cookie for the whole run; the password appears nowhere else. */
  let cookie = '';
  const signIn = async () => {
    const res = await fetch(`${BASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(`the install refused the password (${res.status})`);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  };

  const get = async (p) => {
    const res = await fetch(`${BASE_URL}${p}`, { headers: cookie ? { cookie } : {} });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const send = async (method, p, body) => {
    const res = await fetch(`${BASE_URL}${p}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const post = (p, body) => send('POST', p, body);
  const del = (p) => send('DELETE', p);

  const latestDeploy = async () => (await railwayJson(['deployment', 'list', '--service', service]))[0];

  /**
   * Waits out a redeploy or a restart, and proves it happened rather than
   * assuming it: a new deployment id must reach SUCCESS, and the install must
   * then answer again. Polling the URL alone would pass instantly against the
   * process that is still up.
   */
  const waitForNewDeploy = async (was, label) => {
    const until = Date.now() + DEPLOY_TIMEOUT_MS;
    let now = was;
    while (Date.now() < until) {
      await sleep(5000);
      now = await latestDeploy();
      if (now && now.id !== was.id && now.status === 'SUCCESS') break;
      if (now && now.id !== was.id && ['FAILED', 'CRASHED'].includes(now.status)) {
        throw new Error(`${label} ended ${now.status}`);
      }
    }
    if (!now || now.id === was.id) throw new Error(`${label} produced no new deployment`);
    while (Date.now() < until) {
      const res = await fetch(`${BASE_URL}/api/session`).catch(() => null);
      if (res?.ok) {
        await signIn();
        return now;
      }
      await sleep(3000);
    }
    throw new Error(`${label} never came back on ${BASE_URL}`);
  };

  /**
   * A restart makes no new deployment row, so it is watched the other way
   * round: the install has to go away and come back. Proven by the process's
   * own boot, not by a clock — the boot sweep is the thing under test.
   */
  const waitForRestart = async () => {
    const until = Date.now() + DEPLOY_TIMEOUT_MS;
    let wentAway = false;
    while (Date.now() < until) {
      const res = await fetch(`${BASE_URL}/api/session`).catch(() => null);
      if (!res?.ok) wentAway = true;
      else if (wentAway) {
        await signIn();
        return true;
      }
      await sleep(2000);
    }
    return false;
  };

  await signIn();
  const startedOn = await latestDeploy();
  console.log(`on deploy ${startedOn.id}  (${startedOn.status})\n`);

  // The whole run happens in a level of its own, torn down at the end: the
  // reference install must be left as it was found.
  const made = await post('/api/levels', {
    name: 'hosted proof',
    project: 'Proof',
    theme: 'cave',
  });
  const LEVEL = made.body.id;
  if (made.status !== 201 || !LEVEL) {
    throw new Error(`could not make a level to work in: ${made.status} ${JSON.stringify(made.body)}`);
  }

  /** Everything created on the install, undone in reverse however this ends. */
  const cleanup = [async () => del(`/api/levels/${LEVEL}`)];

  try {
    // ── 3. what this install cannot do, said where the work is queued ───────
    // First because it is free, needs no state, and is the half of the ticket
    // that turned out to need code rather than a script.
    console.log('── the doors this install cannot offer ──');
    const conns = (await get('/api/connections')).body;
    const act = (Array.isArray(conns) ? conns : []).find((c) => c.name === 'browser-act');
    check('supervised acting is listed at all — refused, not absent', !!act, act ? '' : 'missing');
    check(
      '  …and carries the reason this install cannot offer it',
      typeof act?.unavailable === 'string' && act.unavailable.length > 0,
      JSON.stringify(act?.unavailable ?? null),
    );
    check(
      '  …which is about the machine, not a missing key',
      act?.ready === true && act?.missingSecrets?.length === 0,
      `ready=${act?.ready} missingSecrets=${JSON.stringify(act?.missingSecrets)}`,
    );
    // The doors that DO work here are untouched by any of this: a blanket
    // "hosted means less" would be the easy wrong version of this change.
    const web = (Array.isArray(conns) ? conns : []).find((c) => c.name === 'web');
    check('an ordinary door says nothing of the kind', web?.unavailable === undefined);

    const organize = await post(`/api/levels/${LEVEL}/work/plan`, {
      text: 'organize my downloads folder into subfolders by kind',
    });
    check(
      'an organize sentence is still read as one',
      organize.body.organize === true,
      `organize=${organize.body.organize}`,
    );
    check(
      '  …and the desk says the folder cannot be picked here, before Start',
      typeof organize.body.organizeRefused === 'string',
      JSON.stringify(organize.body.organizeRefused ?? null),
    );

    // The half only a browser can show: that the route's fact is actually on
    // the bar. The D-177/D-178 gap, and the shape #16, #17 and #29 were each
    // caught by — most recently `prove-standing-ui` asserting on an empty
    // string for four tickets.
    await workBarSaysIt(BASE_URL, password, LEVEL, check);

    // ── 1 & 2. a paste and a run, read back across one redeploy ─────────────
    console.log('\n── a key pasted into Settings, and what a run costs ──');

    if (paid) {
      const key = /^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m.exec(
        existsSync(MINE.env) ? readFileSync(MINE.env, 'utf8') : '',
      )?.[1]?.trim();
      if (!key) throw new Error('--paid needs ANTHROPIC_API_KEY in this machine\'s .env');
      // A host variable, because there is nowhere in the app to paste one.
      // Removed again at the end — the install is a reference install and
      // holds no real key when nobody is watching it.
      //
      // DELETED, never set empty. The first run of this blanked it instead,
      // and an empty host variable is still a name `process.env` holds — so by
      // D-270 it would have shadowed anything ever pasted into `/data/.env`
      // under that name, permanently and silently. The rule this whole slice
      // is about, caught in its own cleanup.
      cleanup.push(async () => {
        await railway(['variable', 'delete', 'ANTHROPIC_API_KEY', '--service', service]);
      });
      const was = await latestDeploy();
      const set = await railway(['variables', '--service', service, '--set', `ANTHROPIC_API_KEY=${key}`]);
      if (set.code !== 0) throw new Error(`could not set the model key: ${set.err.trim()}`);
      console.log('      model key set as a service variable — waiting out the redeploy it triggers');
      await waitForNewDeploy(was, 'the model-key redeploy');
      const settings = (await get('/api/settings')).body;
      // The finding this sequence exists for: the executor is decided ONCE, at
      // boot. A key that arrives after boot reaches `process.env` and changes
      // nothing until the process comes back.
      check(
        'the executor is real only after the restart the key forced',
        settings.executor === 'claude-agent-sdk',
        `executor=${settings.executor} auth=${settings.auth?.source}`,
      );
    }

    // A well-formed value that is not a key. Persistence is the claim; the far
    // end is never called, and never should be with a made-up value.
    const FAKE = `prove-hosted-not-a-real-key-${randomUUID().replace(/-/g, '')}`;
    const pasted = await post('/api/settings/connections/search/secret', {
      secret: 'BRAVE_API_KEY',
      value: FAKE,
    });
    cleanup.push(async () => del('/api/settings/connections/search/secrets'));
    check('the drawer accepts a pasted door key', pasted.status === 200, `status=${pasted.status}`);

    const HASH_LINE = [
      "const fs=require('node:fs'),h=require('node:crypto');",
      "const f='/data/.env';",
      "const want=process.argv[1]+'=';",
      "const raw=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';",
      "const l=raw.split(String.fromCharCode(10)).map(x=>x.trim()).find(x=>x.startsWith(want))||'';",
      "console.log(l?h.createHash('sha256').update(l).digest('hex'):'absent');",
    ].join('');
    const expected = createHash('sha256').update(`BRAVE_API_KEY=${FAKE}`).digest('hex');
    const onVolume = await inContainer(HASH_LINE, 'BRAVE_API_KEY');
    check(
      'it lands on the volume, byte for byte, as the value that was sent',
      onVolume === expected,
      `${onVolume.slice(0, 12)} vs ${expected.slice(0, 12)}`,
    );
    const readyBefore = (await get('/api/connections')).body.find((c) => c.name === 'search');
    check('and the door reads as ready', readyBefore?.ready === true);

    let spentBefore = null;
    let paidJob = null;
    if (paid) {
      console.log('      queueing one web-fetch summary…');
      const queued = await post(`/api/levels/${LEVEL}/work`, {
        text: 'Read https://example.com and write RESULT.md with one sentence saying what that page is for.',
        tools: ['web'],
      });
      check('the paid job is queued', queued.status === 201, `status=${queued.status}`);
      paidJob = queued.body?.id ?? queued.body?.job?.id ?? null;
      const until = Date.now() + JOB_TIMEOUT_MS;
      let finished = null;
      while (Date.now() < until) {
        await sleep(5000);
        const state = (await get(`/api/levels/${LEVEL}/state`)).body;
        const job = (state.jobs ?? []).find((j) => j.id === paidJob);
        if (job && !['queued', 'running'].includes(job.status)) {
          finished = job;
          break;
        }
      }
      check(
        'it runs to an ending rather than sitting in the queue',
        !!finished,
        finished ? `status=${finished.status}` : `still ${JOB_TIMEOUT_MS / 1000}s later`,
      );
      spentBefore = (await get('/api/spend')).body;
      check(
        'and it cost real money — a simulated run costs nothing',
        (spentBefore?.overall?.costUsd ?? 0) > 0,
        JSON.stringify(spentBefore?.overall ?? null),
      );
    }

    // The redeploy both checks read across. A real one: it is in the deploy
    // history, and the container it produces has never seen either fact.
    console.log('      redeploying…');
    const beforeRedeploy = await latestDeploy();
    const redeploy = await railway(['redeploy', '--service', service, '--yes']);
    if (redeploy.code !== 0) throw new Error(`redeploy failed: ${redeploy.err.trim()}`);
    const nowOn = await waitForNewDeploy(beforeRedeploy, 'the redeploy');
    console.log(`      back on ${nowOn.id}`);

    const readyAfter = (await get('/api/connections')).body.find((c) => c.name === 'search');
    check('the pasted key is still there after the redeploy', readyAfter?.ready === true);
    const afterVolume = await inContainer(HASH_LINE, 'BRAVE_API_KEY');
    check(
      '  …and the same bytes, not merely a name that is set',
      afterVolume === expected,
      `${afterVolume.slice(0, 12)} vs ${expected.slice(0, 12)}`,
    );

    if (paid) {
      const spentAfter = (await get('/api/spend')).body;
      check(
        "the paid run's ledger row is read back from the volume AFTER the redeploy",
        (spentAfter?.overall?.costUsd ?? 0) > 0 &&
          spentAfter.overall.costUsd === spentBefore.overall.costUsd,
        `${JSON.stringify(spentAfter?.overall ?? null)}`,
      );
      // The money removed again before anything else runs on this install.
      const wasPaid = await latestDeploy();
      await railway(['variable', 'delete', 'ANTHROPIC_API_KEY', '--service', service]);
      console.log('      model key removed — waiting out that redeploy');
      await waitForNewDeploy(wasPaid, 'the key-removal redeploy');
      const back = (await get('/api/settings')).body;
      check('and the install is back to simulated before anything else runs', back.executor === 'simulated');
    }

    // ── 4. one firing, and a restart that does not repeat it ────────────────
    console.log('\n── a schedule fires once, and a restart does not fire it again ──');

    // The row is armed in the SERVER's local time, which is the container's,
    // not this machine's. Asked of the install rather than assumed: a probe
    // row's own `nextDueAt` says what it made of an hour and a minute, and the
    // difference from ours is the offset. A guessed UTC would have worked here
    // and broken on the first install in a different zone.
    const probeAt = new Date(Date.now() + 3600_000);
    const probeRow = await post(`/api/levels/${LEVEL}/schedules`, {
      text: 'a probe that is deleted before it can fire',
      cadence: { kind: 'daily', hour: probeAt.getUTCHours(), minute: probeAt.getUTCMinutes() },
    });
    const probeDue = probeRow.body?.schedule?.nextDueAt ?? probeRow.body?.nextDueAt;
    await del(`/api/levels/${LEVEL}/schedules/${probeRow.body?.schedule?.id ?? probeRow.body?.id}`);
    check('the install says when it would fire a row', typeof probeDue === 'number', String(probeDue));
    // `probeAt`'s wall-clock reading, asked for as if it were UTC. The install
    // read the same two numbers in ITS zone, so the gap between the two
    // instants is the zone gap — folded into ±12h because a zone far enough
    // ahead pushes the probe's occurrence into tomorrow and adds a day to it.
    const asUtc = Date.UTC(
      probeAt.getUTCFullYear(),
      probeAt.getUTCMonth(),
      probeAt.getUTCDate(),
      probeAt.getUTCHours(),
      probeAt.getUTCMinutes(),
      0,
      0,
    );
    const DAY = 86_400_000;
    let offsetMs = Math.round((probeDue - asUtc) / 60_000) * 60_000;
    while (offsetMs > DAY / 2) offsetMs -= DAY;
    while (offsetMs <= -DAY / 2) offsetMs += DAY;
    console.log(`      the install's clock runs ${-offsetMs / 3_600_000}h from UTC`);
    // MINUS: the install reads its own clock, so to land at the instant we
    // want, the row must name that instant's reading THERE. Plus was the first
    // version and it would have passed anyway on this container, which runs
    // UTC — which is why the arming is checked below rather than trusted.
    const armAt = new Date(Date.now() + ARM_AHEAD_MS - offsetMs);
    const armed = await post(`/api/levels/${LEVEL}/schedules`, {
      text: 'say hello, and nothing else',
      cadence: { kind: 'daily', hour: armAt.getUTCHours(), minute: armAt.getUTCMinutes() },
      // Holds no door: a firing that reached out would be a second variable.
      tools: [],
    });
    const rowId = armed.body?.schedule?.id ?? armed.body?.id;
    check('a row is armed', armed.status === 201 && !!rowId, `status=${armed.status}`);
    cleanup.push(async () => del(`/api/levels/${LEVEL}/schedules/${rowId}`));
    // The arming asserted rather than assumed: the row has to be due within
    // the next couple of minutes, or the wait below would time out and the
    // failure would read as "the scheduler is broken" instead of "the proof
    // pointed it at the wrong minute".
    const dueIn = (armed.body?.nextDueAt ?? 0) - Date.now();
    check(
      '  …for a moment that is actually a couple of minutes away',
      dueIn > 30_000 && dueIn < ARM_AHEAD_MS + 90_000,
      `due in ${Math.round(dueIn / 1000)}s`,
    );

    const rowNow = async () =>
      ((await get(`/api/levels/${LEVEL}/schedules`)).body.schedules ?? []).find((s) => s.id === rowId);
    const firedJobs = async () =>
      ((await get(`/api/levels/${LEVEL}/state`)).body.jobs ?? []).filter((j) =>
        String(j.note ?? '').includes('queued by its schedule'),
      );

    const due = (await rowNow())?.nextDueAt;
    console.log(
      `      due in ${Math.round((due - Date.now()) / 1000)}s by this machine's clock — waiting`,
    );
    const untilFired = Date.now() + ARM_AHEAD_MS + 120_000;
    let fired = null;
    while (Date.now() < untilFired) {
      await sleep(10_000);
      const row = await rowNow();
      if (row?.lastFiredAt) {
        fired = row;
        break;
      }
    }
    check('it fires', !!fired, fired ? new Date(fired.lastFiredAt).toISOString() : 'never fired');
    const jobsAfterFiring = await firedJobs();
    check('exactly one job came of it', jobsAfterFiring.length === 1, `jobs=${jobsAfterFiring.length}`);
    check(
      'and the row has moved past the occurrence, not stayed on it',
      fired && fired.nextDueAt > fired.lastFiredAt,
      fired ? `next=${new Date(fired.nextDueAt).toISOString()}` : '',
    );

    // The acceptance's own words: the schedules file on the volume. Read
    // there rather than through the API, because the API is the process that
    // is about to be killed.
    const ROW_ON_VOLUME = [
      "const fs=require('node:fs');",
      "const dir='/data/.agentlings/levels/'+process.argv[1]+'/schedules.json';",
      "const rows=fs.existsSync(dir)?JSON.parse(fs.readFileSync(dir,'utf8')):[];",
      "const r=rows.find(x=>x.id===process.argv[2]);",
      "console.log(JSON.stringify(r?{lastFiredAt:r.lastFiredAt,nextDueAt:r.nextDueAt,error:r.lastError||null}:null));",
    ].join('');
    const onDiskBefore = JSON.parse(await inContainer(ROW_ON_VOLUME, LEVEL, rowId));
    check(
      'the schedules file on the volume records that one firing',
      onDiskBefore && onDiskBefore.lastFiredAt === fired?.lastFiredAt && !onDiskBefore.error,
      JSON.stringify(onDiskBefore),
    );

    console.log('      restarting the process…');
    const restarted = await railway(['service', 'restart', '--service', service, '--yes']);
    if (restarted.code !== 0) {
      const fallback = await railway(['redeploy', '--service', service, '--yes']);
      if (fallback.code !== 0) throw new Error(`could not restart: ${restarted.err.trim()}`);
    }
    check('the install goes away and comes back', await waitForRestart());

    // The point of the whole check. Boot is a sweep too (index.ts), and a row
    // whose occurrence is behind it would fire again on every single deploy —
    // which on a host is every push. `markFired` advancing BEFORE the attempt
    // is what makes that not happen, and this is that, live.
    const afterBoot = await rowNow();
    check(
      'the boot sweep does not fire it a second time',
      afterBoot?.lastFiredAt === fired?.lastFiredAt,
      `${fired?.lastFiredAt} → ${afterBoot?.lastFiredAt}`,
    );
    const jobsAfterBoot = await firedJobs();
    check(
      '  …and there is still exactly one job, not one per boot',
      jobsAfterBoot.length === 1,
      `jobs=${jobsAfterBoot.length}`,
    );
    const onDiskAfter = JSON.parse(await inContainer(ROW_ON_VOLUME, LEVEL, rowId));
    check(
      '  …with the volume agreeing, which is where the row actually lives',
      JSON.stringify(onDiskAfter) === JSON.stringify(onDiskBefore),
      JSON.stringify(onDiskAfter),
    );
  } finally {
    console.log('\n── leaving the install as it was found ──');
    for (const undo of cleanup.reverse()) {
      await undo().catch(() => {});
    }
  }

  // Asked of the install, not assumed from having called the undo functions.
  await sleep(1000);
  const ended = (await get('/api/settings')).body;
  check('it is keyless again', ended.auth?.source === 'none' && ended.executor === 'simulated',
    `executor=${ended.executor} auth=${ended.auth?.source}`);
  check(
    '  …and the pasted door key is gone from the volume',
    (await inContainer(
      [
        "const fs=require('node:fs');",
        "const f='/data/.env';",
        "const raw=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';",
        "const l=raw.split(String.fromCharCode(10)).map(x=>x.trim()).find(x=>x.startsWith(process.argv[1]+'='))||'';",
        "console.log(l?'live':'gone');",
      ].join(''),
      'BRAVE_API_KEY',
    )) === 'gone',
  );
  const stillUp = await fetch(`${BASE_URL}/`).then((r) => r.status).catch(() => 0);
  check('and it is still up', stillUp === 200, `GET / -> ${stillUp}`);
}

/**
 * The work bar itself, in a browser, on the hosted address.
 *
 * The route carrying a fact and the bar painting it are two different claims,
 * and this project has now been caught on that gap four times. Skips loudly
 * rather than failing when there is no browser to drive — a check that could
 * not be made is not a check that passed.
 */
async function workBarSaysIt(base, password, levelId, report) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.log('SKIP  the work bar on screen — playwright-core is not installed here');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (err) {
    console.log(`SKIP  the work bar on screen — no browser to drive (${String(err).slice(0, 60)})`);
    return;
  }
  try {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    if (await page.locator('.login-screen').count()) {
      await page.fill('.login-field', password);
      await page.click('.login-go');
      await page.waitForTimeout(3000);
    }
    // There are no URLs to navigate by — the app is one screen deep in state,
    // so a level is reached the way a person reaches it. `prove-refusal-ui`'s
    // recipe, because it is the one that works.
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.ts-item')];
      (items.find((i) => i.textContent?.includes('START')) ?? items[0])?.click();
    });
    await page.waitForTimeout(2500);
    await page.evaluate((id) => {
      const cards = [...document.querySelectorAll('.lvl-card')];
      (cards.find((c) => c.textContent?.toLowerCase().includes('hosted proof')) ?? cards[0])?.click();
    }, levelId);
    await page.waitForTimeout(3500);
    // A fresh install shows the first-run tour over everything, which is
    // exactly the state a person deploying the template is in. Dismissed the
    // way they would dismiss it (D-248's lesson).
    if (await page.locator('.tour').count()) {
      await page.evaluate(() => {
        [...document.querySelectorAll('.tour-foot button')]
          .find((b) => b.textContent?.trim() === 'Skip')
          ?.click();
      });
      await page.waitForTimeout(800);
    }
    report('the work bar is on screen at all', (await page.locator('.work-input').count()) === 1);
    const refusedRow = page.locator('.work-conn-refused');
    await refusedRow.first().waitFor({ timeout: 15_000 }).catch(() => {});
    const said = (await refusedRow.count()) ? (await refusedRow.first().innerText()).trim() : '';
    report(
      'the work bar itself says the door is refused, and why',
      said.length > 0 && /screen/i.test(said),
      JSON.stringify(said),
    );
    // "Refused, not absent": the name has to be on screen, not merely a
    // sentence about screens.
    report(
      '  …naming the door, so it reads as something this install cannot host',
      /browser/i.test(said),
      JSON.stringify(said.slice(0, 80)),
    );

    await page.locator('.work-input').first().fill('organize my downloads folder into subfolders by kind');
    // The plan is debounced and then round-trips, so this waits for the answer
    // rather than for a number of milliseconds.
    await page
      .locator('.work-organize, .work-organize-refused')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => {});
    const organizeRow = page.locator('.work-organize-refused');
    const organizeSaid = (await organizeRow.count())
      ? (await organizeRow.first().innerText()).trim()
      : '';
    report(
      'and an organize sentence gets the reason instead of a button that errors',
      organizeSaid.length > 0,
      JSON.stringify(organizeSaid),
    );
    report(
      '  …with no folder button on offer beside it',
      (await page.locator('.work-folder-btn').count()) === 0,
      `buttons=${await page.locator('.work-folder-btn').count()}`,
    );
  } finally {
    await browser.close();
  }
}
