import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from 'node:fs';
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
 * not even the file. Counted once per sentence, at Start: the plan re-runs
 * on every keystroke, so a line there would be a keystroke meter. A refusal
 * that is queued anyway — the desk warns, it does not block — is still one.
 */
export interface Refusal {
  at: number;
  level: string;
  /** A `BOUNDARIES` id (`money`, `sign`, `act`, `people`, `not-built`) or a never-channel's name. */
  key: string;
}

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
  {
    // Decided or measured not-built: no media is read or made, no design tool driven (D-204, D-229, D-253).
    key: 'not-built',
    patterns: [
      /\b(?:videos?|animations?|animate|podcasts?|voice-?overs?|jingles?|soundtracks?|screencasts?)\b/i,
      /\b(?:audio|sound|music)\s+(?:files?|clips?|tracks?|recordings?)\b/i,
      /\brecord\s+(?:an?\s+|the\s+|my\s+)?(?:audio|voice|sound|narration)\b/i,
      /\b(?:generate|render)\s+(?:an?\s+|the\s+|some\s+)?(?:photoreal\w*|images?|pictures?|photos?)\b/i,
      /\bphotoreal\w*|\b3d[- ]?print\w*/i,
      /\b(?:figma|photoshop|illustrator|autocad|revit|solidworks|sketchup|premiere|after\s+effects)\b/i,
    ],
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

/**
 * Does the file end where a line ends? A torn last line does not, and a
 * record appended straight after it would be torn with it — the reader
 * skips the torn line, so the meter would silently lose a refusal.
 */
function endsAtLineEnd(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    const { size } = fstatSync(fd);
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

/** One line per row the sentence claims; nothing at all when it claims none. */
export function recordRefusals(sandboxRoot: string, level: string, text: string, at: number): void {
  const keys = refusalKeys(text);
  if (keys.length === 0) return;
  mkdirSync(sandboxRoot, { recursive: true });
  const file = refusalsFile(sandboxRoot);
  const lead = existsSync(file) && !endsAtLineEnd(file) ? '\n' : '';
  const lines = keys.map((key) => `${JSON.stringify({ at, level, key } satisfies Refusal)}\n`);
  appendFileSync(file, lead + lines.join(''));
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
