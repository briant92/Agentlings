// The one install step for voice notes (D-265, #17):
//
//   npm run voice:install
//
// Fetches the Whisper model into .agentlings/models/ (241 MB, once) and then
// proves it runs on this machine against fixtures/voice/jfk-4s.wav — four
// seconds of speech whose words are known — and that a second of silence is
// "nothing heard" rather than the word Whisper invents in it. No Telegram
// note lives in the repo; the proof of a real one is scripts/prove-voice.mjs
// on a running server, after one has been sent. The server itself never
// downloads: until this has run, a note that arrives carries "the
// transcriber is not installed" and the desk says so by name.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installTranscriber,
  modelDir,
  transcribePcm,
  VOICE_MODEL,
  VOICE_MODEL_MB,
  voiceStatus,
  WHISPER_RATE,
} from '../server/src/transcribe';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');
const FIXTURE = path.join(ROOT, 'fixtures', 'voice', 'jfk-4s.wav');

/** 16 kHz mono 16-bit PCM WAV → floats; the fixture's shape and nothing wider. */
function pcmFromWav(file: string): Float32Array {
  const buf = readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== WHISPER_RATE) {
    throw new Error(`${file} is not 16 kHz mono`);
  }
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = view.getUint32(off + 4, true);
    if (id === 'data') {
      const out = new Float32Array(Math.floor(size / 2));
      for (let i = 0; i < out.length; i++) out[i] = view.getInt16(off + 8 + i * 2, true) / 32768;
      return out;
    }
    off += 8 + size;
  }
  throw new Error(`${file} has no data chunk`);
}

const before = voiceStatus(SANDBOX_ROOT);
console.log(
  before.installed
    ? `${VOICE_MODEL} is already in ${before.dir} — checking it runs`
    : `fetching ${VOICE_MODEL} (${VOICE_MODEL_MB} MB) into ${before.dir} …`,
);

const started = Date.now();
const status = await installTranscriber(SANDBOX_ROOT);
if (!status.installed) {
  console.error('the model did not land whole — run again; a partial folder is not a model');
  process.exit(1);
}

let bytes = 0;
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else bytes += statSync(file).size;
  }
};
walk(modelDir(SANDBOX_ROOT));
console.log(
  `installed: ${Math.round(bytes / 1024 / 1024)} MB on disk after ${Math.round((Date.now() - started) / 1000)} s`,
);

let bad = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

// Silence is judged before the model: it must never become a word.
const quiet = await transcribePcm(SANDBOX_ROOT, new Float32Array(WHISPER_RATE));
check(
  'a second of silence is "nothing heard", not a guessed word',
  'error' in quiet && quiet.error === 'nothing heard',
  'error' in quiet ? quiet.error : `heard "${quiet.text}"`,
);

// Known words: the model loads, detects the language, and reads them.
const readAt = Date.now();
const heard = await transcribePcm(SANDBOX_ROOT, pcmFromWav(FIXTURE));
if ('error' in heard) {
  check('the fixture transcribes', false, heard.error);
} else {
  check('the fixture transcribes', true, `"${heard.text}" in ${Date.now() - readAt} ms`);
  check('the language is detected as English', heard.language === 'en', heard.language);
  check('the words are the known ones', /fellow americans/i.test(heard.text), heard.text);
}

if (bad > 0) {
  console.error(`${bad} check(s) failed — the model is on disk but this machine is not transcribing; report it`);
  process.exit(1);
}
console.log('the machine can transcribe — a voice note to the bot now reaches the desk as text');
