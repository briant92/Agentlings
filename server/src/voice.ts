import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { VoiceNote } from '@agentlings/shared';
import { seenChat, type TelegramChat } from './audience';

/**
 * A voice note is a sentence (D-265, #17). An audio note arriving on Telegram
 * — the bot's own getUpdates, polled like the roster reads it (D-253: polled,
 * never delivered) — is transcribed on this machine and reaches the desk as
 * text, where it is quoted back and confirmed exactly as a typed sentence is.
 * Nothing here queues: the sweep writes notes, the desk takes one by pressing
 * Start with its id, and the audio rides the job's `input/` so the words can
 * be checked against it.
 *
 * Only the roster's notes are taken. Whoever tapped Start or was ever sent to
 * is in `audience/telegram.json` (D-122); a stranger's note is passed over by
 * name and enters the seen ring so it is not looked at again.
 */

/** Update ids remembered so a restart does not re-transcribe the day's notes. */
export const VOICE_SEEN_CAP = 500;
/** A note past this is refused by name — a monologue, not a sentence. */
export const MAX_VOICE_SECONDS = 600;

/**
 * The network seam, injected so a test never touches Telegram. It is the
 * roster's own getUpdates seam (`telegramChats`) widened by `arrayBuffer`,
 * because the file host answers bytes — not the library's `Http` (D-187),
 * whose response is text and whose every double would have to grow a
 * member it never uses. The global fetch satisfies it as it stands.
 */
export type VoiceHttp = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** One voice message as the poll read it, before any bytes are fetched. */
export interface IncomingVoice {
  /** Telegram's update id. */
  id: string;
  chatId: string;
  from: string;
  /** Sent at, ms. */
  at: number;
  fileId: string;
  seconds: number;
}

export interface VoicePoll {
  /** Oldest first, so two notes in a row reach the desk in the order spoken. */
  notes: IncomingVoice[];
  /** Voice notes from chats not on the roster — named, never transcribed. */
  passedOver: { chatId: string; from: string }[];
  /** Ids to add to the ring: the taken and the passed over alike. */
  seen: string[];
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    date?: number;
    chat?: TelegramChat;
    voice?: { file_id?: string; duration?: number };
  };
}

/**
 * One Telegram call as an answer or an error, never a throw. A network that
 * times out rejects the fetch rather than answering it, and this poll runs
 * unattended four times a minute: an escaped rejection here killed the whole
 * server thirteen times in ten days (D-284) before anyone read the log.
 */
async function reach(
  http: VoiceHttp,
  url: string,
  step: string,
): Promise<Awaited<ReturnType<VoiceHttp>> | { error: string }> {
  try {
    return await http(url);
  } catch (err) {
    return { error: `Telegram unreachable for ${step}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * One poll, pure over what Telegram answered: nothing here writes. The caller
 * records the ring and fetches the audio. A failing call is an error with
 * nothing advanced, so the next sweep asks the same question again.
 */
export async function pollVoice(opts: {
  http: VoiceHttp;
  token: string;
  roster: ReadonlySet<string>;
  seen: ReadonlySet<string>;
}): Promise<VoicePoll | { error: string }> {
  const reply = await reach(opts.http, `https://api.telegram.org/bot${opts.token}/getUpdates`, 'getUpdates');
  if ('error' in reply) return reply;
  if (!reply.ok) return { error: `Telegram did not answer getUpdates (${reply.status})` };
  const body = (await reply.json()) as { result?: TelegramUpdate[] };
  const notes: IncomingVoice[] = [];
  const passedOver: VoicePoll['passedOver'] = [];
  const seen: string[] = [];
  for (const update of body.result ?? []) {
    const message = update.message;
    const voice = message?.voice;
    const chat = seenChat(message?.chat);
    if (typeof update.update_id !== 'number' || !voice?.file_id || !chat) continue;
    const id = String(update.update_id);
    if (opts.seen.has(id)) continue;
    seen.push(id);
    if (!opts.roster.has(chat.id)) {
      passedOver.push({ chatId: chat.id, from: chat.name });
      continue;
    }
    notes.push({
      id,
      chatId: chat.id,
      from: chat.name,
      at: (message?.date ?? 0) * 1000,
      fileId: voice.file_id,
      seconds: voice.duration ?? 0,
    });
  }
  notes.sort((a, b) => Number(a.id) - Number(b.id));
  seen.sort((a, b) => Number(a) - Number(b));
  return { notes, passedOver, seen };
}

/** The bytes of one voice note: getFile names the path, the file host serves it. */
export async function downloadVoice(
  http: VoiceHttp,
  token: string,
  fileId: string,
): Promise<Buffer | { error: string }> {
  const meta = await reach(
    http,
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    'getFile',
  );
  if ('error' in meta) return meta;
  if (!meta.ok) return { error: `Telegram did not answer getFile (${meta.status})` };
  const body = (await meta.json()) as { result?: { file_path?: string } };
  const filePath = body.result?.file_path;
  if (!filePath) return { error: 'Telegram named no file path for the note' };
  const file = await reach(http, `https://api.telegram.org/file/bot${token}/${filePath}`, 'the audio');
  if ('error' in file) return file;
  if (!file.ok) return { error: `Telegram did not serve the audio (${file.status})` };
  return Buffer.from(await file.arrayBuffer());
}

// ── the note store: one JSON per note beside its audio, under .agentlings/voice ──

export function voiceDir(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'voice');
}

export function voiceNoteFile(sandboxRoot: string, id: string): string {
  return path.join(voiceDir(sandboxRoot), `${id}.json`);
}

/** Where the note's audio sits — the same name it rides the job under. */
export function voiceAudioFile(sandboxRoot: string, note: VoiceNote): string {
  return path.join(voiceDir(sandboxRoot), note.file);
}

/** `voice-<id>.oga`: what the audio is called both on disk and in a job's input/. */
export function voiceAttachmentName(note: { id: string }): string {
  return `voice-${note.id}.oga`;
}

/**
 * `voice-<id>.txt`: the words as transcribed, riding `input/` beside the
 * audio — the ticket's "so the transcript can be checked against it" holds
 * from the job alone, whatever the desk edited the sentence into.
 */
export function voiceTranscriptName(note: { id: string }): string {
  return `voice-${note.id}.txt`;
}

/** Notes a restart left mid-read: on disk with neither words nor reason, audio present. */
export function unreadVoiceNotes(sandboxRoot: string): VoiceNote[] {
  return readVoiceNotes(sandboxRoot).filter(
    (note) =>
      !note.transcript &&
      !note.error &&
      !note.dismissedAt &&
      !note.usedBy &&
      existsSync(voiceAudioFile(sandboxRoot, note)),
  );
}

export function writeVoiceNote(sandboxRoot: string, note: VoiceNote): void {
  mkdirSync(voiceDir(sandboxRoot), { recursive: true });
  writeFileSync(voiceNoteFile(sandboxRoot, note.id), `${JSON.stringify(note, null, 2)}\n`);
}

export function readVoiceNote(sandboxRoot: string, id: string): VoiceNote | null {
  const file = voiceNoteFile(sandboxRoot, id);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as VoiceNote;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null; // a torn write is the next sweep's to finish, not a crash
  }
}

/** Every note on disk, oldest first. */
export function readVoiceNotes(sandboxRoot: string): VoiceNote[] {
  const dir = voiceDir(sandboxRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== SEEN_FILE)
    .map((name) => readVoiceNote(sandboxRoot, name.slice(0, -'.json'.length)))
    .filter((note): note is VoiceNote => note !== null)
    .sort((a, b) => a.at - b.at || Number(a.id) - Number(b.id));
}

/** What waits at the desk: neither queued nor dismissed. An errored note waits too, so the desk can say why. */
export function pendingVoiceNotes(sandboxRoot: string): VoiceNote[] {
  return readVoiceNotes(sandboxRoot).filter((note) => !note.usedBy && !note.dismissedAt);
}

/**
 * The one check Start makes before a note's audio rides a job. Every refusal
 * names the note and the reason — a note that was never transcribed cannot
 * become a sentence by being pressed.
 */
export function usableVoiceNote(
  sandboxRoot: string,
  id: string,
): { note: VoiceNote } | { error: string } {
  const note = readVoiceNote(sandboxRoot, id);
  if (!note) return { error: `no voice note ${id}` };
  if (note.usedBy) return { error: `voice note ${id} already queued job ${note.usedBy}` };
  if (note.dismissedAt) return { error: `voice note ${id} was dismissed` };
  if (note.error) return { error: `voice note ${id} was not transcribed — ${note.error}` };
  if (!note.transcript) return { error: `voice note ${id} is still being transcribed` };
  return { note };
}

const SEEN_FILE = 'seen.json';

/** The update ids already looked at, oldest first. */
export function readVoiceSeen(sandboxRoot: string): string[] {
  const file = path.join(voiceDir(sandboxRoot), SEEN_FILE);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Kept to the newest VOICE_SEEN_CAP: Telegram forgets an update after a day, so can we. */
export function writeVoiceSeen(sandboxRoot: string, ids: string[]): void {
  mkdirSync(voiceDir(sandboxRoot), { recursive: true });
  writeFileSync(
    path.join(voiceDir(sandboxRoot), SEEN_FILE),
    `${JSON.stringify(ids.slice(-VOICE_SEEN_CAP))}\n`,
  );
}
