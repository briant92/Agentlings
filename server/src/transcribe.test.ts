import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanTranscript,
  modelDir,
  monoAt16k,
  silent,
  VOICE_MODEL,
  VOICE_MODEL_FILES,
  VOICE_MODEL_MB,
  voiceStatus,
} from './transcribe';

describe('monoAt16k', () => {
  it('averages the channels and resamples to 16 kHz', () => {
    const left = new Float32Array(48).fill(1);
    const right = new Float32Array(48).fill(0);
    const pcm = monoAt16k([left, right], 48_000);
    expect(pcm.length).toBe(16);
    expect(pcm[0]).toBeCloseTo(0.5);
    expect(pcm[15]).toBeCloseTo(0.5);
  });

  it('passes 16 kHz mono through untouched', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    expect(monoAt16k([samples], 16_000)).toBe(samples);
  });

  it('interpolates rather than dropping samples', () => {
    // A ramp at 32 kHz keeps its slope at 16 kHz: every other point, in between.
    const ramp = new Float32Array(32).map((_, i) => i / 32);
    const pcm = monoAt16k([ramp], 32_000);
    expect(pcm.length).toBe(16);
    expect(pcm[1]).toBeCloseTo(2 / 32);
    expect(pcm[8]).toBeCloseTo(16 / 32);
  });
});

describe('silent', () => {
  it('calls near-silence silent and speech-level audio not', () => {
    expect(silent(new Float32Array(16_000))).toBe(true);
    const hiss = new Float32Array(16_000).map((_, i) => (i % 2 ? 0.002 : -0.002));
    expect(silent(hiss)).toBe(true);
    // Measured: the four-second speech fixture sits at RMS 0.17.
    const speech = new Float32Array(16_000).map((_, i) => Math.sin(i / 7) * 0.08);
    expect(silent(speech)).toBe(false);
    expect(silent(new Float32Array(0))).toBe(true);
  });
});

describe('cleanTranscript', () => {
  it('collapses whitespace and drops Whisper’s bracketed noise tokens', () => {
    expect(cleanTranscript('  Hola,   necesito  que revises la factura. ')).toBe(
      'Hola, necesito que revises la factura.',
    );
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript(' (music) [inaudible] ')).toBe('');
    expect(cleanTranscript('Read it (please) now')).toBe('Read it (please) now');
  });
});

describe('voiceStatus', () => {
  let root = '';
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('is not installed until every model file is on disk, and says the one step', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-model-'));
    const before = voiceStatus(root);
    expect(before).toEqual({
      installed: false,
      model: VOICE_MODEL,
      modelMb: VOICE_MODEL_MB,
      dir: modelDir(root),
    });
    // One file short is still not installed — a half download is not a model.
    for (const file of VOICE_MODEL_FILES.slice(0, -1)) {
      mkdirSync(path.dirname(path.join(modelDir(root), file)), { recursive: true });
      writeFileSync(path.join(modelDir(root), file), '');
    }
    expect(voiceStatus(root).installed).toBe(false);
    const last = VOICE_MODEL_FILES[VOICE_MODEL_FILES.length - 1]!;
    mkdirSync(path.dirname(path.join(modelDir(root), last)), { recursive: true });
    writeFileSync(path.join(modelDir(root), last), '');
    expect(voiceStatus(root).installed).toBe(true);
  });

  it('keeps the model under .agentlings, never in the repo', () => {
    expect(modelDir('/x/.agentlings')).toBe(path.join('/x/.agentlings', 'models', VOICE_MODEL));
  });
});
