import type { Job, Quote } from '@agentlings/shared';
import { quoteFor } from './estimate';
import { RECIPE_TURNS, turnsFor } from './executors/claude';
import { readKnowledge } from './levels';
import { rateFor, readLedger, type Tier } from './ledger';
import { readRecipes } from './recipes';
import { type Decision, decide } from './router';
import type { RoleRegistry } from './roles';
import { storeLines } from './store';
import { usableTools } from './tools';

/**
 * What the server holds that a quote has to consult. Passed in rather than
 * reached for, so pricing a request stays a function of what it is given —
 * the same reason `estimate.ts` takes a ledger instead of reading one.
 */
export interface QuoteContext {
  /** Where the ledger lives. */
  sandboxRoot: string;
  /** Roles, for the turn leash a session on this one would be granted. */
  registry: RoleRegistry;
  /** Everything a run of this job could do — the router's capability view. */
  surfaceFor: (job: Job, roleName?: string | null) => string[];
  /**
   * The search key, so the quote can tell whether the free search tier is
   * actually available. Optional: without it a search is priced as a session,
   * which is the safe direction — quoting free for work that then costs money
   * is the one thing the quote exists to prevent.
   */
  searchToken?: () => string | undefined;
}

/**
 * What a request would cost, worked out by asking the router what it would do
 * with it and looking up what that kind of work has cost before.
 *
 * `repoPath` is passed rather than read off the level because a job may carry
 * its own, and the shape decides both the route and the rate — quoting a repo
 * job at the level's empty path would price it as work of a different kind.
 */
export function quoteFor_(
  ctx: QuoteContext,
  levelDir: string,
  text: string,
  tools: string[] | undefined,
  role: string | null,
  repoPath: string | undefined,
  /**
   * The job will bypass the router, so asking the router what it would do
   * produces a fiction — a `routed` quote of zero, or a one-shot's leash, for
   * a run that is about to be a full session either way.
   *
   * Branches on exactly the expression `RoutedExecutor` branches on, so the
   * quote and the run cannot disagree about which of them is happening.
   */
  noRouter = false,
): Quote {
  const probe: Job = {
    id: '',
    title: '',
    prompt: text,
    status: 'queued',
    slot: -1,
    createdAt: 0,
    ...(repoPath ? { repoPath } : {}),
    ...(tools?.length ? { tools } : {}),
  };
  const decision: Decision = noRouter
    ? { kind: 'agent' }
    : decide(probe, {
        knowledge: readKnowledge(levelDir),
        // The quote has to see the same corpus the run will, or it prices a
        // session for work the store is about to answer for nothing.
        store: storeLines(levelDir, Date.now()),
        recipes: readRecipes(levelDir),
        tools: usableTools(levelDir),
        canFetch: tools?.includes('web') === true,
        // The quote has to see the same tiers the run will, or it prices a
        // session for work about to be routed free — the mismatch D-049 was
        // written about, in the other direction.
        canSearch: tools?.includes('search') === true && Boolean(ctx.searchToken?.()),
        // The same surface the run will have. Without it the quote demotes
        // every recipe the executor would honour, and prices a session for a
        // one-shot.
        capabilities: ctx.surfaceFor(probe, role),
      });
  const tier: Tier =
    decision.kind === 'answer' || decision.kind === 'fetch' || decision.kind === 'search'
      ? 'routed'
      : decision.kind === 'tool'
        ? 'tool'
        : decision.kind === 'oneshot'
          ? 'oneshot'
          : 'session';
  const jobClass = decision.kind === 'oneshot' ? decision.recipeKey : (role ?? 'unclassified');
  const ledger = readLedger(ctx.sandboxRoot);
  // What this run is about to be allowed to spend, worked out exactly as the
  // executor will: the leash it will be given, priced at what a turn of this
  // role's work in this shape and on this tier has really cost. The quote may
  // not come in under that, or it would be quoting for turns it has already
  // decided to grant.
  const leash =
    decision.kind === 'oneshot' ? RECIPE_TURNS : turnsFor(role ? ctx.registry.get(role) : undefined);
  const rate = rateFor(
    ledger,
    role ?? '',
    decision.kind === 'oneshot' ? 'oneshot' : 'session',
    Boolean(repoPath),
  );
  // Which free thing it is, since `routed` covers three and the user is
  // reading this to decide whether to queue the job.
  const freeBecause =
    decision.kind === 'fetch'
      ? 'Free — just reading the pages you named'
      : decision.kind === 'search'
        ? 'Free — just looking for pages'
        : undefined;

  return quoteFor(tier, jobClass, ledger, {
    // A one-shot is priced off the recipe key, which is this exact job; a
    // session is priced off a role, which is a kind of work. Only the first may
    // say "done this before".
    sameJob: decision.kind === 'oneshot',
    ...(freeBecause ? { freeBecause } : {}),
    maxCeilingUsd: Number(process.env.AGENTLINGS_MAX_COST_USD) || undefined,
    ...(rate.samples > 0 ? { floorUsd: leash * rate.usd } : {}),
  });
}
