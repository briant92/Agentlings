import { MAX_ATTACHMENTS } from '@agentlings/shared';
import { claimedChannel } from './channel';
import { OUTBOX_FILE } from './outbox';
import { PAPERWORK } from './outputs';

/**
 * Composite work (D-105): one sentence, several steps — split only where the
 * user said so.
 *
 * The engine's tiers are per job, so a composite sentence falls through to a
 * full session even when its parts are each free: "summarise the expenses
 * CSV, then telegram Brian the total" is a compiled tool and a cheap send
 * wearing a 50c session's clothes. Splitting makes the ladder apply to the
 * parts — each step is an ordinary job with its own recipe key, its own
 * tier and its own quote, and what flows between them is files, not state:
 * a delivered step's outputs land in the next step's input/ like any
 * attachment, which also keeps every answer honestly unbankable.
 *
 * The router's rule governs the split too: **never guess**. What splits is an
 * explicit sequence marker — ", then", "; then", ". Then", "and then", "after
 * that", "next", "finally", a hand-numbered list — or an "and" with a *send*
 * after it and no send before it (D-182), which is the one bare-"and" shape
 * that can be told from a second object. A conditional lead before the first
 * marker refuses ("if the tests pass, then commit" is one instruction), a
 * fragment refuses ("...and then some"),
 * and more steps than MAX_STEPS refuses whole, because past that the box has
 * become a script. The desk shows the split before Start, with "run as one
 * job" one click away — a wrong split is visible, never silent.
 *
 * Deliberately not built here: open-ended goal decomposition, where the app
 * invents the steps. That is M6's question and stays parked — this splits
 * what the user already wrote, nothing more.
 */
export const MAX_STEPS = 3;

/**
 * The explicit sequence markers, and only these.
 *
 * "then" may stand on its own anywhere; the rest need a boundary in front of
 * them, because they are ordinary words elsewhere in a sentence — "the next
 * release" and "after that meeting" are not sequence markers, and only the
 * comma or full stop says a second instruction has started.
 *
 * Bare "and" is absent from *this* list and belongs to `andSplit` below, which
 * splits on exactly one shape and refuses the rest. The old note here said the
 * two readings "are the same shape to any rule that does not understand the
 * words" — true of "and the XLSX" against "and summarise it", and not true of
 * "and telegram Brian the total", which the desk's own send gate can name.
 */
const MARKER =
  /[,;.]?\s+(?:and\s+)?then\s+|[,;.]\s*(?:and\s+)?(?:next|finally|lastly|after\s+that|afterwards|after\s+which)[,]?\s+/i;

/**
 * The one "and" that splits (D-182): the clause after it is a **send**, and
 * the clause before it is not.
 *
 * Bare "and" was refused three times, and the reason stands for almost every
 * sentence: "summarise the CSV and the XLSX" and "read the report and
 * summarise it" are both one job, and no rule that does not understand the
 * words can tell them from two. What changed is that one shape *can* be told
 * apart, and it is the shape D-105's own docstring is about — "summarise the
 * expenses CSV, then telegram Brian the total", a compiled tool and a cheap
 * send wearing a 50c session's clothes. Splitting there is the whole point of
 * splitting; splitting two stages of one analysis buys nothing.
 *
 * Both sides being sends is the exception inside the exception: "email it to
 * Ana and telegram me the headline" is one job on two channels (D-179), and
 * splitting it would undo that entry a week after it landed.
 *
 * `claimedChannel` is the same gate the desk claims a send with, so the
 * splitter and the ask card can never disagree about what a send is.
 */
const AND_JOIN = /,?\s+and\s+/gi;

function andSplit(text: string): string[] | null {
  const parts: string[] = [];
  let from = 0;
  AND_JOIN.lastIndex = 0;
  for (let hit = AND_JOIN.exec(text); hit; hit = AND_JOIN.exec(text)) {
    const before = text.slice(from, hit.index);
    const after = text.slice(hit.index + hit[0].length);
    if (claimedChannel(after) && !claimedChannel(before)) {
      parts.push(before);
      from = hit.index + hit[0].length;
    }
  }
  if (parts.length === 0) return null;
  parts.push(text.slice(from));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * A hand-numbered list — "1. pull the figures 2. check them 3. telegram me".
 *
 * As explicit as a sequence marker gets, and unreachable by MARKER: the user
 * wrote the order out as digits instead of words. Kept a separate rule rather
 * than another branch of MARKER because its evidence is different — a lone
 * "1." proves nothing ("reduce it by 1. Then check"), and what makes this a
 * list is that the numbers start at one, at the very start, and run in order.
 */
const NUMBERED = /(?:^|\s)(\d{1,2})[.)]\s+/g;

function numberedSteps(text: string): string[] | null {
  const marks = [...text.matchAll(NUMBERED)];
  if (marks.length < 2) return null;
  if (marks[0].index !== 0) return null;
  if (marks.some((mark, i) => Number(mark[1]) !== i + 1)) return null;
  return marks
    .map((mark, i) =>
      text.slice((mark.index ?? 0) + mark[0].length, marks[i + 1]?.index ?? text.length).trim(),
    )
    .filter(Boolean);
}

/**
 * A conditional before the first marker means the "then" is a consequence,
 * not a sequence — "if the file exists, then delete it" is one instruction.
 */
const CONDITIONAL_LEAD = /\b(if|when|whenever|unless|until)\b/i;

export function splitSteps(text: string): string[] | null {
  const numbered = numberedSteps(text);
  const first = MARKER.exec(text);
  if (!numbered && !first) {
    // No worded marker at all — the send-"and" is the only thing left that
    // could split this, and it splits nothing else.
    const only = andSplit(text);
    return only ? bounded(only) : null;
  }
  // The conditional guard reads the words before the first marker, and a
  // numbered list has none — its first marker is the string's own start.
  if (!numbered && first && CONDITIONAL_LEAD.test(text.slice(0, first.index))) return null;
  const parts = (
    numbered ??
    text
      .split(new RegExp(MARKER.source, 'gi'))
      .map((part) => part.trim())
      .filter(Boolean)
  )
    // Each worded step may itself end in a send joined by "and" — "…, then
    // write it up and email it to Ana" is a write and a send, the same shape
    // as the whole sentence one level up.
    .flatMap((part) => andSplit(part) ?? [part]);
  return bounded(parts);
}

/** The bounds every split shares, whichever marker found it. */
function bounded(parts: string[]): string[] | null {
  if (parts.length < 2 || parts.length > MAX_STEPS) return null;
  // A one-word part is a fragment the marker tore off ("…and then some"),
  // not a step anyone meant — refuse the whole split rather than queue it.
  if (parts.some((part) => part.split(/\s+/).length < 2)) return null;
  return parts;
}

/**
 * Which of a delivered step's files ride forward as the next step's input.
 * Paperwork stays (the report travels separately as previous-step.md), the
 * outbox is the step's own send, and a patch belongs to promote — none of
 * them is the thing the next step works on.
 */
export function pickForwards(names: string[]): { take: string[]; leftBehind: string[] } {
  const deliverables = names.filter(
    (name) =>
      !PAPERWORK.has(name) &&
      name !== OUTBOX_FILE &&
      name !== 'DIFF.patch' &&
      name !== 'previous-step.md',
  );
  // One slot is the report's: the previous RESULT.md rides beside the files.
  const room = MAX_ATTACHMENTS - 1;
  return { take: deliverables.slice(0, room), leftBehind: deliverables.slice(room) };
}

/**
 * The standing instruction a step job carries (rides Job.brief, D-074's
 * seam): what came before, where its output is, and to do only this step.
 */
export function stepBrief(args: {
  previousPrompt: string;
  n: number;
  of: number;
  forwarded: string[];
  leftBehind: string[];
  hadReport: boolean;
}): string {
  return [
    `## Step ${args.n} of ${args.of}`,
    `This job is one step of a sequence. The step before it did: "${args.previousPrompt}".`,
    ...(args.hadReport
      ? ['Its report is input/previous-step.md — read it first.']
      : ['It left no report behind.']),
    ...(args.forwarded.length
      ? [`Its files are waiting in input/: ${args.forwarded.join(', ')}.`]
      : ['It left no files beyond its report.']),
    ...(args.leftBehind.length
      ? [
          `Too many files to carry — these stayed in the previous step's sandbox: ${args.leftBehind.join(', ')}. Say so in RESULT.md if they were needed.`,
        ]
      : []),
    'Do only this step; any later steps run as their own jobs when this one delivers.',
  ].join('\n');
}
