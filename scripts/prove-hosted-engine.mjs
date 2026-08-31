// #32's last box: a hosted install is given a model key THROUGH THE APP, and
// the key survives the redeploy its host performs on every push.
//
//   node scripts/prove-hosted-engine.mjs            the proof (one small job)
//   node scripts/prove-hosted-engine.mjs --forget   the teardown, afterwards
//
// Run from the repository, which is where the Railway CLI is linked. Address
// and password come from the service's own variables, so nothing is typed and
// no password appears in the output — `prove-hosted.mjs`'s arrangement.
//
// ── why this is a separate script from prove-hosted.mjs ──
// That script proves a pasted secret survives a redeploy, and says in its own
// header WHY it had to use a door key to do it: "there is no field anywhere
// for the model key ... on a hosted install the model key can only be a host
// variable". #32 made that false. Its `--paid` path still sets
// ANTHROPIC_API_KEY as a SERVICE VARIABLE, which by D-270 permanently shadows
// /data/.env under that name — so it now models the one thing a person must
// not do, and asserts "the executor is real only after the restart the key
// forced", which `ChosenExecutor` also made false. Those are edits to that
// script, tracked separately; this one proves the new claim on its own terms.
//
// ── what it will not do ──
// It refuses to run if ANTHROPIC_API_KEY exists as a service variable. That
// variable would beat the pasted key for good, and every check below would
// then be passing about the wrong mechanism — agreement for the wrong reason,
// which is the failure this whole ticket kept producing.
//
// ── what it costs ──
// One small job on the hosted install, a few cents. The key itself is the
// maintainer's throwaway: `--forget` removes it from the install, and it is
// revoked at Anthropic by hand afterwards.

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';

const SERVICE = 'Agentlings';
const FORGET = process.argv.includes('--forget');
const DEPLOY_TIMEOUT_MS = 600_000;

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
class Stop extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The CLI as a program, not a shell line — npm installs it on Windows as a
 * `.cmd` shim, and Node runs those through cmd.exe, which re-splits argv on
 * its own rules (prove-hosted.mjs learnt this the hard way).
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
    const beside = path.join(path.dirname(shim), 'node_modules', '@railway', 'cli', 'bin', 'railway.exe');
    if (existsSync(beside)) return beside;
  }
  throw new Error('the Railway CLI is not on PATH — install it and `railway link` this project');
}
const BIN = railwayBin();

/** One CLI call. Output is returned, never printed — variables come back here. */
const railway = (args, timeoutMs = 120_000) =>
  new Promise((resolve) => {
    const child = spawn(BIN, args);
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: -2, out, err: `timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => finish({ code: -1, out, err: String(e) }));
    child.on('close', (code) => finish({ code, out, err }));
  });

const railwayJson = async (args) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(5000);
    const r = await railway([...args, '--json']);
    if (r.code === 0) {
      try {
        return JSON.parse(r.out);
      } catch {
        /* a transient far end is not a proof failing */
      }
    }
  }
  throw new Error(`railway ${args[0]} did not answer with JSON`);
};

const inContainer = async (source, ...args) => {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(5000);
    const r = await railway(['ssh', '--service', SERVICE, 'node', '-e', source, ...args], 45_000);
    if (r.code === 0) return r.out.trim();
    last = r.err.trim().split('\n').filter(Boolean).pop() ?? `exit ${r.code}`;
  }
  throw new Error(`ssh failed after 3 tries: ${last}`);
};

// ── who and where ───────────────────────────────────────────────────────────
const vars = await railwayJson(['variables', '--service', SERVICE]);
const BASE_URL = `https://${vars.RAILWAY_PUBLIC_DOMAIN}`;
const password = vars.AGENTLINGS_PASSWORD;
if (!password) throw new Error(`${SERVICE} has no AGENTLINGS_PASSWORD — by D-271 it cannot listen`);

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

const latestDeploy = async () => (await railwayJson(['deployment', 'list', '--service', SERVICE]))[0];

/**
 * Proves the redeploy happened rather than assuming it: a NEW deployment id
 * must reach SUCCESS, and only then must the install answer. Polling the URL
 * alone passes instantly against the process that is still up — measured
 * twice in one session, both times looking exactly like success.
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
  throw new Error(`${label} succeeded but the install never answered again`);
};

/** The key's line on the volume, as a hash. The value never crosses back. */
const HASH_LINE = [
  "const fs=require('node:fs'),h=require('node:crypto');",
  "const f='/data/.env';",
  "const want=process.argv[1]+'=';",
  "const raw=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';",
  "const l=raw.split(String.fromCharCode(10)).map(x=>x.trim()).find(x=>x.startsWith(want))||'';",
  "console.log(l?h.createHash('sha256').update(l).digest('hex'):'absent');",
].join('');

let level;
try {
  await signIn();
  console.log(`install   ${BASE_URL}`);
  console.log(`service   ${SERVICE}\n`);

  // ── 0. the paste must be the thing under test ─────────────────────────────
  // A host variable of the same name beats /data/.env for good (D-270), so if
  // one existed every check below would agree for the wrong reason.
  check(
    'no ANTHROPIC_API_KEY service variable — the paste is what is being tested',
    !Object.hasOwn(vars, 'ANTHROPIC_API_KEY'),
    Object.hasOwn(vars, 'ANTHROPIC_API_KEY') ? 'one is set; it would shadow the paste' : 'none set',
  );
  if (Object.hasOwn(vars, 'ANTHROPIC_API_KEY')) {
    throw new Stop('remove the ANTHROPIC_API_KEY service variable before proving the paste');
  }

  if (FORGET) {
    // ── teardown ────────────────────────────────────────────────────────────
    console.log('── forgetting the key, leaving the install as it was found ──');
    const forgot = await send('DELETE', '/api/settings/connections/anthropic/secrets');
    check('the key is forgotten', forgot.status === 200, JSON.stringify(forgot.body.forgot ?? forgot.body.error));
    const after = await get('/api/settings');
    check('the install is doing pretend work again', after.body.executor === 'simulated', after.body.executor);
    const gone = await inContainer(HASH_LINE, 'ANTHROPIC_API_KEY');
    // D-218: the line becomes its commented placeholder, so it is not 'absent'
    // — what matters is that it no longer starts with the live name.
    check('the live line is gone from the volume', gone === 'absent', gone.slice(0, 12));
    console.log('\nNOW REVOKE THE KEY AT console.anthropic.com — this script cannot.');
  } else {
    // ── 1. the pasted key is what makes this install real ────────────────────
    console.log('── the key a person pasted, on the volume ──');
    const before = await get('/api/settings');
    check(
      'the install runs real work, from a key pasted in Settings',
      before.body.executor === 'claude-agent-sdk',
      `executor=${before.body.executor} auth=${before.body.auth?.source}`,
    );
    const engine = (before.body.connections ?? []).find((c) => c.name === 'anthropic');
    check('the engine row is on and ready', engine?.enabled === true && engine?.ready === true);
    const models = await get('/api/settings/models');
    check(
      'and the picker reaches models with it',
      (models.body.models ?? []).length > 0,
      `${(models.body.models ?? []).length} models`,
    );

    const onVolumeBefore = await inContainer(HASH_LINE, 'ANTHROPIC_API_KEY');
    check('the key is on the volume at /data/.env', onVolumeBefore !== 'absent', onVolumeBefore.slice(0, 12));

    // ── 2. a real job, on the hosted install ─────────────────────────────────
    console.log('\n── one real job on the hosted install ──');
    const made = await send('POST', '/api/levels', {
      name: `engine proof ${randomUUID().slice(0, 6)}`,
      project: 'Proof',
      theme: 'cave',
    });
    if (made.status !== 201) throw new Stop(`could not make a level (${made.status})`);
    level = made.body.id;
    const queued = await send('POST', `/api/levels/${level}/jobs`, {
      title: '#32 hosted engine proof',
      prompt: 'Write a file called HOSTED.md holding one line: the word ready. Nothing else.',
    });
    check('a job is queued', queued.status === 201, JSON.stringify(queued.body).slice(0, 120));
    const id = queued.body.id;
    process.stdout.write('      waiting');
    const until = Date.now() + 300_000;
    let job;
    let sawIt = false;
    while (Date.now() < until) {
      await sleep(5000);
      process.stdout.write('.');
      // `/state` is the only way in from off the machine: there is no
      // GET /api/levels/:lid/jobs, and the local proof reads jobs.json off
      // disk. The first run of this polled the route that does not exist and
      // sat through five minutes of 404 before reporting `status: undefined`
      // — a job it never found, read as a job that failed.
      const state = await get(`/api/levels/${level}/state`);
      const list = state.body.jobs ?? [];
      job = list.find((j) => j.id === id);
      if (job) sawIt = true;
      if (job && !['queued', 'running'].includes(job.status)) break;
    }
    console.log('');
    check('the job was visible on the install at all', sawIt, sawIt ? '' : 'never appeared in /state');
    console.log(`      status: ${job?.status}${job?.error ? ` — ${job.error}` : ''}`);
    console.log(`      meter: ${JSON.stringify(job?.meter ?? {})}`);
    check('it delivered — it did not merely finish', job?.status === 'done', job?.status);
    check(
      'a real model answered it on the hosted install',
      (job?.meter?.costUsd ?? 0) > 0 && (job?.meter?.turns ?? 0) > 0,
      `$${job?.meter?.costUsd} over ${job?.meter?.turns} turn(s) on ${job?.meter?.model}`,
    );

    // ── 3. the redeploy every push performs ──────────────────────────────────
    console.log('\n── the redeploy a host performs on every push ──');
    const was = await latestDeploy();
    const asked = await railway(['redeploy', '--service', SERVICE, '--yes']);
    if (asked.code !== 0) throw new Stop(`could not redeploy: ${asked.err.trim()}`);
    console.log('      redeploy asked for — waiting for a NEW deployment to reach SUCCESS');
    const now = await waitForNewDeploy(was, 'the redeploy');
    check('a new deployment reached SUCCESS', now.id !== was.id, `${was.id.slice(0, 8)} → ${now.id.slice(0, 8)}`);

    const onVolumeAfter = await inContainer(HASH_LINE, 'ANTHROPIC_API_KEY');
    check(
      'the key survived it, byte for byte',
      onVolumeAfter === onVolumeBefore && onVolumeAfter !== 'absent',
      `${onVolumeAfter.slice(0, 12)} vs ${onVolumeBefore.slice(0, 12)}`,
    );
    const after = await get('/api/settings');
    check(
      'and the install came back running real work, with no variable set anywhere',
      after.body.executor === 'claude-agent-sdk',
      `executor=${after.body.executor} auth=${after.body.auth?.source}`,
    );
  }
} catch (e) {
  if (e instanceof Stop) console.error(`\nstopped: ${e.message}`);
  else console.error('\nthrew:', e);
  bad++;
} finally {
  if (level) {
    try {
      await send('DELETE', `/api/levels/${level}`);
    } catch {
      console.error(`NOTE  the proof level ${level} is still on the install — remove it by hand`);
    }
  }
  console.log(bad === 0 ? '\nALL PASS' : `\n${bad} FAILED`);
  process.exitCode = bad === 0 ? 0 : 1;
}
