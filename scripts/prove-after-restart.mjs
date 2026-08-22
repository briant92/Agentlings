// The two live proofs D-217 and D-218 owe after the restart that carries them.
//
//   node scripts/prove-after-restart.mjs probe        (D-217: one name, not seven)
//   node scripts/prove-after-restart.mjs disconnect   (D-218: the round trip)
//
// Both refuse to run against a server that predates the build: the Disconnect
// route answers 404 on the old server and 400 on the new one for a connection
// that holds no secret, which is a side-effect-free way to ask which one is up.
// Nothing here ever prints a secret value — names, booleans and counts only.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const LEVEL = 'training-ground';
const mode = process.argv[2];

const json = async (url, init) => {
  const res = await fetch(`${BASE}${url}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

async function assertNewServer() {
  const { status } = await json('/api/settings/connections/web/secrets', { method: 'DELETE' });
  if (status === 404) {
    console.error('the running server predates D-217/D-218 (the Disconnect route is unknown) — restart it first');
    process.exit(1);
  }
  if (status !== 400) {
    console.error(`unexpected answer ${status} from the restart check — stopping`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe() {
  await assertNewServer();
  const prompt =
    'List the names of every environment variable visible to this process whose name contains TOKEN, KEY or SECRET - names only, never values. Run exactly: node -e "console.log(Object.keys(process.env).filter(k=>/TOKEN|KEY|SECRET/i.test(k)).sort().join(String.fromCharCode(10)))" and write the output verbatim into RESULT.md under a heading Names seen, followed by the count. Do not print, echo or write any value.';
  const queued = await json(`/api/levels/${LEVEL}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'env probe (after launder)', prompt }),
  });
  if (queued.status !== 201) {
    console.error('could not queue the probe:', queued.status, queued.body);
    process.exit(1);
  }
  const id = queued.body.id;
  console.log('queued', id);
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const { body } = await json(`/api/levels/${LEVEL}/state`);
    const jobs = Array.isArray(body.jobs) ? body.jobs : Object.values(body.jobs ?? {});
    const job = jobs.find((j) => j.id === id);
    if (!job) continue;
    if (['done', 'partial', 'failed'].includes(job.status)) {
      console.log('status', job.status, 'cost', job.meter?.costUsd, 'turns', job.meter?.turns);
      const out = await fetch(`${BASE}/api/levels/${LEVEL}/jobs/${id}/output/RESULT.md`);
      const text = out.ok ? await out.text() : '(no RESULT.md)';
      const block = /```\n([\s\S]*?)```/.exec(text);
      const names = block ? block[1].trim().split(/\r?\n/).filter(Boolean) : [];
      console.log('names seen:', names.length, names.join(', '));
      console.log(names.length === 1 && names[0] === 'ANTHROPIC_API_KEY' ? 'PROVEN: one name, the key the run authenticates with' : 'NOT PROVEN - read RESULT.md');
      return;
    }
  }
  console.error('the probe did not finish in ten minutes');
  process.exit(1);
}

async function disconnect() {
  await assertNewServer();
  const NAME = 'TELEGRAM_BOT_TOKEN';
  const before = readFileSync(ENV_FILE, 'utf8');
  const live = before.split(/\r?\n/).find((l) => new RegExp(`^\\s*${NAME}\\s*=`).test(l));
  if (!live) {
    console.error(`no live ${NAME} line in .env — nothing to round-trip`);
    process.exit(1);
  }
  const value = live.slice(live.indexOf('=') + 1).trim(); // held in memory only
  const settings = (await json('/api/settings')).body;
  const row = settings.connections.find((c) => c.name === 'telegram');
  console.log('before:', { ready: row.ready, enabled: row.enabled, identity: Boolean(row.identity) });
  const wasEnabled = row.enabled;

  const gone = await json('/api/settings/connections/telegram/secrets', { method: 'DELETE' });
  console.log('DELETE ->', gone.status, {
    forgot: gone.body.forgot,
    alsoDisconnected: gone.body.alsoDisconnected,
    revoked: gone.body.revoked,
  });
  const after = readFileSync(ENV_FILE, 'utf8');
  const placeholder = after.split(/\r?\n/).some((l) => l.trim() === `# ${NAME}=`);
  const stillLive = after.split(/\r?\n/).some((l) => new RegExp(`^\\s*${NAME}\\s*=`).test(l));
  const rowGone = gone.body.connections?.find((c) => c.name === 'telegram');
  console.log('env line is the placeholder:', placeholder, '| any live line left:', stillLive);
  console.log('row after:', { ready: rowGone?.ready, enabled: rowGone?.enabled, identity: Boolean(rowGone?.identity) });
  const linesBefore = before.split(/\r?\n/).length;
  const linesAfter = after.split(/\r?\n/).length;
  console.log('line count unchanged:', linesBefore === linesAfter);

  const restored = await json('/api/settings/connections/telegram/secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ values: { [NAME]: value } }),
  });
  if (restored.status !== 200) {
    // The belt: put the line back by hand so nothing is lost, then say so.
    writeFileSync(ENV_FILE, after.replace(`# ${NAME}=`, `${NAME}=${value}`));
    console.error('re-store FAILED', restored.status, restored.body?.error, '- the .env line was written back directly; the live env needs a restart or a successful Check');
    process.exit(1);
  }
  const back = readFileSync(ENV_FILE, 'utf8');
  console.log('re-stored via the drawer route (validated by getMe):', restored.status, '| identity back:', restored.body.identity !== null);
  console.log('.env byte-identical to before:', back === before);
  if (wasEnabled) {
    const on = await json('/api/settings/connections/telegram', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    console.log('switch restored:', on.status === 200);
  }
  const finalRow = (await json('/api/settings')).body.connections.find((c) => c.name === 'telegram');
  console.log('final:', { ready: finalRow.ready, enabled: finalRow.enabled, identity: Boolean(finalRow.identity) });
  console.log(
    placeholder && !stillLive && rowGone?.ready === false && back === before && finalRow.ready
      ? 'PROVEN: forgotten, placeholder left in place, re-stored byte-identical'
      : 'NOT PROVEN - read the lines above',
  );
}

if (mode === 'probe') await probe();
else if (mode === 'disconnect') await disconnect();
else {
  console.error('usage: node scripts/prove-after-restart.mjs probe|disconnect');
  process.exit(1);
}
