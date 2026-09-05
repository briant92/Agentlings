import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RefusalReading } from '@agentlings/shared';
import { NEVER_CHANNELS, claimedChannel } from './channel';
import { BOUNDARIES } from './coverage';

/**
 * The refusals file (D-249, D-259): the demand meter. When a sentence at
 * the desk claims a shelf-of-never row (a payment, a licensed act, an act on
 * the world, a channel refused by decision) or names a capability graded
 * not built, one line lands here beside the ledger — when, which level,
 * which row — and nothing of the sentence itself. Two reopen triggers wait
 * on this file showing demand: media generation (D-253) and a planner-only
 * manager (D-257).
 *
 * The keys are the job board's row ids (`BOUNDARIES` in `coverage.ts`), the
 * not-built row's capabilities by name, and the channel shelf's names, so
 * the desk and the board refuse by one vocabulary of rows. The *words* are
 * the desk's own: the board's term lists are written for O*NET duty
 * statements and, read over the 250 distinct sentences this machine had
 * queued by 2026-08-25, fired 29 times on the policy rows and 70 more on
 * `physical` — every one a coding word ("stamps capabilities", "published
 * as of today", "a level pack") and not one a refusal (D-259). A demand
 * meter needs precision before recall: a missed refusal is one uncounted, a
 * phantom is a false reopen signal.
 *
 * The bar every pattern is held to is `fixtures/refusals/desk-sentences.json`
 * — asks, each with the rows it claims, and the bookkeeping, media-reading
 * and coding sentences that claim nothing — because the real prompts on
 * this machine hold almost no finance or media ask and could not show
 * either kind of mistake. Every sentence there was a mistake someone found
 * by typing it; add the next one there before touching a pattern.
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
/** Up to three words between a verb and its object — "make a two-minute video", "push the fix to prod". */
const GAP = String.raw`(?:[\w-]+\s+){0,3}`;
/** Where money goes: what separates "wire the deposit to the landlord" from "wire the deposit so I can do it myself". */
const TO = String.raw`(?:to|into|from|out|back|over|before|by|now|today|tonight|tomorrow)`;
const MONEY = String.raw`(?:\$\s?[0-9]|[0-9][0-9,.]*\s?(?:usd|clp|eur|gbp|dollars|pesos|euros)\b)`;
const re = (source: string) => new RegExp(source, 'i');

interface Claim {
  key: string;
  patterns: RegExp[];
}

/** What a sentence at the desk claims, row by row. Each cites the decision that refuses it. */
export const CLAIMS: Claim[] = [
  {
    // Never moves money or takes it (D-219).
    key: 'money',
    patterns: [
      re(String.raw`\bpays?\s+(?:for|off|out|back|${OBJ})\b(?!\s+itself)`),
      re(String.raw`\bmake\s+(?:a|an|the)\s+(?:payment|transfer|wire|deposit|purchase)\b`),
      re(String.raw`\b(?:transfer|wire|send|move)\s+(?:the\s+|some\s+|all\s+)?(?:(?:money|funds|cash)\s+${TO}\b|${MONEY})`),
      re(String.raw`\b(?:wire|transfer)\s+(?:the|my|our|a|an)\s+(?:deposit|rent|fees?|balance|amount|sum|payment)\s+${TO}\b`),
      re(String.raw`\b(?:reimburses?|refunds?|remits?)\s+${OBJ}\b`),
      re(String.raw`\b(?:run|process|do)\s+(?:the\s+)?payroll(?=\s+for\b|\s*[.,;!]|\s*$)`),
      re(String.raw`\b(?:buy|purchase)\s+${OBJ}\b`),
    ],
  },
  {
    // The decision is yours, and nothing here is a licensed professional (D-229).
    key: 'sign',
    patterns: [
      re(String.raw`\bsigns?\s+(?:for\s+me|${OBJ})\b`),
      re(String.raw`\bon\s+my\s+behalf\b`),
      re(String.raw`\bnotari[sz]e|\bnotary\b`),
      re(String.raw`\bcertif(?:y|ies)\s+${OBJ}\b`),
      re(String.raw`\bprescribes?\b`),
    ],
  },
  {
    // Not an actor: everything that reaches the real world goes through you at review (D-075).
    key: 'act',
    patterns: [
      re(String.raw`\bdeploy\s+(?:to\b|${OBJ}\b)`),
      re(String.raw`\bpublish\s+(?:to\b|on\b|${OBJ}\b)`),
      re(String.raw`\b(?:release|push|ship)\s+${GAP}(?:to\s+)?(?:production|prod|live)\b`),
      re(String.raw`\bgo\s+live\b`),
      re(String.raw`\binstall\s+(?:${OBJ}\s+)?(?:on|onto|to)\s+(?:the\s+)?(?:server|machine|production|prod|vps|box)\b`),
      re(String.raw`\b(?:file|submit)\s+(?:the|my|our|a|an)\s+(?:tax(?:es)?|return|claim|lawsuit|permit)\b`),
    ],
  },
  {
    // Not a chat and not a manager: it takes one job and stops (D-075, D-257).
    key: 'people',
    patterns: [
      re(String.raw`\bsupervise\b`),
      re(String.raw`\bdelegate\s+${OBJ}\b`),
      re(String.raw`\b(?:manage|run|lead|coordinate)\s+(?:the|my|our)\s+(?:team|crew|staff|people|horde|meeting|standup|stand-up)\b`),
      re(String.raw`\bassign\s+(?:the\s+)?(?:tasks?|work|jobs?)\s+to\b`),
      re(String.raw`\b(?:attend|join)\s+(?:the|a|an|my|our)\s+(?:meeting|call|standup|stand-up|interview)\b`),
      re(String.raw`\b(?:call|phone|ring)\s+(?:him|her|them|the\s+(?:client|supplier|vendor|bank|landlord|customer|office))\b`),
      re(String.raw`\b(?:negotiate|interview)\s+(?:with\s+)?(?:the|a|an|him|her|them|my|our)\b`),
      re(String.raw`\bplan\s+(?:the\s+)?(?:crew's|team's|horde's)\s+week\b`),
    ],
  },
  // Decided or measured not-built (D-204, D-229, D-253): no media is made, no
  // design tool driven. A making verb with the medium as its object — a video
  // *summarised* is a file read, and reading is built; a logo *designed* is a
  // drawing, and the designer draws.
  {
    key: 'video',
    patterns: [re(String.raw`\b(?:make|create|produce|generate|record|edit|render|film|shoot)\s+${GAP}(?:videos?|animations?|screencasts?)\b`)],
  },
  {
    key: 'audio',
    patterns: [
      re(String.raw`\b(?:make|create|produce|generate|record|edit|render|mix)\s+${GAP}(?:audio|podcasts?|voice-?overs?|jingles?|soundtracks?|narration|songs?|music)\b`),
    ],
  },
  {
    key: 'image',
    patterns: [
      re(String.raw`\b(?:make|create|produce|generate|render)\s+${GAP}(?:images?|pictures?|photos?|photographs?|illustrations?|artwork|photoreal\w*)\b`),
    ],
  },
  {
    key: 'design-tool',
    patterns: [re(String.raw`\b(?:in|with|using)\s+(?:figma|photoshop|illustrator|autocad|revit|solidworks|sketchup|premiere|after\s+effects)\b`)],
  },
];

export function refusalsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'refusals.jsonl');
}

/**
 * Each key's board row, how the desk names the claim, and what it says the
 * crew will do instead — the second half #22 asked for, because *this asks
 * for a payment* plus the board's *never moves money* tells you only what you
 * will not get. `does` is the desk's alone: `BOUNDARIES.why` is written about
 * a duty on a job posting and has no other side to name, and the board must
 * not learn one here.
 *
 * It is deliberately absent on the not-built row. There is no other side to
 * that line: D-259's own words are that no media is *read* or made, so a
 * consolation sentence there would be the first thing on this line that is
 * not true.
 *
 * The four not-built capabilities share the board's one `not-built` row, so
 * they are named by their medium and the row's reason is said once (a
 * sentence asking for a video and an image would otherwise print the same
 * 160 characters twice).
 */
const READING: Record<string, { row: string; lead: string; does?: string }> = {
  money: {
    row: 'money',
    lead: 'this asks for a payment',
    does: 'It will prepare the payment for you to make.',
  },
  sign: {
    row: 'sign',
    lead: 'this asks the crew to sign or approve',
    // Not "for you to sign": this row also matches *Notarise the power of
    // attorney* and *Prescribe something for the cough*, which you cannot
    // sign either — the board's own reason on this line is that nothing here
    // is a licensed professional, so the offer names the licence, not you.
    does: 'It will draft it; putting a name to it stays with whoever is licensed to.',
  },
  act: {
    row: 'act',
    lead: 'this asks the crew to act on the world',
    // Not "putting it live": *File my tax return for 2025* is on this row and
    // nothing about it goes live. And not "it reaches the world when you
    // approve", which was the first wording — Approve applies a patch or
    // replays a send, and deploys, publishes and files nothing.
    does: 'It will produce the work and hand it over; carrying it out stays yours.',
  },
  people: {
    row: 'people',
    lead: 'this asks the crew to meet or manage people',
    // Not "the room is yours": *Delegate the follow-ups to Ana* and
    // *Supervise the contractors on Monday* have no room in them.
    does: 'It will prepare the material and write up what you decide; dealing with people stays yours.',
  },
  video: { row: 'not-built', lead: 'a video' },
  audio: { row: 'not-built', lead: 'audio' },
  image: { row: 'not-built', lead: 'an image' },
  'design-tool': { row: 'not-built', lead: 'work in a design tool' },
};

/**
 * The board's sentence for a row, **throwing** if the row is not on the board.
 *
 * The alternative was a lookup that fell back to an empty string, which would
 * have painted a lead-in with nothing after it: exactly the desk-and-board
 * drift `refusalRows` below claims is impossible, arriving silently at the one
 * moment it matters. Refusing to start names the problem; a blank line hides
 * it.
 *
 * Exported so that refusal can be *reached*: with the real tables the throw is
 * dead code, and this repo has been bitten by guards that passed by never
 * executing (D-246). A test calls it with a row that is not the board's.
 */
export function boardWhy(row: string): string {
  const boundary = BOUNDARIES.find((b) => b.id === row);
  if (!boundary) throw new Error(`boardWhy: '${row}' is not a job board row`);
  return boundary.why;
}

/**
 * Every row a reading names, with its sentence — resolved once, at load, so a
 * reading pointing off the board stops the server rather than reaching a
 * person. Built from `READING`'s own rows, so the lookup below cannot miss.
 */
const ROW_WHY = new Map(
  [...new Set(Object.values(READING).map((r) => r.row))].map((row) => [row, boardWhy(row)] as const),
);

const listWords = (words: string[]): string =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/**
 * What the desk says about a sentence, one line per board row it claims;
 * `[]` for ordinary work.
 *
 * **The order is `refusalKeys`'s**, which is `CLAIMS`'s — `money, sign, act,
 * people`, then the not-built row where its first medium fell. That is *not*
 * the board's order (`BOUNDARIES` runs `money, people, act, sign`), and the
 * difference is visible: a sentence claiming `sign` and `people` prints them
 * the other way round from the positions board. The order that matters here
 * is the meter's, because the desk's promise is to show what Start would
 * count — so it is stated as the meter's rather than borrowed from the board,
 * and a test pins the one pair that can tell them apart.
 *
 * The reason is `BOUNDARIES.why` **verbatim** — the same string the positions
 * board prints under a red duty, decision cite and all — because the desk and
 * the board saying the same thing has to be a property of one string, not an
 * agreement between two copies free to drift (D-030).
 *
 * A never-channel is deliberately not here, though `refusalKeys` counts one:
 * the ask card has stated that refusal since D-079, in the channel shelf's own
 * words and with the channels that *would* carry it offered beside it — which
 * a line cannot do. A second sentence saying the same thing in another voice
 * is the duplication D-030 warns about, so the rule is written down: a
 * never-channel is refused on the ask card, never on this line.
 *
 * Reading only. Nothing is counted here — the meter stays at Start, at a rule
 * armed and at a reply sent (D-259), because the plan re-runs on every
 * keystroke.
 */
export function refusalRows(text: string): RefusalReading[] {
  const rows: { row: string; keys: string[] }[] = [];
  for (const key of refusalKeys(text)) {
    // A key with no reading. Today that is a never-channel and nothing else —
    // held to it by a test over `CLAIMS`, since this `continue` on its own
    // would swallow a new claim key whose reading somebody forgot.
    const reading = READING[key];
    if (!reading) continue;
    const found = rows.find((r) => r.row === reading.row);
    if (found) found.keys.push(key);
    else rows.push({ row: reading.row, keys: [key] });
  }
  return rows.map(({ row, keys }) => {
    const first = READING[keys[0]!]!;
    return {
      row,
      keys,
      lead:
        row === 'not-built'
          ? `this asks for ${listWords(keys.map((k) => READING[k]!.lead))}`
          : first.lead,
      why: ROW_WHY.get(row)!,
      ...(first.does ? { does: first.does } : {}),
    };
  });
}

/**
 * The rows a sentence claims, each once, in `CLAIMS`'s order above, a
 * never-channel last; `[]` for ordinary work.
 *
 * Said as `CLAIMS`'s and not "the board's", which is what this line claimed
 * from D-259 until #22: `BOUNDARIES` runs `money, people, act, sign` and
 * `CLAIMS` runs `money, sign, act, people`, so the two disagree the moment a
 * sentence claims both `sign` and `people`.
 */
export function refusalKeys(text: string): string[] {
  const keys = CLAIMS.filter((c) => c.patterns.some((p) => p.test(text))).map((c) => c.key);
  // The channel shelf's own gate (D-182): a channel word beside a send verb.
  // A mention alone is D-093's question, never a claim, so it is not a refusal.
  const channel = claimedChannel(text);
  if (channel && NEVER_CHANNELS.includes(channel)) keys.push(channel);
  return keys;
}

/** One line per row the sentence claims; nothing at all when it claims none. Appends as the ledger does (D-259). */
export function recordRefusals(sandboxRoot: string, levelId: string, text: string, at: number): void {
  recordRefusalKeys(sandboxRoot, levelId, refusalKeys(text), at);
}

/**
 * The meter itself, fed keys already read (D-287 Q4): Start counts what its
 * reading claimed, so one read serves the card and the count and the two
 * cannot disagree about what was claimed. A rule armed and a reply sent have
 * no reading and go through `recordRefusals` above, which reads the words.
 */
export function recordRefusalKeys(
  sandboxRoot: string,
  levelId: string,
  keys: readonly string[],
  at: number,
): void {
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
