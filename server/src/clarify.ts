import type { ClarifyQuestion, Quote } from '@agentlings/shared';

/**
 * Questions worth asking before any money moves.
 *
 * Deterministic and local by design. The concept matcher already has to work
 * with no auth and no network, and this sits in the same place in the flow —
 * an intake that stops working when the network does would be worse than one
 * that never asked. A model tier could sharpen these later; it must never
 * become what they depend on.
 *
 * Three rules keep it from becoming a form, which is the thing the one-box
 * intake was built not to be:
 *
 *  - never on work that is free, since there is nothing to save;
 *  - never more than a few, so answering stays cheaper than rewording;
 *  - never required, because Start must always work.
 */

/** Above this many questions the box has become a form. */
const MAX_QUESTIONS = 3;

/** Words that name no bound at all, so the run has to invent one. */
const UNBOUNDED =
  /\b(everything|every file|all the|the whole|the entire|properly|better|improve|optimi[sz]e|clean up|tidy|polish|fix up)\b/i;

/** Verbs that go and get something, where the shape of the answer is the job. */
const GATHERING = /\b(find|research|look up|compare|gather|search|price|prices|cost of)\b/i;

/**
 * Verbs that make something. Found by test drive: the rules only knew about
 * *fetching*, so "Produce a PDF" — the vaguest brief the box can take — was
 * asked nothing at all, while a paying session went off to guess what should
 * be in it. Making something is the case where the brief matters most.
 */
const PRODUCING = /\b(produce|write|make|create|draft|generate|prepare|build|design|publish)\b/i;

/** A named output format, so there is no point asking what shape to use. */
const FORMAT_NAMED =
  /\b(pdf|docx?|word|spreadsheet|xlsx?|csv|markdown|md|table|list|note|email|slide|deck|readme)\b/i;

/**
 * Something that says what the thing is *about*. A brief with one of these has
 * a subject, however terse — "a PDF of the ledger" needs no further asking.
 */
const SUBJECT_MATTER =
  /\b(about|of|for|from|with|covering|listing|explaining|summari[sz]ing|comparing|on)\b/i;

/** Something that looks like a file, a path, or a name worth starting from. */
const NAMED_TARGET = /[\w-]+\.[a-z]{1,5}\b|[\w-]+[/\\][\w-]+|`[^`]+`|\b[a-z]+[A-Z]\w*/;

const PRONOUN = /\b(it|this|that|these|those|them)\b/i;

/**
 * Per-channel wording for the recipient hint. Only the hint varies — the ask
 * itself never does, so the queue-time recompute matches whatever card the
 * user answered on even when a fork changed the channel between the two.
 */
const SEND_TO_HINTS: Record<string, string> = {
  gmail: 'A name and email address — no run may invent one.',
  telegram: 'A numeric chat id — each person taps Start on your bot once.',
  'whatsapp-business': 'A number with country code — no run may invent one.',
};

/** Free work has nothing to narrow: a routed answer and a tool both cost zero. */
function costsMoney(tier: Quote['tier']): boolean {
  return tier === 'oneshot' || tier === 'session';
}

/**
 * A pronoun with nothing behind it. The intake is one box and holds no
 * conversation, so "fix it" is not terse — it is unanswerable, and the run
 * will spend real turns guessing what "it" was.
 *
 * Only short sentences qualify. A long one that happens to say "so that it
 * handles empty input" has already said what it means.
 */
function dangling(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length <= 8 && PRONOUN.test(text) && !NAMED_TARGET.test(text);
}

/**
 * Says what to make, but not what to put in it — "Produce a PDF".
 *
 * Length is the guard rather than grammar: a brief long enough to carry a
 * subject usually does, and one that names a file or says what it is *about*
 * has already answered this. Being wrong here costs a question nobody needed,
 * which is why it only ever asks and never blocks.
 */
function contentless(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return (
    words.length <= 8 &&
    PRODUCING.test(text) &&
    !SUBJECT_MATTER.test(text) &&
    !NAMED_TARGET.test(text)
  );
}

export function questionsFor(
  text: string,
  { hasRepo, tier, channel }: { hasRepo: boolean; tier: Quote['tier']; channel?: string },
): ClarifyQuestion[] {
  if (!text.trim() || !costsMoney(tier)) return [];
  const asked: ClarifyQuestion[] = [];

  // A send job asks its two facts first: the outbox contract refuses to
  // invent a recipient or a message (D-075), so a run without them can only
  // spend money asking for them — which a real 6¢ run did, and its whole
  // delivery was the question (D-087). Still never required: the arrest at
  // Start is the client's honesty, not a server gate.
  if (channel) {
    asked.push({
      id: 'send-to',
      ask: 'Who should this go to?',
      hint: SEND_TO_HINTS[channel] ?? 'A name and where to reach them — no run may invent one.',
      options: [],
      freeText: true,
    });
    asked.push({
      id: 'send-say',
      ask: 'What should it say, roughly?',
      hint: 'A line is enough — they write it out properly.',
      options: [],
      freeText: true,
    });
  }

  if (dangling(text)) {
    asked.push({
      id: 'subject',
      ask: 'What should they work on?',
      hint: 'This asks for something in particular, but not what.',
      options: [],
      freeText: true,
    });
  }

  // A brief that says what to make but not what to put in it. Asked before
  // the starting point, because what the thing *is* outranks where to look.
  if (contentless(text)) {
    asked.push({
      id: 'about',
      ask: 'What should go in it?',
      hint: 'Otherwise they have to invent the contents.',
      options: [],
      freeText: true,
    });
  }

  // Measured on this project: every repo run used to open with `ls` before it
  // could do anything, spending one of its turns finding its bearings. A named
  // starting point is the same saving, made before the run rather than during.
  if (hasRepo && !NAMED_TARGET.test(text)) {
    asked.push({
      id: 'target',
      ask: 'Which file or folder should they start from?',
      hint: 'Naming one saves them a turn spent looking.',
      options: [{ label: 'let them find it', answer: 'Search the project for the right place.' }],
      freeText: true,
    });
  }

  // Only where there is no repository: a job that lands in a project already
  // knows what its output is — a change to the code.
  if (!hasRepo && (GATHERING.test(text) || PRODUCING.test(text)) && !FORMAT_NAMED.test(text)) {
    asked.push({
      id: 'shape',
      ask: 'What should come back?',
      options: [
        { label: 'a short answer', answer: 'Answer in a sentence or two.' },
        { label: 'a list', answer: 'Answer as a short list.' },
        { label: 'a table', answer: 'Answer as a table with the figures set out.' },
        { label: 'a written note', answer: 'Write it up as a note in a file.' },
      ],
    });
  }

  if (UNBOUNDED.test(text)) {
    asked.push({
      id: 'scope',
      ask: 'How far should this go?',
      hint: 'Unbounded work is what runs out of turns.',
      options: [
        { label: 'the clearest cases only', answer: 'Do the clearest cases and stop.' },
        { label: 'as far as it takes', answer: 'Be thorough, even if it takes longer.' },
      ],
    });
  }

  return asked.slice(0, MAX_QUESTIONS);
}

/**
 * The answers as lines for the session, in the order they were asked.
 *
 * The questions are recomputed from the same sentence rather than sent back by
 * the caller, which works only because the rules are deterministic — and is
 * what stops a caller inventing instructions the user never saw.
 */
export function clarificationLines(
  text: string,
  context: { hasRepo: boolean; tier: Quote['tier']; channel?: string },
  answers: Record<string, string> | undefined,
): string[] {
  if (!answers) return [];
  const lines: string[] = [];
  for (const question of questionsFor(text, context)) {
    const given = answers[question.id]?.trim();
    if (!given) continue;
    const chosen = question.options.find((o) => o.label === given);
    lines.push(`${question.ask} ${chosen ? chosen.answer : given}`);
  }
  return lines;
}
