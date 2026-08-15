// What the desk makes of a plain sentence, measured against what a person
// would make of it.
//
//   npm run bench:intake            the scorecard
//   npm run bench:intake -- --all   every case, passing ones included
//
// Reads no state and writes none: the roles and skills are the real installed
// catalog, and everything else is a cold level — no crew memory, no recipes,
// no compiled tools — because that is the hardest case and the one every new
// level starts in. Every channel is treated as connected, so what is measured
// is recognition and never wiring.
//
// It calls the real intake functions rather than restating their rules, for
// the reason D-024 gives: a scripted check that reimplements what it checks
// passes by agreeing with itself.
//
// Two kinds of failure are reported apart, and the difference is the whole
// point of running this:
//
//   MISS       — the rule could have fired and did not. Tunable.
//   STRUCTURAL — the label cannot be expressed at all: a chain carries three
//                steps, some channels have no client that could send, and
//                nothing anywhere carries "redact this first". Not tunable;
//                a decision. (One channel per job was on this list until
//                D-179 took it off.)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clarificationLines, questionsFor } from '../server/src/clarify';
import { briefForJob, detectChannelAsk, mentionsChannel } from '../server/src/channel';
import { CHANNELS } from '../server/src/channels';
import { readConnections } from '../server/src/connections';
import { MatchIndex, suggestSetup } from '../server/src/match';
import { wantsOrganize } from '../server/src/organize';
import { FILE_CHANNELS } from '../server/src/outbox';
import { RoleRegistry, listSkills } from '../server/src/roles';
import { decide, type Decision } from '../server/src/router';
import { wantsWithholding } from '../server/src/redact';
import { MAX_STEPS, splitSteps } from '../server/src/steps';
import { quoteFor_ } from '../server/src/quote';
import { CASES, type BenchCase } from './intake-bench-cases';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const index = new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills')));

// The catalog's own connections, every secret present and every one enabled,
// so a channel's state never decides whether its words were recognised.
const connections = readConnections(path.join(ROOT, 'catalog', 'connections.json'));
const env: Record<string, string> = {};
for (const conn of connections) for (const name of Object.keys(conn.secrets ?? {})) env[name] = 'x';
const settings = {
  connections: Object.fromEntries(connections.map((c) => [c.name, true])),
};

// A cold level: nothing learned, nothing compiled, no ledger.
const COLD = mkdtempSync(path.join(tmpdir(), 'agentlings-bench-'));
const QUOTE_CTX = {
  sandboxRoot: COLD,
  registry,
  surfaceFor: () => [] as string[],
  searchToken: () => 'bench',
};

/**
 * `asked` is its own verdict on purpose. A channel word with no send verb
 * beside it is not dropped — the desk surfaces it as a question the user
 * confirms (D-093), and the sentence then routes correctly. That is a
 * materially better outcome than a miss and a materially worse one than
 * recognition, and collapsing it into either would misreport the desk.
 */
type Verdict = 'ok' | 'asked' | 'miss' | 'structural';

interface Check {
  surface: string;
  verdict: Verdict;
  expected: string;
  actual: string;
  why?: string;
}

interface Ran {
  test: BenchCase;
  checks: Check[];
}

/** Everything the desk works out about one sentence, as the routes do it. */
function readSentence(test: BenchCase) {
  const prompt = test.prompt;
  const tools = test.tools ?? ['web'];
  const steps = splitSteps(prompt);
  // A chain is queued one sentence at a time (index.ts queueSentence), so the
  // channel of a chain is whatever its *steps* claim — reading the whole
  // sentence would credit the desk with a detection no job ever gets.
  const sentences = steps ?? [prompt];
  const asks = sentences.map((s) => detectChannelAsk(s, connections, settings, env));
  const ask = asks.find(Boolean) ?? null;
  const channel = ask?.channel ?? ask?.asked;
  const match = suggestSetup(index, roles, prompt);
  const decision: Decision = decide(
    {
      id: '',
      title: '',
      prompt,
      status: 'queued',
      slot: -1,
      createdAt: 0,
      ...(test.hasRepo ? { repoPath: path.join(ROOT) } : {}),
      tools,
    },
    {
      knowledge: [],
      store: [],
      recipes: [],
      tools: [],
      canFetch: tools.includes('web'),
      canSearch: tools.includes('search'),
      capabilities: [],
    },
  );
  const quote = quoteFor_(
    QUOTE_CTX,
    COLD,
    prompt,
    tools,
    match.role,
    test.hasRepo ? ROOT : undefined,
  );
  const carried = [
    ...(ask?.channel && CHANNELS[ask.channel] ? [ask.channel] : []),
    ...(ask?.also ?? [])
      .map((option) => option.channel)
      .filter((name) => CHANNELS[name] && name !== ask?.channel),
  ];
  const context = {
    hasRepo: !!test.hasRepo,
    tier: quote.tier,
    channel,
    // The channels the job would carry, so the card asks what Start will ask
    // (D-179, D-180) — a recipient field per channel.
    channels: carried,
    // No roster on a cold level, which is the safe direction: an unknown name
    // leaves a residue and reads as content-bearing (clarify.ts, bareSend).
    names: [] as string[],
  };
  const questions = questionsFor(prompt, context);
  // Answer everything the desk asked, then ask what a step job actually
  // receives. `queueSentence` re-derives the clarifications from the step's own
  // sentence, so an answer only survives if that step asks the same question.
  const answered = Object.fromEntries(questions.map((q) => [q.id, `<${q.id}>`]));
  const delivered = (steps ?? [prompt]).flatMap((sentence, i) =>
    clarificationLines(
      sentence,
      {
        ...context,
        channel: asks[i]?.channel ?? asks[i]?.asked,
      },
      // The answers ride with the chain, so every step is queued with them
      // and each keeps only the ones its own sentence asks for.
      answered,
    ),
  );
  return {
    steps,
    ask,
    channel,
    // The channels the queued job would carry — the same wired-only rule
    // `queueSentence` settles by (D-179).
    carried,
    // The near-miss the desk questions rather than claims (D-093), per step
    // for the same reason the ask is.
    mention: sentences.map((s) => mentionsChannel(s)).find(Boolean) ?? null,
    match,
    // An organize sentence is forced to the generalist worker by the route
    // (D-132), so the matcher's own answer is not the role that runs.
    role: wantsOrganize(prompt) && registry.get('worker') ? 'worker' : match.role,
    decision,
    quote,
    questions,
    delivered,
    // The brief a *job* gets, not the raw channel contract: `briefForJob` is
    // what the executor calls, and it is where the per-channel blocks and the
    // withholding contract are assembled. Reading `channelBrief` here credited
    // the desk with a brief no run ever sees.
    brief:
      briefForJob(
        { channels: carried.length ? carried : channel ? [channel] : [], prompt },
        () => [],
        () => undefined,
      ) ?? null,
    /**
     * The brief of the step that actually *sends* (D-183) — the last one whose
     * own sentence claims a channel — carrying the chain's withholding flag,
     * set from the whole sentence exactly as `queueSentence` sets it. A chain
     * redacts in one step and sends in another, so asking the whole sentence
     * would credit the desk with a gate the sending job never receives.
     */
    sendBrief: (() => {
      const sentences2 = steps ?? [prompt];
      const last = [...sentences2]
        .reverse()
        .find((s) => detectChannelAsk(s, connections, settings, env));
      if (!last) return null;
      return (
        briefForJob(
          {
            channels: carried.length ? carried : channel ? [channel] : [],
            prompt: last,
            withholding: steps ? wantsWithholding(prompt) : undefined,
          },
          () => [],
          () => undefined,
        ) ?? null
      );
    })(),
  };
}

function run(test: BenchCase): Ran {
  const seen = readSentence(test);
  const checks: Check[] = [];
  const want = test.expect;
  const add = (surface: string, verdict: Verdict, expected: string, actual: string, why?: string) =>
    checks.push({ surface, verdict, expected, actual, ...(why ? { why } : {}) });

  if (want.steps !== undefined) {
    const got = seen.steps?.length ?? null;
    const expected = want.steps === null ? 'one job' : `${want.steps} steps`;
    const actual = got === null ? 'one job' : `${got} steps`;
    if (got === want.steps) add('split', 'ok', expected, actual);
    else if (typeof want.steps === 'number' && want.steps > MAX_STEPS)
      add('split', 'structural', expected, actual, `MAX_STEPS is ${MAX_STEPS}`);
    else add('split', 'miss', expected, actual);
  }

  if (want.channels !== undefined) {
    const claimed = seen.ask?.asked ?? null;
    const questioned = seen.mention?.channel ?? null;
    const expected = want.channels.length ? want.channels.join(' + ') : 'none';
    const actual = claimed
      ? claimed
      : questioned
        ? `not claimed — questioned as ${questioned}`
        : 'none';
    const first = want.channels[0] ?? null;
    // Recognised outright, recovered by a confirmation, or lost — and, when
    // the sentence asks for more than one, whether the job carries them all.
    const one: Verdict =
      first === claimed ? 'ok' : first !== null && first === questioned ? 'asked' : 'miss';
    if (want.channels.length > 1) {
      // One job now sends on every wired channel the sentence asked for
      // (D-179), so the question is no longer "which one survived" but "are
      // they all carried" — a channel no client can send is still a real
      // limit and still counts as structural.
      const carried = new Set(seen.carried);
      const unsendable = want.channels.filter((channel) => !CHANNELS[channel]);
      const missing = want.channels.filter(
        (channel) => !carried.has(channel) && CHANNELS[channel],
      );
      add(
        'channel',
        missing.length > 0 ? 'miss' : unsendable.length > 0 ? 'structural' : 'ok',
        expected,
        carried.size > 0 ? `carries ${[...carried].join(' + ')}` : actual,
        unsendable.length > 0 ? `${unsendable.join(', ')} cannot send at all` : undefined,
      );
      // Structural is not the same as silent. Whatever the job ends up
      // carrying, the desk has to name every other channel the sentence asked
      // for — this is the check that was failing invisibly before D-178.
      const named = new Set([
        seen.ask?.asked,
        ...(seen.ask?.also ?? []).map((option) => option.channel),
      ]);
      const unsaid = want.channels.filter((channel) => !named.has(channel));
      // Every channel the job carries must have a recipient field of its own
      // (D-180) — a card that asks once for two channels is a card that
      // attributes an address to a channel nobody typed it for.
      const asksFor = new Set(
        seen.questions.filter((q) => q.id.startsWith('send-to')).map((q) => q.channel),
      );
      const unasked = seen.carried.filter((channel) => !asksFor.has(channel));
      add(
        'asks-each',
        unasked.length === 0 ? 'ok' : 'miss',
        'a recipient field per channel carried',
        unasked.length === 0
          ? `asks for ${[...asksFor].join(' + ')}`
          : `never asks who on ${unasked.join(', ')}`,
      );
      add(
        'dropped-said',
        unsaid.length === 0 ? 'ok' : 'miss',
        'every channel asked for is named at the desk',
        unsaid.length === 0
          ? `names ${[...named].filter(Boolean).join(' + ')}`
          : `says nothing about ${unsaid.join(', ')}`,
      );
    } else add('channel', one, expected, actual);
  }

  if (want.role !== undefined) {
    const got = seen.role;
    const wanted = Array.isArray(want.role) ? want.role : [want.role];
    add(
      'role',
      wanted.includes(got as string | null) ? 'ok' : 'miss',
      wanted.map((r) => r ?? 'no role').join(' | '),
      `${got ?? 'no role'} (${seen.match.confidence})`,
    );
  }

  // What the user typed at the desk, against what the job that needs it gets.
  // Only meaningful for a chain: an unsplit job is queued from the very
  // answers it was quoted on.
  if (seen.steps && want.channels?.length) {
    const wantedFacts = ['send-to', 'send-say'].filter((id) =>
      seen.questions.some((q) => q.id === id),
    );
    if (wantedFacts.length) {
      const arrived = wantedFacts.filter((id) => seen.delivered.some((l) => l.includes(`<${id}>`)));
      add(
        'handoff',
        arrived.length === wantedFacts.length ? 'ok' : 'miss',
        `${wantedFacts.join(', ')} reach the sending step`,
        arrived.length ? arrived.join(', ') : 'none of them do',
        'each step is queued from its own sentence, with no answers',
      );
    }
  }

  if (want.tier !== undefined) {
    const wanted = Array.isArray(want.tier) ? want.tier : [want.tier];
    add(
      'tier',
      wanted.includes(seen.decision.kind) ? 'ok' : 'miss',
      wanted.join(' | '),
      seen.decision.kind,
    );
  }

  if (want.asks) {
    const ids = seen.questions.map((q) => q.id);
    const missing = want.asks.filter((id) => !ids.includes(id));
    add(
      'clarify',
      missing.length === 0 ? 'ok' : 'miss',
      `asks ${want.asks.join(', ')}`,
      ids.length ? ids.join(', ') : 'nothing',
    );
  }
  if (want.asksNot) {
    const ids = seen.questions.map((q) => q.id);
    const wrong = want.asksNot.filter((id) => ids.includes(id));
    add(
      'clarify',
      wrong.length === 0 ? 'ok' : 'miss',
      `never asks ${want.asksNot.join(', ')}`,
      ids.length ? ids.join(', ') : 'nothing',
    );
  }

  if (want.organize !== undefined) {
    const got = wantsOrganize(test.prompt);
    add('organize', got === want.organize ? 'ok' : 'miss', String(want.organize), String(got));
  }

  // Can this sentence's file actually ride? The brief is what tells a session
  // that "files" exists at all, so its absence is the whole answer.
  if (want.attaches) {
    const allowed = seen.channel ? FILE_CHANNELS.has(seen.channel) : false;
    const told = seen.brief?.includes('"files"') ?? false;
    if (told) add('attach', 'ok', 'file may ride', `${seen.channel} carries files`);
    else if (seen.channel && !allowed)
      add(
        'attach',
        'structural',
        'file may ride',
        `${seen.channel} cannot carry files`,
        'nothing at intake says so',
      );
    else add('attach', 'miss', 'file may ride', 'no channel settled, so no brief');
  }

  // Withholding, and recurrence: probed rather than assumed absent, so this
  // check starts passing by itself the day a surface for either is built.
  if (want.redacts) {
    // Recognised at all (D-181). Everything else follows from this: the
    // shortcut tiers are refused on it and the brief is written from it.
    const noticed = wantsWithholding(test.prompt);
    // A shortcut tier cannot withhold anything — a banked answer and a
    // compiled tool were both decided before the instruction existed.
    const shortcut = ['answer', 'tool', 'compose'].includes(seen.decision.kind);
    // And where there is a send, the session has to be told the contract it
    // will be judged against. Where there is none, there is nothing to gate:
    // the sentence is the session's own instruction and no message goes out.
    // Read off the *sending step*, not the whole sentence (D-183). A four-step
    // chain redacts in one step and sends in another, and asking the whole
    // sentence would credit the desk with a gate the sending job never gets —
    // measured: without the chain flag this check drops to 3 of 4.
    const told = seen.sendBrief ? seen.sendBrief.includes('WITHHELD.json') : true;
    const ok = noticed && !shortcut && told;
    add(
      'redact',
      ok ? 'ok' : 'miss',
      'recognised, kept off the shortcut tiers, and the contract told',
      !noticed
        ? 'the sentence is not read as withholding anything'
        : shortcut
          ? `routed to ${seen.decision.kind}, which cannot withhold`
          : told
            ? 'recognised and briefed'
            : 'a send with no withholding contract in its brief',
    );
  }
  if (want.recurs) {
    const heard = seen.questions.map((q) => q.ask).join(' ');
    const carries = /every|cadence|schedule|repeat/i.test(heard);
    add(
      'recurring',
      carries ? 'ok' : 'structural',
      'the cadence is recognised',
      carries ? 'carried' : 'queued once, silently',
      'a schedule is made in the UI; no sentence creates one',
    );
  }

  return { test, checks };
}

const results = CASES.map(run);
const showAll = process.argv.includes('--all');

const ICON: Record<Verdict, string> = {
  ok: 'ok  ',
  asked: 'ASK ',
  miss: 'MISS',
  structural: 'STRU',
};

console.log(`\nIntake benchmark — ${CASES.length} sentences, ${roles.length} roles installed\n`);

// Per surface.
const surfaces = [...new Set(results.flatMap((r) => r.checks.map((c) => c.surface)))];
console.log('surface       ok  asked   miss  structural');
for (const surface of surfaces) {
  const checks = results.flatMap((r) => r.checks).filter((c) => c.surface === surface);
  const cell = (v: Verdict) => String(checks.filter((c) => c.verdict === v).length).padStart(5);
  console.log(`${surface.padEnd(11)} ${cell('ok')} ${cell('asked')} ${cell('miss')} ${cell('structural')}`);
}

// Per family.
console.log('\nfamily            cases  clean');
const families = [...new Set(CASES.map((c) => c.family))];
for (const family of families) {
  const mine = results.filter((r) => r.test.family === family);
  const clean = mine.filter((r) => r.checks.every((c) => c.verdict === 'ok')).length;
  console.log(`${family.padEnd(17)} ${String(mine.length).padStart(5)}  ${String(clean).padStart(5)}`);
}

// The cases themselves.
for (const { test, checks } of results) {
  const clean = checks.every((c) => c.verdict === 'ok');
  if (clean && !showAll) continue;
  console.log(`\n[${test.id}] ${test.prompt}`);
  if (test.note) console.log(`  · ${test.note}`);
  for (const check of checks) {
    if (check.verdict === 'ok' && !showAll) continue;
    console.log(
      `  ${ICON[check.verdict]} ${check.surface}: wanted ${check.expected} — got ${check.actual}${
        check.why ? ` [${check.why}]` : ''
      }`,
    );
  }
}

const all = results.flatMap((r) => r.checks);
const clean = results.filter((r) => r.checks.every((c) => c.verdict === 'ok')).length;
console.log(
  `\n${clean}/${results.length} sentences handled exactly right; ` +
    `${all.filter((c) => c.verdict === 'asked').length} recovered by asking, ` +
    `${all.filter((c) => c.verdict === 'miss').length} misses, ` +
    `${all.filter((c) => c.verdict === 'structural').length} structural gaps, ` +
    `of ${all.length} checks.\n`,
);
