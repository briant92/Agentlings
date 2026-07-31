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

/** Something that looks like a file, a path, or a name worth starting from. */
const NAMED_TARGET = /[\w-]+\.[a-z]{1,5}\b|[\w-]+[/\\][\w-]+|`[^`]+`|\b[a-z]+[A-Z]\w*/;

const PRONOUN = /\b(it|this|that|these|those|them)\b/i;

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

export function questionsFor(
  text: string,
  { hasRepo, tier }: { hasRepo: boolean; tier: Quote['tier'] },
): ClarifyQuestion[] {
  if (!text.trim() || !costsMoney(tier)) return [];
  const asked: ClarifyQuestion[] = [];

  if (dangling(text)) {
    asked.push({
      id: 'subject',
      ask: 'What should they work on?',
      hint: 'This asks for something in particular, but not what.',
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

  if (!hasRepo && GATHERING.test(text)) {
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
  context: { hasRepo: boolean; tier: Quote['tier'] },
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
