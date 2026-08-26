import { describe, expect, it } from 'vitest';
import type { VoiceNote, VoiceStatus } from '@agentlings/shared';
import { voiceHead, voiceHold, voiceLength } from './voice';

const NOW = new Date(2026, 7, 25, 23, 50).getTime();
const note = (over: Partial<VoiceNote> = {}): VoiceNote => ({
  id: '10',
  chatId: '8633678680',
  from: 'Brian Thornton',
  at: new Date(2026, 7, 25, 23, 41).getTime(),
  seconds: 74,
  file: 'voice-10.oga',
  ...over,
});
const installed: VoiceStatus = {
  installed: true,
  model: 'onnx-community/whisper-small',
  modelMb: 241,
  dir: 'x',
};

describe('voiceLength', () => {
  it('reads as minutes and seconds', () => {
    expect(voiceLength(74)).toBe('1:14');
    expect(voiceLength(9)).toBe('0:09');
  });
});

describe('voiceHead', () => {
  it('names the sender, the length and the clock', () => {
    expect(voiceHead(note(), NOW)).toBe('Voice note from Brian Thornton · 1:14 · 23:41');
  });
  it('adds the date once it is not today', () => {
    const yesterday = note({ at: new Date(2026, 7, 24, 8, 5).getTime() });
    expect(voiceHead(yesterday, NOW)).toMatch(/^Voice note from Brian Thornton · 1:14 · .*08:05$/);
    expect(voiceHead(yesterday, NOW)).not.toBe('Voice note from Brian Thornton · 1:14 · 08:05');
  });
});

describe('voiceHold', () => {
  it('is null for a transcribed note — the words go in the box', () => {
    expect(voiceHold(note({ transcript: 'revisa la factura' }), installed)).toBeNull();
  });
  it('says a note is still being read', () => {
    expect(voiceHold(note(), installed)).toBe('being transcribed…');
  });
  it('quotes the failure by name', () => {
    expect(voiceHold(note({ error: 'nothing heard' }), installed)).toBe(
      'not transcribed — nothing heard',
    );
  });
  it('names the one install step when the model is missing', () => {
    const missing = { ...installed, installed: false };
    const hold = voiceHold(
      note({ error: 'the transcriber is not installed — run npm run voice:install' }),
      missing,
    );
    expect(hold).toContain('npm run voice:install');
    expect(hold).toContain('241 MB');
    expect(hold).toContain('send the note again');
  });
});
