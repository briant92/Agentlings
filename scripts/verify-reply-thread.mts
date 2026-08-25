// D-248's last claim, checked at the far end: did the approved reply land
// INSIDE the conversation whose mail queued the job?
//
//   npx tsx scripts/verify-reply-thread.mts <levelId> <jobId>
//
// Reads the job's own mailTrigger stamp, then asks Gmail for the newest mail
// sent by the account to the trigger's sender and compares thread ids. Uses
// the app's own reader (mail.ts) and the app's own Google credential from
// .env — the same reach the mail desk has, nothing wider.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessTokenFromRefresh } from '../server/src/google';
import { fetchTriggerMail, listMailIds } from '../server/src/mail';
import type { Http } from '../server/src/library';

// The same one-liner index.ts uses — plain fetch behind the reader's type.
const http: Http = (url, headers, init) => fetch(url, { headers, ...init });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [levelId, jobId] = process.argv.slice(2);
if (!levelId || !jobId) {
  console.error('usage: npx tsx scripts/verify-reply-thread.mts <levelId> <jobId>');
  process.exit(2);
}

const env: Record<string, string> = {};
for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const jobs = JSON.parse(readFileSync(path.join(ROOT, '.agentlings', 'levels', levelId, 'jobs.json'), 'utf8'));
const job = jobs.find((j: { id: string }) => j.id === jobId);
if (!job?.mailTrigger) {
  console.error('that job carries no mailTrigger stamp');
  process.exit(1);
}
const sender = /<([^>]+)>/.exec(job.mailTrigger.from ?? '')?.[1] ?? job.mailTrigger.from;
console.log('trigger thread :', job.mailTrigger.threadId, ' from', sender);
console.log('outboxSent     :', JSON.stringify(job.outboxSent ?? null));

const access = await accessTokenFromRefresh({
  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN,
});
if ('error' in access) {
  console.error(access.error);
  process.exit(1);
}
const listed = await listMailIds(http, access.token, `from:me to:${sender} newer_than:1d`, 5);
if ('error' in listed) {
  console.error(listed.error);
  process.exit(1);
}
if (listed.ids.length === 0) {
  console.log('no mail sent to the sender in the last day — not approved yet?');
  process.exit(1);
}
let ok = false;
for (const id of listed.ids) {
  const sent = await fetchTriggerMail(http, access.token, id);
  if ('error' in sent) {
    console.error(sent.error);
    continue;
  }
  const same = sent.threadId === job.mailTrigger.threadId;
  console.log(`sent ${id} · thread ${sent.threadId} · "${sent.subject}" · ${same ? 'SAME THREAD' : 'different thread'}`);
  if (same) ok = true;
}
console.log(ok ? '\nTHREADED — the reply sits in the conversation that asked.' : '\nNOT THREADED');
process.exit(ok ? 0 : 1);
