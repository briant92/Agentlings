import type { Agentling, Quote, RoleInfo, WorkPlan } from '@agentlings/shared';
import { questionsFor } from './clarify';
import { MatchIndex, suggestSetup } from './match';

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
    // Free work carries no ceiling, which is not the same as carrying none by
    // accident: `quoteFor` returns a zero ceiling only for the tiers that never
    // spend, and every paying tier is bounded below at a cent. So a job that
    // costs money always has one.
    ...(args.quote.ceilingUsd ? { quotedUsd: args.quote.ceilingUsd } : {}),
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
