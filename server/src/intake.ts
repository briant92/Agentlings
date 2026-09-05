import type { Agentling, ChannelAsk, Job, Quote, WorkPlan } from '@agentlings/shared';
import { readAudience, rosterChannel } from './audience';
import {
  detectChannelAsk,
  droppedChannels,
  filelessChannels,
  isWiredChannel,
  mentionsChannel,
  sentenceSpans,
  settledChannels,
} from './channel';
import { wantsCheck } from './check';
import { clarificationLines, questionsFor, sendFacts } from './clarify';
import type { EventLog } from './events';
import type { CrewSeed, LevelMeta } from './levels';
import type { MatchIndex } from './match';
import { wantsOrganize } from './organize';
import { AUTHOR_ROLE } from './packcontract';
import { NO_ORGANIZE_HERE, pickFolderAvailable } from './pickFolder';
import {
  GATHER_SENTENCE,
  PLAN_SENTENCE,
  type PartyPlan,
  handBrief,
  newPartyId,
  planBrief,
  planParty,
} from './party';
import type { JobQueue } from './queue';
import { type QuoteContext, quoteFor_ } from './quote';
import { wantsReconciliation } from './reconciliation';
import { wantsWithholding } from './redact';
import { refusalKeys, refusalRows } from './refusals';
import { cadenceFrom, describeCadence, triggerFrom } from './schedules';
import { grantedTools } from './settings';
import { splitSteps } from './steps';
import type { InstallContext, QueueParty } from './verdict';
import { forceRole, planWork, queuedJobSpec, rosterGapNote, runnerRole } from './work';

/**
 * A sentence becomes a job through one reading (D-287). `read` works out
 * everything the desk shows about a sentence — its shape, its plan, the
 * channels it settles, its quote and its questions — and returns it as one
 * value; `queue` performs that reading. The card and the job are the same
 * reading, never two, so "what the desk showed is what gets queued" holds by
 * construction rather than by comment — the four faults `queueSentence` and
 * `/work/plan` disagreed on (D-097, D-179, D-259) were two hand-written
 * derivations of this one answer drifting apart.
 *
 * `read` is pure — it reads the ledger, the store and the audience to price
 * and phrase the card, and mutates none of them — because the preview re-runs
 * on every keystroke. Counting refusals stays Start's act (D-259), fed from
 * the reading's keys and never re-derived from the words. `queue` adds and
 * then emits, in the one place that does either for a sentence; the five
 * adds left in `index.ts` — redo, reply, continue, the compile job and the
 * bare add route — are "the same job again" under other quote rules and are
 * named in D-287 as the follow-up.
 */

/**
 * What Start would queue for this reading (D-287): one plain job, a chain
 * whose first step queues the rest, a party of hands, or a plan job that
 * proposes the split. The desk's `shape`, carried on the card so the client
 * could act on it; nothing does yet.
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
 * The slice of a level's runtime intake touches — structural like
 * `VerdictRuntime`, satisfied by `index.ts`'s `LevelRuntime`. `read` takes
 * the crew, so the plan can name who takes the job; the level's dir, for the
 * ledger the quote reads; its repository, which decides the route and the
 * rate. `queue` takes the queue it adds to, the feed it then tells, and the
 * roster the queued line's roster-gap note is derived from (D-200).
 */
export interface IntakeRuntime {
  meta: Pick<LevelMeta, 'id' | 'repoPath'>;
  dir: string;
  sim: { agentlings: Agentling[] };
  queue: JobQueue;
  eventLog: EventLog;
  roster: CrewSeed[];
}

/**
 * What only the way in knows that changes the reading (D-287 Q3): the tools
 * it is priced against, a channel it picked, the send answers it holds, the
 * shapes it admits, and — for the ways in that already know — the role, the
 * repository rule, the channel seam and the chain. A way in says which shapes
 * it admits; it never decides the shape itself. The desk admits everything;
 * `single` is the user's "run as one job"; `authoring` is the New Level
 * dialog pricing a world before its button is pressed.
 */
export interface ReadOpts {
  tools?: string[];
  /** A channel the caller picked — a confirmed near-miss at the desk (D-093), a rule's stored one. */
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
   * A way in whose sentence is already one job passes `PLAIN_ONLY`.
   */
  admits?: { chain?: boolean; party?: boolean };
  /**
   * The role this job is for, when the way in knows and the sentence does
   * not — a check pass, the gather, pack authoring. Honoured only for a role
   * that exists, so a caller cannot invent a class the ledger would then
   * carry.
   */
  role?: string;
  /**
   * The job's deliverable lives in the sandbox, never the repository — so
   * the level's repo must not ride (D-141). Authoring learned this at a
   * price: five clones paid for nothing, and the session "installed" its
   * pack into the clone too, so the one Approve fired two installs that
   * collided with each other.
   */
  noRepo?: boolean;
  /**
   * The channels this job carries, decided by the way in instead of by
   * detection — the party seam (TEAMWORK T2): `[]` for a hand or a plan,
   * the party's settled list for the gather.
   */
  channelsOverride?: string[];
  /**
   * The chain, when the way in is the chain itself (D-105): the sentences
   * still to run after this one, and which step this is. Honoured as
   * decided — the sentence is never re-split, never a party, and never takes
   * the composed-send shortcut (D-097 inverted, see `readJob`).
   */
  steps?: string[];
  step?: { n: number; of: number };
}

/** The admissions of a way in whose sentence is already one job: no split, no party. */
export const PLAIN_ONLY: NonNullable<ReadOpts['admits']> = { chain: false, party: false };

/**
 * What only the way in knows that rides the job without changing the reading:
 * the material, the line the feed says, the trigger, the standing brief, the
 * link to the previous step, and the flags a chain or a party carries forward
 * to a later job. `note` and `brief` are for the way in that queues one job;
 * a party's hands and a plan say how they came to be themselves.
 */
export interface QueueExtras {
  attachments?: { name: string; data: Buffer }[];
  /** How this job came to exist, said on the queued event's line. */
  note?: string;
  /** The mail whose arrival queued this job (D-248). */
  mailTrigger?: Job['mailTrigger'];
  /** Standing instructions for the session, rides Job.brief. */
  brief?: string;
  /** The real folder to reorganize, picked at intake (D-132). */
  organizeRoot?: string;
  /** The previous step's job id — the chain link the review groups by. */
  stepPrev?: string;
  /** The chain asked for something to be kept out (D-183) — carried to a later step, the gather, the check. */
  withholding?: boolean;
  /** The chain asked for the work to be checked (TEAMWORK T1, D-194) — carried to a later step, the gather. */
  checked?: boolean;
  /** This job is a check pass: the job it checks, and whose work to avoid. */
  check?: Job['check'];
  /** This job is the gather of a work party (TEAMWORK T2). */
  party?: Job['party'];
}

/**
 * One sentence read as one job: everything `queuedJobSpec` takes that the
 * words decide, plus what the card and the questions are phrased from.
 * Intake's own — a way in sees it only through the card.
 */
interface JobReading {
  text: string;
  plan: WorkPlan;
  tools: string[];
  repoPath?: string;
  quote: Quote;
  /** The ask the sentence made, whatever the pick — the card shows it. */
  detected: ChannelAsk | null;
  /** The channel settled: the pick when wired, else the detected ask's own. */
  channel?: string;
  /** Every channel this job carries (D-179), after the way in's override. */
  channels?: string[];
  /** What the sentence settled before any override — a party's spec carries it for the gather. */
  carried: string[];
  /** The context the questions are asked under, and the clarifications recomputed under. */
  asking: Parameters<typeof questionsFor>[1];
  send?: { to: string; words: string };
  clarifications: string[];
  channelMention?: { channel: string; label: string };
  alsoAsked: { channel: string; label: string }[];
  /** These words asked for a check pass (TEAMWORK T1). */
  checked: boolean;
}

/**
 * One reading of a sentence — the desk card, and the job Start queues.
 * `shape`, `card` and `refusalKeys` are a way in's to read; everything under
 * them is what `queue` performs, the reading's own.
 */
export interface Reading {
  /** What Start would queue (D-287). */
  shape: Shape;
  /**
   * Everything `/work/plan` answers today plus `shape`, ready to serialise —
   * the desk card. The keys are the ones the desk has always read, so a
   * client reads it exactly as before; where the card and the queue used to
   * derive a value differently (the settled channel, the plan's price), the
   * value is now the queue's.
   */
  card: Record<string, unknown>;
  /**
   * The meter's keys for the sentence (D-259) — what Start counts, once,
   * from this reading and never from a second look at the words.
   */
  refusalKeys: string[];
  /** The whole sentence, as read. */
  text: string;
  /** The jobs this reading queues: the one job, step one of the chain, the plan job, or every hand. */
  jobs: JobReading[];
  /** The card's answers, riding the chain while it has steps left. */
  answers?: Record<string, string>;
  /** The chain, whether the split found it or the way in decided it. */
  steps?: string[];
  step?: { n: number; of: number };
  /** The party the sentence licensed, when the shape is one. */
  party?: PartyPlan;
  /** What the whole sentence settled to carry — for a party's spec and a plan's brief. */
  carried: string[];
  /** Read off the WHOLE sentence (D-183): a chain, a party and a plan carry it; a plain job's own words suffice. */
  withholding: boolean;
  /** Read off the whole sentence too — the deliverable lands at the end of a chain. */
  checked: boolean;
}

/** Every name this channel could be asked to send to, aliases included — the bare-send test needs them (D-097). */
function rosterNames(sandboxRoot: string, channel: string | undefined): string[] {
  if (!channel) return [];
  return readAudience(sandboxRoot, rosterChannel(channel)).flatMap((person) => [
    person.name,
    ...(person.username ? [person.username] : []),
    ...(person.aliases ?? []),
  ]);
}

/** What one job's reading is given: the options that change a reading, less the ones `read` has already resolved. */
type JobOpts = Pick<
  ReadOpts,
  'channel' | 'answers' | 'authoring' | 'role' | 'noRepo' | 'channelsOverride' | 'steps' | 'step'
>;

/**
 * One sentence, one job — the derivation the card and the queue share.
 *
 * The rules that used to be written twice, settled once: the role is forced
 * where the way in or the words say so (a check pass, the gather, authoring;
 * an organize sentence runs as the worker that carries the organizing skill,
 * D-132); a pick supersedes the ask the card made and is honoured only for a
 * wired channel, so an unwired pick settles to no channel — the draft —
 * never to a channel the words named instead (D-178, `settledChannels`'s
 * rule, applied nowhere else); the send facts are read against the channel
 * the job will *carry*, never against an ask that fell to a fork — a card
 * that promised free for a never-channel send and a queue that then billed a
 * session would be the worst of both (D-097); and a step of a chain never
 * composes, because the desk asked its send questions of the whole sentence
 * and a step whose own words read as a bare send would compose those answers
 * verbatim under the other promise.
 *
 * `tools` arrives granted: resolved once by the caller and handed to every
 * quote and the queued job, never recomputed downstream.
 */
function readJob(
  rt: IntakeRuntime,
  text: string,
  ctx: IntakeContext,
  tools: string[],
  opts: JobOpts,
): JobReading {
  const { install, catalog } = ctx;
  const { registry } = catalog;
  const repoPath = opts.noRepo ? '' : rt.meta.repoPath;
  const matched = planWork(catalog.matcher(), registry.list(), rt.sim.agentlings, repoPath, text);
  const forced =
    opts.role ??
    (opts.authoring === true ? AUTHOR_ROLE : wantsOrganize(text) ? 'worker' : undefined);
  const plan =
    forced && registry.get(forced) ? forceRole(matched, forced, rt.sim.agentlings) : matched;
  // Derived at ask time from the catalog and Settings, so the same sentence
  // gets a different card once a channel is connected (D-079). Detected once
  // and read twice: the card shows the ask the sentence made, whatever the
  // pick; the settlement and the dropped-channel stamp read it too.
  const detected = detectChannelAsk(text, install.connections(), install.settings(), install.env);
  const { channel, carried } = settledChannels(detected, opts.channel);
  // The name the send questions are asked under: the settled channel, else —
  // when no pick superseded the ask — the asked one, so a draft still asks
  // its facts (D-179).
  const askChannel = channel ?? (opts.channel ? undefined : detected?.asked);
  const overridden = opts.channelsOverride?.filter(isWiredChannel);
  const carrying = overridden ?? carried;
  const channels = carrying.length > 0 ? carrying : undefined;
  const names = rosterNames(install.sandboxRoot, askChannel);
  const inChain = Boolean(opts.steps?.length || opts.step);
  const send = inChain ? null : sendFacts(text, { channel, names }, opts.answers);
  // The quote decides whether asking is worth it at all, and the quote needs
  // the role the draft settles and the send the desk holds (D-097) — so the
  // questions are filled in after it.
  const quote = quoteFor_(
    catalog,
    rt.dir,
    text,
    tools,
    runnerRole(plan),
    repoPath || undefined,
    false,
    undefined,
    send ?? undefined,
    channel,
  );
  const asking = {
    hasRepo: !!rt.meta.repoPath,
    tier: quote.tier,
    channel: askChannel,
    // What the job will actually carry, so the card asks the questions the
    // queued job would ask — a To box shown here and refused there is the
    // drift `clarificationLines` exists to prevent (D-179).
    channels,
    names,
  };
  const mention = channel ? null : mentionsChannel(text);
  return {
    text,
    plan,
    tools,
    repoPath: repoPath || undefined,
    quote,
    detected,
    channel,
    channels,
    carried,
    asking,
    send: send ?? undefined,
    // Recomputed from the same sentence rather than trusted from the caller,
    // so the only instructions that can reach a session are ones the user
    // was actually shown.
    clarifications: clarificationLines(text, asking, opts.answers),
    // A channel word the job is NOT carrying (D-093): stamped so the review
    // can say approving sends nothing, with the reply as the way out.
    ...(mention ? { channelMention: { channel: mention.channel, label: mention.label } } : {}),
    // The channels this sentence genuinely asked for that a one-channel job
    // cannot take (D-178) — every channel the ask named, minus the carried.
    alsoAsked: droppedChannels(detected, channels),
    checked: wantsCheck(text),
  };
}

/** One reading of a sentence: the desk card, the shape Start would queue, and the jobs `queue` performs (D-287). */
export function read(
  rt: IntakeRuntime,
  text: string,
  ctx: IntakeContext,
  opts: ReadOpts = {},
): Reading {
  const { install, catalog } = ctx;
  const { registry } = catalog;

  // The doors this run would hold, resolved once from the install and handed
  // to every quote and the queued job, never recomputed downstream — web
  // access decides whether the router can use its free fetch tier, so a
  // quote that answered this differently from the run would price a
  // different job.
  const tools = grantedTools(opts.tools, install.connections(), install.settings(), install.env);

  const inChain = Boolean(opts.steps?.length || opts.step);
  const admitsChain = !opts.single && !inChain && opts.admits?.chain !== false;
  const admitsParty = !opts.single && !inChain && opts.admits?.party !== false;

  // The split Start will queue (D-105), and the party the sentence licenses
  // (TEAMWORK T2) — a licence that cannot be honoured says why instead of
  // being ignored. The chain split wins first.
  const split = admitsChain ? splitSteps(text) : null;
  const partyPlanned = admitsParty && !split ? planParty(text) : null;
  const licensed = partyPlanned && 'hands' in partyPlanned ? partyPlanned : null;

  // The shape, decided in one place (D-287 Q3): a chain split wins, then the
  // planner press, then a licensed party, then plain. A firing cannot drift
  // into a party because it does not admit one (T2 kept), and `single`
  // admits neither.
  const shape: Shape = split
    ? 'chain'
    : admitsParty && opts.planParty
      ? 'party plan'
      : licensed
        ? 'party'
        : 'plain';

  // The whole sentence, read as the one job it would be: the card's draft,
  // quote and questions, and the plain job itself.
  const whole = readJob(rt, text, ctx, tools, opts);
  // Each step quoted on its own sentence, because per-step tiers are the
  // point of splitting at all; step one is the job Start queues, with the
  // rest riding it.
  const stepReadings = split
    ? split.map((sentence, i) =>
        readJob(rt, sentence, ctx, tools, {
          ...opts,
          steps: split.slice(i + 1),
          step: { n: i + 1, of: split.length },
        }),
      )
    : null;
  // Every hand priced on its own piece — sandbox-only and channel-less, the
  // shape T2 built: a hand never sends, and repo parties are T4's trial.
  const hands =
    licensed && shape === 'party'
      ? licensed.hands.map((piece) =>
          readJob(rt, piece, ctx, tools, { noRepo: true, channelsOverride: [] }),
        )
      : null;
  // The plan job (TEAMWORK T3): an architect-class run proposing the split,
  // priced whenever the desk could press for it — a blocked party carries
  // the offer, the press itself carries the job. On a repo level the planner
  // gets its own clone to survey (T4), and the price says so.
  const planJob =
    shape === 'party plan' || (partyPlanned && 'blocked' in partyPlanned)
      ? readJob(rt, PLAN_SENTENCE, ctx, tools, {
          channelsOverride: [],
          ...(registry.get('architect') ? { role: 'architect' } : {}),
        })
      : null;

  const refuses = refusalRows(text);

  const card: Record<string, unknown> = {
    ...whole.plan,
    quote: whole.quote,
    // The desk's underlines: the channel detectors' evidence merged over the
    // matcher's words, replacing the matcher-only list the draft carries.
    spans: sentenceSpans(text, whole.plan.spans),
    // What the crew will refuse, said before Start (#22) rather than found
    // inside a run that spent turns discovering it. Read from the *whole*
    // sentence, exactly as the meter reads it at Start — so a split into
    // steps cannot make the desk and the count disagree about what was
    // claimed. Read only: refusals are not counted here and must never be,
    // because this route re-runs on every keystroke (D-259).
    ...(refuses.length > 0 ? { refuses } : {}),
    ...(stepReadings
      ? {
          steps: stepReadings.map(({ text: sentence, plan, quote }) => ({
            sentence,
            title: plan.title,
            quote,
          })),
        }
      : {}),
    // The party previewed like the split is, the words quoted back (D-184),
    // the gather priced on its fixed sentence as the role the whole request
    // matches — the same answer the desk would show for the sentence solo.
    ...(hands && licensed
      ? {
          party: {
            words: licensed.asked.words,
            ...(licensed.sendTail ? { sendTail: licensed.sendTail } : {}),
            hands: hands.map(({ text: sentence, plan, quote }) => ({
              sentence,
              title: plan.title,
              quote,
            })),
            gather: {
              quote: quoteFor_(
                catalog,
                rt.dir,
                GATHER_SENTENCE,
                tools,
                runnerRole(
                  planWork(catalog.matcher(), registry.list(), rt.sim.agentlings, undefined, text),
                ),
                undefined,
              ),
            },
          },
        }
      : {}),
    // A blocked party carries the planner offer, priced (TEAMWORK T3): the
    // desk can say what pressing the button costs before it is pressed — and
    // once pressed, the card carries the plan job's own quote.
    ...(partyPlanned && 'blocked' in partyPlanned && planJob
      ? { partyBlocked: partyPlanned.blocked, planQuote: planJob.quote }
      : planJob
        ? { planQuote: planJob.quote }
        : {}),
    // A detected send asks its facts even when the ask fell to a fork — the
    // asked name stands in for the channel so the hint has something to say,
    // and a confirmed near-miss (D-093) counts like a detection.
    questions: questionsFor(text, whole.asking),
    ...(whole.detected ? { channelAsk: whole.detected } : {}),
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
        whole.channels ?? (whole.asking.channel ? [whole.asking.channel] : []),
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
    ...(whole.checked ? { checked: true } : {}),
    // The near-miss itself, when no ask fired: a channel word with no send
    // verb beside it (D-093), for the desk to question rather than claim.
    ...(() => {
      if (whole.detected) return {};
      const mention = mentionsChannel(text);
      return mention ? { channelMention: mention } : {};
    })(),
    shape,
  };

  return {
    shape,
    card,
    refusalKeys: refusalKeys(text),
    text,
    jobs:
      shape === 'chain' && stepReadings
        ? [stepReadings[0]]
        : shape === 'party' && hands
          ? hands
          : shape === 'party plan' && planJob
            ? [planJob]
            : [whole],
    ...(opts.answers ? { answers: opts.answers } : {}),
    // The chain: found by the split, or handed in decided by the chain itself.
    ...(split ? { steps: split.slice(1), step: { n: 1, of: split.length } } : {}),
    ...(!split && opts.steps ? { steps: opts.steps } : {}),
    ...(!split && opts.step ? { step: opts.step } : {}),
    ...(shape === 'party' && licensed ? { party: licensed } : {}),
    carried: whole.carried,
    // Read off the WHOLE sentence, before a split loses it (D-183): "…then
    // redact the client names, then email it" asks for a withholding in
    // step two and sends in step three, and step three's own words say
    // nothing about it — so the chain carries the flag rather than each
    // step re-deriving it from a sentence that no longer contains it. A
    // party's hands and a plan carry it for the same reason; a plain job's
    // own words are the whole sentence.
    withholding: shape !== 'plain' && wantsWithholding(text),
    checked: whole.checked,
  };
}

/**
 * The queued line's detail: the caller's own note (a firing schedule, a
 * continuation) and, when the job is for a role nobody awake holds, the
 * roster-gap sentence (D-200). Every way in composes it, so a schedule, an
 * inbound message, a chain step, a reply or a compile says what the desk
 * card has said since D-192 — the record was the one place the fallback
 * was still silent.
 */
export function queuedDetail(
  rt: Pick<IntakeRuntime, 'sim' | 'roster'>,
  job: Job,
  ...notes: (string | undefined)[]
): { detail?: string } {
  const parts = [...notes, rosterGapNote(rt.sim.agentlings, rt.roster, job.preferredRole)].filter(
    (note): note is string => Boolean(note),
  );
  return parts.length > 0 ? { detail: parts.join(' · ') } : {};
}

/** What rides one job beside its reading — the extras, plus what the reading settled for it. */
interface Ride extends QueueExtras {
  answers?: Record<string, string>;
  steps?: string[];
  step?: { n: number; of: number };
}

/**
 * Add, then emit — the one place a sentence's job is added and the feed told
 * (D-287). Everything the words decided comes from the reading; everything
 * else from the way in. `queuedJobSpec` guards every optional field itself,
 * for its own reason: the field it does not name does not exist (D-097).
 */
function perform(rt: IntakeRuntime, job: JobReading, ride: Ride, note: string | undefined): Job {
  const queued = rt.queue.add(
    queuedJobSpec({
      title: job.plan.title,
      prompt: job.text,
      repoPath: job.repoPath,
      tools: job.tools,
      plan: job.plan,
      quote: job.quote,
      clarifications: job.clarifications,
      attachments: ride.attachments ?? [],
      channels: job.channels,
      organizeRoot: ride.organizeRoot,
      send: job.send,
      brief: ride.brief,
      steps: ride.steps,
      step: ride.step,
      stepPrev: ride.stepPrev,
      // The card's answers ride on while the chain has steps left, so a
      // question the desk asked of the whole sentence still reaches the step
      // that asks it too — the clarifications above decide which ones those are.
      answers: ride.answers,
      mailTrigger: ride.mailTrigger,
      withholding: ride.withholding,
      checked: job.checked || ride.checked,
      check: ride.check,
      party: ride.party,
      channelMention: job.channelMention,
      alsoAsked: job.alsoAsked,
    }),
  );
  rt.eventLog.emit({
    type: 'queued',
    jobId: queued.id,
    title: queued.title,
    ...queuedDetail(rt, queued, note),
  });
  return queued;
}

/** The spec every job of a party carries (TEAMWORK T2): what the gather will need, since it is built by whichever hand settles last. */
function partySpec(args: {
  id: string;
  of: number;
  asked: string;
  sendTail?: string;
  channels: string[];
  answers?: Record<string, string>;
  checked: boolean;
  loadBearing?: number[];
  repo?: boolean;
}): NonNullable<Job['party']> {
  return {
    id: args.id,
    hand: 0,
    of: args.of,
    asked: args.asked,
    ...(args.sendTail ? { sendTail: args.sendTail } : {}),
    ...(args.channels.length ? { channels: args.channels } : {}),
    ...(args.answers && Object.keys(args.answers).length ? { answers: args.answers } : {}),
    ...(args.checked ? { checked: true } : {}),
    ...(args.loadBearing?.length ? { loadBearing: args.loadBearing } : {}),
    ...(args.repo ? { repo: true } : {}),
  };
}

/**
 * Every hand at once (TEAMWORK T2, D-195), each an ordinary job on its own
 * piece. Attachments ride to every hand, because "summarise the attached
 * report's A, B and C" needs the report in each hand's own input/; a scoped
 * hand (T4) is briefed on its scope.
 */
function performHands(
  rt: IntakeRuntime,
  hands: JobReading[],
  plan: PartyPlan,
  spec: NonNullable<Job['party']>,
  ride: {
    attachments?: { name: string; data: Buffer }[];
    withholding: boolean;
    scopes?: (string[] | undefined)[];
  },
): Job[] {
  return hands.map((hand, i) => {
    const scope = ride.scopes?.[i];
    return perform(
      rt,
      hand,
      {
        attachments: ride.attachments,
        withholding: ride.withholding,
        ...(scope ? { brief: handBrief(scope) } : {}),
        party: { ...spec, hand: i + 1, ...(scope ? { scope } : {}) },
      },
      `hand ${i + 1} of ${spec.of} — a party on "${plan.asked.words}"`,
    );
  });
}

/**
 * Perform a reading (D-287): one add for plain, step one with the rest for a
 * chain, the hands for a party, the plan job for a party plan — then the
 * queued event. Returns the job the way in answers with: the one job, step
 * one, the first hand, the plan.
 */
export function queue(rt: IntakeRuntime, reading: Reading, extras: QueueExtras = {}): Job {
  const { shape, jobs, text } = reading;
  if (shape === 'party' && reading.party) {
    const spec = partySpec({
      id: newPartyId(),
      of: jobs.length,
      asked: text,
      sendTail: reading.party.sendTail,
      channels: reading.carried,
      answers: reading.answers,
      checked: reading.checked,
    });
    return performHands(rt, jobs, reading.party, spec, {
      attachments: extras.attachments,
      withholding: reading.withholding,
    })[0]!;
  }
  if (shape === 'party plan') {
    // The user asked for a party and wrote no list (TEAMWORK T3, D-196): an
    // architect-class run proposes the split as PARTY.json and queues
    // nothing. Approving the reviewed proposal is what queues the hands
    // (`queueParty` below, from the verdict) — the model proposes, the
    // person disposes, exactly the organizer's MOVES.json shape (D-132).
    const repo = Boolean(rt.meta.repoPath);
    return perform(
      rt,
      jobs[0]!,
      {
        attachments: extras.attachments,
        withholding: reading.withholding,
        party: {
          ...partySpec({
            id: newPartyId(),
            of: 0,
            asked: text,
            channels: reading.carried,
            answers: reading.answers,
            checked: reading.checked,
          }),
          plan: true,
        },
        brief: planBrief({ asked: text, sends: reading.carried.length > 0, repo }),
      },
      'planning a party — the split is reviewed before any hand runs',
    );
  }
  return perform(
    rt,
    jobs[0]!,
    {
      ...extras,
      answers: reading.answers,
      steps: reading.steps,
      step: reading.step,
      withholding: reading.withholding || extras.withholding,
      checked: reading.checked || extras.checked,
    },
    extras.note,
  );
}

/**
 * Queue the hands of a reviewed plan (TEAMWORK T3) — the verdict's way in,
 * bound to the level by `index.ts` (D-287 Q7), taking the options the
 * verdict's `QueueParty` thunk declares. The plan is the reviewer's, not the
 * grammar's, so this is not a reading of the sentence: each hand is read on
 * its own piece, and the spec the plan job stored — channels, answers, the
 * load-bearing marks — is carried forward onto every hand.
 */
export function queueParty(
  rt: IntakeRuntime,
  text: string,
  ctx: IntakeContext,
  plan: PartyPlan,
  opts: Parameters<QueueParty>[2],
): Job[] {
  const { install } = ctx;
  const tools = grantedTools(opts.tools, install.connections(), install.settings(), install.env);
  const hands = plan.hands.map((piece) =>
    readJob(rt, piece, ctx, tools, { ...(opts.repo ? {} : { noRepo: true }), channelsOverride: [] }),
  );
  const carried =
    opts.channels ??
    settledChannels(
      detectChannelAsk(text, install.connections(), install.settings(), install.env),
      opts.channel,
    ).carried;
  const spec = partySpec({
    id: opts.partyId ?? newPartyId(),
    of: plan.hands.length,
    asked: text,
    sendTail: plan.sendTail,
    channels: carried,
    answers: opts.answers,
    checked: wantsCheck(text),
    loadBearing: opts.loadBearing,
    repo: opts.repo,
  });
  return performHands(rt, hands, plan, spec, {
    attachments: opts.attachments,
    withholding: wantsWithholding(text),
    scopes: opts.scopes,
  });
}
