import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  downloadVoice,
  pendingVoiceNotes,
  pollVoice,
  readVoiceNote,
  readVoiceNotes,
  readVoiceSeen,
  unreadVoiceNotes,
  usableVoiceNote,
  voiceAttachmentName,
  voiceNoteFile,
  voiceTranscriptName,
  VOICE_SEEN_CAP,
  writeVoiceNote,
  writeVoiceSeen,
  type VoiceHttp,
} from './voice';

/** getUpdates as Telegram shapes it: one message per update, voice or text. */
function update(
  id: number,
  chat: { id: number; first_name?: string; last_name?: string },
  body: Record<string, unknown>,
) {
  return { update_id: id, message: { message_id: id, date: 1_756_150_000 + id, chat, ...body } };
}
const voice = (fileId: string, duration = 14) => ({
  voice: {
    file_id: fileId,
    file_unique_id: `u-${fileId}`,
    duration,
    mime_type: 'audio/ogg',
    file_size: 20_480,
  },
});

function fake(routes: Record<string, unknown>, binary: Record<string, Buffer> = {}) {
  const calls: string[] = [];
  const http: VoiceHttp = async (url) => {
    calls.push(url);
    if (url.includes('/file/bot')) {
      const file = url.split('/file/bot')[1]?.split('/').slice(1).join('/') ?? '';
      const data = binary[file];
      return {
        ok: data !== undefined,
        status: data ? 200 : 404,
        json: async () => ({}),
        // A fresh Uint8Array copies the bytes into an ArrayBuffer of its own.
        arrayBuffer: async () => new Uint8Array(data ?? Buffer.alloc(0)).buffer as ArrayBuffer,
      };
    }
    const method = /\/bot[^/]+\/(\w+)/.exec(url)?.[1];
    const reply = method ? routes[method] : undefined;
    return {
      ok: reply !== undefined,
      status: reply === undefined ? 500 : 200,
      json: async () => reply,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  return { http, calls };
}

const BRIAN = { id: 1000000001, first_name: 'Brian', last_name: 'Thornton' };
const STRANGER = { id: 1, first_name: 'Nobody' };
const ROSTER = new Set(['1000000001']);

describe('pollVoice', () => {
  it('returns the roster’s unseen voice notes, oldest first, and passes strangers over by name', async () => {
    const { http, calls } = fake({
      getUpdates: {
        ok: true,
        result: [
          update(12, BRIAN, voice('f-12', 9)),
          update(10, BRIAN, voice('f-10')),
          update(11, BRIAN, { text: 'a typed line is not a note' }),
          update(13, STRANGER, voice('f-13')),
        ],
      },
    });
    const poll = await pollVoice({ http, token: 'tok', roster: ROSTER, seen: new Set() });
    if ('error' in poll) throw new Error(poll.error);
    expect(poll.notes.map((n) => n.id)).toEqual(['10', '12']);
    expect(poll.notes[0]).toMatchObject({
      chatId: '1000000001',
      from: 'Brian Thornton',
      fileId: 'f-10',
      seconds: 14,
      at: (1_756_150_000 + 10) * 1000,
    });
    expect(poll.passedOver).toEqual([{ chatId: '1', from: 'Nobody' }]);
    // Both the taken and the passed-over enter the ring: neither is looked at twice.
    expect(poll.seen).toEqual(['10', '12', '13']);
    expect(calls).toEqual(['https://api.telegram.org/bottok/getUpdates']);
  });

  it('skips what the ring already holds and says nothing when nothing is new', async () => {
    const { http } = fake({
      getUpdates: { ok: true, result: [update(10, BRIAN, voice('f-10'))] },
    });
    const poll = await pollVoice({ http, token: 'tok', roster: ROSTER, seen: new Set(['10']) });
    expect(poll).toEqual({ notes: [], passedOver: [], seen: [] });
  });

  it('answers a failing getUpdates as an error with nothing advanced', async () => {
    const { http } = fake({});
    const poll = await pollVoice({ http, token: 'tok', roster: ROSTER, seen: new Set() });
    expect(poll).toEqual({ error: 'Telegram did not answer getUpdates (500)' });
  });

  it('a network that never answers is an error too, never a throw (D-284)', async () => {
    // The shape of the thirteen deaths: fetch rejects with ETIMEDOUT instead
    // of answering, and the sweep that awaits it runs unattended.
    const http: VoiceHttp = async () => {
      throw new TypeError('fetch failed');
    };
    const poll = await pollVoice({ http, token: 'tok', roster: ROSTER, seen: new Set() });
    expect(poll).toEqual({ error: 'Telegram unreachable for getUpdates: fetch failed' });
  });
});

describe('downloadVoice', () => {
  it('asks getFile for the path, then reads the bytes from the file host', async () => {
    const bytes = Buffer.from('OggS-not-really');
    const { http, calls } = fake(
      { getFile: { ok: true, result: { file_id: 'f-10', file_path: 'voice/file_3.oga' } } },
      { 'voice/file_3.oga': bytes },
    );
    const got = await downloadVoice(http, 'tok', 'f-10');
    expect(Buffer.isBuffer(got) && got.equals(bytes)).toBe(true);
    expect(calls).toEqual([
      'https://api.telegram.org/bottok/getFile?file_id=f-10',
      'https://api.telegram.org/file/bottok/voice/file_3.oga',
    ]);
  });

  it('names the step that failed', async () => {
    const { http } = fake({});
    expect(await downloadVoice(http, 'tok', 'f-10')).toEqual({
      error: 'Telegram did not answer getFile (500)',
    });
    const noFile = fake({
      getFile: { ok: true, result: { file_id: 'f-10', file_path: 'gone.oga' } },
    });
    expect(await downloadVoice(noFile.http, 'tok', 'f-10')).toEqual({
      error: 'Telegram did not serve the audio (404)',
    });
  });

  it('a network that never answers names the step it died on, never a throw (D-284)', async () => {
    const dead: VoiceHttp = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await downloadVoice(dead, 'tok', 'f-10')).toEqual({
      error: 'Telegram unreachable for getFile: fetch failed',
    });
    // The path answers, the file host does not.
    const meta = fake({ getFile: { ok: true, result: { file_id: 'f-10', file_path: 'voice/file_3.oga' } } });
    const halfDead: VoiceHttp = async (url) => {
      if (url.includes('/file/bot')) throw new TypeError('fetch failed');
      return meta.http(url);
    };
    expect(await downloadVoice(halfDead, 'tok', 'f-10')).toEqual({
      error: 'Telegram unreachable for the audio: fetch failed',
    });
  });
});

describe('the note store', () => {
  let root = '';
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });
  const note = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    chatId: '1000000001',
    from: 'Brian Thornton',
    at: Number(id) * 1000,
    seconds: 14,
    file: `voice-${id}.oga`,
    ...over,
  });

  it('writes one file per note and lists them oldest first', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    writeVoiceNote(root, note('20', { transcript: 'later' }));
    writeVoiceNote(root, note('10', { transcript: 'earlier' }));
    expect(readVoiceNotes(root).map((n) => n.id)).toEqual(['10', '20']);
    expect(readVoiceNote(root, '20')?.transcript).toBe('later');
    expect(readVoiceNote(root, '99')).toBeNull();
    expect(JSON.parse(readFileSync(voiceNoteFile(root, '10'), 'utf8')).file).toBe('voice-10.oga');
  });

  it('a torn file is skipped, never a crash', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    writeVoiceNote(root, note('10', { transcript: 'fine' }));
    writeFileSync(voiceNoteFile(root, '11'), '{"id": "11", "chat');
    expect(readVoiceNotes(root).map((n) => n.id)).toEqual(['10']);
  });

  it('pending means neither used nor dismissed — an errored note stays so the desk can say so', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    writeVoiceNote(root, note('10', { transcript: 'fine' }));
    writeVoiceNote(root, note('11', { transcript: 'used', usedBy: 'job-1' }));
    writeVoiceNote(root, note('12', { transcript: 'gone', dismissedAt: 5 }));
    writeVoiceNote(root, note('13', { error: 'nothing heard' }));
    expect(pendingVoiceNotes(root).map((n) => n.id)).toEqual(['10', '13']);
  });

  it('usableVoiceNote refuses by name everything but a transcribed, unused note', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    writeVoiceNote(root, note('10', { transcript: 'fine' }));
    writeVoiceNote(root, note('11', { transcript: 'used', usedBy: 'job-1' }));
    writeVoiceNote(root, note('12', { transcript: 'gone', dismissedAt: 5 }));
    writeVoiceNote(root, note('13', { error: 'nothing heard' }));
    writeVoiceNote(root, note('14'));
    expect(usableVoiceNote(root, '10')).toMatchObject({ note: { id: '10' } });
    expect(usableVoiceNote(root, '99')).toEqual({ error: 'no voice note 99' });
    expect(usableVoiceNote(root, '11')).toEqual({
      error: 'voice note 11 already queued job job-1',
    });
    expect(usableVoiceNote(root, '12')).toEqual({ error: 'voice note 12 was dismissed' });
    expect(usableVoiceNote(root, '13')).toEqual({
      error: 'voice note 13 was not transcribed — nothing heard',
    });
    expect(usableVoiceNote(root, '14')).toEqual({
      error: 'voice note 14 is still being transcribed',
    });
  });

  it('the seen ring persists and keeps only the newest ids', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    expect(readVoiceSeen(root)).toEqual([]);
    const ids = Array.from({ length: VOICE_SEEN_CAP + 5 }, (_, i) => String(i));
    writeVoiceSeen(root, ids);
    const kept = readVoiceSeen(root);
    expect(kept).toHaveLength(VOICE_SEEN_CAP);
    expect(kept[0]).toBe('5');
    expect(kept.at(-1)).toBe(String(VOICE_SEEN_CAP + 4));
  });

  it('the audio and the words ride the job under names that say what they are', () => {
    expect(voiceAttachmentName(note('10'))).toBe('voice-10.oga');
    expect(voiceTranscriptName(note('10'))).toBe('voice-10.txt');
  });

  it('a note a restart left mid-read is unread only while its audio is still on disk', () => {
    root = mkdtempSync(path.join(tmpdir(), 'voice-'));
    writeVoiceNote(root, note('10'));
    writeFileSync(path.join(root, 'voice', 'voice-10.oga'), 'OggS');
    writeVoiceNote(root, note('11')); // audio never landed — nothing to read
    writeVoiceNote(root, note('12', { transcript: 'done' }));
    writeVoiceNote(root, note('13', { error: 'nothing heard' }));
    writeVoiceNote(root, note('14', { dismissedAt: 5 }));
    writeFileSync(path.join(root, 'voice', 'voice-14.oga'), 'OggS');
    expect(unreadVoiceNotes(root).map((n) => n.id)).toEqual(['10']);
  });
});
