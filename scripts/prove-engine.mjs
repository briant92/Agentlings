// The live proof #32 owes (D-277): a person gives an install a model key, and
// the crew stops pretending — without a restart.
//
//   node scripts/prove-engine.mjs            the safe tier only
//   node scripts/prove-engine.mjs --cycle    also forget the key and put it back
//   node scripts/prove-engine.mjs --spend    also run ONE real job (costs money)
//
// Everything #32 landed is unit-tested; 2833 green says nothing about whether
// a real key pasted into a running server reaches a real job. Only a live run
// can say that, and D-277's own finding is why — the engine's row was complete
// in the catalog, the type, the route, the store and both grant seams, and
// rendered on no board at all.
//
// THIS INSTALL ALREADY HAS A KEY. So the transition cannot be proved by
// pasting one; it is proved by taking the key away and giving it back. That is
// what --cycle does, and why it is not the default:
//
//   * `.env` is copied aside BEFORE anything is touched, and the install is
//     restored in a `finally` on every path including a throw. `.env` is
//     gitignored, so there is no `git checkout` to fall back on (D-021).
//   * The key is read from `.env` and held in a variable. It is never an
//     argument, never logged, never in a URL — D-275's leak was a credential
//     reaching argv, where a rejection carried it into a log and a card.
//   * Forgetting also switches the row OFF (the route disables every affected
//     connection), so restoring the key alone would leave this install doing
//     pretend work in silence. The restore flips it back and checks it did.
//
// The safe tier changes nothing it does not put back: it pastes a bad key
// (refused before anything is written), asks for a model this key cannot use,
// and toggles the row off and on again. It makes one throwaway level for the
// door refusal and deletes it.

import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const envText = readFileSync(ENV_FILE, 'utf8');
const line = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm').exec(envText)?.[1]?.trim();

// Mirrors listenPort()'s precedence (D-271): AGENTLINGS_PORT wins when both
// are set. A .mjs script cannot import the .ts module that decides it.
const PORT = line('AGENTLINGS_PORT') || line('PORT') || '4600';
const BASE = `http://127.0.0.1:${PORT}`;

const CYCLE = process.argv.includes('--cycle');
const SPEND = process.argv.includes('--spend');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};
// Never `process.exit` here: on Windows it can exit 0 after printing FAIL,
// which is how a prove script once reported success while failing (D-276).
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
};

const envHash = () => createHash('sha256').update(readFileSync(ENV_FILE)).digest('hex').slice(0, 12);
const envLine = (name) =>
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => new RegExp(`^\\s*#?\\s*${name}\\s*=`).test(l)) ?? '<no such line>';
// The value is never printed. What a reader needs is the SHAPE of the line —
// live, commented, or gone — and that is all this returns.
const shapeOf = (name) => {
  const l = envLine(name);
  if (l === '<no such line>') return 'absent';
  if (/^\s*#/.test(l)) return /=\s*$/.test(l) ? 'commented placeholder' : 'commented, with a value';
  return /=\s*$/.test(l) ? 'live but empty' : 'live, with a value';
};

// ── sign in ─────────────────────────────────────────────────────────────────
const password = line('AGENTLINGS_PASSWORD');
let cookie = '';
if (password) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  }).catch((e) => {
    // A refused connection is the ordinary way to run this with the server
    // down. Say so, rather than handing back a stack trace about a socket.
    console.error(`nothing is listening on ${BASE} — start the server first (${e.cause?.code ?? e.message})`);
    process.exitCode = 1;
    return null;
  });
  if (res === null) throw new Error('no server');
  if (!res.ok) {
    console.error(`could not sign in (${res.status}) — is the server on this .env?`);
    process.exitCode = 1;
  }
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const json = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const patch = (body) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const put = (body) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const settings = async () => (await call('/api/settings')).body;
const engineRow = async () => (await settings()).connections?.find((c) => c.name === 'anthropic');
const setEnabled = (on) => call('/api/settings/connections/anthropic', patch({ enabled: on }));

// ── the ground this proof stands on ─────────────────────────────────────────
// A guard that fires must not `throw` from the top level: on Windows that
// unwinds while a fetch socket is still closing, trips a libuv assertion and
// exits 127 — a number nobody reads as "refused to start". Measured here, and
// the same hazard prove-realwork.mjs names about `process.exit`.
let blocked = '';
const before = await settings();
if (before === undefined || before.executor === undefined) {
  blocked = 'the running server has no executor line — is it older than #32?';
}
const startedReal = before.executor === 'claude-agent-sdk';
const startEnabled = (await engineRow())?.enabled ?? false;
const startModel = before.model ?? null;
const startHash = envHash();

console.log(`server ${BASE} — executor ${before.executor}, engine row ${startEnabled ? 'on' : 'off'}`);
console.log(`ANTHROPIC_API_KEY in .env: ${shapeOf('ANTHROPIC_API_KEY')}`);
console.log('');

const levels = (await call('/api/levels')).body ?? [];
const running = levels.reduce((n, l) => n + (l.jobsRunning ?? 0), 0);
if (!blocked && running > 0) {
  blocked = `${running} job(s) running — this proof moves the engine underneath them. Wait.`;
}

if (blocked) {
  console.error(blocked);
  process.exitCode = 1;
}

let level;
// Set by --cycle the moment `.env` is copied aside, so the `finally` can put
// the file itself back — not just the switches. Without this, a process killed
// between forgetting and pasting leaves the install keyless and the operator
// hunting for a backup they were told about once, in scrollback.
let backup;
// The model this proof picks, so --spend can hold the meter against it.
let chosen;
try {
  if (blocked) stop(blocked);
  // ── 1. the row and the executor agree, read fresh ─────────────────────────
  const row = await engineRow();
  check('the engine has a row in the catalog', row !== undefined);
  check('and it is the engine kind, not a send', row?.kind === 'engine', row?.kind);
  check('it declares the model key as its secret', row?.credentialed === true);
  check(
    'the executor line agrees with the row, read now rather than at boot',
    startEnabled && row?.ready ? startedReal : true,
    `${before.executor} / row ${startEnabled ? 'on' : 'off'}, ${row?.ready ? 'ready' : 'not ready'}`,
  );

  // ── 2. a bad key is refused, and NOTHING is stored ────────────────────────
  // Shaped like a real key so it passes secretValueProblem and is refused by
  // Anthropic itself — the point is the provider's verdict, not our regex.
  const hashBeforeBad = envHash();
  const badKey = `sk-ant-api03-${'x'.repeat(80)}`;
  const badPaste = await call(
    '/api/settings/connections/anthropic/secret',
    json({ values: { ANTHROPIC_API_KEY: badKey } }),
  );
  check(
    'a bad key is refused with a reason',
    badPaste.status === 400 && /key/i.test(String(badPaste.body.error ?? '')),
    JSON.stringify(badPaste.body.error),
  );
  check('the reason does not echo the key back', !JSON.stringify(badPaste.body).includes(badKey));
  check('and nothing was written to .env', envHash() === hashBeforeBad, shapeOf('ANTHROPIC_API_KEY'));
  check(
    'the live executor is untouched by a refused paste',
    (await settings()).executor === before.executor,
  );

  // ── 3. a secret the engine does not declare ───────────────────────────────
  const wrongName = await call(
    '/api/settings/connections/anthropic/secret',
    json({ values: { OPENAI_API_KEY: 'x' } }),
  );
  check(
    'a secret the engine does not declare is refused',
    wrongName.status === 400 && /declares no secret/.test(String(wrongName.body.error ?? '')),
    JSON.stringify(wrongName.body.error),
  );

  // ── 4. the model picker asks the provider, not a list in here ─────────────
  const models = (await call('/api/settings/models')).body.models ?? [];
  check(
    'the picker lists models this key can actually reach',
    startedReal ? models.length > 0 : true,
    `${models.length} models`,
  );
  if (models.length > 0) {
    console.log(`      e.g. ${models.slice(0, 3).map((m) => m.id).join(', ')}`);
  }

  const bogus = await call('/api/settings/model', put({ model: 'claude-does-not-exist' }));
  check('a model this key cannot use is refused', bogus.status === 400, JSON.stringify(bogus.body.error));

  if (models.length > 0) {
    // The cheapest the key can reach, so --spend costs as little as possible.
    chosen = models.find((m) => /haiku/.test(m.id))?.id ?? models[0].id;
    const set = await call('/api/settings/model', put({ model: chosen }));
    check('a model from that list is accepted', set.status === 200, JSON.stringify(set.body));
    check('and reads back as the chosen one', (await settings()).model === chosen, chosen);
  }

  // ── 5. the engine may never be granted to a run ───────────────────────────
  const made = await call(
    '/api/levels',
    json({ name: '#32 engine proof', project: 'Proof', theme: 'jungle-dusk' }),
  );
  if (made.status !== 201) stop(`could not make a level (${made.status})`);
  level = made.body.id;
  const at = new Date(Date.now() + 60 * 60_000);
  const asDoor = await call(
    `/api/levels/${level}/schedules`,
    json({
      text: 'the engine is not a door',
      cadence: { kind: 'daily', hour: at.getHours(), minute: at.getMinutes() },
      tools: ['anthropic'],
    }),
  );
  check(
    'a schedule rule naming the engine as a door is refused',
    asDoor.status === 400,
    JSON.stringify(asDoor.body.error),
  );

  // ── 6. the switch alone returns the install to pretend work ───────────────
  if (startEnabled && startedReal) {
    const off = await setEnabled(false);
    check('the engine row switches off', off.status === 200);
    check(
      'and the executor is simulated straight away, with no restart',
      (await settings()).executor === 'simulated',
    );
    check('while the key is still in .env', shapeOf('ANTHROPIC_API_KEY') === 'live, with a value');
    await setEnabled(true);
    check(
      'switching it back on runs real work again, still with no restart',
      (await settings()).executor === 'claude-agent-sdk',
    );
  } else {
    console.log('SKIP  the switch round trip — the engine did not start on with a key');
  }

  // ── 7. --cycle: take the key away and give it back ────────────────────────
  if (CYCLE) {
    if (!startedReal) stop('--cycle needs an install that starts with a working key');
    backup = path.join(ROOT, '.agentlings', `env.backup.${Date.now()}`);
    copyFileSync(ENV_FILE, backup);
    console.log(`\n.env copied to ${path.relative(ROOT, backup)} before anything is touched\n`);
    // Held in a variable, never an argument and never logged (D-275).
    const key = line('ANTHROPIC_API_KEY');
    if (!key) stop('no key in .env to cycle');

    const forgot = await call('/api/settings/connections/anthropic/secrets', { method: 'DELETE' });
    check('the key is forgotten', forgot.status === 200, JSON.stringify(forgot.body.forgot));
    check('the reply carries names, never values', !JSON.stringify(forgot.body).includes(key));
    check(
      'the .env line becomes its commented placeholder (D-218)',
      shapeOf('ANTHROPIC_API_KEY') === 'commented placeholder',
      envLine('ANTHROPIC_API_KEY'),
    );
    check('the install is doing pretend work again', (await settings()).executor === 'simulated');
    check('and forgetting switched the row off too', (await engineRow())?.enabled === false);

    const paste = await call(
      '/api/settings/connections/anthropic/secret',
      json({ values: { ANTHROPIC_API_KEY: key } }),
    );
    check(
      'the same key pastes back and validates',
      paste.status === 200,
      JSON.stringify(paste.body.identity ?? paste.body.error),
    );
    check('the .env line is live again', shapeOf('ANTHROPIC_API_KEY') === 'live, with a value');
    // The honest sequence: pasting stores the key, but forgetting had switched
    // the row off, so the executor does not come back until the switch does.
    const pastedRow = await engineRow();
    console.log(
      `      after pasting: row ${pastedRow?.enabled ? 'on' : 'off'}, executor ${(await settings()).executor}`,
    );
    if (!pastedRow?.enabled) await setEnabled(true);
    check(
      'the install runs real work again, without a restart',
      (await settings()).executor === 'claude-agent-sdk',
    );
    check('and .env is byte-for-byte what it was', envHash() === startHash, `${envHash()} vs ${startHash}`);
  }

  // ── 8. --spend: one real job, the only proof that costs money ─────────────
  if (SPEND) {
    if ((await settings()).executor !== 'claude-agent-sdk') stop('--spend needs a live engine');
    // It must DELIVER, not merely answer. "Finishing is not delivering"
    // (queue.ts): a run that writes no file is failed by design and absorbed
    // rather than billed — so a prompt asking only for a reply proves the
    // engine ran and leaves a red job behind, which is what the first run of
    // this proof did.
    const queued = await call(
      `/api/levels/${level}/jobs`,
      json({
        title: '#32 engine proof',
        prompt:
          'Write a file called ENGINE.md containing exactly one line: the name of the model answering this. Nothing else.',
      }),
    );
    check('a job is queued', queued.status === 201, JSON.stringify(queued.body).slice(0, 200));
    const jobsFile = path.join(ROOT, '.agentlings', 'levels', level, 'jobs.json');
    const readJobs = () => (existsSync(jobsFile) ? JSON.parse(readFileSync(jobsFile, 'utf8')) : []);
    const id = queued.body.id ?? queued.body.job?.id;
    process.stdout.write('      waiting for the job');
    const deadline = Date.now() + 300_000;
    let job;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      process.stdout.write('.');
      job = readJobs().find((j) => j.id === id);
      if (job && !['queued', 'running'].includes(job.status)) break;
    }
    console.log('');
    const meter = job?.meter ?? {};
    console.log(`      status: ${job?.status}${job?.error ? ` — ${job.error}` : ''}`);
    console.log(`      meter: ${JSON.stringify(meter)}`);
    // Two different claims, kept apart. The first run of this proof asserted
    // only "not queued or running" and went green on a FAILED job.
    check(
      'the job delivered — it did not merely finish',
      job?.status === 'done',
      `${job?.status}${job?.error ? `: ${job.error}` : ''}`,
    );
    check(
      'a real model answered it, not the simulator',
      (meter.costUsd ?? 0) > 0 && (meter.turns ?? 0) > 0,
      `$${meter.costUsd} over ${meter.turns} turn(s)`,
    );
    // The whole point of #32's model box: the choice made in Settings is the
    // model that actually ran, read off the meter rather than off the setting.
    check(
      'and it is the model chosen in Settings, read off the meter',
      meter.model === chosen,
      `${meter.model} vs ${chosen}`,
    );

    // ── the other half of the precedence: a role naming its own model wins ──
    // This cannot be seen while the chosen model and the role's are the same
    // string, which is exactly the trap the first version of this proof fell
    // into: `analyst`, `clerk` and `scout` all pin the very model picked above
    // as the cheapest, so every run agreed for the wrong reason. So choose a
    // DIFFERENT model, then let a job route to a role that pins its own.
    const pinned = {};
    for (const f of readdirSync(path.join(ROOT, 'roles'))) {
      const m = /^model:\s*(.+)$/m.exec(readFileSync(path.join(ROOT, 'roles', f), 'utf8'));
      if (m) pinned[path.basename(f, '.md')] = m[1].trim();
    }
    const other = models.find((m) => !Object.values(pinned).includes(m.id))?.id;
    // The model is taken from the role of the agentling that PICKS THE JOB UP
    // (`registry.get(agentling.role)`), not from the job's routing preference
    // — an earlier version of this check compared against `preferredRole` and
    // reported a defect that was its own misreading. So the roster decides it:
    // rest everyone whose role pins nothing, and the job has one worker left.
    // A new level's crew is created all-`worker` (`newCrewSeed`), and worker
    // pins no model — so this cannot wait for a pinned role to turn up. It
    // assigns one, on its own throwaway level, rather than resting the crew of
    // a real one to borrow its clerk.
    const roster = JSON.parse(
      readFileSync(path.join(ROOT, '.agentlings', 'levels', level, 'roster.json'), 'utf8'),
    );
    const pinnedRole = Object.keys(pinned)[0];
    const worker = roster[0];
    if (other && worker && pinnedRole) {
      const gave = await call(
        `/api/levels/${level}/agentlings/${worker.id}/role`,
        json({ role: pinnedRole }),
      );
      if (gave.status === 200) worker.role = pinnedRole;
    }
    if (!other || !worker || !pinned[worker.role]) {
      console.log(
        `SKIP  role-beats-choice — ${!other ? 'no second model to contrast' : 'could not put a model-pinning role on an agentling'}`,
      );
    } else {
      for (const a of roster) {
        if (a.id !== worker.id && !a.resting) {
          await call(`/api/levels/${level}/agentlings/${a.id}/rest`, { method: 'POST' });
        }
      }
      await call('/api/settings/model', put({ model: other }));
      const second = await call(
        `/api/levels/${level}/jobs`,
        json({
          title: '#32 role model proof',
          prompt: 'Write a file called ROLE.md holding one line: the word ready. Nothing else.',
        }),
      );
      const sid = second.body.id;
      process.stdout.write(
        `      waiting for ${worker.name} the ${worker.role} (pins ${pinned[worker.role]}, Settings says ${other})`,
      );
      const dl = Date.now() + 300_000;
      let sj;
      while (Date.now() < dl) {
        await new Promise((r) => setTimeout(r, 5000));
        process.stdout.write('.');
        sj = readJobs().find((j) => j.id === sid);
        if (sj && !['queued', 'running'].includes(sj.status)) break;
      }
      console.log('');
      const ranAs = roster.find((a) => a.id === sj?.assignedTo)?.role ?? worker.role;
      check(
        'a role naming its own model still wins over the choice in Settings',
        sj?.meter?.model === pinned[ranAs],
        `${ranAs} ran ${sj?.meter?.model}, its role pins ${pinned[ranAs]}, Settings said ${other}`,
      );
    }
  }
} catch (e) {
  if (e instanceof Stop) console.error(`\nstopped: ${e.message}`);
  else console.error('\nthrew:', e);
  bad++;
} finally {
  // Put the install back exactly as it was found, on every path.
  try {
    if (blocked) throw new Stop(blocked);
    // A level will not close cleanly under a live job, and deleting one out
    // from under a run leaves it spending against a level nobody can see.
    if (level) {
      const jobsFile = path.join(ROOT, '.agentlings', 'levels', level, 'jobs.json');
      const live = existsSync(jobsFile)
        ? JSON.parse(readFileSync(jobsFile, 'utf8')).filter((j) =>
            ['queued', 'running'].includes(j.status),
          )
        : [];
      for (const j of live) {
        await call(`/api/levels/${level}/jobs/${j.id}/cancel`, { method: 'POST' });
        console.log(`      cancelled ${j.id} before closing the level`);
      }
    }
    // The file first: switches are worthless on an install whose key is gone.
    if (backup && envHash() !== startHash) {
      copyFileSync(backup, ENV_FILE);
      console.log(`\n.env restored from ${path.relative(ROOT, backup)}`);
      // The file is the record, but the LIVE env is what the running server
      // reads (D-078) — and nothing here can reach into its process. Say so
      // rather than leave a green line standing over a half-restored install.
      console.log('   the running server still holds whatever the last route set — restart it if this line appeared');
    }
    await call('/api/settings/model', put({ model: startModel ?? '' }));
    if (((await engineRow())?.enabled ?? false) !== startEnabled) await setEnabled(startEnabled);
    if (level) await call(`/api/levels/${level}`, { method: 'DELETE' });
  } catch (e) {
    if (!(e instanceof Stop)) {
      console.error('CLEANUP FAILED — check Settings by hand:', e);
      bad++;
    }
  }
  // A backup of `.env` is a plaintext copy of the model key. Once the file it
  // guards is provably identical, it is no longer insurance — it is a second
  // place the key lives, unwatched (D-275). Kept ONLY if anything differs.
  if (backup && existsSync(backup)) {
    if (envHash() === startHash) {
      rmSync(backup);
      console.log(`\n${path.relative(ROOT, backup)} removed — .env is provably intact, so the copy was only a second place the key lived`);
    } else {
      console.log(`\nKEPT ${path.relative(ROOT, backup)} — .env does NOT match what it was; restore it by hand`);
    }
  }
  if (blocked) {
    // Nothing was touched, so there is nothing to report restoring — and a
    // green "as it was found" here would be a line about work never done.
    process.exitCode = 1;
  } else {
    const end = await settings().catch(() => ({}));
    console.log('');
    console.log(
      `restored: executor ${end.executor}, model ${JSON.stringify(end.model ?? null)}, key ${shapeOf('ANTHROPIC_API_KEY')}`,
    );
    check(
      'the install is as it was found',
      end.executor === before.executor && envHash() === startHash,
      `${end.executor} / ${envHash()} vs ${startHash}`,
    );
    console.log(bad === 0 ? '\nALL PASS' : `\n${bad} FAILED`);
    process.exitCode = bad === 0 ? 0 : 1;
  }
}
