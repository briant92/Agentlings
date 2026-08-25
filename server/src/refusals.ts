import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NEVER_CHANNELS, claimedChannel } from './channel';

/**
 * The refusals file (D-249, D-259): the demand meter. When a sentence at
 * the desk claims a shelf-of-never row (a payment, a licensed act, an act on
 * the world, a channel refused by decision) or names a capability graded
 * not built, one line lands here beside the ledger — when, which level,
 * which row — and nothing of the sentence itself. Two reopen triggers wait
 * on this file showing demand: media generation (D-253) and a planner-only
 * manager (D-257).
 *
 * The keys are the job board's row ids (`BOUNDARIES` in `coverage.ts`) and
 * the channel shelf's names, so the desk and the board refuse by one
 * vocabulary of rows. The *words* are the desk's own: the board's term
 * lists are written for O*NET duty statements and, read over the 250
 * distinct sentences this machine had queued by 2026-08-25, fired 29 times
 * on the policy rows and 70 more on `physical` — every one a coding word
 * ("stamps capabilities", "published as of today", "a level pack") and not
 * one a refusal (D-259). A demand meter needs precision before recall: a
 * missed refusal is one uncounted, a phantom is a false reopen signal. So a
 * claim here is a verb with its object, held to zero hits on that
 * population; its recall is unmeasured until a real refusal arrives.
 *
 * Soft rows (a send, a watch, a login) are partial work, never refused, and
 * never counted; a wired channel is a send. Ordinary work appends nothing —
 * not even the file. Counted once per sentence, where the desk hands it
 * over — Start, a rule armed, a reply sent — and never at the plan, which
 * re-runs on every keystroke and would make a keystroke meter. A refusal
 * that is queued anyway — the desk warns, it does not block — is still one.
 */
export interface Refusal {
  at: number;
  /** The level's id, as the ledger's `levelId` — #12 joins the two files on it. */
  levelId: string;
  /** A `BOUNDARIES` id (`money`, `sign`, `act`, `people`), a not-built capability's name (`NOT_BUILT`) or a never-channel's name. */
  key: string;
}

/**
 * The not-built row (D-204, D-229, D-253), one key per capability, because
 * the trigger that waits on this file is *media generation* and a Figma ask
 * must not read as demand for it.
 */
export const NOT_BUILT: readonly string[] = ['video', 'audio', 'image', 'design-tool'];

/** The thing a verb acts on — what turns "pay attention" into no claim and "pay the invoice" into one. */
const OBJ = String.raw`(?:the|this|that|it|them|him|her|my|our|his|their|a|an|some|any|each|every|all|\$|[0-9])`;

interface Claim {
  key: string;
  patterns: RegExp[];
}

/** What a sentence at the desk claims, row by row, in the board's order. Each cites the decision that refuses it. */
export const CLAIMS: Claim[] = [
  {
    // Never moves money or takes it (D-219).
    key: 'money',
    patterns: [
      new RegExp(String.raw`\bpays?\s+(?:for|off|out|back|${OBJ})\b`, 'i'),
      /\bmake\s+(?:a|an|the)\s+(?:payment|transfer|wire|deposit|purchase)\b/i,
      /\b(?:transfer|wire|send|move)\s+(?:the\s+|some\s+)?(?:money|funds|cash|\$\s?[0-9]|[0-9][0-9,.]*\s?(?:usd|clp|eur|gbp|dollars|pesos|euros))/i,
      /\b(?:wire|bank)\s+transfer\b/i,
      new RegExp(String.raw`\b(?:remits?|reimburses?|refunds?)\s+${OBJ}\b`, 'i'),
      /\b(?:run|process|do)\s+(?:the\s+)?payroll\b/i,
      new RegExp(String.raw`\b(?:buy|purchase)\s+${OBJ}\b`, 'i'),
    ],
  },
  {
    // The decision is yours, and nothing here is a licensed professional (D-229).
    key: 'sign',
    patterns: [
      new RegExp(String.raw`\bsigns?\s+(?:for\s+me|${OBJ})\b`, 'i'),
      /\bon\s+my\s+behalf\b/i,
      /\bnotari[sz]e|\bnotary\b/i,
      new RegExp(String.raw`\bcertif(?:y|ies)\s+${OBJ}\b`, 'i'),
      /\bprescribes?\b/i,
    ],
  },
  {
    // Not an actor: everything that reaches the real world goes through you at review (D-075).
    key: 'act',
    patterns: [
      new RegExp(String.raw`\bdeploy\s+(?:to\b|${OBJ}\b)`, 'i'),
      new RegExp(String.raw`\bpublish\s+(?:to\b|on\b|${OBJ}\b)`, 'i'),
      new RegExp(String.raw`\b(?:release|push|ship)\s+(?:${OBJ}\s+)?(?:to\s+)?(?:production|prod|live)\b`, 'i'),
      /\bgo\s+live\b/i,
      new RegExp(String.raw`\binstall\s+(?:${OBJ}\s+)?(?:on|onto|to)\s+(?:the\s+)?(?:server|machine|production|prod|vps|box)\b`, 'i'),
      /\b(?:file|submit)\s+(?:the|my|our|a|an)\s+(?:tax(?:es)?|return|claim|lawsuit|permit)\b/i,
    ],
  },
  {
    // Not a chat and not a manager: it takes one job and stops (D-075, D-257).
    key: 'people',
    patterns: [
      /\bsupervise\b/i,
      new RegExp(String.raw`\bdelegate\s+${OBJ}\b`, 'i'),
      /\b(?:manage|run|lead|coordinate)\s+(?:the|my|our)\s+(?:team|crew|staff|people|horde|meeting|standup|stand-up)\b/i,
      /\bassign\s+(?:the\s+)?(?:tasks?|work|jobs?)\s+to\b/i,
      /\b(?:attend|join)\s+(?:the|a|an|my|our)\s+(?:meeting|call|standup|stand-up|interview)\b/i,
      /\b(?:call|phone|ring)\s+(?:him|her|them|the\s+(?:client|supplier|vendor|bank|landlord|customer|office))\b/i,
      /\b(?:negotiate|interview)\s+(?:with\s+)?(?:the|a|an|him|her|them|my|our)\b/i,
      /\bplan\s+(?:the\s+)?(?:crew's|team's|horde's)\s+week\b/i,
    ],
  },
  // Decided or measured not-built (D-204, D-229, D-253): no media is made, no
  // design tool driven. A making verb with the medium as its object — a video
  // *summarised* is a file read, and reading is built.
  {
    key: 'video',
    patterns: [/\b(?:make|create|produce|generate|record|edit|render|film|shoot)\s+(?:[\w-]+\s+){0,3}?(?:videos?|animations?|screencasts?)\b/i],
  },
  {
    key: 'audio',
    patterns: [
      /\b(?:make|create|produce|generate|record|edit|render|mix)\s+(?:[\w-]+\s+){0,3}?(?:audio|podcasts?|voice-?overs?|jingles?|soundtracks?|narration|songs?|music)\b/i,
    ],
  },
  {
    key: 'image',
    patterns: [/\b(?:make|create|produce|generate|render|take)\s+(?:[\w-]+\s+){0,3}?(?:photoreal\w*|photos?|photographs?)\b/i],
  },
  {
    key: 'design-tool',
    patterns: [/\b(?:in|with|using)\s+(?:figma|photoshop|illustrator|autocad|revit|solidworks|sketchup|premiere|after\s+effects)\b/i],
  },
];

export function refusalsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'refusals.jsonl');
}

/** The rows a sentence claims, each once, in the board's order, a never-channel last; `[]` for ordinary work. */
export function refusalKeys(text: string): string[] {
  const keys = CLAIMS.filter((c) => c.patterns.some((re) => re.test(text))).map((c) => c.key);
  // The channel shelf's own gate (D-182): a channel word beside a send verb.
  // A mention alone is D-093's question, never a claim, so it is not a refusal.
  const channel = claimedChannel(text);
  if (channel && NEVER_CHANNELS.includes(channel)) keys.push(channel);
  return keys;
}

/** One line per row the sentence claims; nothing at all when it claims none. Appends as the ledger does (D-259). */
export function recordRefusals(sandboxRoot: string, levelId: string, text: string, at: number): void {
  const keys = refusalKeys(text);
  if (keys.length === 0) return;
  mkdirSync(sandboxRoot, { recursive: true });
  const lines = keys.map((key) => `${JSON.stringify({ at, levelId, key } satisfies Refusal)}\n`);
  appendFileSync(refusalsFile(sandboxRoot), lines.join(''));
}

/** Every refusal on disk; a torn line is skipped, never allowed to lose the rest (as the ledger's are). */
export function readRefusals(sandboxRoot: string): Refusal[] {
  const file = refusalsFile(sandboxRoot);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Refusal];
      } catch {
        return [];
      }
    });
}
