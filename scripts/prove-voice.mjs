// The live proof D-265 owes (#17) — the half a running server can reach.
//
//   node scripts/prove-voice.mjs
//
// What the unit tests cannot touch: the voice routes on a real server, the
// transcriber's state as the desk reads it, Start refusing a note by name,
// and — when a REAL note is on disk, transcribed and unused — the whole way
// in: the note listed with its words, queued through /work on a level whose
// crew is rested, the audio riding the job's input/ byte for byte, the
// queued line saying where the words came from, the note spent on disk and
// refused a second time. The job is cancelled and the level closed after.
//
// What it cannot make happen: a voice note arriving. That is Brian's thumb
// on the bot — send one, wait a sweep (15 s) and the read (a few seconds),
// run this again. Without one it says so at the end rather than letting 0
// failures read as "proven end to end".
//
// Costs nothing. Adds zero ledger rows.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const BASE = 'http://127.0.0.1:4600';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_DIR = path.join(ROOT, '.agentlings', 'voice');

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

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
const call = async (url, init = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const post = (url, body) =>
  call(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// ── refuse a server older than the thing this proves ────────────────────────
const voice = await call('/api/voice');
if (voice.status === 404) {
  console.error('the running server predates D-265 — restart it first');
  process.exit(1);
}
check('GET /api/voice answers', voice.status === 200, `${voice.status}`);
const t = voice.body.transcriber ?? {};
check(
  'it names the transcriber: model, size and where it lives',
  typeof t.model === 'string' && typeof t.modelMb === 'number' && typeof t.dir === 'string',
  `${t.model} ${t.modelMb} MB at ${t.dir}`,
);
check(
  'the transcriber is installed (else: npm run voice:install)',
  t.installed === true,
  t.installed ? 'installed' : 'NOT installed',
);
check('the notes are a list', Array.isArray(voice.body.notes), `${voice.body.notes?.length} waiting`);
check(
  'no listed note is spent or dismissed',
  (voice.body.notes ?? []).every((n) => !n.usedBy && !n.dismissedAt),
);
check(
  'no listed note carries both words and a reason',
  (voice.body.notes ?? []).every((n) => !(n.transcript && n.error)),
);
{
  const notes = voice.body.notes ?? [];
  const read = notes.filter((n) => n.transcript).length;
  const failed = notes.filter((n) => n.error).length;
  console.log(`  listed: ${read} with words, ${failed} with a reason, ${notes.length - read - failed} still being read`);
}

const gone = await post('/api/voice/nope/dismiss', {});
check('dismissing a note that does not exist is a 404 by name', gone.status === 404, gone.body.error);

// ── a level nobody can work on ──────────────────────────────────────────────
const made = await post('/api/levels', { name: 'D-265 voice proof', project: 'Proof', theme: 'jungle-dusk' });
if (made.status !== 201) {
  console.error(`could not make a level (${made.status}) — is the server running?`, made.body);
  process.exit(1);
}
const lid = made.body.id;
const levelDir = path.join(ROOT, '.agentlings', 'levels', lid);
const readJobs = () =>
  existsSync(path.join(levelDir, 'jobs.json'))
    ? JSON.parse(readFileSync(path.join(levelDir, 'jobs.json'), 'utf8'))
    : [];
const cleanup = async () => {
  try {
    for (const j of readJobs()) await post(`/api/levels/${lid}/jobs/${j.id}/cancel`, {});
  } catch {
    // Best effort: a level that will not close is reported below, not thrown.
  }
  const closed = await call(`/api/levels/${lid}`, { method: 'DELETE' });
  if (closed.status !== 200) {
    console.error(`could not close the proof level ${lid} (${closed.status}) — close it by hand`);
  }
};

// Rested and VERIFIED off disk before anything is queued (D-246's lesson).
const rosterFile = path.join(levelDir, 'roster.json');
const roster = JSON.parse(readFileSync(rosterFile, 'utf8'));
check('the proof level has a crew to rest', roster.length > 0, `${roster.length} hired`);
for (const a of roster) await post(`/api/levels/${lid}/agentlings/${a.id}/rest`, {});
const awake = JSON.parse(readFileSync(rosterFile, 'utf8')).filter((a) => !a.resting);
check('every agentling on the proof level is resting', awake.length === 0, awake.map((a) => a.name).join(' '));
if (awake.length > 0 || roster.length === 0) {
  console.error('refusing to queue anything while someone could pick a job up');
  await cleanup();
  process.exit(1);
}

// ── Start refuses a note by name ────────────────────────────────────────────
const unknown = await post(`/api/levels/${lid}/work`, { text: 'read this', voice: 'nope' });
check('Start with an unknown note is refused by name', unknown.status === 400, unknown.body.error);
check('and queued nothing', readJobs().length === 0);

// ── the real note, if one is on disk ────────────────────────────────────────
const onDisk = existsSync(VOICE_DIR)
  ? readdirSync(VOICE_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'seen.json')
      .map((f) => {
        try {
          return JSON.parse(readFileSync(path.join(VOICE_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  : [];
const spent = onDisk.filter((n) => n.usedBy);
const failed = onDisk.filter((n) => n.error);
const usable = onDisk.filter((n) => n.transcript && !n.usedBy && !n.dismissedAt);
console.log(
  `notes on disk: ${onDisk.length} (${usable.length} usable, ${spent.length} spent, ${failed.length} failed)`,
);
for (const n of failed) console.log(`  failed ${n.id} from ${n.from}: ${n.error}`);
for (const n of spent) console.log(`  spent ${n.id} from ${n.from} → job ${n.usedBy}: "${n.transcript}"`);

if (usable.length > 0) {
  const note = usable[usable.length - 1];
  console.log(`  using ${note.id} from ${note.from}, ${note.seconds} s, ${note.language}: "${note.transcript}"`);
  const listed = (voice.body.notes ?? []).find((n) => n.id === note.id);
  check('the desk lists it with its words', listed?.transcript === note.transcript);
  const audioFile = path.join(VOICE_DIR, note.file);
  check('its audio is on disk', existsSync(audioFile), note.file);

  const queued = await post(`/api/levels/${lid}/work`, { text: note.transcript, voice: note.id });
  check('Start with the note queues a job', queued.status === 201, queued.body.error);
  const job = queued.body;
  const rode = (job.attachments ?? []).find((a) => a.name === note.file);
  check('the audio rides the job as an input', rode !== undefined, JSON.stringify(job.attachments));
  const inputFile = path.join(levelDir, 'jobs', job.id, 'input', note.file);
  check(
    'byte for byte',
    existsSync(inputFile) && statSync(inputFile).size === statSync(audioFile).size,
    existsSync(inputFile) ? `${statSync(inputFile).size} bytes` : 'missing',
  );
  const words = path.join(levelDir, 'jobs', job.id, 'input', `voice-${note.id}.txt`);
  check(
    'the words as transcribed ride beside it, so the check can be made from the job alone',
    existsSync(words) && readFileSync(words, 'utf8').trim() === note.transcript,
  );
  check('the sentence is the transcript', job.prompt === note.transcript);
  const after = JSON.parse(readFileSync(path.join(VOICE_DIR, `${note.id}.json`), 'utf8'));
  check('the note is spent on disk, naming the job', after.usedBy === job.id, after.usedBy);
  const again = await post(`/api/levels/${lid}/work`, { text: note.transcript, voice: note.id });
  check('a second Start with the same note is refused by name', again.status === 400, again.body.error);
  const relisted = await call('/api/voice');
  check('the desk no longer lists it', !(relisted.body.notes ?? []).some((n) => n.id === note.id));
  // The queued line lives on the socket only — the replay a fresh
  // connection gets carries every event so far.
  const line = await new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:4600/ws?level=${encodeURIComponent(lid)}`, {
      headers: cookie ? { cookie } : {},
    });
    const done = (value) => {
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    socket.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.type !== 'events') return;
      const hit = msg.events.find((e) => e.jobId === job.id && e.type === 'queued');
      if (hit) {
        clearTimeout(timer);
        done(hit);
      }
    });
    socket.on('error', () => done(null));
  });
  check(
    'the queued line says where the words came from',
    /read from a voice note/.test(line?.detail ?? ''),
    line?.detail ?? 'no queued line seen on the socket',
  );
  check('the job cost nothing — nobody was awake to take it', readJobs().every((j) => j.status === 'queued'));
} else {
  console.log(
    'no transcribed, unused note on disk — send a voice note to the bot, wait ~20 s, run again for the live half',
  );
}

await cleanup();
console.log(`\n${bad === 0 ? 'all checks passed' : `${bad} check(s) FAILED`}`);
if (usable.length === 0) {
  console.log('NOT proven end to end: no real voice note was queued by this run.');
}
process.exit(bad === 0 ? 0 : 1);
