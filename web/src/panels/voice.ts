import type { VoiceNote, VoiceStatus } from '@agentlings/shared';

/**
 * How a voice note reads on the desk (D-265): who, how long, when — and then
 * the words, or the reason there are none. The words are quoted, because
 * pressing Use puts exactly them in the box; a reason is stated, because a
 * note that was not transcribed must never look like one that was.
 */

export function voiceLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The head of the line — the facts before the words. */
export function voiceHead(note: VoiceNote, now = Date.now()): string {
  const when = new Date(note.at);
  const sameDay = new Date(now).toDateString() === when.toDateString();
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  const clock = sameDay ? `${hh}:${mm}` : `${when.toLocaleDateString()} ${hh}:${mm}`;
  return `Voice note from ${note.from} · ${voiceLength(note.seconds)} · ${clock}`;
}

/**
 * Why a note cannot be used, in the desk's words — or null when it can. The
 * missing-model case names the one step, because the fix is the person's to
 * run and the desk is where they will read it.
 */
export function voiceHold(note: VoiceNote, transcriber: VoiceStatus): string | null {
  if (note.error) {
    // The transcriber's own state decides the hint, not the wording of the
    // error — a reworded sentence on the server must not lose it.
    return transcriber.installed
      ? `not transcribed — ${note.error}`
      : `not transcribed — the transcriber is not installed on this machine; run npm run voice:install (${transcriber.modelMb} MB, ${transcriber.model}) and send the note again`;
  }
  if (!note.transcript) return 'being transcribed…';
  return null;
}
