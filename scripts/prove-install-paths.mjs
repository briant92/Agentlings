// The live proof #23 owes: an install told where to keep things keeps them
// there, and a key pasted into Settings survives a restart from the moved
// secrets file.
//
//   node scripts/prove-install-paths.mjs
//
// It starts its own server rather than talking to a running one, because the
// whole point is a *different* AGENTLINGS_HOME — and that is also what makes
// it safe to start: a fresh home has no levels, so no armed schedule row can
// double-fire, and an empty secrets file means no door can open, no model is
// reachable and nothing costs money. It refuses to run if port 4600 is
// already answering, so it can never be the thing that killed a live session.
//
// The maintainer's own store is proven untouched by hashing `.env` and
// `.agentlings/server.log` before and after.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:4600';
const LAUNCHER = path.join(ROOT, 'server', 'scripts', 'dev-logged.mjs');
const FIXTURE = path.join(ROOT, 'server', 'src', 'mcpprobe.fixture.mjs');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const hash = (file) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent';

const listening = () =>
  new Promise((resolve) => {
    const socket = createConnection({ port: 4600, host: '127.0.0.1' })
      .on('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .on('error', () => resolve(false));
  });

if (await listening()) {
  console.error(
    'something is already on 4600 — stop it first. This proof needs its own server on a different AGENTLINGS_HOME.',
  );
  process.exit(1);
}

// ── the maintainer's store, as it stands ────────────────────────────────────
const MINE = {
  env: path.join(ROOT, '.env'),
  log: path.join(ROOT, '.agentlings', 'server.log'),
};
const before = { env: hash(MINE.env), log: hash(MINE.log) };

// ── a home of its own ───────────────────────────────────────────────────────
const HOME = mkdtempSync(path.join(os.tmpdir(), 'agentlings-home-'));
console.log(`AGENTLINGS_HOME=${HOME}\n`);

let child = null;
const start = async () => {
  child = spawn(process.execPath, [LAUNCHER, '--no-watch'], {
    env: { ...process.env, AGENTLINGS_HOME: HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${BASE}/api/settings`).catch(() => null);
    if (res?.ok) return await res.json();
    await sleep(500);
  }
  throw new Error('the server never answered on 4600');
};
const stop = async () => {
  if (!child) return;
  const ended = new Promise((r) => child.on('exit', r));
  child.kill();
  child = null;
  await ended;
  // The port is only really free once nothing answers on it.
  for (let i = 0; i < 40 && (await listening()); i++) await sleep(250);
};

try {
  // ── 1. the store follows the variable ─────────────────────────────────────
  const settings = await start();
  check('the server boots on a home it has never seen', Array.isArray(settings.connections));
  check(
    'and builds its data directory under that home',
    existsSync(path.join(HOME, '.agentlings', 'levels')),
    path.join(HOME, '.agentlings', 'levels'),
  );
  check(
    'the launcher puts the server log there too, not in the repository',
    existsSync(path.join(HOME, '.agentlings', 'server.log')),
  );

  // ── 2. a key pasted into Settings lands in the relocated secrets file ─────
  // The same route the add-a-connection form posts to (D-244). The far end is
  // this repo's stdio fixture, which refuses to start without its secret — so
  // the secret provably travelled, and no real credential is involved.
  const draft = {
    name: 'proof-install-paths',
    label: 'Proof (install paths)',
    transport: 'stdio',
    command: process.execPath,
    args: [FIXTURE],
    secrets: { FIXTURE_TOKEN: 'the fixture refuses to start without it' },
  };
  const added = await fetch(`${BASE}/api/connections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draft, values: { FIXTURE_TOKEN: 'pasted-into-settings' } }),
  });
  const addedBody = await added.json().catch(() => ({}));
  check('a connection is added through the running server', added.status === 201, JSON.stringify(addedBody.error ?? ''));

  const moved = path.join(HOME, '.env');
  check(
    'the pasted key is written to the secrets file under the home',
    existsSync(moved) && readFileSync(moved, 'utf8').includes('FIXTURE_TOKEN=pasted-into-settings'),
    moved,
  );
  check(
    "and not to the maintainer's .env, which is byte-identical",
    hash(MINE.env) === before.env,
  );
  check(
    "nor to the maintainer's server log",
    hash(MINE.log) === before.log,
  );
  check(
    'the connection reads ready while the server that stored it is up',
    (addedBody.connections ?? []).find((c) => c.name === draft.name)?.ready === true,
  );

  // ── 3. it is read back after a restart ───────────────────────────────────
  // The trap this whole slice exists for: on a host whose filesystem is
  // rebuilt per deploy, this is the check that would have failed silently,
  // days after the key was pasted.
  await stop();
  const again = await start();
  const row = (again.connections ?? []).find((c) => c.name === draft.name);
  check('the connection is still there after a restart', row !== undefined);
  check(
    'and its key was read back from the relocated secrets file',
    row?.ready === true,
    JSON.stringify(row?.missingSecrets ?? []),
  );

  // ── 4. which wins: the environment or the file ───────────────────────────
  // Measured on the very file the server just wrote, not asserted from the
  // docs. This is the sentence slice 7 owes the README.
  const probe = await new Promise((resolve) => {
    const out = [];
    const proc = spawn(
      process.execPath,
      [
        '-e',
        `process.loadEnvFile(${JSON.stringify(moved)}); console.log(process.env.FIXTURE_TOKEN);`,
      ],
      { env: { ...process.env, FIXTURE_TOKEN: 'set-by-the-host' }, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    proc.stdout.on('data', (c) => out.push(c));
    proc.on('exit', () => resolve(Buffer.concat(out).toString().trim()));
  });
  check(
    'a name already in the environment beats the same name in the secrets file',
    probe === 'set-by-the-host',
    `${probe} (node ${process.version})`,
  );
  // ── 5. and the drawer's own write reaches the same relocated file ────────
  // The paste-into-an-existing-connection route
  // (`POST /api/settings/connections/:name/secret`) cannot be proven with a
  // fixture: it validates against the connection's own far end first, and a
  // connection this repo added by hand has no validator — proving it would
  // mean a real credential, which no proof script here spends. Its sibling
  // needs no validator and writes to the same one constant, so the drawer's
  // reach into the relocated file is shown through that.
  const forgot = await fetch(`${BASE}/api/settings/connections/${draft.name}/secrets`, {
    method: 'DELETE',
  });
  const forgotBody = await forgot.json().catch(() => ({}));
  check(
    'the Settings drawer forgets the secret through its own route',
    forgot.status === 200 && (forgotBody.forgot ?? []).includes('FIXTURE_TOKEN'),
    JSON.stringify(forgotBody.error ?? forgotBody.forgot ?? ''),
  );
  check(
    'and it is the relocated secrets file that was rewritten',
    readFileSync(moved, 'utf8').includes('# FIXTURE_TOKEN=') &&
      !readFileSync(moved, 'utf8').includes('FIXTURE_TOKEN=pasted-into-settings'),
  );
  check("the maintainer's .env is still byte-identical", hash(MINE.env) === before.env);

} finally {
  await stop();
  rmSync(HOME, { recursive: true, force: true });
}

console.log(`\n${bad === 0 ? 'all checks passed' : `${bad} check(s) failed`}`);
process.exit(bad === 0 ? 0 : 1);
