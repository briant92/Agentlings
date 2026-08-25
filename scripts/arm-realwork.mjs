// Arm the Monday report on a level (D-261): the week's real-work block, sent
// at $0 with no model, landing in review like any send.
//
//   node scripts/arm-realwork.mjs <level> <channel> <recipient>
//   node scripts/arm-realwork.mjs hq telegram 8633678680
//
// Mondays at 08:05 — between HQ's 08:00 calendar brief and its 08:10 mail
// brief. One POST through the route, with the gate's cookie — kept as a
// script because there is no work-bar control for a report row (D-261, not
// built), and a curl with a login dance is not something anyone repeats
// correctly. Reads the row back and prints its label, so the arming is
// verified by what the server stored rather than by the request that was
// sent. Another cadence is one POST to the same route by hand.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [level, channel, to] = process.argv.slice(2);
if (!level || !channel || !to) {
  console.error('usage: node scripts/arm-realwork.mjs <level> <channel> <recipient>');
  process.exitCode = 2;
} else {
  const cadence = { kind: 'weekly', dow: 1, hour: 8, minute: 5 };

  const password = /^\s*AGENTLINGS_PASSWORD\s*=\s*(.+)$/m
    .exec(readFileSync(path.join(ROOT, '.env'), 'utf8'))?.[1]
    ?.trim();
  let cookie = '';
  if (password) {
    const res = await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  }
  const headers = { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) };

  const res = await fetch(`${BASE}/api/levels/${level}/schedules`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ report: 'realwork', cadence, channel, to }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 201) {
    console.error(`refused (${res.status}): ${body.error ?? JSON.stringify(body)}`);
    process.exitCode = 1;
  } else {
    const listed = await fetch(`${BASE}/api/levels/${level}/schedules`, { headers });
    const rows = (await listed.json()).schedules ?? [];
    const row = rows.find((s) => s.id === body.id);
    if (!row) {
      console.error(`armed as ${body.id} but the level does not list it back`);
      process.exitCode = 1;
    } else {
      console.log(`armed ${row.id} on ${level}: “${row.prompt}” — ${row.cadenceLabel}`);
      console.log(`next firing ${new Date(row.nextDueAt).toString()} → ${channel} ${to}`);
    }
  }
}
