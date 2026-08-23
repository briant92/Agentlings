// Queue one B0 trial job through the desk route with its two files attached,
// wait for it, and print what the plan, the route and the run did.
//
//   node run-trial.mjs us     (bank statement + own cash ledger)
//   node run-trial.mjs cl     (cartola + libro mayor banco)
//   node run-trial.mjs rcv    (cartola + the two SII registers — the no-books variant)
//   node run-trial.mjs us-oct (the next period of the US books — the roll-forward test, D-223)
//
// Same sentence every time, on purpose: the second run is the inheritance test.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:4600';
const LEVEL = 'training-ground';
const SENTENCE =
  'Reconcile the attached bank statement against the attached records: match every statement line to a record by amount, date and reference, list what matched and what did not on each side, and show the two closing balances and the difference.';

const SETS = {
  us: ['us/bank-statement-2026-09.csv', 'us/cash-ledger-2026-09.csv'],
  cl: ['cl/cartola-mayo-2026.csv', 'cl/libro-mayor-banco-mayo-2026.csv'],
  'us-oct': ['us-oct/bank-statement-2026-10.csv', 'us-oct/cash-ledger-2026-10.csv'],
  rcv: ['cl/cartola-mayo-2026.csv', 'cl/sii-rcv-ventas-mayo-2026.csv', 'cl/sii-rcv-compras-mayo-2026.csv'],
};
const set = SETS[process.argv[2]];
if (!set) {
  console.error('usage: node run-trial.mjs us|cl|rcv|us-oct');
  process.exit(1);
}

const json = async (url, init) => {
  const res = await fetch(`${BASE}${url}`, init);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = set.map((rel) => ({
  name: path.basename(rel),
  data: readFileSync(path.join(HERE, rel)).toString('base64'),
}));
const queued = await json(`/api/levels/${LEVEL}/work`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: SENTENCE, files, single: true }),
});
if (queued.status !== 201 && queued.status !== 200) {
  console.error('not queued:', queued.status, queued.body);
  process.exit(1);
}
const job = Array.isArray(queued.body) ? queued.body[0] : (queued.body.job ?? queued.body);
console.log('queued', job.id, '| role', job.plan?.role ?? job.role, '| route', job.quote?.kind ?? job.quote?.route, '| quote', job.quote?.label ?? JSON.stringify(job.quote)?.slice(0, 120));
console.log('attachments', (job.attachments ?? []).map((a) => a.name).join(', '));

const t0 = Date.now();
for (;;) {
  await sleep(10000);
  const { body } = await json(`/api/levels/${LEVEL}/state`);
  const jobs = Array.isArray(body.jobs) ? body.jobs : Object.values(body.jobs ?? {});
  const now = jobs.find((j) => j.id === job.id);
  if (!now) continue;
  if (['done', 'partial', 'failed'].includes(now.status)) {
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log('finished', now.status, '| cost', now.meter?.costUsd, '| turns', now.meter?.turns, '| cut', now.meter?.outOfTurns || now.meter?.timedOut || false, '| minutes', mins);
    console.log('role ran', now.role ?? now.plan?.role, '| recipe', now.recipeKey ?? now.quote?.recipeKey ?? '-');
    const out = await json(`/api/levels/${LEVEL}/jobs/${job.id}/output`);
    const names = (out.body.files ?? out.body.outputs ?? out.body ?? []).map?.((f) => f.name ?? f) ?? [];
    console.log('outputs:', JSON.stringify(names).slice(0, 400));
    const res = await fetch(`${BASE}/api/levels/${LEVEL}/jobs/${job.id}/output/RESULT.md`);
    console.log('--- RESULT.md ---');
    console.log(res.ok ? await res.text() : '(none)');
    process.exit(0);
  }
  if (Date.now() - t0 > 15 * 60000) {
    console.error('still running after 15 minutes — stopping the wait, not the job');
    process.exit(2);
  }
}
