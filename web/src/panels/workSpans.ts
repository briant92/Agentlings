import type { WorkPlan, WorkSpan } from '@agentlings/shared';

/**
 * The work box's live highlight, as pure functions (D-177's lesson: a
 * condition inside a component is structurally unreachable to the web suite).
 *
 * Everything here renders what the server's plan already computed — the
 * overlay and the ghost never change what gets queued; only the user taking
 * a ghost with Tab edits the sentence, and that edit re-plans like any typed
 * one (D-093: correction is the user's move, never the matcher's).
 */

/** A run of the sentence: plain, or under one span's underline. */
export interface PaintPiece {
  text: string;
  category?: WorkSpan['category'];
}

/** A suggestion offered at the caret, located in the box's own text. */
export interface Ghost {
  start: number;
  end: number;
  suggestion: string;
}

/**
 * The plan's spans mapped onto what the box actually holds. The server
 * computed offsets over the trimmed sentence, the box shows the untrimmed
 * one, and the plan lags the keystrokes by a debounce — so offsets shift by
 * the leading whitespace, a plan for other words paints nothing, and every
 * span is checked against the very characters it claims before it is used.
 */
export function usableSpans(
  text: string,
  plannedFor: string,
  spans: WorkSpan[] | undefined,
): WorkSpan[] {
  if (!spans || text.trim() !== plannedFor) return [];
  const lead = text.length - text.trimStart().length;
  return spans
    .map((s) => ({ ...s, start: s.start + lead, end: s.end + lead }))
    .filter((s) => text.slice(s.start, s.end) === s.word);
}

/** The sentence cut into plain and underlined runs, in order, lossless. */
export function paintPieces(text: string, spans: WorkSpan[]): PaintPiece[] {
  const pieces: PaintPiece[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at) pieces.push({ text: text.slice(at, span.start) });
    pieces.push({ text: text.slice(span.start, span.end), category: span.category });
    at = span.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

/**
 * The brand a channel word wears — the chip's colour class, keyed by the
 * word itself because a WorkSpan carries no channel. Covers only the channels
 * the app already draws a mark for (ChannelLogo's set); any other channel
 * word keeps the plain channel underline. If the server's tables learn a new
 * word before this legend does, the fallback shows — cosmetic only, never a
 * routing claim.
 */
const WORD_BRAND: Record<string, string> = {
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  whatsappbusiness: 'whatsapp',
  mail: 'gmail',
  email: 'gmail',
  gmail: 'gmail',
  slack: 'slack',
  sms: 'sms',
  discord: 'discord',
  calendar: 'calendar',
  github: 'github',
};

export function chipChannel(word: string): string | null {
  return WORD_BRAND[word.toLowerCase().replace(/[\s-]+/g, '')] ?? null;
}

/**
 * The overlay class for a piece — one per span category, plain runs bare. A
 * channel word with a known brand adds the brand chip class on top of its
 * category class.
 */
export function paintClass(
  category: WorkSpan['category'] | undefined,
  word?: string,
): string | undefined {
  if (!category) return undefined;
  if (category === 'channel-word' && word) {
    const brand = chipChannel(word);
    if (brand) return `wi-channel-word chan-${brand}`;
  }
  return `wi-${category}`;
}

/**
 * The ghost to offer: the caret sitting in, or immediately after, a word the
 * plan holds a suggestion for. Spans arrive already mapped by `usableSpans`,
 * so the offsets are the box's own.
 */
export function ghostFor(
  caret: number,
  spans: WorkSpan[],
  suggestions: WorkPlan['suggestions'] | undefined,
): Ghost | null {
  for (const span of spans) {
    if (span.category !== 'gap-suggestion') continue;
    if (caret < span.start || caret > span.end) continue;
    const match = suggestions?.find((s) => s.word === span.word.toLowerCase());
    if (match) return { start: span.start, end: span.end, suggestion: match.suggestion };
  }
  return null;
}

/** Tab took the ghost: the flagged word replaced, the caret after the fix. */
export function acceptGhost(text: string, ghost: Ghost): { next: string; caret: number } {
  return {
    next: text.slice(0, ghost.start) + ghost.suggestion + text.slice(ghost.end),
    caret: ghost.start + ghost.suggestion.length,
  };
}

/**
 * Which underline a word on the "nothing covers" line wears — the same
 * legend as the box above it, read from the same merged spans, so the two
 * never disagree about a word. A gap the channel detectors claimed ("send"
 * is a catalog gap and the send verb at once) keeps the channel colour, and
 * its suggestion is not offered anywhere — the merge already preferred the
 * channel reading.
 */
export function gapClass(
  word: string,
  spans: WorkSpan[] | undefined,
  suggestions: WorkPlan['suggestions'] | undefined,
): string {
  const span = spans?.find((s) => s.word.toLowerCase() === word);
  if (span && span.category !== 'gap' && span.category !== 'gap-suggestion') {
    return paintClass(span.category, span.word)!;
  }
  return suggestions?.some((s) => s.word === word) ? 'wi-gap-suggestion' : 'wi-gap';
}
