/**
 * The mail-trigger preview line (D-248) — what the desk says about a rule as
 * it is typed, from what `GET /api/trigger/preview` answered.
 *
 * Pure, and kept apart from the panel for D-246's reason: the line is the
 * whole point of the control — a rule that matches nothing must not look like
 * one that works, and a rule that matches everything must say what it would
 * spend — so its four states are pinned here rather than read off a screen.
 *
 * Tones borrow the standing-input row's: `hit` states a fact the server just
 * checked; `miss` is a warning about what was typed, never an error.
 */
export interface TriggerPreviewReply {
  status: number;
  body: { count?: number; more?: boolean; newest?: string; capPerDay?: number; error?: string };
}

export interface PreviewLine {
  tone: 'hit' | 'miss' | 'idle';
  text: string;
}

export function previewLine(reply: TriggerPreviewReply): PreviewLine {
  const { status, body } = reply;
  // A query the server refused (empty, too long): nothing to say yet.
  if (status === 400) return { tone: 'idle', text: '' };
  if (status !== 200) {
    return { tone: 'miss', text: body.error ?? `the preview could not be read (HTTP ${status})` };
  }
  const count = body.count ?? 0;
  const cap = body.capPerDay ?? 10;
  if (count === 0) {
    return {
      tone: 'miss',
      text: 'nothing matched in the last 7 days — the rule can still fire, but check the words',
    };
  }
  if (body.more || count >= cap) {
    return {
      tone: 'miss',
      text: `matched ${cap}${body.more ? '+' : ''} this week — at up to ${cap} firings a day this would spend on nearly every mail`,
    };
  }
  return {
    tone: 'hit',
    text: `matched ${count} in the last 7 days, none from you${body.newest ? ` · newest: ${body.newest}` : ''}`,
  };
}
