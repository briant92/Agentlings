import type { Agentling, Job, Quote, RoleInfo, WorkPlan } from '@agentlings/shared';
import { questionsFor } from './clarify';
import { MatchIndex, suggestSetup } from './match';
import type { NewJobSpec } from './queue';

/** Used by tests that are about routing rather than pricing. */
const NO_QUOTE: Quote = {
  tier: 'session',
  ceilingUsd: 0,
  samples: 0,
  certainty: 'estimated',
  wording: '',
};

/**
 * Work intake: one sentence in, a queued job out. The user names an outcome
 * ("add tests for the payment module"); the app derives the title, matches
 * the role, and picks who takes it. Nothing here is guesswork the user can't
 * see — the plan is shown before anything is queued.
 */

const MAX_TITLE = 52;

/** A short title from the user's own words — never a summary they didn't write. */
export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (!clean) return 'Untitled job';
  // Cut at the first clause if there is one, then at a word boundary.
  const clause = clean.split(/[,;:]| — | - /)[0].trim() || clean;
  let title = clause;
  if (title.length > MAX_TITLE) {
    const cut = title.slice(0, MAX_TITLE);
    const space = cut.lastIndexOf(' ');
    title = (space > 20 ? cut.slice(0, space) : cut).trim() + '…';
  }
  return title[0].toUpperCase() + title.slice(1);
}

/**
 * Who takes the job: an idle holder of the matched role, then any holder,
 * then whoever is idle. Returns null only when the level has no crew.
 */
export function pickAgentling(crew: Agentling[], role: string | null): Agentling | null {
  if (crew.length === 0) return null;
  const idle = (a: Agentling) => a.state === 'idle';
  const holds = (a: Agentling) => a.role === role;
  return (
    crew.find((a) => holds(a) && idle(a)) ??
    crew.find(holds) ??
    crew.find(idle) ??
    crew[0]
  );
}

/**
 * The plan for a job whose role the *route* decides, not the sentence.
 *
 * Authoring a world arrives by a button rather than by words (D-110), so
 * there is no sentence for the matcher to read and no reason to make it
 * guess. The route names the role and this re-picks the taker for it.
 *
 * `confidence` becomes 1 because it describes how sure the *choice* is, and a
 * route that names a role is certain. What it deliberately does not do is
 * pretend the role is held: `noOneHasRole` is recomputed from the real crew,
 * so `runnerRole` still prices the job under whoever will actually run it.
 * Forcing a role nobody holds must change the plan's story, not its price.
 */
export function forceRole(plan: WorkPlan, role: string, crew: Agentling[]): WorkPlan {
  const taker = pickAgentling(crew, role);
  return {
    ...plan,
    role,
    agentling: taker ? { id: taker.id, name: taker.name, role: taker.role } : null,
    noOneHasRole: !crew.some((a) => a.role === role),
    confidence: 1,
  };
}

export function planWork(
  index: MatchIndex,
  roles: RoleInfo[],
  crew: Agentling[],
  levelRepoPath: string | undefined,
  text: string,
  quote: Quote = NO_QUOTE,
): WorkPlan {
  const match = suggestSetup(index, roles, text);
  const taker = pickAgentling(crew, match.role);
  return {
    title: titleFrom(text),
    role: match.role,
    agentling: taker ? { id: taker.id, name: taker.name, role: taker.role } : null,
    noOneHasRole: !!match.role && !crew.some((a) => a.role === match.role),
    confidence: match.confidence,
    // Asked once per level: undefined means never asked, '' means declined.
    needsRepo: levelRepoPath === undefined,
    repoPath: levelRepoPath ?? '',
    quote,
    gaps: match.gaps,
    // Priced first, then asked: whether a question is worth the user's time
    // depends on whether the run costs anything, which only the quote knows.
    questions: questionsFor(text, { hasRepo: !!levelRepoPath, tier: quote.tier }),
  };
}

/**
 * The role that will actually do the work, which is not always the one the
 * matcher named.
 *
 * A job routed to a role nobody holds is picked up by whoever is free (see
 * Queue.nextUnassigned), and the session then runs as *their* role — their
 * prompt, their tools, their turn cap. Pricing it as the absent specialist
 * quotes for work that will not happen, off a history that will never exist.
 * Measured 2026-07-31: two phrasings of one job matched `scribe` and `mason`,
 * and since nobody is a mason that quote fell through to a tier average,
 * swinging the same work between "about 15c, high confidence" and "up to 50c,
 * first time".
 */
export function runnerRole(plan: WorkPlan): string | null {
  // The matcher naming *nobody* is the same situation and was not treated as
  // one. Below `MIN_CONFIDENCE` it declines rather than guesses, which is right
  // — but the job is still going to be picked up and run by someone, and
  // pricing it under `null` finds no history at all.
  //
  // Measured on the economic-indicators job: matched at 0.24 confidence, so
  // `role` was null, so `history()` looked up a class no ledger row carries and
  // returned nothing, so every quote fell through to the tier average and said
  // "first time doing this" — on the sixth run of that sentence, all six of
  // them recorded under `worker`. The third form of one fault: D-026 and D-029
  // fixed the class being *wrong*, `quoteClass` fixed it being the wrong
  // *field*, and this is it being absent.
  if (!plan.role || plan.noOneHasRole) return plan.agentling?.role ?? plan.role;
  return plan.role;
}

/**
 * How a queued job is specced, wherever it was queued from.
 *
 * The two routes in differ only in what they are handed — `/work` derives the
 * title and uses the level's repository, `POST /jobs` keeps the caller's title
 * and takes no repository unless given one — and they must not differ in
 * anything else. They did: `/jobs` queued work with no `quotedUsd` at all, so
 * `turnsForBudget` never bound and the run silently fell back to the role's
 * cap, which is an unquoted way into a system whose whole cost story is that
 * the quote binds before the money moves.
 *
 * So the parts that must never drift live here rather than at each call site:
 * a ceiling is always carried, and the role is always settled — quoting on one
 * role while another runs the session is its own recorded bug.
 */
export function queuedJobSpec(args: {
  title: string;
  prompt: string;
  repoPath?: string;
  tools?: string[];
  plan: WorkPlan;
  quote: Quote;
  clarifications?: string[];
  attachments?: { name: string; data: Buffer }[];
  /** The job this one answers, whose sandbox it carries forward. */
  continues?: string;
  /** Standing instructions for the session, kept out of the prompt (D-074). */
  brief?: string;
  /** The channel this job sends on, when intake detected one (D-079). */
  channel?: string;
  /** The folder this job reorganizes, picked at intake (D-132). */
  organizeRoot?: string;
  /** Recipient and words both, when the desk holds the whole send (D-097). */
  send?: { to: string; words: string };
  /** A mentioned channel the job never carried (D-093), for the review. */
  channelMention?: { channel: string; label: string };
  /** The sentences still to run after this one (D-105). */
  steps?: string[];
  /** Which step this job is, for the cards. */
  step?: { n: number; of: number };
}): {
  title: string;
  prompt: string;
  repoPath?: string;
  tools?: string[];
  preferredRole?: string;
  quotedUsd?: number;
  clarifications?: string[];
  attachments?: { name: string; data: Buffer }[];
  continues?: string;
  brief?: string;
  channel?: string;
  organizeRoot?: string;
  send?: { to: string; words: string };
  channelMention?: { channel: string; label: string };
  steps?: string[];
  step?: { n: number; of: number };
} {
  return {
    title: args.title,
    prompt: args.prompt,
    repoPath: args.repoPath,
    ...(args.tools?.length ? { tools: args.tools } : {}),
    ...(args.clarifications?.length ? { clarifications: args.clarifications } : {}),
    ...(args.attachments?.length ? { attachments: args.attachments } : {}),
    ...(args.plan.role ? { preferredRole: args.plan.role } : {}),
    ...(args.continues ? { continues: args.continues } : {}),
    ...(args.brief ? { brief: args.brief } : {}),
    ...(args.channel ? { channel: args.channel } : {}),
    ...(args.organizeRoot ? { organizeRoot: args.organizeRoot } : {}),
    // Dropped here once, and the route, the type and the router were all
    // correct while the job reached the queue without it — the field this
    // function does not name does not exist, and spreading it into the call
    // slips past excess-property checking. The 16.7¢ session that composed a
    // message the desk was already holding is the receipt (D-097).
    ...(args.send ? { send: args.send } : {}),
    ...(args.channelMention ? { channelMention: args.channelMention } : {}),
    // The chain rides the job (D-105) — the field this function does not
    // name does not exist, which is this file's own hard-won rule.
    ...(args.steps?.length ? { steps: args.steps } : {}),
    ...(args.step ? { step: args.step } : {}),
    // Free work carries no ceiling, which is not the same as carrying none by
    // accident: `quoteFor` returns a zero ceiling only for the tiers that never
    // spend, and every paying tier is bounded below at a cent. So a job that
    // costs money always has one.
    ...(args.quote.ceilingUsd ? { quotedUsd: args.quote.ceilingUsd } : {}),
  };
}

/**
 * The same request again, without the shortcut — "do it properly" (D-097).
 *
 * Pure and here rather than inline in the route, for `queuedJobSpec`'s
 * reason: route wiring is not tested, and three separate faults in one day
 * were a field the route knew about and the thing building the object did
 * not. Only `noRouter` should differ from the job this redoes; everything
 * that *specced* it rides again.
 *
 * Four things silently did not, and each made the redone job unable to do the
 * work it was redoing: without `channel` a send has no outbox contract in its
 * brief at all, without `clarifications` it has lost the recipient and the
 * message the user typed, without `brief` it has lost its standing
 * instructions, and without its files "summarise the attached expenses.csv"
 * comes back to an empty `input/`.
 *
 * `send` is the exception, and deliberately. It is the input the shortcut
 * consumed: carrying it would hand the run a brief insisting on the user's
 * words verbatim, which is precisely what the free compose already produced —
 * so the redo would cost money to write the same file. Asking for it properly
 * is asking for a person's judgement on the wording, and the words themselves
 * still ride as the clarification the user answered.
 */
export function redoJobSpec(
  previous: Job,
  /** The previous job's attached files, re-read from its sandbox. */
  attachments: { name: string; data: Buffer }[],
  /** Quoted as a session, since `noRouter` means the router is never asked. */
  quotedUsd: number | undefined,
  /** The role to fall back on when the previous job settled none. */
  fallbackRole: string | undefined,
): NewJobSpec {
  return {
    title: previous.title,
    prompt: previous.prompt,
    repoPath: previous.repoPath,
    preferredRole: previous.preferredRole ?? fallbackRole,
    tools: previous.tools,
    noRouter: true,
    ...(previous.clarifications?.length ? { clarifications: previous.clarifications } : {}),
    ...(previous.brief ? { brief: previous.brief } : {}),
    ...(previous.channel ? { channel: previous.channel } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(quotedUsd ? { quotedUsd } : {}),
    // Redoing a step redoes the step, not the chain's end: the remaining
    // steps ride so its delivery still queues the next one (D-105).
    ...(previous.steps?.length ? { steps: previous.steps } : {}),
    ...(previous.step ? { step: previous.step } : {}),
  };
}

/**
 * The brief for picking a cut-off run back up.
 *
 * Pure and here rather than inline in the route, for `queuedJobSpec`'s reason:
 * the wiring is not tested, and this is the part that decides whether the next
 * run resumes or starts again.
 *
 * The brief only — never the prompt. A continuation used to carry both joined
 * as its `prompt`, which gave it a different recipe key from the job it
 * continues: it banked its close-out under a compound key nobody would ever
 * match, and none of its runs joined the job's priced history (D-074). The
 * brief now rides on `Job.brief`, the same seam that keeps clarification
 * answers out of the key, and the continuation's prompt is the original
 * sentence verbatim.
 *
 * It points at RESULT.md rather than repeating it. The previous run was asked
 * to say what it established, what is still missing and what it would do next
 * (D-063), so the handover it wrote is better than one composed out here — and
 * it is already on disk in the sandbox this job carries forward.
 */
export function continuationBrief(previous: { repoPath?: string }): string {
  const carried = previous.repoPath
    ? 'the clone already carries the changes you made'
    : 'anything you produced is already here';
  return [
    `You have already worked on this and ran out of turns — ${carried}.`,
    'Read RESULT.md first: it says what the last run established, what is still missing, and what it would do next. Carry on from there rather than starting again, and keep RESULT.md updated as you go.',
  ].join('\n');
}
