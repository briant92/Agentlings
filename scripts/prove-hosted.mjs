// The live proof for the publish line — an install that anybody can reach.
//
//   node scripts/prove-hosted.mjs --local
//
// `--local` is the half #28 owes, and it runs on this machine with no
// container anywhere: start the server on every interface with no password and
// watch it refuse; give it one and watch it listen with the gate on; then send
// it a POST from its own address and one from somebody else's. The other mode
// — this script with no flag, against the reference install — belongs to #30
// and is not written yet, which is why the flag is required rather than
// defaulted. #24 builds the install it will run against, not the mode.
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

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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

if (!process.argv.slice(2).includes('--local')) {
  console.error(
    'usage: node scripts/prove-hosted.mjs --local\n' +
      '(the hosted mode, against the reference install, is #30 and does not exist yet)',
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
