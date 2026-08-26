import { existsSync } from 'node:fs';
import path from 'node:path';
import type { VoiceStatus } from '@agentlings/shared';

/**
 * The transcriber (D-265, #17): Whisper on this machine, no API, no per-call
 * cost. `@huggingface/transformers` runs the ONNX export on the CPU through
 * onnxruntime-node; the Ogg Opus that Telegram sends is decoded in WASM by
 * `ogg-opus-decoder`. No binary is fetched by hand: `npm install` brings the
 * runtime, and one documented step — `npm run voice:install` — brings the
 * model into `.agentlings/models/`. The server never downloads on its own:
 * a sweep that quietly pulled a quarter-gigabyte would be doing something
 * nobody asked for, so a missing model is a named state at the desk instead.
 *
 * Measured 2026-08-25 on this machine (RTX 5080, CPU only — DirectML loaded
 * both models and decoded to empty token lists, so it is not used):
 * `whisper-base` q8 (76 MB) misheard a plain sentence; `whisper-small` q8
 * (241 MB) was right on both samples and ran a 20 s note in 7.4 s;
 * `large-v3-turbo` q4 (727 MB) was right with better punctuation and ran the
 * same note in 13.2 s. Small is the pick: right, and faster than realtime.
 */
export const VOICE_MODEL = 'onnx-community/whisper-small';
const VOICE_MODEL_DTYPE = 'q8';
/** `du -sh` of the cache after one install, 2026-08-25. */
export const VOICE_MODEL_MB = 241;
/** What one install writes; all present means installed, one short means not. */
export const VOICE_MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
] as const;
/** Whisper hears 16 kHz mono and nothing else. */
export const WHISPER_RATE = 16_000;

function modelsDir(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'models');
}

export function modelDir(sandboxRoot: string): string {
  return path.join(modelsDir(sandboxRoot), VOICE_MODEL);
}

export function voiceStatus(sandboxRoot: string): VoiceStatus {
  const dir = modelDir(sandboxRoot);
  return {
    installed: VOICE_MODEL_FILES.every((file) => existsSync(path.join(dir, file))),
    model: VOICE_MODEL,
    modelMb: VOICE_MODEL_MB,
    dir,
  };
}

/**
 * Channels averaged to one and resampled to 16 kHz by linear interpolation —
 * enough for speech at Opus's 48 kHz, and no dependency for what a dozen
 * lines do. Already-16 kHz mono is returned as it came.
 */
export function monoAt16k(channels: Float32Array[], sampleRate: number): Float32Array {
  const first = channels[0] ?? new Float32Array(0);
  let mono = first;
  if (channels.length > 1) {
    mono = new Float32Array(first.length);
    for (const channel of channels) {
      for (let i = 0; i < mono.length; i++) mono[i] += (channel[i] ?? 0) / channels.length;
    }
  }
  if (sampleRate === WHISPER_RATE) return mono;
  const ratio = sampleRate / WHISPER_RATE;
  const out = new Float32Array(Math.floor(mono.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const lo = Math.floor(at);
    const hi = Math.min(lo + 1, mono.length - 1);
    out[i] = mono[lo]! + (mono[hi]! - mono[lo]!) * (at - lo);
  }
  return out;
}

/**
 * Whisper invents a word in silence — a second of zeros came back as "you"
 * on the install's first run — so silence is judged before the model hears
 * it, by energy: a note whose RMS sits under this is nothing heard, never a
 * guessed sentence. Speech in the fixture measures 0.17; a quiet room is
 * under 0.003.
 */
export const SILENCE_RMS = 0.005;

export function silent(pcm: Float32Array): boolean {
  if (pcm.length === 0) return true;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
  return Math.sqrt(sum / pcm.length) < SILENCE_RMS;
}

/**
 * Whisper marks what it did not hear in brackets — `[BLANK_AUDIO]`,
 * `[inaudible]`, `(music)`. Bracketed tokens go; a parenthesis stays unless
 * parentheses are all there was. What is left, collapsed; empty means nothing
 * was heard, and the caller says so instead of queueing a blank.
 */
export function cleanTranscript(raw: string): string {
  const unbracketed = raw.replace(/\[[^\]]*\]/g, ' ');
  const collapsed = unbracketed.replace(/\s+/g, ' ').trim();
  if (collapsed.replace(/\([^)]*\)/g, '').trim() === '') return '';
  return collapsed;
}

export interface Transcript {
  text: string;
  /** Whisper's own language code, read off its first token before the words. */
  language: string;
  /** The model's time — detection and read — not the decode's. */
  ms: number;
}

/** Ogg Opus in, float channels out — `ogg-opus-decoder`, loaded only when a note arrives. */
async function decodeOggOpus(
  bytes: Buffer,
): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const { OggOpusDecoder } = await import('ogg-opus-decoder');
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    const decoded = await decoder.decodeFile(new Uint8Array(bytes));
    return { channels: decoded.channelData, sampleRate: decoded.sampleRate };
  } finally {
    decoder.free();
  }
}

/**
 * The pipeline, built once per process and kept: the model takes ~15 s to
 * load and a few hundred MB, and a desk that transcribes two notes should not
 * pay that twice. Built lazily, so a server with no note ever arriving never
 * loads it — and `import()` rather than a top-level import, so the runtime's
 * native module is not touched by every test that imports this file.
 * `allowDownload` is read on the first build only: the server always passes
 * false, the install script (its own process) true.
 */
type WhisperPipeline = {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string }>;
  processor: (audio: Float32Array) => Promise<Record<string, unknown>>;
  model: {
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> };
    generate: (options: Record<string, unknown>) => Promise<{ tolist(): (number | bigint)[][] }>;
  };
};
let loading: Promise<WhisperPipeline> | null = null;
async function whisper(sandboxRoot: string, allowDownload: boolean): Promise<WhisperPipeline> {
  loading ??= (async () => {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = modelsDir(sandboxRoot);
    env.allowRemoteModels = allowDownload;
    const built = await pipeline('automatic-speech-recognition', VOICE_MODEL, {
      dtype: VOICE_MODEL_DTYPE,
    });
    return built as unknown as WhisperPipeline;
  })();
  return loading;
}

/**
 * Which language was spoken, asked of the model itself: fed only the
 * start-of-transcript token, Whisper's first prediction is the language token
 * (the same trick as its own `detect_language`). Without this the library
 * defaults to English and a Spanish note comes out as a translation of a
 * guess. One decoder step; the encoder pass is repeated by the read below,
 * cheap against the note it is reading.
 */
async function detectLanguage(asr: WhisperPipeline, pcm: Float32Array): Promise<string> {
  const features = await asr.processor(pcm);
  const config = asr.model.generation_config;
  const out = await asr.model.generate({
    ...features,
    decoder_input_ids: [[config.decoder_start_token_id]],
    max_new_tokens: 1,
  });
  const token = Number(out.tolist()[0]?.[1]);
  const code = Object.entries(config.lang_to_id).find(([, id]) => id === token)?.[0];
  return code?.replace(/[<|>]/g, '') || 'en';
}

/**
 * The whole read: bytes → the words, or the reason there are none. Every
 * failure is a sentence the note carries and the desk shows; nothing here
 * throws past a bad note, because the sweep behind it must go on to the next.
 */
export async function transcribe(
  sandboxRoot: string,
  audio: Buffer,
): Promise<Transcript | { error: string }> {
  if (!voiceStatus(sandboxRoot).installed) {
    return { error: 'the transcriber is not installed — run npm run voice:install' };
  }
  let pcm: Float32Array;
  try {
    const decoded = await decodeOggOpus(audio);
    pcm = monoAt16k(decoded.channels, decoded.sampleRate);
  } catch (err) {
    return { error: `the audio could not be decoded — ${err instanceof Error ? err.message : String(err)}` };
  }
  if (pcm.length === 0) return { error: 'the audio was empty' };
  return transcribePcm(sandboxRoot, pcm);
}

/**
 * The model's half alone, 16 kHz mono in. Split from the decode so the
 * install step can prove the model runs on this machine against the WAV
 * fixture — a Telegram note is Ogg Opus, and none is kept in the repo.
 */
export async function transcribePcm(
  sandboxRoot: string,
  pcm: Float32Array,
): Promise<Transcript | { error: string }> {
  const started = Date.now();
  if (silent(pcm)) return { error: 'nothing heard' };
  try {
    const asr = await whisper(sandboxRoot, false);
    const language = await detectLanguage(asr, pcm);
    const out = await asr(pcm, { chunk_length_s: 30, language });
    const text = cleanTranscript(out.text);
    if (!text) return { error: 'nothing heard' };
    return { text, language, ms: Date.now() - started };
  } catch (err) {
    return { error: `the transcriber failed — ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The one install step: fetch the model into `.agentlings/models/`. Proving it runs is the script's job. */
export async function installTranscriber(sandboxRoot: string): Promise<VoiceStatus> {
  await whisper(sandboxRoot, true);
  return voiceStatus(sandboxRoot);
}
