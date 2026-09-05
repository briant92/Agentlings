import type { Agentling } from '@agentlings/shared';
import { readAudience, rosterChannel } from './audience';
import {
  detectChannelAsk,
  filelessChannels,
  isWiredChannel,
  mentionsChannel,
  sentenceSpans,
  settledChannels,
} from './channel';
import { wantsCheck } from './check';
import { questionsFor, sendFacts } from './clarify';
import type { LevelMeta } from './levels';
import type { MatchIndex } from './match';
import { wantsOrganize } from './organize';
import { AUTHOR_ROLE } from './packcontract';
import { NO_ORGANIZE_HERE, pickFolderAvailable } from './pickFolder';
import { GATHER_SENTENCE, PLAN_SENTENCE, planParty } from './party';
import { type QuoteContext, quoteFor_ } from './quote';
import { wantsReconciliation } from './reconciliation';
import { refusalRows } from './refusals';
import { cadenceFrom, describeCadence, triggerFrom } from './schedules';
import { grantedTools } from './settings';
import { splitSteps } from './steps';
import type { InstallContext } from './verdict';
import { forceRole, planWork, runnerRole } from './work';

/**
 * A sentence becomes a job through one reading (D-287). `read` works out
 * everything the desk shows about a sentence — its shape, its plan, the
 * channels it settles, its quote and its questions — and returns it as one
 * value; `queue` (ticket #52) performs that reading. The card and the job
 * are the same reading, never two, so "what the desk showed is what gets
 * queued" holds by construction rather than by comment — the four faults
 * `queueSentence` and `/work/plan` disagreed on (D-097, D-179, D-259) were
 * two hand-written derivations of this one answer drifting apart.
 *
 * This ticket lands the module with its first way in, the preview route,
 * which is the only caller that writes nothing: `read` is pure — it reads
 * the ledger, the store and the audience to price and phrase the card, and
 * mutates none of them. Counting refusals stays Start's act (D-259), never
 * `read`'s, because the preview re-runs on every keystroke.
 */

/**
 * What Start would queue for this reading (D-287): one plain job, a chain
 * whose first step queues the rest, a party of hands, or a plan job that
 * proposes the split. The desk's `shape`, carried on the card so the client
 * could act on it; nothing does yet, and no client edit is in this ticket.
 */
export type Shape = 'plain' | 'chain' | 'party' | 'party plan';

/**
 * The catalog `read` reads a sentence against: `QuoteContext` — everything a
 * quote consults — grown by the `matcher()` thunk, because the match index is
 * rebuilt when the library installs something and nothing install-level may
 * be cached past a Settings change (D-277). Declared once beside `INSTALL`
 * (D-287 Q5); `QUOTE_CTX` is derived from it, never a second copy.
 */
export interface CatalogContext extends QuoteContext {
  /** The match index, rebuilt on a library install (D-277) — a thunk, so it ages. */
  matcher: () => MatchIndex;
}

/** The two contexts a reading needs: where this install keeps things, and its catalog. */
export interface IntakeContext {
  install: InstallContext;
  catalog: CatalogContext;
}

/**
 * The slice of a level's runtime a reading touches — structural like
 * `VerdictRuntime`, satisfied by `index.ts`'s `LevelRuntime`. The crew, so
 * the plan can name who takes the job; the level's dir, for the ledger the
 * quote reads; its repository, which decides the route and the rate.
 */
export interface IntakeRuntime {
  meta: Pick<LevelMeta, 'id' | 'repoPath'>;
  dir: string;
  sim: { agentlings: Agentling[] };
}

/**
 * What only the caller knows about a sentence (D-287 Q3): the tools it is
 * priced against, a channel it picked, the send answers it holds, and which
 * shapes it admits. A way in says which shapes it admits — it never decides
 * the shape itself. The desk (this ticket's caller) admits everything;
 * `single` is the user's "run as one job"; `authoring` is the New Level
 * dialog pricing a world before its button is pressed.
 */
export interface ReadOpts {
  tools?: string[];
  /** A channel the caller picked — a confirmed near-miss at the desk (D-093). */
  channel?: string;
  /** The send facts collected so far, which flip the quote free (D-097). */
  answers?: Record<string, string>;
  /** The user chose "run as one job" — no split, no party (D-105). */
  single?: boolean;
  /** The New Level dialog: the desk says it is authoring, the server picks the role. */
  authoring?: boolean;
  /** The user pressed the planner offer (TEAMWORK T3) — the shape is a plan. */
  planParty?: boolean;
  /**
   * The shapes this way in admits, each defaulting to true. A firing admits
   * plain and chain but never a party (TEAMWORK T2); it passes `party: false`.
   */
  admits?: { chain?: boolean; party?: boolean };
}

/** One reading of a sentence — the card the desk shows and, from #52, the job Start queues. */
export interface Reading {
  /** What Start would queue (D-287). */
  shape: Shape;
  /**
   * Everything `/work/plan` answers today plus `shape`, ready to serialise —
   * the desk card. The wire shape is byte-for-byte what it was; a client
   * reads it exactly as before.
   */
  card: Record<string, unknown>;
}

/** One reading of a sentence: the desk card and the shape Start would queue (D-287). */
export function read(
  rt: IntakeRuntime,
  text: string,
  ctx: IntakeContext,
  opts: ReadOpts = {},
): Reading {
  const { install, catalog } = ctx;
  const { registry } = catalog;

  // The doors this run would hold and the people a channel can reach — both
  // resolved from the install, the way the route's own `granted` and
  // `rosterNames` did, so the reading prices and phrases the same job the
  // route did.
  const granted = (requested: string[] | undefined): string[] =>
    grantedTools(requested, install.connections(), install.settings(), install.env);
  const rosterNames = (channel: string | undefined): string[] =>
    channel
      ? readAudience(install.sandboxRoot, rosterChannel(channel)).flatMap((person) => [
          person.name,
          ...(person.username ? [person.username] : []),
          ...(person.aliases ?? []),
        ])
      : [];

  const admitsChain = !opts.single && opts.admits?.chain !== false;
  const admitsParty = !opts.single && opts.admits?.party !== false;

  // The split Start will queue (D-105), previewed like every other plan
  // fact — each step quoted on its own sentence, because per-step tiers
  // are the point of splitting at all.
  const split = admitsChain ? splitSteps(text) : null;
  const stepPlans = split
    ? split.map((sentence) => {
        const stepDraft = planWork(
          catalog.matcher(),
          registry.list(),
          rt.sim.agentlings,
          rt.meta.repoPath,
          sentence,
        );
        return {
          sentence,
          title: stepDraft.title,
          quote: quoteFor_(
            catalog,
            rt.dir,
            sentence,
            granted(opts.tools),
            runnerRole(stepDraft),
            rt.meta.repoPath || undefined,
          ),
        };
      })
    : null;
  // The party the sentence licenses (TEAMWORK T2), previewed like the split
  // is: every hand priced on its own piece, the gather priced on its fixed
  // sentence, the words quoted back (D-184) — and a licence that cannot be
  // honoured says why instead of being ignored. The chain split wins first.
  const partyPlanned = admitsParty && !split ? planParty(text) : null;
  const partyPlans =
    partyPlanned && 'hands' in partyPlanned
      ? {
          words: partyPlanned.asked.words,
          ...(partyPlanned.sendTail ? { sendTail: partyPlanned.sendTail } : {}),
          hands: partyPlanned.hands.map((sentence) => {
            const handDraft = planWork(
              catalog.matcher(),
              registry.list(),
              rt.sim.agentlings,
              undefined,
              sentence,
            );
            return {
              sentence,
              title: handDraft.title,
              quote: quoteFor_(
                catalog,
                rt.dir,
                sentence,
                granted(opts.tools),
                runnerRole(handDraft),
                undefined,
              ),
            };
          }),
          gather: {
            quote: quoteFor_(
              catalog,
              rt.dir,
              GATHER_SENTENCE,
              granted(opts.tools),
              runnerRole(planWork(catalog.matcher(), registry.list(), rt.sim.agentlings, undefined, text)),
              undefined,
            ),
          },
        }
      : null;

  // The shape, decided in one place (D-287 Q3): a chain split wins, then the
  // planner press, then a licensed party, then plain. A firing cannot drift
  // into a party because it does not admit one (T2 kept), and `single`
  // admits neither.
  const shape: Shape = split
    ? 'chain'
    : admitsParty && opts.planParty
      ? 'party plan'
      : partyPlanned && 'hands' in partyPlanned
        ? 'party'
        : 'plain';

  // A near-miss the user confirmed (D-093): the client re-plans naming the
  // channel, so the send questions come from the server like any other —
  // honoured only for channels that exist, like every pick.
  const confirmed =
    typeof opts.channel === 'string' && isWiredChannel(opts.channel) ? opts.channel : undefined;
  const matchedDraft = planWork(
    catalog.matcher(),
    registry.list(),
    rt.sim.agentlings,
    rt.meta.repoPath,
    text,
  );
  // An organize sentence runs as worker (it carries the organizing skill,
  // D-132), forced at queue time by `organizeRoot`. The preview has to say so
  // too, or the card shows the matcher's guess (scribe for "sort … into
  // subfolders") while Start quietly runs a worker — the same shape as the
  // authoring force right beside it.
  const draft =
    opts.authoring === true && registry.get(AUTHOR_ROLE)
      ? forceRole(matchedDraft, AUTHOR_ROLE, rt.sim.agentlings)
      : wantsOrganize(text) && registry.get('worker')
        ? forceRole(matchedDraft, 'worker', rt.sim.agentlings)
        : matchedDraft;
  // Derived at ask time from the catalog and Settings, so the same sentence
  // gets a different card once a channel is connected (D-079).
  const channelAsk = detectChannelAsk(text, install.connections(), install.settings(), install.env);
  // Settled before the quote now, because whether this is free depends on it:
  // a send the desk holds whole is composed in code (D-097), and the card has
  // to say so while the user is still deciding.
  const askChannel = channelAsk?.channel ?? channelAsk?.asked ?? confirmed;
  // The channels Start would carry (D-179) — settled by the one function
  // every way in settles by, so the card and the queued job agree about
  // how many sends this is.
  const askChannels = settledChannels(channelAsk, confirmed).carried;
  const names = rosterNames(askChannel);
  const send = sendFacts(text, { channel: askChannel, names }, opts.answers);
  const refuses = refusalRows(text);
  // The quote decides whether asking is worth it at all, and the quote needs
  // the role the draft settles — so the questions are filled in last.
  const quote = quoteFor_(
    catalog,
    rt.dir,
    text,
    granted(opts.tools),
    runnerRole(draft),
    rt.meta.repoPath || undefined,
    false,
    undefined,
    send ?? undefined,
    askChannel,
  );

  const card: Record<string, unknown> = {
    ...draft,
    quote,
    // The desk's underlines: the channel detectors' evidence merged over the
    // matcher's words, replacing the matcher-only list the draft carries.
    spans: sentenceSpans(text, draft.spans),
    // What the crew will refuse, said before Start (#22) rather than found
    // inside a run that spent turns discovering it. Read from the *whole*
    // sentence, exactly as the meter reads it at Start — so a split into
    // steps cannot make the desk and the count disagree about what was
    // claimed. Read only: refusals are not counted here and must never be,
    // because this route re-runs on every keystroke (D-259).
    ...(refuses.length > 0 ? { refuses } : {}),
    ...(stepPlans ? { steps: stepPlans } : {}),
    ...(partyPlans ? { party: partyPlans } : {}),
    // A blocked party carries the planner offer, priced (TEAMWORK T3): the
    // desk can say what pressing the button costs before it is pressed.
    ...(partyPlanned && 'blocked' in partyPlanned
      ? {
          partyBlocked: partyPlanned.blocked,
          planQuote: quoteFor_(
            catalog,
            rt.dir,
            PLAN_SENTENCE,
            granted(opts.tools),
            registry.get('architect') ? 'architect' : null,
            undefined,
          ),
        }
      : {}),
    // A detected send asks its facts even when the ask fell to a fork — the
    // asked name stands in for the channel so the hint has something to say,
    // and a confirmed near-miss (D-093) counts like a detection.
    questions: questionsFor(text, {
      hasRepo: !!rt.meta.repoPath,
      tier: quote.tier,
      channel: askChannel,
      // What Start will actually carry, so the card asks the questions the
      // queued job would ask — a To box shown here and refused there is the
      // drift `clarificationLines` exists to prevent (D-179).
      channels: askChannels,
      names,
    }),
    ...(channelAsk ? { channelAsk } : {}),
    // A cadence written into the sentence (D-184). Read and shown, never
    // acted on: Start with a repeat set creates a schedule, so the desk fills
    // the controls in and says what it read rather than deciding quietly.
    ...(() => {
      const readCadence = cadenceFrom(text);
      return readCadence
        ? { cadence: { ...readCadence, label: describeCadence(readCadence.cadence) } }
        : {};
    })(),
    // A mail trigger written into the sentence (D-248): the chip goes on and
    // the words are quoted back; the query itself is never guessed.
    ...(() => {
      const readTrigger = triggerFrom(text);
      return readTrigger ? { trigger: readTrigger } : {};
    })(),
    // A file asked to ride on a channel that cannot carry one. Said here
    // because the outbox contract only refuses it at the end, once the run is
    // written and paid for. Read against the channels Start would actually
    // carry, so a file that rides on one of two channels names only the other.
    ...(() => {
      const noFiles = filelessChannels(
        text,
        askChannels.length ? askChannels : askChannel ? [askChannel] : [],
      );
      return noFiles.length ? { noFiles } : {};
    })(),
    // A folder reorganization is asked for by picking the folder, the way a
    // send asks for its recipient (D-132): the sentence wants organizing, but
    // only the native picker yields the absolute path, so the desk shows a
    // "choose the folder" step rather than claiming one from the words.
    ...(wantsOrganize(text)
      ? {
          organize: true,
          // …and on an install with no desktop the picker is the whole ask,
          // so the desk says so instead of offering a button that errors on
          // the click (#30). Asked of the picker rather than restated here.
          ...(pickFolderAvailable() ? {} : { organizeRefused: NO_ORGANIZE_HERE }),
        }
      : {}),
    // A reconciliation is named here and counted at the desk (D-224): the
    // preview carries no files, and the verb is the server's to hear.
    ...(wantsReconciliation(text) ? { reconcile: true } : {}),
    // The sentence asked for a check pass (TEAMWORK T1) — said on the card
    // like the cadence is (D-184): what the desk read, before Start acts on
    // it, with the second session's cost visible in the plan.
    ...(wantsCheck(text) ? { checked: true } : {}),
    // The near-miss itself, when no ask fired: a channel word with no send
    // verb beside it (D-093), for the desk to question rather than claim.
    ...(() => {
      if (channelAsk) return {};
      const mention = mentionsChannel(text);
      return mention ? { channelMention: mention } : {};
    })(),
    shape,
  };

  return { shape, card };
}
