import { serve } from '@hono/node-server';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Agentling,
  AgentlingProfile,
  Cadence,
  CheckVerdict,
  CrewMember,
  Job,
  LevelInfo,
  MergePreview,
  Quote,
  ServerMessage,
  ConnectionInfo,
  SettingsInfo,
  WorkPlan,
} from '@agentlings/shared';
import {
  awaitingVerdict,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  opKey,
  opLabel,
  slugProblem,
  SOCKET_LEVEL_GONE,
  TICK_MS,
} from '@agentlings/shared';
import {
  approvalKey,
  autoBlocker,
  autoSendable,
  describeApproval,
  readApprovals,
  recordApproval,
  setAuto,
} from './approvals';
import { describeAuth, readStoredLogin, shouldRunRealSessions } from './auth';
import {
  cadenceFrom,
  createSchedule,
  describeCadence,
  describeSchedule,
  dueNow,
  markFired,
  readSchedules,
  removeSchedule,
  SCHEDULE_SWEEP_MS,
  setPaused,
  validCadence,
} from './schedules';
import { pickForwards, splitSteps, stepBrief } from './steps';
import { CHECK_SENTENCE, CHECKED_WORK_REPORT, checkBrief, parseCheck, wantsCheck } from './check';
import {
  GATHER_SENTENCE,
  PLAN_SENTENCE,
  type PartyPlan,
  gatherBrief,
  handBrief,
  handFileName,
  handReportName,
  newPartyId,
  outOfScope,
  patchPaths,
  planBrief,
  planParty,
} from './party';
import { capabilityTokens, compileBlockers, compileDoors } from './capability';
import { CHANNELS, outboxRefusal } from './channels';
import { sentOn } from './outbox';
import { wantsWithholding, withholdingLeaks, withholdingRefusal } from './redact';
import { performOutboxSend } from './outboxsend';
import { describe, doorEndpoints, missingSecrets, readConnections } from './connections';
import {
  enabledNames,
  grantedTools,
  readSettings,
  setConnection,
  setIdentity,
  writeSettings,
} from './settings';
import { clarificationLines, questionsFor, sendFacts } from './clarify';
import { activeCrew, crewMembers, syncRoster } from './crew';
import {
  channelShelf,
  detectChannelAsk,
  droppedChannels,
  filelessChannels,
  mentionsChannel,
} from './channel';
import {
  closeBlocker,
  closeLevelFiles,
  closePreview,
  describeClosedLevel,
  listClosedLevels,
  reopenLevelFiles,
} from './close';
import { sweepWorkingCopies, workingCopies } from './sweep';
import { secretValueProblem, storeSecret } from './env';
import {
  accessTokenFromRefresh,
  exchangeCode,
  FlowStore,
  GOOGLE_SECRETS,
  googleContacts,
  googleOtherContacts,
  startCredentials,
} from './google';
import { quoteFor } from './estimate';
import { EventLog } from './events';
import { carryManifest, ClaudeAgentExecutor, COMPILE_TURNS, mapTools } from './executors/claude';
import type { Executor } from './executors/executor';
import { RoutedExecutor } from './executors/routed';
import { SimulatedExecutor } from './executors/simulated';
import { categorise, entriesIn, indexedBySource } from './browse';
import { deliveredIds, DELIVERIES_SHOWN, deliveriesFor } from './deliveries';
import { applyPatch, beginPatch, endPatch, patchFile, patchInFlight } from './gitwork';
import {
  appendKnowledge,
  createLevelFiles,
  discardNotes,
  knowledgeNote,
  levelDir,
  listLevelDirs,
  migrateLegacy,
  newCrewSeed,
  readKnowledge,
  readMeta,
  readRoster,
  THEME_KEYS,
  writeMeta,
  writeRoster,
  type CrewSeed,
  type LevelMeta,
} from './levels';
import { installPack, scanPacks, themeExists } from './packs';
import { packBrief } from './packbrief';
import { ocrAvailable } from './ocr';
import { isStale, readIndex, storeLines, sync, writeIndex } from './store';
import {
  fetchTemplate,
  installState,
  libraryStatus,
  listCompanions,
  loadIndex,
  loadManifest,
  readSources,
  recordInstall,
  reviewWarnings,
  saveIndex,
  skillFolder,
  syncSources,
  type Http,
  type LibraryIndex,
} from './library';
import {
  append as appendLedger,
  closeOpenRows,
  costPerTurn,
  finalize as finalizeLedger,
  ledgerRow,
  openRow,
  readLedger,
  repriceChain,
  settleOutcome,
  totals,
  totalsBy,
} from './ledger';
import { MatchIndex, searchEntries, suggestSetup } from './match';
import { absorptionNote, mergeLessons, proposeMerges } from './merge';
import { MemoryStore } from './memory';
import {
  contentTypeFor,
  describeOutputs,
  opensInBrowser,
  attachedFiles,
  outputNames,
  PREVIOUS_RESULT,
  safeOutputPath,
  deliverySummary,
} from './outputs';
import { pickFolder } from './pickFolder';
import { previewFile } from './preview';
import { isDiscardNote, isJournal, productivityOf, recordOf } from './productivity';
import { JobQueue } from './queue';
import { refineMatch } from './refine';
import {
  installSkill,
  listSkills,
  RoleRegistry,
  roleTextWithSkill,
  toRawUrl,
  writeSkillFile,
} from './roles';
import {
  mergeChats,
  mergeContacts,
  mergeSends,
  readAudience,
  removePerson,
  rosterChannel,
  telegramChats,
  writeAudience,
} from './audience';
import { readSends } from './sends';
import { Sim } from './sim';
import { TOOL_CANDIDATE_RUNS, readRecipes, readToolCandidates } from './recipes';
import {
  RUN_SCRIPT,
  VERIFY_SCRIPT,
  freeToolName,
  installTool,
  isComplete,
  promotionPrompt,
  readTools,
  toolDir,
  toolNameFor,
  writeTool,
} from './tools';
import { type QuoteContext, quoteFor_ } from './quote';
import { validateConnectionSecret } from './validate';
import { callGithub } from './github';
import { callRender } from './render';
import { callBls } from './bls';
import { callCalendar } from './calendar';
import { callMail } from './mail';
import { logDoor, readDoorUsage } from './doorlog';
import { readTrajectory } from './trajectory';
import { callSearch } from './search';
import { appendMovesJournal, executeMoves, reverseMoves } from './moves';
import { folderInventory, wantsOrganize } from './organize';
import { fetchPage } from './web';
import { AUTHOR_ROLE } from './packcontract';
import {
  continuationBrief,
  forceRole,
  planWork,
  queuedJobSpec,
  redoJobSpec,
  replyBrief,
  rosterGapNote,
  runnerRole,
} from './work';

const PORT = 4600;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // repo root
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');
const ROLES_DIR = path.join(ROOT, 'roles');
/** Source images dropped in by hand, and references uploaded here. Untracked. */
const ARTWORK_DIR = path.join(ROOT, 'Artwork');
const SKILLS_DIR = path.join(ROOT, 'skills');
const SOURCES_FILE = path.join(ROOT, 'catalog', 'sources.json');
const CONNECTIONS_FILE = path.join(ROOT, 'catalog', 'connections.json');
const ENV_FILE = path.join(ROOT, '.env');

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // No .env yet — fine.
}

const registry = new RoleRegistry(ROLES_DIR);
registry.load();

/** Built once and reused; installing a template is the only thing that ages it. */
let matchIndex: MatchIndex | null = null;
function matcher(): MatchIndex {
  matchIndex ??= new MatchIndex(registry.loaded(), listSkills(SKILLS_DIR));
  return matchIndex;
}

/** Real HTTP for the library; the sync logic itself takes this as a parameter. */
const http: Http = (url, headers, init) => fetch(url, { headers, ...init });

let library: LibraryIndex | null = loadIndex(SANDBOX_ROOT);
let syncing: Promise<LibraryIndex> | null = null;

/** One sync at a time; callers share the in-flight promise. */
function syncLibrary(): Promise<LibraryIndex> {
  syncing ??= syncSources(readSources(SOURCES_FILE), http, Date.now(), process.env.GITHUB_TOKEN)
    .then((index) => {
      library = index;
      saveIndex(SANDBOX_ROOT, index);
      const failed = index.sources.filter((s) => !s.ok);
      console.log(
        `[agentlings] library: ${index.entries.length} templates from ${index.sources.length - failed.length}/${index.sources.length} sources` +
          (failed.length > 0 ? ` (${failed.map((s) => `${s.repo}: ${s.error}`).join('; ')})` : ''),
      );
      return index;
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

/** API key, a Claude Code login, or an explicit AGENTLINGS_EXECUTOR override. */
const forced = process.env.AGENTLINGS_EXECUTOR;
const auth = describeAuth(process.env, readStoredLogin(), Date.now());
const useClaude = forced ? forced === 'claude' : shouldRunRealSessions(auth);
const simulated = new SimulatedExecutor();
console.log(
  `[agentlings] executor: ${useClaude ? 'claude-agent-sdk' : 'simulated (set ANTHROPIC_API_KEY in .env or AGENTLINGS_EXECUTOR=claude)'}`,
);
// Say it once, at startup, instead of letting the user find out one failed
// agentling at a time.
if (useClaude && auth.problem) console.warn(`[agentlings] ${auth.problem}`);

interface LevelRuntime {
  meta: LevelMeta;
  dir: string;
  queue: JobQueue;
  sim: Sim;
  eventLog: EventLog;
  memory: MemoryStore;
  /** Everyone ever hired here and still on the books, resting crew included. */
  roster: CrewSeed[];
}

const levels = new Map<string, LevelRuntime>();

function saveRoster(rt: LevelRuntime): void {
  rt.roster = syncRoster(rt.roster, rt.sim.agentlings);
  writeRoster(rt.dir, rt.roster);
}

/** Mid-job crew can't be rested, merged or let go until they finish. */
function isBusy(rt: LevelRuntime, id: string): boolean {
  return rt.sim.agentlings.find((a) => a.id === id)?.state === 'working';
}

function makeLevel(dir: string): LevelRuntime {
  const meta = readMeta(dir);
  const queue = new JobQueue(dir);
  const memory = new MemoryStore(path.join(dir, 'memory'));
  const eventLog = new EventLog((event) =>
    sendToLevel(meta.id, { type: 'events', events: [event] }),
  );
  // The deterministic layer wraps whichever executor is in use, so work it
  // recognises never reaches a session at all.
  const executor: Executor = new RoutedExecutor(
    dir,
    () => readKnowledge(dir),
    () => readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'web') ?? null,
    surfaceFor,
    useClaude
      ? new ClaudeAgentExecutor(
          registry,
          memory,
          SKILLS_DIR,
          // What the crew earned plus what you indexed, as one corpus: the
          // session picks the 8 most relevant either way, and a store line
          // carries its own source and date so the prompt stays honest about
          // where each came from. Stale contributes nothing (D-047).
          () => [...readKnowledge(dir), ...storeLines(dir, Date.now())],
          () => readConnections(CONNECTIONS_FILE),
          () => readLedger(SANDBOX_ROOT),
          (channel) => readAudience(SANDBOX_ROOT, rosterChannel(channel)),
          // The newest audited body on the channel — what "the same" means.
          (channel) =>
            readSends(SANDBOX_ROOT)
              .filter((r) => r.channel === channel && r.ok && r.body)
              .at(-1)?.body,
        )
      : simulated,
    // Absent without a key, which is what makes the free tier refuse to claim
    // a search it could not then run.
    process.env.BRAVE_API_KEY
      ? (query: string) =>
          callSearch(
            'search_web',
            { query },
            { http: (url, headers) => fetch(url, { headers }), token: process.env.BRAVE_API_KEY },
          )
      : undefined,
    // Read fresh per run, not captured: a connection switched off in Settings
    // must reach the next compiled-tool run, not the next restart.
    () => readConnections(CONNECTIONS_FILE),
  );
  const roster = readRoster(dir);
  const sim = new Sim(
    activeCrew(roster),
    queue,
    executor,
    (event) => eventLog.emit(event),
    (agentling, job, outcome, detail, lesson) => {
      const date = new Date().toISOString().slice(0, 10);
      const jobTitle = job.title;
      // A learnt lesson is stamped with the job that taught it (D-089), so
      // the profile can tag it; the dedup key strips the stamp, so the same
      // lesson re-taught by a second job replaces rather than piles up.
      const line = lesson
        ? `${date} · ${lesson} (job: ${jobTitle})`
        : outcome === 'done'
          ? `${date} · delivered "${jobTitle}" as ${agentling.role}`
          : `${date} · failed "${jobTitle}" as ${agentling.role} — ${detail}`;
      memory.append(agentling.name, line);
      // Only a run that learnt something writes to the level's shared brain
      // (D-167). The bare job-log line is already in the ledger and in the
      // agentling's own memory on the line above; in KNOWLEDGE.md it could
      // only take a slot from a lesson a later session needed.
      const note = knowledgeNote(date, agentling, jobTitle, outcome, lesson);
      if (note) appendKnowledge(dir, note);

      // Every job goes in the ledger, including the ones we absorb — the
      // difference between cost and price is only visible if both are kept.
      // This closes the row the start opened (D-199).
      finalizeLedger(SANDBOX_ROOT, ledgerRow(job, meta.id, agentling.role, outcome, Date.now()));
      // The one path that sends without review, gated hard (D-082). Fire and
      // forget: a send must never block the finish bookkeeping around it.
      void autoSendIfApproved(dir, queue, eventLog, meta.id, job);
      // A delivered step queues the next through the same glue; a failed
      // one halts the chain with the reason in the feed (D-105).
      const chainRuntime = levels.get(meta.id);
      if (chainRuntime) {
        queueNextStep(chainRuntime, job);
        // The check pass rides the same completion seam (TEAMWORK T1): a
        // finished check settles its verdict on the job it checked; a
        // delivered job the desk asked to have checked queues one.
        if (job.check) settleCheck(chainRuntime, job);
        else queueCheck(chainRuntime, job);
        // And the party's gather (TEAMWORK T2): the last settled hand
        // queues it, exactly as a delivered step queues the next.
        queueGatherIfLastHand(chainRuntime, job);
      }
      // Persist the career as it happens, so a restart no longer wipes it.
      const runtime = levels.get(meta.id);
      if (runtime) {
        const seed = runtime.roster.find((s) => s.id === agentling.id);
        if (seed) seed.lastWorkedAt = Date.now();
        saveRoster(runtime);
      }
    },
    // The row opens the moment the run does, so a process that dies under it
    // leaves an interrupted row at the next start rather than nothing (D-199).
    (agentling, job) =>
      appendLedger(SANDBOX_ROOT, openRow(job, meta.id, agentling.role, Date.now())),
  );
  const rt: LevelRuntime = { meta, dir, queue, sim, eventLog, memory, roster };
  levels.set(meta.id, rt);
  return rt;
}

/**
 * The one path that sends without a human in the moment (D-082). Everything
 * about it is subtractive: it fires only on a clean finish whose whole
 * deliverable is the outbox, only under a standing approval the user earned
 * and then granted, and only to recipients inside that approval's allowlist.
 * Any doubt — a refusal, a partial failure, anything else produced — leaves
 * the job in review exactly as if no approval existed.
 */
async function autoSendIfApproved(
  dir: string,
  queue: JobQueue,
  eventLog: EventLog,
  levelId: string,
  job: Job,
): Promise<void> {
  try {
    if (autoBlocker(job, outputNames(queue.sandboxDir(job.id))) !== null) return;
    const outboxes = job.outbox!;
    const approval = readApprovals(dir).find(
      (a) => a.key === approvalKey(queue.rootPrompt(job.id) ?? job.prompt),
    );
    if (!autoSendable(approval, outboxes)) return;
    const refusal = outboxRefusal(
      outboxes,
      readConnections(CONNECTIONS_FILE),
      readSettings(SANDBOX_ROOT),
      process.env,
    );
    if (refusal) {
      eventLog.emit({
        type: 'progress',
        jobId: job.id,
        title: job.title,
        detail: `standing approval could not send — ${refusal}`,
      });
      return;
    }
    // The one send door, claimed per job (D-160): if a manual Approve is
    // mid-send this instant, auto quietly stands down — the review outcome
    // is already in a human's hands, which is this path's whole philosophy.
    const runs = await performOutboxSend({
      outboxes,
      jobId: job.id,
      levelId,
      dir: queue.sandboxDir(job.id),
      sandboxRoot: SANDBOX_ROOT,
      env: process.env,
      alreadySent: (channel) => sentOn(queue.get(job.id), channel),
      record: (channel, r) => queue.recordOutboxSends(job.id, channel, r),
    });
    if (!runs) return;
    const at = Date.now();
    const sent = runs.reduce((n, r) => n + r.run.sentTo.length, 0);
    const failed = runs.reduce((n, r) => n + r.run.failed.length, 0);
    if (failed > 0) {
      eventLog.emit({
        type: 'progress',
        jobId: job.id,
        title: job.title,
        detail: `standing approval sent ${sent} of ${sent + failed} — the rest waits for your review`,
      });
      return;
    }
    queue.resolve(job.id, 'promote');
    recordApproval(dir, queue.rootPrompt(job.id) ?? job.prompt, outboxes, at);
    eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: `sent automatically — ${sent} via ${runs.map((r) => r.channel).join(' and ')}, standing approval`,
      by: 'app',
    });
  } catch (err) {
    eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `standing approval failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

migrateLegacy(SANDBOX_ROOT);
// Closed levels stay on disk and stay unloaded — reopening is what loads one.
for (const dir of listLevelDirs(SANDBOX_ROOT)) {
  if (!readMeta(dir).closedAt) makeLevel(dir);
}
// Seed only a genuinely empty install: an all-closed map is a decision the
// user made, not an absence to paper over with a fresh HQ.
if (levels.size === 0 && listLevelDirs(SANDBOX_ROOT).length === 0) {
  const meta = createLevelFiles(SANDBOX_ROOT, {
    name: 'HQ',
    project: 'Agentlings dev',
    theme: 'cave',
  });
  makeLevel(levelDir(SANDBOX_ROOT, meta.id));
}

// Every ledger row still open now belongs to a run the last process died
// under — this one has no session running yet — so it is closed as
// interrupted, cost unknown: the ledger's half of what restore() just did to
// the job store (D-199).
const died = closeOpenRows(SANDBOX_ROOT);
if (died > 0) {
  console.log(
    `[agentlings] ${died} run(s) died with the last process — ledger rows closed as interrupted, cost unknown`,
  );
}

// Recover the diffs of runs the last process was killed in the middle of.
// Not awaited: the server should come up now, and a job that has been waiting
// since a crash can wait another second for its patch.
for (const rt of levels.values()) {
  void rt.queue.harvestInterrupted().then((n) => {
    if (n > 0) console.log(`[agentlings] recovered changes from ${n} interrupted job(s)`);
  });
}

/**
 * The queued line's detail: the caller's own note (a firing schedule, a
 * continuation) and, when the job is for a role nobody awake holds, the
 * roster-gap sentence (D-200). Every way in composes it, so a schedule, an
 * inbound message, a chain step, a reply or a compile says what the desk
 * card has said since D-192 — the record was the one place the fallback
 * was still silent.
 */
function queuedDetail(
  rt: LevelRuntime,
  job: Job,
  ...notes: (string | undefined)[]
): { detail?: string } {
  const parts = [...notes, rosterGapNote(rt.sim.agentlings, rt.roster, job.preferredRole)].filter(
    (note): note is string => Boolean(note),
  );
  return parts.length > 0 ? { detail: parts.join(' · ') } : {};
}

function levelInfo(rt: LevelRuntime): LevelInfo {
  const jobs = rt.queue.list();
  return {
    ...rt.meta,
    crew: rt.sim.agentlings.length,
    colors: rt.sim.agentlings.map((a) => a.color),
    jobsDone: rt.sim.agentlings.reduce((sum, a) => sum + a.jobsDone, 0),
    jobsRunning: jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
    // The select screen's notification blocks (D-137): what waits on a
    // decision, what fires on its own, and the ids whose unread-ness only the
    // browser can judge — its seen set never reaches the server. Carried-on
    // legs are decided (D-139), so the badge counts what the desk lists.
    toReview: jobs.filter(awaitingVerdict).length,
    schedules: readSchedules(rt.dir).filter((s) => !s.paused).length,
    finished: deliveredIds(jobs, DELIVERIES_SHOWN),
  };
}

const app = new Hono();

/**
 * Libraries a sandbox can resolve, read once. A sandbox lives inside the
 * project, so Node walks up to the root's node_modules (D-031) — which means
 * installing one changes what every job can do, silently, and a method written
 * before it should stop being treated as settled. Measured then: an agentling
 * that did not know `pdf-lib` existed hand-assembled PDF bytes over several
 * turns, and succeeded, which is what made it expensive rather than wrong.
 */
const LIBRARIES = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    return Object.keys(pkg.dependencies ?? {}).sort();
  } catch {
    return [];
  }
})();

/**
 * Everything a run of this job could do, in one list.
 *
 * The single place that decides what counts as a capability, so the router,
 * the recipe it banks and the one it matches against can never disagree.
 */
function surfaceFor(job: Job, roleName?: string | null): string[] {
  const role = roleName ? registry.get(roleName) : undefined;
  return capabilityTokens({
    connections: job.tools,
    tools: mapTools(role?.tools ?? []),
    skills: (role?.skills ?? []).filter((s) => existsSync(path.join(SKILLS_DIR, s, 'SKILL.md'))),
    libraries: LIBRARIES,
  });
}

/** What `quoteFor_` has to consult, gathered once — none of it varies per call. */
const QUOTE_CTX: QuoteContext = {
  sandboxRoot: SANDBOX_ROOT,
  registry,
  surfaceFor,
  searchToken: () => process.env.BRAVE_API_KEY,
};

/** The registry as the UI sees it, qualified by what the user has switched. */
function connectionList(): ConnectionInfo[] {
  const connections = readConnections(CONNECTIONS_FILE);
  const settings = readSettings(SANDBOX_ROOT);
  return describe(
    connections,
    process.env,
    new Set(enabledNames(connections, settings, process.env)),
    settings.identities ?? {},
  );
}

app.get('/api/settings', (c) =>
  c.json({
    executor: useClaude ? 'claude-agent-sdk' : 'simulated',
    auth,
    connections: connectionList(),
  } satisfies SettingsInfo),
);

/**
 * The channel tiers beyond the wired connections (D-088): planned, and
 * never-with-the-reason. Settings shows them so nobody waits for a channel
 * this menu will not grow.
 */
app.get('/api/channels', (c) => c.json(channelShelf()));

/**
 * Every name this channel could be asked to send to, aliases included.
 *
 * The bare-send test needs them because a recipient is not a subject (D-097):
 * "send a Telegram to Pepo" names a person, and without knowing that "Pepo"
 * is a person it reads as a topic. Names come from the same roster the picker
 * offers, so the two agree by construction — and a channel with nobody on it
 * simply contributes none, which reads every send as content-bearing and is
 * the old behaviour.
 */
function rosterNames(channel: string | undefined): string[] {
  if (!channel) return [];
  return readAudience(SANDBOX_ROOT, rosterChannel(channel)).flatMap((person) => [
    person.name,
    ...(person.username ? [person.username] : []),
    ...(person.aliases ?? []),
  ]);
}

/**
 * The channel's audience (D-092), refreshed on every read — this GET is both
 * the garage's "check for new people" and the picker's quiet refresh, one
 * call doing both by decision. Telegram's getUpdates retains ~24 hours, so
 * whatever it shows is merged and persisted; Gmail merges the user's saved
 * contacts on the consent they already gave (D-122); the send audit is
 * re-merged whole (idempotent) so names reviewed at send time ride in. A
 * missing token degrades to the stored roster; a live source that *refused*
 * — the People API console toggle, a revoked consent — comes back as
 * `problem` beside the stored people, because a wall the user must act on
 * once should never look like an empty address book.
 */
app.get('/api/channels/:channel/audience', async (c) => {
  // Calendar asks for gmail's book (D-124): attendees are email addresses,
  // and the mapping happening here is what lets the client stay ignorant of
  // it — the picker just fetches the channel it is on.
  const channel = rosterChannel(c.req.param('channel'));
  let people = readAudience(SANDBOX_ROOT, channel);
  let problem: string | undefined;
  if (channel === 'telegram' && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      people = mergeChats(people, await telegramChats(process.env.TELEGRAM_BOT_TOKEN));
    } catch {
      // The stored roster is the answer when Telegram is unreachable.
    }
  }
  const googleAuth = {
    clientId: process.env[GOOGLE_SECRETS.clientId],
    clientSecret: process.env[GOOGLE_SECRETS.clientSecret],
    refreshToken: process.env[GOOGLE_SECRETS.refreshToken],
  };
  if (channel === 'gmail' && googleAuth.clientId && googleAuth.clientSecret && googleAuth.refreshToken) {
    const minted = await accessTokenFromRefresh({
      clientId: googleAuth.clientId,
      clientSecret: googleAuth.clientSecret,
      refreshToken: googleAuth.refreshToken,
    });
    if ('error' in minted) {
      problem = minted.error;
    } else {
      // Emailed-people first, the curated book second, so a saved contact's
      // chosen name outranks an auto-collected one in the merge — and if
      // both lists refuse, the saved book's broader sentence keeps the line
      // (D-123); an insufficient-scope refusal on this list alone leaves
      // the reconnect sentence standing beside whatever the book gave.
      const emailed = await googleOtherContacts({ accessToken: minted.token });
      if ('error' in emailed) problem = emailed.error;
      else people = mergeContacts(people, emailed);
      const saved = await googleContacts({ accessToken: minted.token });
      if ('error' in saved) problem = saved.error;
      else people = mergeContacts(people, saved);
    }
  }
  people = mergeSends(people, readSends(SANDBOX_ROOT), channel);
  writeAudience(SANDBOX_ROOT, channel, people);
  return c.json({ people, ...(problem ? { problem } : {}) });
});

/** Un-know someone: the roster forgets them until they say hello again. */
app.delete('/api/channels/:channel/audience/:id', (c) =>
  c.json({
    people: removePerson(SANDBOX_ROOT, rosterChannel(c.req.param('channel')), c.req.param('id')),
  }),
);

/**
 * Turn a connection on or off for every level. Global on purpose: the registry
 * is global, and what the crew may reach is a property of the crew rather than
 * of one world they happen to be working in.
 */
app.patch('/api/settings/connections/:name', async (c) => {
  const name = c.req.param('name');
  const known = readConnections(CONNECTIONS_FILE).some((conn) => conn.name === name);
  if (!known) return c.json({ error: 'no such connection' }, 404);
  const body = await c.req.json<{ enabled?: boolean }>();
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'enabled must be a boolean' }, 400);
  writeSettings(SANDBOX_ROOT, setConnection(readSettings(SANDBOX_ROOT), name, body.enabled));
  return c.json(connectionList());
});

/**
 * Accepts a pasted secret for a connection: validated with one real call
 * first, then written to `.env` and the live `process.env` — the same single
 * store the server loads at boot, so nothing needs a restart and no second
 * store exists to disagree with this one (D-078).
 *
 * The value crosses the API exactly once, inbound, right here. It is never
 * returned, never listed, and never echoed in an error. Storing does not
 * enable: everything credentialed still ships off, and the switch stays the
 * user's own move.
 */
app.post('/api/settings/connections/:name/secret', async (c) => {
  const name = c.req.param('name');
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === name);
  if (!connection) return c.json({ error: 'no such connection' }, 404);
  const body = await c.req.json<{
    secret?: string;
    value?: string;
    values?: Record<string, unknown>;
  }>();
  // One submission carries every value the connection still needs. A
  // two-secret connection (WhatsApp Business) can only be validated whole —
  // its one real call needs both halves — and "validated before stored"
  // has to hold for the set, not per field (D-078, D-081).
  const offered = body.values ?? (body.secret ? { [body.secret]: body.value } : {});
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(offered)) {
    if (!Object.hasOwn(connection.secrets ?? {}, key)) {
      return c.json({ error: `"${name}" declares no secret named "${key}"` }, 400);
    }
    const value = typeof raw === 'string' ? raw.trim() : '';
    const problem = secretValueProblem(value);
    if (problem) return c.json({ error: `${key}: ${problem}` }, 400);
    values[key] = value;
  }
  if (Object.keys(values).length === 0) return c.json({ error: 'paste the token first' }, 400);
  const stillMissing = missingSecrets(connection, { ...process.env, ...values });
  if (stillMissing.length > 0) {
    return c.json(
      { error: `still needs ${stillMissing.join(', ')} — fill every field, then Check` },
      400,
    );
  }
  const verdict = await validateConnectionSecret(name, { ...process.env, ...values });
  if (!verdict.ok) return c.json({ error: verdict.reason ?? 'the key did not validate' }, 400);
  for (const [key, value] of Object.entries(values)) {
    storeSecret(ENV_FILE, key, value, process.env);
  }
  if (verdict.identity) {
    writeSettings(SANDBOX_ROOT, setIdentity(readSettings(SANDBOX_ROOT), name, verdict.identity));
  }
  return c.json({ connections: connectionList(), identity: verdict.identity ?? null });
});

/**
 * Google's Connect flow (D-080): the two-field start, then the loopback
 * callback. The client id and secret live only in the pending flow until the
 * exchange succeeds — a flow that never comes back stores nothing anywhere,
 * which is D-078's rule stretched over two requests.
 */
const googleFlows = new FlowStore();
const GOOGLE_REDIRECT = `http://127.0.0.1:${PORT}/api/oauth/google/callback`;

app.post('/api/settings/connections/google/oauth/start', async (c) => {
  const body = await c.req.json<{ clientId?: string; clientSecret?: string }>();
  // Typed secrets win; the stored client answers an empty ask — that is the
  // connected card's re-approve, which re-walks consent so a widened scope
  // list can actually be granted (D-123). Validation still guards both
  // sources: a truly absent client gets the same sentences as before.
  const { clientId, clientSecret } = startCredentials(body, process.env);
  for (const [label, value] of [
    ['client id', clientId],
    ['client secret', clientSecret],
  ] as const) {
    const problem = secretValueProblem(value);
    if (problem) return c.json({ error: `${label}: ${problem}` }, 400);
  }
  const { url } = googleFlows.begin(clientId, clientSecret, GOOGLE_REDIRECT, Date.now());
  return c.json({ url });
});

/** A whole page, because this tab is Google's redirect and not the app. */
function oauthPage(title: string, detail: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Agentlings</title>',
    '<style>body{font:15px/1.6 system-ui,sans-serif;background:#10131a;color:#d8dce6;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:34rem;padding:2rem;text-align:center}h1{font-size:1.15rem}</style>',
    `</head><body><main><h1>${esc(title)}</h1><p>${esc(detail)}</p></main></body></html>`,
  ].join('');
}

app.get('/api/oauth/google/callback', async (c) => {
  const { code, state, error } = c.req.query();
  if (error) {
    return c.html(oauthPage('Not connected', `Google said: ${error}. You can close this tab.`), 400);
  }
  const flow = googleFlows.take(state ?? '', Date.now());
  if (!flow || !code) {
    return c.html(
      oauthPage(
        'Not connected',
        'This sign-in link is stale or already used — go back to Agentlings and press Connect again.',
      ),
      400,
    );
  }
  const got = await exchangeCode({
    code,
    verifier: flow.verifier,
    clientId: flow.clientId,
    clientSecret: flow.clientSecret,
    redirectUri: GOOGLE_REDIRECT,
  });
  if ('error' in got) {
    return c.html(oauthPage('Not connected', `${got.error} You can close this tab.`), 400);
  }
  // The exchange succeeding is the validation (D-078): only now does
  // anything land in .env, all three in one move.
  storeSecret(ENV_FILE, GOOGLE_SECRETS.clientId, flow.clientId, process.env);
  storeSecret(ENV_FILE, GOOGLE_SECRETS.clientSecret, flow.clientSecret, process.env);
  storeSecret(ENV_FILE, GOOGLE_SECRETS.refreshToken, got.refreshToken, process.env);
  if (got.email) {
    writeSettings(SANDBOX_ROOT, setIdentity(readSettings(SANDBOX_ROOT), 'google', got.email));
  }
  return c.html(
    oauthPage(
      'Connected',
      `${got.email ?? 'Your Google account'} is connected. Close this tab and return to Agentlings — the switch in Settings is still yours to flip.`,
    ),
  );
});

app.get('/api/levels', (c) =>
  c.json(
    [...levels.values()]
      .sort((a, b) => a.meta.createdAt - b.meta.createdAt)
      .map((rt) => levelInfo(rt)),
  ),
);

/**
 * The level packs installed right now, whole — theme, ops and all.
 *
 * Sent in full rather than as a list of names the client then fetches: the
 * server has already read and validated every one, and handing back only the
 * names would mean the client fetching the same files again and deciding for a
 * second time whether they are usable. Rejected packs come back too, with
 * their reasons, so a pack that does not appear in the world can say why
 * instead of just being absent.
 *
 * Read from disk per request, so dropping a folder in and reloading is the
 * whole install; there is no cache to invalidate and no restart to remember.
 */
app.get('/api/packs', (c) => {
  const scan = scanPacks(ROOT);
  return c.json({
    installed: scan.installed.map((p) => ({ slug: p.slug, pack: p.pack })),
    rejected: scan.rejected,
  });
});

app.post('/api/levels', async (c) => {
  const body = await c.req.json<{ name?: string; project?: string; theme?: string }>();
  // A built-in, or a pack installed on disk — which is why this asks rather
  // than matching against a fixed list.
  const theme = body.theme?.trim();
  if (!body.name?.trim() || !theme || !themeExists(ROOT, theme)) {
    return c.json({ error: 'name and a valid theme are required' }, 400);
  }
  const meta = createLevelFiles(SANDBOX_ROOT, {
    name: body.name.trim(),
    project: body.project?.trim() || 'General',
    theme,
  });
  const rt = makeLevel(levelDir(SANDBOX_ROOT, meta.id));
  return c.json(levelInfo(rt), 201);
});

function getLevel(id: string): LevelRuntime | undefined {
  return levels.get(id);
}

/** Who is mid-job right now, for the close guard's named refusal. */
function workingName(rt: LevelRuntime): string | undefined {
  return rt.sim.agentlings.find((a) => a.state === 'working')?.name;
}

/** The closed shelf: still on disk, whole, and one button from coming back. */
app.get('/api/levels/closed', (c) =>
  c.json(listClosedLevels(SANDBOX_ROOT).map(({ dir, meta }) => describeClosedLevel(dir, meta))),
);

/**
 * What closing would keep and stop, before the button — the merge preview's
 * grammar. The confirmation names consequences (schedules stop, granted
 * approvals lapse, reviews wait) instead of asserting safety.
 */
app.get('/api/levels/:lid/close/preview', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(
    closePreview({
      jobs: rt.queue.list(),
      workingName: workingName(rt),
      recipes: readRecipes(rt.dir).length,
      notes: readKnowledge(rt.dir).length,
      crew: rt.roster.map((seed) => seed.name),
      schedules: readSchedules(rt.dir),
      approvals: readApprovals(rt.dir),
    }),
  );
});

/**
 * Closing a level. An archive, not a delete: the folder stays whole under
 * levels/ (the id is never reissued, the ledger's rows keep their referent),
 * schedules pause, and the runtime stops — the tick and schedule sweeps both
 * walk the levels map, so removal from it is the whole stop. The app has no
 * route that destroys a level's data, deliberately (D-111's counterpart: the
 * app offers the reversible act; the irreversible one stays out of reach).
 */
app.delete('/api/levels/:lid', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const blocker = closeBlocker(rt.queue.list(), workingName(rt));
  if (blocker) return c.json({ error: blocker }, 409);
  const closedAt = closeLevelFiles(rt.dir, Date.now());
  levels.delete(rt.meta.id);
  sentJobsRev.delete(rt.meta.id);
  // The same signal a vanished level already sends (SOCKET_LEVEL_GONE), so a
  // watcher leaves for the select screen instead of retrying forever.
  for (const [socket, subscribed] of subscriptions) {
    if (subscribed === rt.meta.id) socket.close(SOCKET_LEVEL_GONE, 'level closed');
  }
  return c.json({ id: rt.meta.id, closedAt });
});

/**
 * Back on the map exactly as left. Schedules stay paused — a level asleep
 * for months must not fire a catch-up on waking — and the client names any
 * standing approvals, which never stopped being granted, before this is
 * pressed.
 */
app.post('/api/levels/:lid/reopen', (c) => {
  const lid = c.req.param('lid');
  if (levels.has(lid)) return c.json({ error: 'already open' }, 400);
  const dir = levelDir(SANDBOX_ROOT, lid);
  if (!existsSync(path.join(dir, 'level.json'))) return c.json({ error: 'unknown level' }, 404);
  if (!readMeta(dir).closedAt) return c.json({ error: 'already open' }, 400);
  reopenLevelFiles(dir);
  return c.json(levelInfo(makeLevel(dir)));
});

/** The measured disk answer: repo/ clones under resolved jobs, nothing else. */
app.get('/api/working-copies', async (c) => c.json(await workingCopies(SANDBOX_ROOT)));

app.post('/api/working-copies/sweep', async (c) => c.json(await sweepWorkingCopies(SANDBOX_ROOT)));

app.get('/api/levels/:lid/state', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(rt.sim.state());
});

app.post('/api/levels/:lid/jobs', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ title?: string; prompt?: string; repoPath?: string }>();
  if (!body.title?.trim() || !body.prompt?.trim()) {
    return c.json({ error: 'title and prompt are required' }, 400);
  }
  const prompt = body.prompt.trim();
  // Only what the caller passed. This route does not inherit the level's
  // repository — that is `/work`'s behaviour and changing it here would hand
  // every job a clone it never used to get. The quote is priced on this same
  // value, so it describes the run that will actually happen.
  const repoPath = body.repoPath?.trim() || undefined;
  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, repoPath, prompt);
  const tools = granted(undefined);
  const job = rt.queue.add(
    queuedJobSpec({
      title: body.title.trim(),
      prompt,
      repoPath,
      tools,
      plan,
      quote: quoteFor_(QUOTE_CTX, rt.dir, prompt, tools, runnerRole(plan), repoPath),
    }),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title, ...queuedDetail(rt, job) });
  return c.json(job, 201);
});

/** What the app would do with a sentence — shown before anything is queued. */
app.post('/api/levels/:lid/work/plan', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{
    text?: string;
    tools?: string[];
    channel?: string;
    /**
     * What the card has been filled in with so far. The desk re-plans as the
     * user types, so the send facts arriving here are what let the quote flip
     * to free the moment both are in hand (D-097).
     */
    answers?: Record<string, string>;
    /** The user chose "run as one job" — plan it unsplit (D-105). */
    single?: boolean;
    /**
     * This is the New Level dialog pricing a world before its button is
     * pressed. The desk says what kind of job it is; the server decides which
     * role that means, so the quote shown is the quote charged.
     */
    authoring?: boolean;
  }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  // The split Start will queue (D-105), previewed like every other plan
  // fact — each step quoted on its own sentence, because per-step tiers
  // are the point of splitting at all.
  const split = body.single === true ? null : splitSteps(text);
  const stepPlans = split
    ? split.map((sentence) => {
        const stepDraft = planWork(
          matcher(),
          registry.list(),
          rt.sim.agentlings,
          rt.meta.repoPath,
          sentence,
        );
        return {
          sentence,
          title: stepDraft.title,
          quote: quoteFor_(
            QUOTE_CTX,
            rt.dir,
            sentence,
            granted(body.tools),
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
  const partyPlanned = body.single === true || split ? null : planParty(text);
  const partyPlans =
    partyPlanned && 'hands' in partyPlanned
      ? {
          words: partyPlanned.asked.words,
          ...(partyPlanned.sendTail ? { sendTail: partyPlanned.sendTail } : {}),
          hands: partyPlanned.hands.map((sentence) => {
            const handDraft = planWork(
              matcher(),
              registry.list(),
              rt.sim.agentlings,
              undefined,
              sentence,
            );
            return {
              sentence,
              title: handDraft.title,
              quote: quoteFor_(
                QUOTE_CTX,
                rt.dir,
                sentence,
                granted(body.tools),
                runnerRole(handDraft),
                undefined,
              ),
            };
          }),
          gather: {
            quote: quoteFor_(
              QUOTE_CTX,
              rt.dir,
              GATHER_SENTENCE,
              granted(body.tools),
              runnerRole(planWork(matcher(), registry.list(), rt.sim.agentlings, undefined, text)),
              undefined,
            ),
          },
        }
      : null;
  // A near-miss the user confirmed (D-093): the client re-plans naming the
  // channel, so the send questions come from the server like any other —
  // honoured only for channels that exist, like every pick.
  const confirmed =
    typeof body.channel === 'string' && CHANNELS[body.channel] ? body.channel : undefined;
  const matchedDraft = planWork(
    matcher(),
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
    body.authoring === true && registry.get(AUTHOR_ROLE)
      ? forceRole(matchedDraft, AUTHOR_ROLE, rt.sim.agentlings)
      : wantsOrganize(text) && registry.get('worker')
        ? forceRole(matchedDraft, 'worker', rt.sim.agentlings)
        : matchedDraft;
  // Derived at ask time from the catalog and Settings, so the same sentence
  // gets a different card once a channel is connected (D-079).
  const channelAsk = detectChannelAsk(
    text,
    readConnections(CONNECTIONS_FILE),
    readSettings(SANDBOX_ROOT),
    process.env,
  );
  // Settled before the quote now, because whether this is free depends on it:
  // a send the desk holds whole is composed in code (D-097), and the card has
  // to say so while the user is still deciding.
  const askChannel = channelAsk?.channel ?? channelAsk?.asked ?? confirmed;
  // The channels Start would carry (D-179) — the same wired-only rule
  // `queueSentence` settles by, so the card and the queued job agree about
  // how many sends this is.
  const askChannels = [
    ...(channelAsk?.channel && CHANNELS[channelAsk.channel] ? [channelAsk.channel] : []),
    ...(confirmed && CHANNELS[confirmed] && confirmed !== channelAsk?.channel ? [confirmed] : []),
    ...(channelAsk?.also ?? [])
      .map((option) => option.channel)
      .filter((name) => CHANNELS[name] && name !== channelAsk?.channel && name !== confirmed),
  ];
  const names = rosterNames(askChannel);
  const send = sendFacts(text, { channel: askChannel, names }, body.answers);
  // The quote decides whether asking is worth it at all, and the quote needs
  // the role the draft settles — so the questions are filled in last.
  const quote = quoteFor_(
    QUOTE_CTX,
    rt.dir,
    text,
    granted(body.tools),
    runnerRole(draft),
    rt.meta.repoPath || undefined,
    false,
    undefined,
    send ?? undefined,
    askChannel,
  );
  return c.json({
    ...draft,
    quote,
    ...(stepPlans ? { steps: stepPlans } : {}),
    ...(partyPlans ? { party: partyPlans } : {}),
    // A blocked party carries the planner offer, priced (TEAMWORK T3): the
    // desk can say what pressing the button costs before it is pressed.
    ...(partyPlanned && 'blocked' in partyPlanned
      ? {
          partyBlocked: partyPlanned.blocked,
          planQuote: quoteFor_(
            QUOTE_CTX,
            rt.dir,
            PLAN_SENTENCE,
            granted(body.tools),
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
      const read = cadenceFrom(text);
      return read
        ? { cadence: { ...read, label: describeCadence(read.cadence) } }
        : {};
    })(),
    // A file asked to ride on a channel that cannot carry one. Said here
    // because the outbox contract only refuses it at the end, once the run is
    // written and paid for. Read against the channels Start would actually
    // carry, so a file that rides on one of two channels names only the other.
    ...(() => {
      const noFiles = filelessChannels(text, askChannels.length ? askChannels : askChannel ? [askChannel] : []);
      return noFiles.length ? { noFiles } : {};
    })(),
    // A folder reorganization is asked for by picking the folder, the way a
    // send asks for its recipient (D-132): the sentence wants organizing, but
    // only the native picker yields the absolute path, so the desk shows a
    // "choose the folder" step rather than claiming one from the words.
    ...(wantsOrganize(text) ? { organize: true } : {}),
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
  });
});

/**
 * One sentence in, a queued job out. The project folder is asked for once per
 * level and remembered; '' records that the user declined.
 */
/**
 * Files that came with the request, as bytes.
 *
 * They ride with the request that creates the job rather than being uploaded
 * first and referenced later, which is what removes the staging area and the
 * orphans that come with one — there is no window in which bytes exist with no
 * job to own them.
 *
 * The caps are the point of failing loudly here: a large document read into a
 * session's context can eat the turn budget the quote was built from, and the
 * quote does not know attachments exist.
 */
function decodeAttachments(
  files: { name?: string; data?: string }[] | undefined,
): { name: string; data: Buffer }[] {
  if (!files?.length) return [];
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`too many files — ${MAX_ATTACHMENTS} at most`);
  }
  return files.map((file) => {
    const name = file.name?.trim();
    if (!name || typeof file.data !== 'string') throw new Error('each file needs a name and data');
    const data = Buffer.from(file.data, 'base64');
    if (data.length === 0) throw new Error(`"${name}" is empty`);
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${name}" is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
    }
    return { name, data };
  });
}

/**
 * Every channel a sentence settles (D-179), the settled one first.
 *
 * The others come from the same ask the card was built from, and only ones
 * that exist and are not the settled one — a `planned` or `never` channel
 * fell out of the ask already, and adding it here would put a contract in
 * the brief for a client that cannot send. A caller's explicit pick keeps
 * its meaning: it settles which channel leads, it does not cancel the rest
 * of the sentence. A settled channel is not required for the rest to ride:
 * "send it on WhatsApp and email Ana" settles nothing (WhatsApp is refused)
 * while Gmail is perfectly sendable.
 *
 * One function because two callers need it — queueSentence for every
 * ordinary job, queueParty for the channels the gather will carry — and two
 * derivations of one list is D-030's mistake.
 */
function settledChannels(
  detected: ReturnType<typeof detectChannelAsk>,
  requested?: string,
): { channel?: string; carried: string[] } {
  const fromAsk = requested ? null : detected;
  const channel =
    requested && CHANNELS[requested]
      ? requested
      : fromAsk?.channel && CHANNELS[fromAsk.channel]
        ? fromAsk.channel
        : undefined;
  const alsoWired = (detected?.also ?? [])
    .map((option) => option.channel)
    .filter((name) => CHANNELS[name] && name !== channel);
  return { channel, carried: [...(channel ? [channel] : []), ...alsoWired] };
}

/**
 * One sentence becomes one queued job — the body every way in shares.
 *
 * The /work route and the schedule sweep both call this (D-103), for
 * queuedJobSpec's reason one level down: three separate faults in one day
 * were a field the route knew about and the thing building the object did
 * not (D-097), and a second hand-rolled copy of this glue is where the
 * fourth would live. The title is derived and the repository is the
 * level's; the channel is server-settled — a caller's pick counts only if
 * the channel exists, else the detected ask's own channel rides — and
 * every caller is quoted, because a scheduled firing is a new way in and
 * an unquoted way in is the D-027 bug.
 */
function queueSentence(
  rt: LevelRuntime,
  fullText: string,
  opts: {
    tools?: string[];
    channel?: string;
    /** The real folder to reorganize, picked at intake (D-132). */
    organizeRoot?: string;
    answers?: Record<string, string>;
    attachments?: { name: string; data: Buffer }[];
    /** How this job came to exist, said on the queued event's line. */
    note?: string;
    /** The chain, when the caller is the chain itself (D-105). */
    steps?: string[];
    step?: { n: number; of: number };
    /** Standing instructions for the session, rides Job.brief. */
    brief?: string;
    /** The user chose "run as one job" — the split is skipped. */
    noSplit?: boolean;
    /**
     * The role this job is for, when the route knows and the sentence does
     * not. Honoured only for a role that exists, so a caller cannot invent a
     * class the ledger would then carry.
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
    /** The chain asked for something to be kept out (D-183). */
    withholding?: boolean;
    /** The chain asked for the work to be checked (TEAMWORK T1, D-194). */
    checked?: boolean;
    /** This job is a check pass: the job it checks, and whose work to avoid. */
    check?: { of: string; avoid?: string };
    /** This job is a hand of a work party, or its gather (TEAMWORK T2). */
    party?: Job['party'];
    /**
     * The channels this job carries, decided by the caller instead of by
     * detection — the party seam: [] for hands, the party's settled list
     * for the gather.
     */
    channelsOverride?: string[];
  } = {},
): Job {
  // The split happens inside the glue (D-105), so every way in composes:
  // a scheduled composite sentence splits at fire time exactly as a typed
  // one splits at Start. A chain-queued step arrives with its chain already
  // decided and is never re-split.
  let text = fullText;
  let steps = opts.steps;
  let step = opts.step;
  let withholding = opts.withholding === true;
  if (!opts.noSplit && steps === undefined && step === undefined) {
    const split = splitSteps(fullText);
    if (split) {
      text = split[0];
      steps = split.slice(1);
      step = { n: 1, of: split.length };
      // Read off the WHOLE sentence, before the split loses it (D-183). "…then
      // redact the client names, then email it to the partners" asks for a
      // withholding in step three and sends in step four, and step four's own
      // words say nothing about it — so the chain carries the flag rather than
      // each step re-deriving it from a sentence that no longer contains it.
      if (wantsWithholding(fullText)) withholding = true;
    }
  }
  // Read off the whole sentence for D-183's reason: the deliverable lands at
  // the end of a chain, so "…, have it checked" must ride every step and act
  // on the last, whatever step the words fell into. A chain-queued step
  // arrives with the flag already decided in opts.
  const checked = opts.checked === true || wantsCheck(fullText);
  const jobRepoPath = opts.noRepo ? '' : rt.meta.repoPath;
  const matched = planWork(matcher(), registry.list(), rt.sim.agentlings, jobRepoPath, text);
  // An organize job routes to the generalist worker, which carries the
  // organizing skill (D-132) — the folder, not the sentence's verb, is what
  // makes it one, so the role is forced rather than matched.
  const forcedRole = opts.organizeRoot ? 'worker' : opts.role;
  const plan =
    forcedRole && registry.get(forcedRole)
      ? forceRole(matched, forcedRole, rt.sim.agentlings)
      : matched;
  const tools = granted(opts.tools);
  const requestedChannel = opts.channel;
  // Detected once and read twice. `channelAsk` keeps its old meaning — the ask
  // the *card* made, which a caller's own pick supersedes — while the stamp
  // below needs what the sentence asked for however the channel was settled:
  // picking Gmail on the fork card makes Telegram the dropped one, and a
  // stamp built from `channelAsk` alone would name neither.
  const detected = detectChannelAsk(
    text,
    readConnections(CONNECTIONS_FILE),
    readSettings(SANDBOX_ROOT),
    process.env,
  );
  const channelAsk = requestedChannel ? null : detected;
  const { channel, carried: settled } = settledChannels(detected, requestedChannel);
  // A party job's channels are decided by the party, never re-detected
  // (TEAMWORK T2): hands carry [] because a hand never sends, and the
  // gather carries what Start settled for the whole request.
  const carried = opts.channelsOverride
    ? opts.channelsOverride.filter((name) => CHANNELS[name])
    : settled;
  const channels = carried.length > 0 ? carried : undefined;
  // Read from the same sentence and the same answers the card was quoted on,
  // through the one function both ways in share — a desk that promised free
  // and a queue that then billed a session would be the worst of both (D-097).
  const names = rosterNames(channel ?? channelAsk?.asked);
  // Never for a step of a chain. The desk asked its send questions of the
  // whole sentence, so a chain's answers were given under whichever promise
  // that sentence earned — "what should it say, roughly?" — and a step whose
  // own sentence happens to read as a bare send would then compose those words
  // verbatim under the other promise. That is D-097's fault inverted, and the
  // shortcut is not owed here anyway: before the answers travelled at all, a
  // chain could never take it.
  const inChain = Boolean(steps?.length || step);
  const send = inChain ? null : sendFacts(text, { channel, names }, opts.answers);
  const quote = quoteFor_(
    QUOTE_CTX,
    rt.dir,
    text,
    tools,
    runnerRole(plan),
    jobRepoPath || undefined,
    false,
    undefined,
    send ?? undefined,
    channel,
  );
  const job = rt.queue.add(
    queuedJobSpec({
      title: plan.title,
      prompt: text,
      repoPath: jobRepoPath || undefined,
      tools,
      plan,
      quote,
      // Recomputed from the same sentence rather than trusted from the caller,
      // so the only instructions that can reach a session are ones the user
      // was actually shown.
      clarifications: clarificationLines(
        text,
        // The same channel context the plan showed, or the send answers would
        // be dropped by the recompute: the settled channel when one rides,
        // else the detected ask's name (a draft still asked its facts).
        {
          hasRepo: !!rt.meta.repoPath,
          tier: quote.tier,
          channel: channel ?? channelAsk?.asked,
          channels,
          names,
        },
        opts.answers,
      ),
      attachments: opts.attachments ?? [],
      channels,
      ...(opts.organizeRoot ? { organizeRoot: opts.organizeRoot } : {}),
      ...(send ? { send } : {}),
      ...(opts.brief ? { brief: opts.brief } : {}),
      ...(steps?.length ? { steps } : {}),
      ...(step ? { step } : {}),
      // The card's answers ride on while the chain has steps left, so a
      // question the desk asked of the whole sentence still reaches the step
      // that asks it too — the recompute below decides which ones those are.
      ...(opts.answers ? { answers: opts.answers } : {}),
      ...(withholding ? { withholding: true } : {}),
      ...(checked ? { checked: true } : {}),
      ...(opts.check ? { check: opts.check } : {}),
      ...(opts.party ? { party: opts.party } : {}),
      // A channel word the job is NOT carrying (D-093): stamped so the
      // review can say approving sends nothing, with the reply as the way
      // out — the same table the ask reads, one notion.
      ...(channel
        ? {}
        : (() => {
            const mention = mentionsChannel(text);
            return mention
              ? { channelMention: { channel: mention.channel, label: mention.label } }
              : {};
          })()),
      // The channels this sentence genuinely asked for that a one-channel job
      // cannot take (D-178). Every channel the ask named, minus the one being
      // carried — so the set is right whichever of them the job ended up on,
      // and a draft job that asked for two still says it sends neither.
      ...(() => {
        const dropped = droppedChannels(detected, channels);
        return dropped.length > 0 ? { alsoAsked: dropped } : {};
      })(),
    }),
  );
  rt.eventLog.emit({
    type: 'queued',
    jobId: job.id,
    title: job.title,
    ...queuedDetail(rt, job, opts.note),
  });
  return job;
}

/**
 * A delivered step queues the next one (D-105) — through the same glue as
 * every way in, as an ordinary job whose input/ holds this step's output.
 * A failed step halts the chain with the reason in the feed; there is no
 * waiting job anywhere, because the next step does not exist until here.
 */
function queueNextStep(rt: LevelRuntime, job: Job): void {
  if (!job.steps?.length || !job.step) return;
  const n = job.step.n + 1;
  const of = job.step.of;
  if (job.status === 'failed') {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `step ${n} of ${of} not queued — step ${job.step.n} delivered nothing`,
    });
    return;
  }
  const dir = rt.queue.sandboxDir(job.id);
  const { take, leftBehind } = pickForwards(outputNames(dir));
  const attachments: { name: string; data: Buffer }[] = [];
  const oversize: string[] = [];
  // The report travels under an alias so it cannot collide with the next
  // step's own RESULT.md, and it rides first — it is the handover.
  const report = path.join(dir, 'RESULT.md');
  if (existsSync(report)) {
    const data = readFileSync(report);
    if (data.length <= MAX_ATTACHMENT_BYTES) {
      attachments.push({ name: 'previous-step.md', data });
    }
  }
  for (const name of take) {
    const data = readFileSync(path.join(dir, name));
    if (data.length > MAX_ATTACHMENT_BYTES) {
      oversize.push(name);
      continue;
    }
    attachments.push({ name, data });
  }
  try {
    queueSentence(rt, job.steps[0], {
      attachments,
      steps: job.steps.slice(1),
      step: { n, of },
      // What the user typed on the card, still travelling with the chain: this
      // step re-derives its own questions from its own sentence, so it hears
      // only the answers it would itself have asked for.
      ...(job.answers ? { answers: job.answers } : {}),
      // The chain's withholding rides to every later step (D-183), and the
      // check flag rides for the same reason — only the last step acts on it.
      ...(job.withholding ? { withholding: true } : {}),
      ...(job.checked ? { checked: true } : {}),
      brief: stepBrief({
        previousPrompt: job.prompt,
        n,
        of,
        forwarded: attachments.filter((a) => a.name !== 'previous-step.md').map((a) => a.name),
        leftBehind: [...leftBehind, ...oversize],
        hadReport: attachments.some((a) => a.name === 'previous-step.md'),
      }),
      note: `step ${n} of ${of} — queued by step ${job.step.n}'s delivery`,
    });
  } catch (err) {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `step ${n} of ${of} could not queue — ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * A delivered job the desk asked to have checked queues its check pass
 * (TEAMWORK T1, D-194) — through the same glue as every way in, exactly as a
 * chain queues its next step: the check job does not exist until here, so
 * there is no waiting status anywhere. Only the last step of a chain checks
 * (the flag rides the chain like withholding; the deliverable lands at the
 * end), and a check job never checks itself.
 */
function queueCheck(rt: LevelRuntime, job: Job): void {
  if (!job.checked || job.check) return;
  if (job.steps?.length) return;
  if (job.status !== 'done' && job.status !== 'partial') {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: 'check not queued — nothing was delivered',
    });
    return;
  }
  const dir = rt.queue.sandboxDir(job.id);
  const { take, leftBehind } = pickForwards(outputNames(dir));
  const attachments: { name: string; data: Buffer }[] = [];
  const oversize: string[] = [];
  // The checked job's report travels renamed (D-146's discipline): it must
  // never look like the checker's own work, and the brief points at the
  // exact name through the shared constant.
  const report = path.join(dir, 'RESULT.md');
  if (existsSync(report)) {
    const data = readFileSync(report);
    if (data.length <= MAX_ATTACHMENT_BYTES) {
      attachments.push({ name: CHECKED_WORK_REPORT, data });
    }
  }
  for (const name of take) {
    const data = readFileSync(path.join(dir, name));
    if (data.length > MAX_ATTACHMENT_BYTES) {
      oversize.push(name);
      continue;
    }
    attachments.push({ name, data });
  }
  // The checker runs as the role that RAN the work — same doors, same class
  // rate, no new price class — resolved the way a continuation resolves it:
  // who actually held the job, then the roster, then the matched role.
  const role =
    rt.sim.agentlings.find((a) => a.id === job.assignedTo)?.role ??
    rt.roster.find((s) => s.id === job.assignedTo)?.role ??
    job.preferredRole;
  try {
    queueSentence(rt, CHECK_SENTENCE, {
      noSplit: true,
      ...(role && registry.get(role) ? { role } : {}),
      ...(job.tools?.length ? { tools: job.tools } : {}),
      attachments,
      check: { of: job.id, ...(job.assignedTo ? { avoid: job.assignedTo } : {}) },
      ...(job.withholding ? { withholding: true } : {}),
      brief: checkBrief({
        checkedPrompt: job.prompt,
        checkedBrief: job.brief,
        hadReport: attachments.some((a) => a.name === CHECKED_WORK_REPORT),
        forwarded: attachments.filter((a) => a.name !== CHECKED_WORK_REPORT).map((a) => a.name),
        leftBehind: [...leftBehind, ...oversize],
        // Named, not forwarded (D-194 amendment): the checker is told what
        // it cannot see, so an unverifiable claim is marked by rule rather
        // than by the checker's own detective work.
        inputsNotHanded: existsSync(rt.queue.inputDir(job.id))
          ? readdirSync(rt.queue.inputDir(job.id))
          : [],
      }),
      note: `check pass — verifying "${job.title}"`,
    });
  } catch (err) {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `check could not queue — ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * A finished check pass lands its verdict on the job it checked (TEAMWORK
 * T1). The verdict informs — the reviewer reads it, the auto-send gate
 * refuses on anything short of `confirmed` — and never authorises; Approve
 * stays the one send. A refuted claim is written into the checked member's
 * own memory, because the disagreements are the training signal the
 * clean-success loop never banks.
 */
function settleCheck(rt: LevelRuntime, checkJob: Job): void {
  const of = checkJob.check?.of;
  if (!of) return;
  const primary = rt.queue.get(of);
  if (!primary) return;
  const parsed = parseCheck(rt.queue.sandboxDir(checkJob.id));
  const by =
    rt.roster.find((s) => s.id === checkJob.assignedTo)?.name ??
    rt.sim.agentlings.find((a) => a.id === checkJob.assignedTo)?.name;
  const verdict: CheckVerdict = {
    ...(parsed ?? { verdict: 'unchecked' as const, note: 'the check never reported' }),
    jobId: checkJob.id,
    ...(by ? { by } : {}),
  };
  rt.queue.recordCheckVerdict(primary.id, verdict);
  rt.eventLog.emit({
    type: 'progress',
    jobId: primary.id,
    title: primary.title,
    detail:
      verdict.verdict === 'confirmed'
        ? `check confirmed${by ? ` by ${by}` : ''} — the claims held`
        : verdict.verdict === 'refuted'
          ? `check refuted a claim${by ? ` (${by})` : ''}${verdict.findings?.[0] ? ` — ${verdict.findings[0]}` : ''}`
          : `check reported no verdict — ${verdict.note ?? 'unreadable'}`,
  });
  if (verdict.verdict === 'refuted' && primary.assignedTo) {
    const author = rt.roster.find((s) => s.id === primary.assignedTo)?.name;
    if (author) {
      const date = new Date().toISOString().slice(0, 10);
      const first = verdict.findings?.[0] ? ` — ${verdict.findings[0]}` : '';
      rt.memory.append(
        author,
        `${date} · a check refuted a claim in my work${first} (job: ${primary.title})`,
      );
    }
  }
  // A check that reported files itself — its verdict lives on the checked
  // job's card, and a second card waiting for a verdict of its own would
  // only stack crates. One that never reported stays for eyes: a broken
  // check is worth looking at.
  if (parsed) {
    try {
      rt.queue.resolve(checkJob.id, 'promote');
      rt.eventLog.emit({
        type: 'resolved',
        jobId: checkJob.id,
        title: checkJob.title,
        detail: 'check filed — the verdict is on the checked job',
        by: 'app',
      });
    } catch {
      // Not resolvable (already resolved, or an unexpected status) — leave it.
    }
  }
  // The auto path asks again now the verdict is in. Everything is decided by
  // the same gate a clean finish uses (D-082): a refuted or missing verdict
  // is refused there by name, and a manual Approve was never blocked at all.
  void autoSendIfApproved(rt.dir, rt.queue, rt.eventLog, rt.meta.id, primary);
}

/**
 * Queue a work party (TEAMWORK T2, D-195): every hand at once, each an
 * ordinary job on its own piece of the sentence's list. Hands carry no
 * channels — a hand never sends, and stampOutbox refuses any outbox it
 * writes (D-193's seam) — and no repository: T2 is the non-repo shape, and
 * repo parties are T4's trial to earn. Attachments ride to every hand,
 * because "summarise the attached report's A, B and C" needs the report in
 * each hand's own input/. Everything the gather will need travels on every
 * hand, since the gather is built by whichever hand settles last.
 */
function queueParty(
  rt: LevelRuntime,
  text: string,
  plan: PartyPlan,
  opts: {
    tools?: string[];
    channel?: string;
    answers?: Record<string, string>;
    attachments?: { name: string; data: Buffer }[];
    /** Channels already settled (the planned party's path) — skips detection. */
    channels?: string[];
    /** Hands the gather halts without, from a reviewed plan (T3). */
    loadBearing?: number[];
    /** Carry the plan job's party id forward, so the trace is one thread. */
    partyId?: string;
    /** A repository party (T4): hands clone and patch their own scopes. */
    repo?: boolean;
    /** Per-hand scopes from the reviewed plan, aligned with plan.hands. */
    scopes?: (string[] | undefined)[];
  },
): Job[] {
  const id = opts.partyId ?? newPartyId();
  const carried =
    opts.channels ??
    settledChannels(
      detectChannelAsk(
        text,
        readConnections(CONNECTIONS_FILE),
        readSettings(SANDBOX_ROOT),
        process.env,
      ),
      opts.channel,
    ).carried;
  const withholding = wantsWithholding(text);
  const of = plan.hands.length;
  const spec: NonNullable<Job['party']> = {
    id,
    hand: 0,
    of,
    asked: text,
    ...(plan.sendTail ? { sendTail: plan.sendTail } : {}),
    ...(carried.length ? { channels: carried } : {}),
    ...(opts.answers && Object.keys(opts.answers).length ? { answers: opts.answers } : {}),
    ...(wantsCheck(text) ? { checked: true } : {}),
    ...(opts.loadBearing?.length ? { loadBearing: opts.loadBearing } : {}),
    ...(opts.repo ? { repo: true } : {}),
  };
  return plan.hands.map((piece, i) => {
    const scope = opts.scopes?.[i];
    return queueSentence(rt, piece, {
      noSplit: true,
      // A repo party's hands clone as any repo job does (T4); everything
      // else stays the sandbox-only shape T2 built.
      ...(opts.repo ? {} : { noRepo: true }),
      tools: opts.tools,
      channelsOverride: [],
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      ...(withholding ? { withholding: true } : {}),
      ...(scope ? { brief: handBrief(scope) } : {}),
      party: { ...spec, hand: i + 1, ...(scope ? { scope } : {}) },
      note: `hand ${i + 1} of ${of} — a party on "${plan.asked.words}"`,
    });
  });
}

/**
 * Queue a plan job (TEAMWORK T3, D-196): the user asked for a party and
 * wrote no list, so an architect-class run proposes the split as PARTY.json
 * — and queues nothing. Approving the reviewed proposal is what queues the
 * hands (the resolve route's branch), which is how the promote grammar
 * answers M6's goal-decomposition trust question: the model proposes, the
 * person disposes, exactly the organizer's MOVES.json shape (D-132).
 */
function queuePartyPlan(
  rt: LevelRuntime,
  text: string,
  opts: {
    tools?: string[];
    channel?: string;
    answers?: Record<string, string>;
    attachments?: { name: string; data: Buffer }[];
  },
): Job {
  const carried = settledChannels(
    detectChannelAsk(
      text,
      readConnections(CONNECTIONS_FILE),
      readSettings(SANDBOX_ROOT),
      process.env,
    ),
    opts.channel,
  ).carried;
  // On a repo level the planner gets its own clone to survey (TEAMWORK
  // T4): partitioning by paths needs sight of the paths. Elsewhere the
  // plan stays sandbox-only as T3 built it.
  const repo = Boolean(rt.meta.repoPath);
  return queueSentence(rt, PLAN_SENTENCE, {
    noSplit: true,
    ...(repo ? {} : { noRepo: true }),
    ...(registry.get('architect') ? { role: 'architect' } : {}),
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    channelsOverride: [],
    ...(wantsWithholding(text) ? { withholding: true } : {}),
    party: {
      id: newPartyId(),
      hand: 0,
      of: 0,
      plan: true,
      asked: text,
      ...(carried.length ? { channels: carried } : {}),
      ...(opts.answers && Object.keys(opts.answers).length ? { answers: opts.answers } : {}),
      ...(wantsCheck(text) ? { checked: true } : {}),
    },
    brief: planBrief({ asked: text, sends: carried.length > 0, repo }),
    note: 'planning a party — the split is reviewed before any hand runs',
  });
}

/** Deliverables forwarded per hand, beside its report; the rest is named. */
const HAND_FILES = 2;

/**
 * The last settled hand queues the gather (TEAMWORK T2) — through the same
 * glue as everything, and not before: the gather does not exist while any
 * hand still runs, so nothing waits anywhere (D-105's rule, kept again by
 * not needing it). Delivered hands are folded in — report and files renamed
 * into the gather's input/ (D-146's discipline, N-wide) and the hand
 * self-files, because its work lives on in the gather and a second card
 * would only stack crates (the check pass's precedent). A failed hand stays
 * visible, absorbed (D-012), and its piece is named uncovered in the
 * gather's brief; every hand failing fails the party out loud.
 */
function queueGatherIfLastHand(rt: LevelRuntime, job: Job): void {
  const p = job.party;
  if (!p || p.gather) return;
  // A plan job proposes and never gathers (T3): its "party" has no hands
  // until the proposal is approved, and treating the settled plan job as a
  // one-hand party would queue a gather over nothing.
  if (p.plan) return;
  const siblings = rt.queue
    .list()
    .filter((j) => j.party?.id === p.id && !j.party?.gather && !j.party?.plan);
  if (siblings.some((j) => j.status === 'queued' || j.status === 'running')) return;
  if (rt.queue.list().some((j) => j.party?.id === p.id && j.party?.gather)) return;
  const delivered = siblings.filter((j) => j.status === 'done' || j.status === 'partial');
  // A load-bearing hand failing halts the party before the gather (T3,
  // D-196): the deliverable is worthless without it, and delivering around
  // the hole would paper over exactly what the reviewer marked as
  // essential. The delivered hands stay in review — their work is real.
  const lost = siblings.filter(
    (j) =>
      j.status !== 'done' &&
      j.status !== 'partial' &&
      p.loadBearing?.includes(j.party?.hand ?? -1),
  );
  if (lost.length > 0) {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `the party halted — load-bearing hand ${lost.map((j) => j.party?.hand).join(' and ')} failed; the delivered hands stay in review`,
    });
    return;
  }
  if (delivered.length === 0) {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `the party failed — none of its ${p.of} hands delivered`,
    });
    return;
  }
  const attachments: { name: string; data: Buffer }[] = [];
  const handBriefs: Parameters<typeof gatherBrief>[0]['hands'] = [];
  const ordered = [...siblings].sort((a, b) => (a.party?.hand ?? 0) - (b.party?.hand ?? 0));
  for (const hand of ordered) {
    const n = hand.party?.hand ?? 0;
    if (hand.status !== 'done' && hand.status !== 'partial') {
      handBriefs.push({
        hand: n,
        piece: hand.prompt,
        hadReport: false,
        files: [],
        leftBehind: [],
        failed: true,
      });
      continue;
    }
    const dir = rt.queue.sandboxDir(hand.id);
    const { take, leftBehind } = pickForwards(outputNames(dir));
    const behind = [...leftBehind, ...take.slice(HAND_FILES)];
    let hadReport = false;
    const report = path.join(dir, 'RESULT.md');
    if (existsSync(report)) {
      const data = readFileSync(report);
      if (data.length <= MAX_ATTACHMENT_BYTES) {
        attachments.push({ name: handReportName(n), data });
        hadReport = true;
      }
    }
    const files: string[] = [];
    for (const name of take.slice(0, HAND_FILES)) {
      const data = readFileSync(path.join(dir, name));
      if (data.length > MAX_ATTACHMENT_BYTES) {
        behind.push(name);
        continue;
      }
      attachments.push({ name: handFileName(n, name), data });
      files.push(handFileName(n, name));
    }
    handBriefs.push({ hand: n, piece: hand.prompt, hadReport, files, leftBehind: behind });
  }
  // A repo party's hands deliver patches (TEAMWORK T4): forward each one
  // renamed beside the reports, with the scope strays the patch's own paths
  // prove — computed here, in code, because that check is the trial's
  // pre-registered artefact and a run's account of itself is not.
  const patches: { hand: number; name: string; strayed: string[] }[] = [];
  if (p.repo) {
    for (const hand of ordered) {
      if (hand.status !== 'done' && hand.status !== 'partial') continue;
      const n = hand.party?.hand ?? 0;
      const file = patchFile(rt.queue.sandboxDir(hand.id));
      if (!existsSync(file)) continue;
      const data = readFileSync(file);
      if (data.length > MAX_ATTACHMENT_BYTES) continue;
      const name = `hand-${n}.patch`;
      attachments.push({ name, data });
      const strayed = hand.party?.scope?.length
        ? outOfScope(patchPaths(data.toString('utf8')), hand.party.scope)
        : [];
      if (strayed.length > 0) {
        rt.eventLog.emit({
          type: 'progress',
          jobId: hand.id,
          title: hand.title,
          detail: `hand ${n}'s patch strays outside its scope: ${strayed.join(', ')} — named in the gather's brief`,
        });
      }
      patches.push({ hand: n, name, strayed });
    }
  }
  const asked = p.asked ?? job.prompt;
  // The gather runs as the role the whole request matches — the same answer
  // the desk would have shown for the sentence run solo.
  const matched = planWork(matcher(), registry.list(), rt.sim.agentlings, undefined, asked);
  const sendLines = Object.entries(p.answers ?? {})
    .filter(([key]) => key.startsWith('send-to:'))
    .map(
      ([key, to]) =>
        `Send the result on ${key.slice('send-to:'.length)} to ${to} — write OUTBOX.json as briefed.`,
    );
  try {
    queueSentence(rt, GATHER_SENTENCE, {
      noSplit: true,
      // A repo party's gather merges on a fresh clone of its own (T4);
      // every other gather stays sandbox-only.
      ...(p.repo ? {} : { noRepo: true }),
      ...(matched.role && registry.get(matched.role) ? { role: matched.role } : {}),
      ...(job.tools?.length ? { tools: job.tools } : {}),
      attachments,
      channelsOverride: p.channels ?? [],
      ...(job.withholding ? { withholding: true } : {}),
      ...(p.checked ? { checked: true } : {}),
      party: { id: p.id, hand: 0, of: p.of, gather: true, asked, ...(p.repo ? { repo: true } : {}) },
      brief: gatherBrief({
        asked,
        ...(p.sendTail ? { sendTail: p.sendTail } : {}),
        hands: handBriefs,
        ...(sendLines.length ? { sendLines } : {}),
        ...(p.repo ? { repo: { patches } } : {}),
      }),
      note: `the gather — assembling ${delivered.length} of ${p.of} hands`,
    });
  } catch (err) {
    rt.eventLog.emit({
      type: 'progress',
      jobId: job.id,
      title: job.title,
      detail: `the gather could not queue — ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  // Fold the delivered hands in only once the gather actually exists.
  for (const hand of delivered) {
    try {
      rt.queue.resolve(hand.id, 'promote');
      rt.eventLog.emit({
        type: 'resolved',
        jobId: hand.id,
        title: hand.title,
        detail: 'hand folded into the gather',
        by: 'app',
      });
    } catch {
      // Already resolved or unresolvable — leave it for eyes.
    }
  }
}

/**
 * Author a world: a description in, a job out (M4).
 *
 * Its own route rather than a sentence pattern at the desk, for now. The
 * phrasings people actually use for this do not exist yet, and both walls the
 * send surface hit — D-090's inflections, D-093's typo'd verb — were found by
 * real sentences rather than predicted. A button cannot misfire, and the
 * matcher can be designed later against sentences that have actually been
 * typed.
 *
 * Everything past the brief is the ordinary glue: quoted, sandboxed, reviewed,
 * and installed only at Approve.
 */
app.post('/api/levels/:lid/author-pack', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{
    description?: string;
    /** A picture to work from — optional for either kind (D-113, D-144). */
    reference?: { name?: string; data?: string };
    /** 'plate' when the user asked for a rendered 3D backdrop (D-144). */
    kind?: string;
  }>();
  const description = body.description?.trim();
  if (!description) return c.json({ error: 'say what the world should be' }, 400);
  const wantsPlate = body.kind === 'plate';

  // The reference rides as an ordinary attachment, so it lands in the
  // sandbox's `input/` like any other supplied material — measured at 88s
  // against 616s for making a session go and find things. A copy is kept in
  // Artwork/ because the picture outlives the job that used it: the pack it
  // inspires has to name it in `provenance`, and a reference nobody can find
  // again cannot be named honestly.
  let attachments: { name: string; data: Buffer }[] = [];
  let reference: string | undefined;
  if (body.reference?.data) {
    try {
      attachments = decodeAttachments([body.reference]);
      reference = attachments[0].name;
      mkdirSync(ARTWORK_DIR, { recursive: true });
      writeFileSync(path.join(ARTWORK_DIR, path.basename(reference)), attachments[0].data);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'bad reference image' }, 400);
    }
  }

  const job = queueSentence(rt, `Author a level pack: ${description}`, {
    // What is already installed, so the session is told what is taken
    // rather than finding out at Approve (M4, first real run).
    brief: packBrief(scanPacks(ROOT).installed.map((p) => p.slug), reference, wantsPlate),
    attachments,
    // A description is prose about a place. Splitting it on the word "then"
    // would turn "a deck, then the sea beyond it" into two jobs (D-105).
    noSplit: true,
    // Authoring is design work, and the sentence cannot say so — it arrives
    // by a button. Naming the role here is also what finally gives the class
    // a ledger of its own, after two runs priced 3x under as `worker`.
    role: AUTHOR_ROLE,
    // The pack is a sandbox deliverable (PACK.json → Approve installs it);
    // a repo clone is a cost per leg and a second door — the gates-of-troy
    // chain paid five clones and double-installed through the diff (D-141).
    noRepo: true,
    note: 'authoring a world',
  });
  return c.json(job, 201);
});

app.post('/api/levels/:lid/work', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{
    text?: string;
    repoPath?: string;
    tools?: string[];
    answers?: Record<string, string>;
    files?: { name?: string; data?: string }[];
    /** The channel picked on the ask-card, when there was one (D-079). */
    channel?: string;
    /** The folder picked for an organize job (D-132) — an absolute path. */
    organizeRoot?: string;
    /** The user chose "run as one job" on the steps row (D-105). */
    single?: boolean;
    /** The user asked a planner to propose the split (TEAMWORK T3). */
    planParty?: boolean;
  }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);

  const organizeRoot = body.organizeRoot?.trim();
  if (organizeRoot && !existsSync(organizeRoot)) {
    return c.json({ error: `no folder at "${organizeRoot}"` }, 400);
  }

  let attachments: { name: string; data: Buffer }[];
  try {
    attachments = decodeAttachments(body.files);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'bad attachment' }, 400);
  }

  if (body.repoPath !== undefined) {
    const repoPath = body.repoPath.trim();
    if (repoPath && !existsSync(repoPath)) {
      return c.json({ error: `no folder at "${repoPath}"` }, 400);
    }
    rt.meta = { ...rt.meta, repoPath };
    writeMeta(rt.dir, rt.meta);
  }

  // The planner path (TEAMWORK T3): the user pressed the offer, so the
  // split is proposed by an architect-class run and reviewed before any
  // hand exists — never queued from here.
  if (body.planParty === true && body.single !== true && splitSteps(text) === null) {
    const job = queuePartyPlan(rt, text, {
      tools: body.tools,
      channel: typeof body.channel === 'string' ? body.channel : undefined,
      answers: body.answers,
      attachments,
    });
    return c.json(job, 201);
  }
  // A party queues here and only here (TEAMWORK T2): the desk previewed it,
  // Start carries it, and the schedule sweep deliberately does not — a
  // schedule that wants a party will say so in its own sentence once
  // parties have earned that (the T2 decision as taken). The chain split
  // wins first: a "then" sentence is a chain today, party words inert.
  if (body.single !== true && splitSteps(text) === null) {
    const party = planParty(text);
    if (party && 'hands' in party) {
      const hands = queueParty(rt, text, party, {
        tools: body.tools,
        channel: typeof body.channel === 'string' ? body.channel : undefined,
        answers: body.answers,
        attachments,
      });
      return c.json(hands[0], 201);
    }
  }
  // Everything from the plan to the queued event is the shared glue above —
  // one body for every way a sentence becomes a job, so the ways in cannot
  // drift. The schedule sweep is the other caller (D-103).
  const job = queueSentence(rt, text, {
    tools: body.tools,
    channel: typeof body.channel === 'string' ? body.channel : undefined,
    ...(organizeRoot ? { organizeRoot } : {}),
    answers: body.answers,
    attachments,
    ...(body.single === true ? { noSplit: true } : {}),
  });
  return c.json(job, 201);
});

/** The recurrence timer (D-103): the sentences this level queues again on a cadence. */
app.get('/api/levels/:lid/schedules', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json({ schedules: readSchedules(rt.dir).map(describeSchedule) });
});

app.post('/api/levels/:lid/schedules', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{
    text?: string;
    cadence?: Cadence;
    channel?: string;
    answers?: Record<string, string>;
  }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  const cadence = body.cadence;
  const bad = validCadence(cadence);
  if (bad || !cadence) return c.json({ error: bad ?? 'a cadence is required' }, 400);
  // The same server-settling rule as queueing: a channel that does not exist
  // is dropped, never stored — a firing replays what Start carried rather
  // than re-detecting (D-079's shape, frozen at creation).
  const channel =
    typeof body.channel === 'string' && CHANNELS[body.channel] ? body.channel : undefined;
  const answers = body.answers && Object.keys(body.answers).length ? body.answers : undefined;
  const schedule = createSchedule(rt.dir, { prompt: text, cadence, channel, answers }, Date.now());
  return c.json(describeSchedule(schedule), 201);
});

app.post('/api/levels/:lid/schedules/:sid/pause', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ paused?: boolean }>().catch(() => ({ paused: true }));
  const schedule = setPaused(rt.dir, c.req.param('sid'), body.paused !== false, Date.now());
  if (!schedule) return c.json({ error: 'unknown schedule' }, 404);
  return c.json(describeSchedule(schedule));
});

app.delete('/api/levels/:lid/schedules/:sid', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  if (!removeSchedule(rt.dir, c.req.param('sid'))) {
    return c.json({ error: 'unknown schedule' }, 404);
  }
  return c.json({ ok: true });
});

/**
 * "Do it properly": the router answered without a session and the user
 * disagrees. Re-queues the same request with the shortcut switched off.
 */
app.post('/api/levels/:lid/jobs/:id/redo', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const previous = rt.queue.get(c.req.param('id'));
  if (!previous) return c.json({ error: 'unknown job' }, 404);
  // This was the second unquoted way in, found exactly as the first was — by
  // tripping over a ledger row with no `quotedUsd` (D-027, D-049). Without a
  // ceiling `turnsForBudget` never binds and the run silently falls back to
  // the role's cap, which is a hole in "the quote binds before the money
  // moves" rather than a shortcut.
  //
  // Quoted as a session on purpose: `noRouter` below means the router is
  // never asked, so a routed quote of zero or a one-shot's leash would price
  // work that is not going to happen.
  const plan = planWork(
    matcher(),
    registry.list(),
    rt.sim.agentlings,
    previous.repoPath,
    previous.prompt,
  );
  const job = rt.queue.add(
    redoJobSpec(
      previous,
      // The bytes live in the previous sandbox: a new job gets a new one, and
      // `attachments` on the old job is only ever names and sizes.
      attachedFiles(rt.queue.inputDir(previous.id), previous.attachments),
      quoteFor_(
        QUOTE_CTX,
        rt.dir,
        previous.prompt,
        previous.tools,
        previous.preferredRole ?? runnerRole(plan),
        previous.repoPath,
        true,
      ).ceilingUsd,
      runnerRole(plan) ?? undefined,
    ),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title, ...queuedDetail(rt, job) });
  return c.json(job, 201);
});

/**
 * Answer an agentling. The run has ended — a session is a one-shot child
 * process and pausing one mid-flight was refused on purpose (D-030) — so a
 * reply is a new job that carries the old sandbox forward and says what
 * changed. Quoted and billed like any other session, because it is one.
 */
app.post('/api/levels/:lid/jobs/:id/reply', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const previous = rt.queue.get(c.req.param('id'));
  if (!previous) return c.json({ error: 'unknown job' }, 404);
  const body = await c.req.json<{ text?: string }>();
  const reply = body.text?.trim();
  if (!reply) return c.json({ error: 'text is required' }, 400);

  const carried = previous.repoPath
    ? 'the clone already carries the changes you made, so continue from them'
    : 'anything you produced is already here, so continue from it';
  const prompt = [
    previous.prompt,
    `You have already worked on this — ${carried}.`,
    ...(previous.summary ? [`You said: ${previous.summary.trim()}`] : []),
    `The user replied: ${reply}`,
  ].join('\n\n');

  // The reply keeps the role that asked the question — the answer is to them,
  // and handing it to a different specialist loses what they had in mind.
  const tools = granted(previous.tools);
  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, previous.repoPath, prompt);
  // The carry hands the parent's report over as PREVIOUS-RESULT.md; the
  // brief points at it exactly when it will be there to read (D-146).
  const parentDir = rt.queue.sandboxDir(previous.id);
  const hasHandover = ['RESULT.md', PREVIOUS_RESULT].some((name) =>
    existsSync(path.join(parentDir, name)),
  );
  const job = rt.queue.add(
    queuedJobSpec({
      title: previous.title,
      prompt,
      repoPath: previous.repoPath,
      tools,
      plan: { ...plan, role: previous.preferredRole ?? plan.role },
      // Kept as its own field as well as inside the prompt: discarding this
      // job has to say what was asked for and not delivered (D-201).
      reply,
      ...(hasHandover ? { brief: replyBrief() } : {}),
      quote: quoteFor_(
        QUOTE_CTX,
        rt.dir,
        prompt,
        tools,
        previous.preferredRole ?? runnerRole(plan),
        previous.repoPath,
        // A reply is mid-flight too: the router will refuse it every shortcut,
        // so the quote must price the session it is really about to be.
        false,
        previous.id,
      ),
      continues: previous.id,
      // The answer continues the send it answers for (D-087) — and when the
      // original never carried one because the detector missed, the reply's
      // own words may supply it through the same gates (D-090): "send it to
      // Pepo on telegram" is detection, not invention. The brief is derived
      // from job.channel at run time.
      channels:
        previous.channels ??
        (() => {
          const found = detectChannelAsk(
            reply,
            readConnections(CONNECTIONS_FILE),
            readSettings(SANDBOX_ROOT),
            process.env,
          );
          // The reply's own channels, the asked one first — the same list the
          // desk would have carried had the detector caught it first time.
          return found?.channel
            ? [found.channel, ...(found.also ?? []).map((o) => o.channel)]
            : undefined;
        })(),
    }),
  );
  // The parent is answered (D-139): its card stops offering the reply box
  // it has already been given an answer through.
  rt.queue.markContinued(previous.id, job.id);
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title, ...queuedDetail(rt, job) });
  return c.json(job, 201);
});

/**
 * Carry on from where a run stopped, without the user having to say so.
 *
 * A reply in all but the words: the same sandbox forward, the same role, its
 * own quote and its own turn budget. What it adds is that the app knows a run
 * was cut off and can offer the next one, rather than leaving the user to
 * notice and phrase it — which was the whole complaint about telling people to
 * make their requests smaller.
 *
 * A *request*, not automatic. Each continuation is a fresh session with a fresh
 * price, and a job that quietly spawned three of them would be three charges
 * against one quote — the thing the quote exists to prevent (D-012, D-025).
 *
 * It refuses a run that stopped for any other reason. "Ran out of turns" does
 * not mean "needed more turns" (D-015, D-025), but its converse is firmer: a
 * run that ended for some other reason has not asked for more.
 */
app.post('/api/levels/:lid/jobs/:id/continue', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const previous = rt.queue.get(c.req.param('id'));
  if (!previous) return c.json({ error: 'unknown job' }, 404);
  // A run stopped by either limit — turns or the clock (D-138) — may be
  // funded past it; one that finished or died some other way may not.
  if (!previous.meter?.outOfTurns && !previous.meter?.timedOut) {
    return c.json({ error: 'that run was not cut short by turns or the clock' }, 400);
  }

  const { prompt, tools, plan, ranAs, quote } = continuationSpec(rt, previous);
  const job = rt.queue.add(
    queuedJobSpec({
      title: previous.title,
      prompt,
      repoPath: previous.repoPath,
      tools,
      plan: { ...plan, role: ranAs ?? plan.role },
      quote,
      continues: previous.id,
      brief: continuationBrief(previous),
    }),
  );
  // Same stamp as a reply (D-139): a run already being carried on must not
  // offer to be carried on again — a second press would be a second charge.
  rt.queue.markContinued(previous.id, job.id);
  rt.eventLog.emit({
    type: 'queued',
    jobId: job.id,
    title: job.title,
    ...queuedDetail(rt, job, rt.queue.continuationDetail(previous.id)),
  });
  return c.json(job, 201);
});

/**
 * What carrying on would cost, before you commit to it (D-114).
 *
 * The review shows this on the More turns button, so it has to be the number
 * the queue will actually use — hence one function, not a second computation
 * that agrees today. A desk that promised free and a queue that then billed a
 * session is the fault D-097 was written about.
 */
app.get('/api/levels/:lid/jobs/:id/continue/quote', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const previous = rt.queue.get(c.req.param('id'));
  if (!previous) return c.json({ error: 'unknown job' }, 404);
  if (!previous.meter?.outOfTurns && !previous.meter?.timedOut) {
    return c.json({ error: 'that run was not cut short by turns or the clock' }, 400);
  }
  return c.json({
    quote: continuationSpec(rt, previous).quote,
    // What the next leg actually receives, from the same list the copy is
    // made from (UI.md, step 10) — so the review's note and the code agree.
    carries: carryManifest(rt.queue.sandboxDir(previous.id)),
  });
});

/** Everything a carry-on is built from, shared by the quote and the queueing. */
function continuationSpec(
  rt: LevelRuntime,
  previous: Job,
): { prompt: string; tools: string[]; plan: WorkPlan; ranAs?: string; quote: Quote } {
  // The original sentence verbatim: the carry-on brief rides on `brief`, never
  // in the prompt, so a continuation is keyed, matched, quoted and credited as
  // the job it continues rather than banking recipes under a compound key
  // nobody will ever match (D-074).
  const prompt = previous.prompt;
  const tools = granted(previous.tools);
  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, previous.repoPath, prompt);
  // Whoever actually ran it, and only then what the matcher says. A
  // continuation is the same job, so re-matching it is asking the wrong
  // question — and measured, it answers wrongly: the continuation prompt has
  // "read RESULT.md" in it, which swung "summary table" work from the worker
  // that ran it to `analyst`. `preferredRole` cannot stand in on its own,
  // because the matcher declines to name a role whenever it is unsure and
  // leaves the field empty, which is exactly when this fires. The ledger
  // already holds this principle for what a run cost; this is it for what a
  // run is (D-026, D-029).
  const ranAs =
    rt.sim.agentlings.find((a) => a.id === previous.assignedTo)?.role ??
    rt.roster.find((a) => a.id === previous.assignedTo)?.role ??
    previous.preferredRole;
  return {
    prompt,
    tools,
    plan,
    ranAs,
    quote: quoteFor_(
      QUOTE_CTX,
      rt.dir,
      prompt,
      tools,
      ranAs ?? runnerRole(plan),
      previous.repoPath,
      false,
      previous.id,
    ),
  };
}

app.post('/api/levels/:lid/jobs/:id/cancel', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const id = c.req.param('id');
  const job = rt.queue.get(id);
  if (!job) return c.json({ error: 'unknown job' }, 404);
  if (!rt.sim.cancelJob(id)) {
    return c.json({ error: `job ${id} is ${job.status}, not running` }, 400);
  }
  return c.json(rt.queue.get(id));
});

app.get('/api/levels/:lid/jobs/:id/output', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  // A continuation is compared against the leg it continues, so the card can
  // say which of these files this run actually wrote (D-202). Only here: the
  // inbox lists every delivery at once and hashing all of them to draw a row
  // of labels would read the whole history on every poll — the review card is
  // where a file is being decided about.
  const dir = rt.queue.sandboxDir(job.id);
  return c.json({
    files: describeOutputs(dir, job.continues ? rt.queue.sandboxDir(job.continues) : undefined),
    // The folders beside the files — work/, input/ — with their weight,
    // which no listing showed (UI.md, step 9).
    dirs: deliverySummary(dir).dirs,
  });
});

/** The sandbox's own trail (D-211), for the review's turns strip (UI.md, step 11). */
app.get('/api/levels/:lid/jobs/:id/trajectory', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  const lines = readTrajectory(rt.queue.sandboxDir(job.id));
  // A run before the trail existed says so, rather than showing an empty strip.
  return c.json(lines === null ? { trail: false, lines: [] } : { trail: true, lines });
});

/**
 * One file, as bytes. The listing withholds anything binary, so a document a
 * job produced is downloaded from here rather than mangled into JSON.
 */
app.get('/api/levels/:lid/jobs/:id/output/:name', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  const name = c.req.param('name');
  const file = safeOutputPath(rt.queue.sandboxDir(job.id), name);
  if (!file) return c.json({ error: 'unknown file' }, 404);
  // Inline for what a browser can actually show, so the review panel can put
  // it in a frame; an attachment would download instead of rendering. The
  // download link asks for a save explicitly, so nothing is lost either way.
  const disposition = opensInBrowser(name) ? 'inline' : 'attachment';
  return c.body(new Uint8Array(readFileSync(file)), 200, {
    'Content-Type': contentTypeFor(name),
    'Content-Disposition': `${disposition}; filename="${name.replace(/"/g, '')}"`,
  });
});

/**
 * The same file, converted for reading rather than saving.
 *
 * Separate from the bytes route because they answer different questions: that
 * one hands over the document, this one describes it well enough to decide
 * whether it is the document you asked for.
 */
app.get('/api/levels/:lid/jobs/:id/output/:name/preview', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.get(c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  const file = safeOutputPath(rt.queue.sandboxDir(job.id), c.req.param('name'));
  if (!file) return c.json({ error: 'unknown file' }, 404);
  return c.json(await previewFile(file));
});

app.post('/api/levels/:lid/jobs/:id/resolve', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ action?: string; packSlug?: string }>();
  if (body.action !== 'promote' && body.action !== 'discard' && body.action !== 'clear') {
    return c.json({ error: 'action must be "promote", "discard" or "clear"' }, 400);
  }
  const pending = rt.queue.get(c.req.param('id'));
  if (!pending) return c.json({ error: 'unknown job' }, 404);
  // A resolve must never land inside this job's own patch-apply await
  // (D-163): a second promote would race `git apply` on the real
  // repository, and a discard would disown a patch already going in.
  if (patchInFlight(pending.id)) {
    return c.json(
      {
        error:
          "this job's patch is still applying — the first Approve is doing it; try again when it lands",
      },
      409,
    );
  }
  // Promote replays the reviewed patch onto the real repository first;
  // the job is only marked promoted if the patch applies cleanly.
  //
  // A failed job counts. Since a session that dies still keeps its diff, a
  // run that did the work and ran out of turns writing it up leaves a patch
  // worth having — and refusing to apply it while still stamping the job
  // "promoted" is the one outcome worse than refusing outright.
  const promotable =
    pending.status === 'done' || pending.status === 'partial' || pending.status === 'failed';
  // A compiled tool is executable instruction, so it installs on the same
  // approval as any other output rather than the moment it is written.
  const waitingTool =
    body.action === 'promote' && promotable
      ? readTools(rt.dir).find((t) => t.pendingJobId === pending.id)
      : undefined;
  if (waitingTool && !installTool(rt.dir, waitingTool, rt.queue.sandboxDir(pending.id))) {
    return c.json(
      { error: `the compiling run did not leave both ${RUN_SCRIPT} and ${VERIFY_SCRIPT}` },
      400,
    );
  }
  /**
   * Discarding a compile un-reserves its name. The manifest is written before
   * the compiling session runs, so refusing its output has to remove it — left
   * behind it is a tool with nothing to execute, and `promote` reads it as
   * "a tool for that recipe already exists" and refuses every later attempt.
   *
   * Found by discarding one: the recipe became permanently uncompilable, which
   * is the opposite of what reviewing its output is for. The router was never
   * at risk — `usableTools` needs both scripts — so this was invisible until
   * somebody tried again (D-045).
   */
  // A clear leaves the compile uninstalled exactly as a discard does, so the
  // reserved name has to go either way (D-216).
  if (body.action === 'discard' || body.action === 'clear') {
    const abandoned = readTools(rt.dir).find((t) => t.pendingJobId === pending.id);
    if (abandoned) rmSync(toolDir(rt.dir, abandoned.name), { recursive: true, force: true });
  }
  /**
   * A reviewed outbox is replayed exactly as a reviewed patch is: at Approve,
   * by us, never by the session (D-075). Before the patch on purpose — a
   * refused send must leave nothing half-promoted, while a failed patch after
   * a send retries cleanly, because recipients already sent to are skipped.
   *
   * Every refusal names its fix and returns 400 with the job still
   * reviewable: "promoted" stamped on a refusal is the one outcome worse than
   * refusing outright. Partial failures are the same shape — results are
   * stamped per recipient first, so a second Approve retries only what
   * failed and can never message anyone twice.
   */
  let sentNow = 0;
  if (body.action === 'promote' && promotable && pending.outbox?.length && !waitingTool) {
    const outboxes = pending.outbox;
    // Counted per channel (D-179): the same address on two channels is two
    // messages, and one flat list would call the second one already sent.
    const remaining = outboxes.flatMap((outbox) =>
      outbox.messages.filter((m) => !sentOn(pending, outbox.channel).includes(m.to)),
    );
    if (remaining.length > 0) {
      const refusal = outboxRefusal(
        outboxes,
        readConnections(CONNECTIONS_FILE),
        readSettings(SANDBOX_ROOT),
        process.env,
      );
      if (refusal) return c.json({ error: `outbox not sent — ${refusal}` }, 400);
      /**
       * The withholding gate (D-181), before the door and before any send.
       *
       * The run said it took these values out; this looks for them in every
       * message, subject and readable attachment and refuses the whole send if
       * one is still there. Whole, not partial: the values are one decision,
       * and sending the clean half of a redaction is sending half a leak.
       *
       * A declaration that did not parse blocks too. `withheldError` means the
       * run tried to say what it withheld and the file was wrong, and reading
       * that as "nothing was withheld" would turn the gate off exactly where
       * it was asked for.
       */
      if (pending.withheldError) {
        return c.json(
          { error: `outbox not sent — ${pending.withheldError}. Nothing was sent.` },
          400,
        );
      }
      if (pending.withheld) {
        const gate = withholdingLeaks(
          outboxes,
          pending.withheld,
          rt.queue.sandboxDir(pending.id),
        );
        const leaked = withholdingRefusal(gate);
        if (leaked) return c.json({ error: `outbox not sent — ${leaked}` }, 400);
      }
      /**
       * One door, claimed per job (D-160): a second Approve landing while
       * this one is mid-send is refused by name instead of racing through
       * the read→send→stamp gap — job 3e14937a sent Pepo the same PDF twice
       * through exactly that window. The recipients list is re-read under
       * the claim; the outer `alreadySent` above only decides whether to
       * enter at all.
       */
      const runs = await performOutboxSend({
        outboxes,
        jobId: pending.id,
        levelId: rt.meta.id,
        dir: rt.queue.sandboxDir(pending.id),
        sandboxRoot: SANDBOX_ROOT,
        env: process.env,
        alreadySent: (channel) => sentOn(rt.queue.get(pending.id), channel),
        record: (channel, r) => rt.queue.recordOutboxSends(pending.id, channel, r),
      });
      if (!runs) {
        return c.json(
          {
            error:
              'this outbox is already sending — the first Approve is doing it; the card updates when it lands',
          },
          409,
        );
      }
      sentNow = runs.reduce((n, r) => n + r.run.sentTo.length, 0);
      const failures = runs.flatMap((r) =>
        r.run.failed.map((f) => ({ ...f, channel: r.channel })),
      );
      if (failures.length > 0) {
        // The channel is named per failure now: with two of them in play, "ana@x
        // — not connected" leaves the user guessing which send it belonged to.
        const detail = failures.map((f) => `${f.to} on ${f.channel}: ${f.reason}`).join('; ');
        return c.json(
          {
            error: `sent ${sentNow} of ${remaining.length} — ${detail}. Approve again to retry the failures; nobody is messaged twice.`,
          },
          400,
        );
      }
    }
  }
  /**
   * The send above is the first of this route's two awaits — the patch apply
   * below is the second, claimed at the door (D-163). If another request resolved the
   * job while it ran — a discard racing a promote through that window; a
   * second promote is already refused by the send's own claim — everything
   * below would reorganize a real folder, apply a patch and install a pack
   * for a verdict that no longer stands. The finished sends are stamped and
   * safe; stop here, before anything else real. resolve() at the tail would
   * throw anyway, but only after those side effects had happened (D-162).
   */
  if (
    promotable &&
    (pending.status === 'promoted' || pending.status === 'discarded' || pending.status === 'cleared')
  ) {
    return c.json(
      {
        error: `while the outbox was sending, this job was ${pending.status} by another request — nothing further was applied`,
      },
      409,
    );
  }
  /**
   * A reviewed pack is installed exactly as a reviewed outbox is sent and a
   * reviewed patch applied: at Approve, by us, never by the session (M4).
   *
   * Refusing names its fix and returns 400 with the job still reviewable,
   * because "promoted" stamped on a refusal is worse than refusing outright.
   * Installing the identical pack again succeeds, so a retry after a failure
   * further down cannot be blocked by the work the first attempt did.
   */
  let installedPack: string | null = null;
  // An authoring job's whole deliverable is the pack. Promoting one with no
  // draft would stamp "promoted" while installing nothing and lock the
  // retry door behind the stamp — the first smooth chain did exactly that
  // (D-156). Refuse with the real reason instead; the job stays reviewable.
  // The marker is the author-pack route's own prompt prefix, read at the
  // chain's root so every continuation leg carries it.
  const rootAsk = rt.queue.rootPrompt(pending.id) ?? pending.prompt;
  if (
    body.action === 'promote' &&
    promotable &&
    !pending.packDraft &&
    rootAsk.startsWith('Author a level pack:')
  ) {
    return c.json(
      {
        error:
          pending.packDraftError ??
          'no PACK.json at the sandbox root — if the run wrote it inside a folder, ' +
            'ask a follow-up run to move it up, then Approve again',
      },
      400,
    );
  }
  if (body.action === 'promote' && promotable && pending.packDraft && !waitingTool) {
    // The reviewer may rename it on the way through. A pack's name is the one
    // thing about it that is not a matter of taste — it has to be unique — so
    // colliding must be something you can fix at the review rather than a dead
    // end that leaves discarding as the only move.
    //
    // The modal prefills the slug and always sends it, so an UNCHANGED slug is
    // not a rename and must not be pre-checked against the installed list —
    // measured on gates-of-troy (D-141): Approve #1 installed the pack and
    // then failed its repo patch; Approve #2 was refused by #1's own install.
    // installPack's already-identical tolerance is the designed retry path,
    // and only a real rename needs the early collision check.
    const sent = body.packSlug?.trim();
    const renamed = sent && sent !== pending.packDraft.slug ? sent : undefined;
    const draft = renamed ? { ...pending.packDraft, slug: renamed } : pending.packDraft;
    if (renamed) {
      const says = slugProblem(renamed, scanPacks(ROOT).installed.map((p) => p.slug));
      if (says) return c.json({ error: `pack not installed — ${says}` }, 400);
    }
    // The sandbox is where a draft's plates live (D-143); the install copies
    // them from there, re-checking at the moment of writing.
    const result = installPack(ROOT, draft, rt.queue.sandboxDir(pending.id));
    if ('error' in result) return c.json({ error: `pack not installed — ${result.error}` }, 400);
    if (!result.already) installedPack = draft.slug;
    // Remember the name it went in under, so the job's record matches the
    // world that now exists rather than the one it asked to be.
    if (renamed) pending.packDraft = draft;
  }
  /**
   * A reviewed party plan is performed exactly as a reviewed pack is
   * installed (TEAMWORK T3, D-196): approving it queues the hands as an
   * ordinary T2 party, carrying the spec the plan job stored — channels,
   * answers, the check flag, and the load-bearing marks the reviewer just
   * read. The model proposed, the person disposed, and only now does
   * anything run. The plan job's own input files ride to every hand, since
   * they are the request's material.
   */
  if (
    body.action === 'promote' &&
    promotable &&
    pending.partyDraft &&
    pending.party?.plan &&
    !waitingTool
  ) {
    const spec = pending.party;
    const draft = pending.partyDraft;
    const loadBearing = draft.hands.flatMap((h, i) => (h.loadBearing ? [i + 1] : []));
    const inputDir = rt.queue.inputDir(pending.id);
    const carried: { name: string; data: Buffer }[] = existsSync(inputDir)
      ? readdirSync(inputDir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => ({ name: e.name, data: readFileSync(path.join(inputDir, e.name)) }))
      : [];
    // A fully scoped plan on a repo level is a repo party (TEAMWORK T4):
    // hands clone and patch their own paths, the gather merges. The draft
    // validator already holds the all-or-none line, so a half-scoped plan
    // cannot reach here.
    const repoParty = Boolean(rt.meta.repoPath) && draft.hands.every((h) => h.scope?.length);
    queueParty(
      rt,
      spec.asked ?? pending.prompt,
      {
        hands: draft.hands.map((h) => h.prompt),
        asked: { n: draft.hands.length, words: 'a planned party' },
      },
      {
        ...(pending.tools?.length ? { tools: pending.tools } : {}),
        ...(spec.channels?.length ? { channels: spec.channels } : {}),
        ...(spec.answers ? { answers: spec.answers } : {}),
        ...(loadBearing.length ? { loadBearing } : {}),
        ...(carried.length ? { attachments: carried } : {}),
        ...(repoParty ? { repo: true, scopes: draft.hands.map((h) => h.scope) } : {}),
        partyId: spec.id,
      },
    );
  }
  /**
   * A reviewed folder reorganization is replayed exactly as a reviewed outbox
   * is sent and a reviewed pack installed: at Approve, by us, never by the
   * session (D-132). The manifest is applied under the folder the job was
   * pointed at — never a root the model could name — and each op is stamped so
   * a retry skips what already moved. A partial failure returns 400 with the
   * job reviewable, so "Approve again" finishes the rest and moves nothing
   * twice. This is the one branch that touches a real folder outside the app.
   *
   * Deliberately synchronous end to end: with the recheck above, nothing
   * yields between reading `movesRun.done` and stamping it, so two Approves
   * cannot interleave here — the property D-160 had to build a claim to get
   * for the outbox, the event loop grants this block for free, and an await
   * introduced into this stretch would silently take it away (D-162).
   */
  let movedNow = 0;
  if (
    body.action === 'promote' &&
    promotable &&
    pending.moves &&
    pending.organizeRoot &&
    !waitingTool
  ) {
    const root = pending.organizeRoot;
    if (!existsSync(root)) {
      return c.json({ error: `the folder is not there any more: ${root}` }, 400);
    }
    const alreadyDone = (pending.movesRun?.done ?? []).map(opKey);
    const run = executeMoves(pending.moves, root, alreadyDone);
    appendMovesJournal(rt.queue.sandboxDir(pending.id), {
      at: Date.now(),
      root,
      done: run.done,
      failed: run.failed,
    });
    rt.queue.recordMoves(pending.id, run);
    movedNow = run.done.length;
    if (run.failed.length > 0) {
      const detail = run.failed.map((f) => `${opLabel(f.op)}: ${f.reason}`).join('; ');
      return c.json(
        {
          error: `moved ${run.done.length}, but some failed — ${detail}. Approve again to retry; nothing moves twice.`,
        },
        400,
      );
    }
  }
  // A compiling run's deliverable is the tool, never the clone it tried the
  // tool out in. Found the hard way: the session sensibly ran its own script
  // to check it worked, which left the output file in its clone, and promoting
  // the compile carried that stray file into the real repository. Its brief
  // says to change nothing else, so nothing else is what gets applied.
  if (body.action === 'promote' && promotable && pending.repoPath && !waitingTool) {
    const patch = patchFile(rt.queue.sandboxDir(pending.id));
    if (existsSync(patch)) {
      beginPatch(pending.id);
      try {
        await applyPatch(pending.repoPath, patch);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return c.json({ error: `patch did not apply: ${detail}` }, 400);
      } finally {
        endPatch(pending.id);
      }
    }
  }

  /**
   * A delivery the user refused is banked before the stamp (D-201) — the
   * check-refutation write-back's twin (D-194), for the verdict that comes
   * from the person rather than from a second agentling.
   *
   * Only a delivery: `done` and `partial` are work handed over and turned
   * down, while discarding a `failed` job is clearing away a run that never
   * delivered — nothing was rejected, and saying so would teach a fiction.
   * The maker is identified by `assignedTo` in this level's roster; a job
   * whose author is gone banks nothing rather than crediting a lesson to
   * whoever holds that role now (D-030's rule, as in the ledger backfill).
   */
  const rejected =
    body.action === 'discard' && (pending.status === 'done' || pending.status === 'partial')
      ? rt.roster.find((s) => s.id === pending.assignedTo)
      : undefined;
  if (rejected) {
    const notes = discardNotes({
      date: new Date().toISOString().slice(0, 10),
      maker: rejected,
      title: pending.title,
      reply: pending.reply,
    });
    rt.memory.append(rejected.name, notes.lesson);
    appendKnowledge(rt.dir, notes.note);
  }

  try {
    const job = rt.queue.resolve(pending.id, body.action);
    // A reviewed, fully sent outbox is one more unchanged approval — the
    // count a standing approval is earned by (D-082). Recorded only on a
    // promote that got this far: every message either sent now or before.
    const approval =
      body.action === 'promote' && pending.outbox
        ? describeApproval(
            recordApproval(
              rt.dir,
              // The root sentence, not the reply transcript: a continuation's
              // approval must climb the same signature's ladder, not mint a
              // key nobody can ever say again (the D-074 rule, for approvals).
              rt.queue.rootPrompt(pending.id) ?? pending.prompt,
              pending.outbox,
              Date.now(),
            ),
          )
        : null;
    // The chain's cut legs earn their price the moment the end promotes
    // (D-150): work that fed an approved delivery finished by any honest
    // reading, and twice a chain of cut legs shipped a world for $0. Each
    // leg prices at min(cost, its own quote); real failures in the chain
    // stay absorbed — only the funded-leash cuts are the seam.
    const cutLegs =
      body.action === 'promote'
        ? rt.queue
            .ancestry(pending.id)
            .filter((leg) => leg.meter?.outOfTurns || leg.meter?.timedOut)
            .map((leg) => leg.id)
        : [];
    const chainPriced =
      body.action === 'promote'
        ? repriceChain(SANDBOX_ROOT, cutLegs)
        : { rows: 0, chargedUsd: 0 };
    // And the row stops calling accepted work a failure (D-205). Strictly
    // after the repricing above: `repriceChain` only touches rows that read
    // `failed`, so settling the outcome first would skip the price. This
    // moves no money — a promoted run whose spend was unmeasurable stays
    // absorbed and still reads `done`, because absorbed is not failed.
    if (body.action === 'promote') {
      settleOutcome(SANDBOX_ROOT, [pending.id, ...cutLegs]);
    }
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      // Your verb, not the ledger's. "promoted" is what the record calls it;
      // "approved" is what you did, and the feed is a list of your decisions.
      detail:
        body.action === 'promote'
          ? (sentNow > 0
              ? `approved — sent ${sentNow} via ${(pending.outbox ?? []).map((o) => o.channel).join(' and ')}`
              : installedPack
                ? `approved — installed the ${installedPack} world`
                : 'approved') +
            (chainPriced.rows > 0
              ? ` · the chain's ${chainPriced.rows} cut leg${chainPriced.rows === 1 ? '' : 's'} now charged $${chainPriced.chargedUsd.toFixed(2)}`
              : '')
          : body.action === 'clear'
            ? 'cleared — seen and let go: nothing applied, nothing banked, the work stays in the sandbox'
            : 'discarded — nothing applied, the work stays in the sandbox' +
              (rejected ? ` · ${rejected.name} banked what was turned down` : ''),
      by: 'you',
    });
    return c.json({ ...job, ...(approval ? { sendApproval: approval } : {}) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * Undo a reorganization (D-132): replay the job's journal backwards. Files
 * go back where they were and the empty folders the moves made are removed —
 * a folder that has since gained a file is left whole, because reversing must
 * never delete. Idempotent by the same accumulator: what has been moved back
 * is dropped from `movesRun.done`, so undoing twice is safe.
 */
app.post('/api/levels/:lid/jobs/:id/reverse-moves', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const job = rt.queue.list().find((j) => j.id === c.req.param('id'));
  if (!job) return c.json({ error: 'unknown job' }, 404);
  if (!job.organizeRoot || !job.movesRun?.done.length) {
    return c.json({ error: 'nothing was moved to undo' }, 400);
  }
  if (!existsSync(job.organizeRoot)) {
    return c.json({ error: `the folder is not there any more: ${job.organizeRoot}` }, 400);
  }
  const undo = reverseMoves(job.movesRun.done, job.organizeRoot);
  appendMovesJournal(rt.queue.sandboxDir(job.id), {
    at: Date.now(),
    root: job.organizeRoot,
    done: undo.done.map((op) => (op.op === 'move' ? { op: 'move', from: op.to, to: op.from } : op)),
    failed: undo.failed,
  });
  // Drop what went back from the accumulator; anything that could not reverse
  // stays recorded, so the picture matches the folder.
  const reversed = new Set(undo.done.map(opKey));
  const remaining = job.movesRun.done.filter((op) => !reversed.has(opKey(op)));
  const updated = rt.queue.setMovesDone(job.id, remaining);
  if (undo.failed.length > 0) {
    const detail = undo.failed.map((f) => `${opLabel(f.op)}: ${f.reason}`).join('; ');
    return c.json({ error: `undid ${undo.done.length}, some could not be reversed — ${detail}` }, 400);
  }
  return c.json(updated);
});

/** Standing approvals for this level — the list, and the switch (D-082). */
app.get('/api/levels/:lid/approvals', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(readApprovals(rt.dir).map(describeApproval));
});

app.post('/api/levels/:lid/approvals', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ key?: string; auto?: boolean }>();
  if (typeof body.key !== 'string' || typeof body.auto !== 'boolean') {
    return c.json({ error: 'key and auto are required' }, 400);
  }
  const { approval, error } = setAuto(rt.dir, body.key, body.auto, Date.now());
  if (!approval) return c.json({ error: error ?? 'could not change it' }, 400);
  return c.json(describeApproval(approval));
});

app.get('/api/levels/:lid/agentlings/:aid', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const agentling = rt.sim.agentlings.find((a) => a.id === c.req.param('aid'));
  if (!agentling) return c.json({ error: 'unknown agentling' }, 404);
  const loaded = registry.get(agentling.role);
  const profile: AgentlingProfile = {
    agentling,
    role: loaded
      ? {
          name: loaded.name,
          description: loaded.description,
          tools: loaded.tools,
          skills: loaded.skills,
          model: loaded.model,
        }
      : null,
    // Learnt lessons only — the journal lines (delivered/failed/hired-to)
    // are the career counter's story, not the memory's (D-089).
    memory: rt.memory.lessons(agentling.name).filter((line) => !isJournal(line)),
    // The notes a discard banked (D-201) under their own tag, and the jobs
    // you kept — the queue's verdicts beside the ledger's outcomes (UI.md,
    // step 12).
    discards: rt.memory.lessons(agentling.name).filter(isDiscardNote),
    kept: rt.queue
      .list()
      .filter((j) => j.assignedTo === agentling.id && j.status === 'promoted').length,
    record: recordOf(
      agentling.id,
      readLedger(SANDBOX_ROOT).filter((e) => e.levelId === rt.meta.id),
    ),
  };
  return c.json(profile);
});

app.post('/api/levels/:lid/agentlings/:aid/role', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const agentling = rt.sim.agentlings.find((a) => a.id === c.req.param('aid'));
  if (!agentling) return c.json({ error: 'unknown agentling' }, 404);
  const body = await c.req.json<{ role?: string; jobDescription?: string }>();
  const role = body.role ? registry.get(body.role) : undefined;
  if (!role) return c.json({ error: `unknown role "${body.role ?? ''}"` }, 400);
  agentling.role = role.name;
  // The hire's own words become their first memory, so the sentence that
  // created them is in front of every session they ever run.
  const job = body.jobDescription?.trim();
  if (job && job !== agentling.jobDescription) {
    agentling.jobDescription = job;
    rt.memory.append(agentling.name, `${new Date().toISOString().slice(0, 10)} · hired to: ${job}`);
  }
  saveRoster(rt);
  return c.json(agentling);
});

/**
 * Concept match: a sentence in, a proposed role and skills out. Local,
 * deterministic and instant — no auth, no network, no LLM.
 */
app.post('/api/match', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  return c.json(suggestSetup(matcher(), registry.list(), text));
});

/**
 * Tier 2: the same sentence, checked by one short Claude call. Deliberately a
 * separate request — /api/match stays instant and the UI has already drawn an
 * answer by the time this lands. Returns null whenever it can't help.
 */
app.post('/api/match/refine', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  if (!useClaude) return c.json({ available: false, refined: null });
  const refined = await refineMatch(text, registry.list(), listSkills(SKILLS_DIR));
  return c.json({ available: true, refined });
});

app.post('/api/levels/:lid/agentlings', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  // Seeded from the whole roster so a resting crew member's name isn't reused.
  const seed = newCrewSeed(rt.roster);
  const agentling = rt.sim.addAgentling(seed);
  rt.roster.push(seed);
  saveRoster(rt);
  return c.json(agentling, 201);
});

/** The Crew panel: everyone on the books, awake or resting. */
app.get('/api/levels/:lid/crew', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(crewOf(rt));
});

/**
 * The productivity panel: what the crew has produced and what it cost.
 *
 * Computed here rather than in the browser because the ledger is the only
 * complete account of what has been paid out, and it is not something to ship
 * to a client — it grows without bound and holds every run of every level.
 */
app.get('/api/levels/:lid/productivity', (c) => {
  const lid = c.req.param('lid');
  const rt = getLevel(lid);
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const entries = readLedger(SANDBOX_ROOT).filter((e) => e.levelId === lid);
  return c.json(
    productivityOf(entries, rt.queue.list(), crewOf(rt), (name) => rt.memory.lessons(name)),
  );
});

/** The inbox: the latest finished work, with what each run left on disk. */
app.get('/api/levels/:lid/deliveries', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const asked = Number(c.req.query('limit'));
  // Capped whatever is asked for: each row costs a directory read, and this is
  // polled on every change to the queue.
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 50) : DELIVERIES_SHOWN;
  const names = new Map(rt.roster.map((seed) => [seed.id, seed.name]));
  return c.json(deliveriesFor(rt.queue.list(), names, (id) => rt.queue.sandboxDir(id), limit));
});

/**
 * What compiling a recipe should cost: a plain session on the recipe's role,
 * quoted directly because the compile sets `noRouter` and so will not be
 * routed anywhere.
 */
function compileQuote(rt: LevelRuntime, role: string): Quote {
  const ledger = readLedger(SANDBOX_ROOT);
  const rate = costPerTurn(ledger, role, 'session', Boolean(rt.meta.repoPath));
  return quoteFor('session', role, ledger, {
    maxCeilingUsd: Number(process.env.AGENTLINGS_MAX_COST_USD) || undefined,
    // Floored on COMPILE_TURNS, the same cap the job is about to be given,
    // rather than on the role's — a quote that funds fewer turns than it has
    // decided to grant hands the smaller number straight back through the turn
    // budget, which is how RECIPE_TURNS = 5 arrived inert.
    ...(rate.samples > 0 ? { floorUsd: COMPILE_TURNS * rate.usd } : {}),
  });
}

/**
 * What a request would cost, worked out by asking the router what it would do
 * with it and looking up what that kind of work has cost before.
 *
 * `repoPath` is passed rather than read off the level because a job may carry
 * its own, and the shape decides both the route and the rate — quoting a repo
 * job at the level's empty path would price it as work of a different kind.
 */
/**
 * What a job may reach outside its sandbox: the connections that are on, plus
 * anything the caller named. Resolved once per request and handed to both the
 * quote and the queued job, never recomputed downstream — web access decides
 * whether the router can use its free `fetch` tier, so a quote that answered
 * this differently from the run would be pricing a different job.
 */
function granted(requested: string[] | undefined): string[] {
  return grantedTools(
    requested,
    readConnections(CONNECTIONS_FILE),
    readSettings(SANDBOX_ROOT),
    process.env,
  );
}

function crewOf(rt: LevelRuntime): CrewMember[] {
  return crewMembers(rt.roster, rt.sim.agentlings, (name) => rt.memory.lessons(name).length);
}

/** Pairs who look like the same hire. Proposals only — nothing acts on them. */
app.get('/api/levels/:lid/merge/proposals', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json(proposeMerges(crewOf(rt)));
});

/** Exactly what a merge would leave behind, before anyone commits to it. */
app.post('/api/levels/:lid/merge/preview', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ keep?: string; absorb?: string }>();
  const crew = crewOf(rt);
  const keep = crew.find((m) => m.id === body.keep);
  const absorb = crew.find((m) => m.id === body.absorb);
  if (!keep || !absorb || keep.id === absorb.id) {
    return c.json({ error: 'two different agentlings are required' }, 400);
  }
  const merged = mergeLessons(
    rt.memory.lessons(keep.name),
    [...rt.memory.lessons(absorb.name), ...absorptionNote(absorb)],
  );
  return c.json({
    keep,
    absorb,
    jobsDone: keep.jobsDone + absorb.jobsDone,
    jobsFailed: keep.jobsFailed + absorb.jobsFailed,
    lessons: merged.length,
    differentRoles: keep.role !== absorb.role,
  } satisfies MergePreview);
});

/**
 * Fold one agentling into another: careers add up, memories combine oldest
 * first, and the absorbed file is archived rather than dropped.
 */
app.post('/api/levels/:lid/merge', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ keep?: string; absorb?: string }>();
  const crew = crewOf(rt);
  const keep = crew.find((m) => m.id === body.keep);
  const absorb = crew.find((m) => m.id === body.absorb);
  if (!keep || !absorb || keep.id === absorb.id) {
    return c.json({ error: 'two different agentlings are required' }, 400);
  }
  for (const member of [keep, absorb]) {
    if (member.busy) {
      return c.json({ error: `${member.name} is working — let them finish first` }, 409);
    }
  }

  // Memory first: if this throws, nothing else has been touched yet.
  rt.memory.write(
    keep.name,
    mergeLessons(rt.memory.lessons(keep.name), [
      ...rt.memory.lessons(absorb.name),
      ...absorptionNote(absorb),
    ]),
  );
  rt.memory.archive(absorb.name);

  const survivor = rt.sim.agentlings.find((a) => a.id === keep.id);
  if (survivor) {
    survivor.jobsDone += absorb.jobsDone;
    survivor.jobsFailed += absorb.jobsFailed;
  } else {
    const seed = rt.roster.find((s) => s.id === keep.id);
    if (seed) {
      seed.jobsDone = keep.jobsDone + absorb.jobsDone;
      seed.jobsFailed = keep.jobsFailed + absorb.jobsFailed;
    }
  }

  rt.sim.sendOut(absorb.id);
  rt.roster = rt.roster.filter((s) => s.id !== absorb.id);
  saveRoster(rt);
  return c.json({ keep: keep.name, absorbed: absorb.name });
});

/** Rest: out through the door, off the queue, nothing lost. */
app.post('/api/levels/:lid/agentlings/:aid/rest', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const seed = rt.roster.find((s) => s.id === c.req.param('aid'));
  if (!seed) return c.json({ error: 'unknown agentling' }, 404);
  if (seed.resting) return c.json({ error: `${seed.name} is already resting` }, 400);
  if (isBusy(rt, seed.id)) {
    return c.json({ error: `${seed.name} is working — let them finish first` }, 409);
  }
  rt.sim.sendOut(seed.id);
  seed.resting = true;
  saveRoster(rt);
  return c.json({ id: seed.id, resting: true });
});

/** Back in through the hatch, career and lessons intact. */
app.post('/api/levels/:lid/agentlings/:aid/wake', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const seed = rt.roster.find((s) => s.id === c.req.param('aid'));
  if (!seed) return c.json({ error: 'unknown agentling' }, 404);
  if (!seed.resting) return c.json({ error: `${seed.name} is already here` }, 400);
  seed.resting = false;
  rt.sim.addAgentling(seed);
  saveRoster(rt);
  return c.json({ id: seed.id, resting: false });
});

/**
 * Letting someone go. The roster forgets them and their lessons move to
 * memory/archive — the app is done with them, the file is still there.
 */
app.delete('/api/levels/:lid/agentlings/:aid', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const seed = rt.roster.find((s) => s.id === c.req.param('aid'));
  if (!seed) return c.json({ error: 'unknown agentling' }, 404);
  if (isBusy(rt, seed.id)) {
    return c.json({ error: `${seed.name} is working — let them finish first` }, 409);
  }
  rt.sim.sendOut(seed.id);
  const archived = rt.memory.archive(seed.name);
  rt.roster = rt.roster.filter((s) => s.id !== seed.id);
  saveRoster(rt);
  return c.json({ id: seed.id, name: seed.name, archived: archived !== null });
});

/**
 * The knowledge store: which folders this level indexes, and what the index
 * holds. Returns the sources and the counts, never the passages — the point of
 * an index you can inspect is a page you can read, not a JSON dump of your
 * notes crossing the API on every poll.
 */
app.get('/api/levels/:lid/knowledge', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const index = readIndex(rt.dir);
  const sources = rt.meta.knowledgeSources ?? [];
  return c.json({
    sources,
    // Checked on every read, not only when it was added: a folder that has
    // since been moved or renamed contributes nothing, and a source that
    // silently contributes nothing is a setting that looks done and is not.
    missing: sources.filter((p) => !existsSync(p)),
    indexed: index !== null,
    entries: index?.entries.length ?? 0,
    files: index ? new Set(index.entries.map((e) => e.source)).size : 0,
    syncedAt: index?.syncedAt,
    // Reported rather than hidden: a store that quietly indexed half your
    // notes would answer confidently from the half it had.
    skipped: index?.skipped ?? 0,
    // The same rule one level down: a long report read only as far as the
    // per-file cap. Absent on an index written before documents were readable.
    truncated: index?.truncated ?? 0,
    scanned: index?.scanned ?? 0,
    scanCut: index?.scanCut ?? 0,
    unscanned: index?.unscanned ?? 0,
    // Windows-only, and it needs a language pack, so the platform alone does
    // not answer it. The panel tells the two apart rather than leaving a scan
    // that contributed nothing to look like a file that was never there.
    ocr: await ocrAvailable(),
    // Stale contributes nothing anywhere, so this is the difference between a
    // level that can answer from your material and one that has stopped.
    stale: index ? isStale(index, Date.now()) : false,
  });
});

/** Point this level at folders of your own material, and index them now. */
app.post('/api/levels/:lid/knowledge/sources', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { paths?: unknown };
  if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
    return c.json({ error: 'paths must be a list of folders' }, 400);
  }
  const paths = (body.paths as string[]).map((p) => p.trim()).filter(Boolean);
  // Which folders exist is worth saying now rather than after a silent sync
  // that found nothing: a typed path is the likeliest thing to be wrong.
  const missing = paths.filter((p) => !existsSync(p));
  rt.meta.knowledgeSources = paths;
  writeMeta(rt.dir, rt.meta);
  const index = await sync(paths, Date.now());
  writeIndex(rt.dir, index);
  return c.json({
    sources: paths,
    missing,
    entries: index.entries.length,
    skipped: index.skipped,
    truncated: index.truncated ?? 0,
    scanned: index.scanned ?? 0,
    scanCut: index.scanCut ?? 0,
    unscanned: index.unscanned ?? 0,
  });
});

/**
 * The native Select Folder dialog, served by the machine that has the
 * folders — a browser never reveals an absolute path, this process can.
 * Machine-level rather than level-scoped: the dialog belongs to the desk,
 * and whichever level asked saves the answer through its own sources route.
 */
app.post('/api/pick-folder', async (c) => {
  const picked = await pickFolder();
  if ('error' in picked) return c.json(picked, 400);
  return c.json(picked);
});

/** Re-read the folders. The crew reads the index, so nothing changes until this runs. */
app.post('/api/levels/:lid/knowledge/sync', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const sources = rt.meta.knowledgeSources ?? [];
  if (sources.length === 0) return c.json({ error: 'no folders to index' }, 400);
  const index = await sync(sources, Date.now());
  writeIndex(rt.dir, index);
  return c.json({
    entries: index.entries.length,
    skipped: index.skipped,
    truncated: index.truncated ?? 0,
    scanned: index.scanned ?? 0,
    scanCut: index.scanCut ?? 0,
    unscanned: index.unscanned ?? 0,
    syncedAt: index.syncedAt,
  });
});

/** The compiled tools this level has earned, and what they have done. */
app.get('/api/levels/:lid/tools', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  return c.json({
    tools: readTools(rt.dir).map((t) => ({ ...t, complete: isComplete(rt.dir, t) })),
    // What could be compiled next, and how often it would have paid off.
    candidates: readToolCandidates(rt.dir),
  });
});

/**
 * Takes a tool out of service by hand.
 *
 * Retirement already exists — two failures in a row set the same field — but
 * until now the only way to retire a tool you *know* is broken was to let it
 * fail twice, at the price of a fallback session each time. The reason is
 * required because the one thing worth keeping is why: "its verify rejects a
 * multi-line export its run correctly lists" is the whole value of the record.
 *
 * One-way on purpose. The scripts stay on disk unchanged, so un-retiring would
 * re-arm the same broken code; the way back is to compile again, which writes
 * new scripts and goes through review like any other executable instruction.
 * Nothing is deleted either — a retired tool is how the next person works out
 * what went wrong.
 */
app.post('/api/levels/:lid/tools/:name/retire', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });
  const reason = body.reason?.trim();
  if (!reason) return c.json({ error: 'reason is required' }, 400);

  const name = c.req.param('name');
  const tool = readTools(rt.dir).find((t) => t.name === name);
  if (!tool) return c.json({ error: `no tool called "${name}"` }, 404);
  if (tool.retiredReason) {
    return c.json({ error: `already retired — ${tool.retiredReason}` }, 400);
  }

  const retired = { ...tool, retiredReason: reason };
  writeTool(rt.dir, retired);
  return c.json(retired);
});

/**
 * Compiles a proven recipe into a tool: one paid session whose only job is to
 * write the script and the check.
 *
 * Deliberately a request rather than something that happens by itself. It
 * spends money, and a promotion nobody asked for is a charge nobody quoted —
 * the candidate log exists so the decision has evidence behind it, not so the
 * app can make the decision alone.
 */
app.post('/api/levels/:lid/tools/promote', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ recipeKey?: string }>();
  const key = body.recipeKey?.trim();
  if (!key) return c.json({ error: 'recipeKey is required' }, 400);

  const recipe = readRecipes(rt.dir).find((r) => r.key === key);
  if (!recipe) return c.json({ error: `no recipe for "${key}"` }, 404);
  if ((recipe.successes ?? 0) < TOOL_CANDIDATE_RUNS) {
    return c.json(
      {
        error: `that recipe has landed ${recipe.successes ?? 0} times; a tool is worth writing after ${TOOL_CANDIDATE_RUNS}`,
      },
      400,
    );
  }
  /**
   * A manifest is written before the compiling session runs, so "a manifest
   * exists" is not "a tool exists". Refusing on the manifest alone made every
   * abandoned compile poison its recipe for ever: discard one and it can never
   * be compiled again, which is the opposite of what reviewing output is for.
   *
   * Asked properly instead — is there a tool that *works*, or a compile still
   * in flight? Both are reasons not to start another. A stranded manifest is
   * neither, and this is deliberately robust to how it was stranded: discard,
   * cancel, a crash, a restart. Chasing each terminal path would leave the
   * next one to be found the same way (D-045).
   */
  const inFlight = (t: { pendingJobId?: string }): boolean => {
    const job = t.pendingJobId ? rt.queue.get(t.pendingJobId) : undefined;
    return job?.status === 'queued' || job?.status === 'running';
  };
  const blocking = readTools(rt.dir).find(
    (t) => t.recipeKey === key && !t.retiredReason && (isComplete(rt.dir, t) || inFlight(t)),
  );
  if (blocking) {
    return c.json(
      {
        error: inFlight(blocking)
          ? 'a compile for that recipe is already running'
          : 'a tool for that recipe already exists',
      },
      400,
    );
  }

  /**
   * Landing three times says the method is repeatable. It does not say the
   * method is *compilable*, and nothing asked that until a recipe reached the
   * gate that plainly was not: "list the last 10 commits on GitHub" earned its
   * three deliveries through the code-host connection, and a tool is plain
   * node with no network. Promoting it would have spent about a dollar asking
   * a session to write a script that cannot exist (D-044).
   *
   * Judged on the connections the recipe was learned with, minus the ones that
   * are on by default — those appear on nearly every surface and so carry no
   * information. What remains was switched on deliberately.
   */
  /**
   * What the method actually reached, when the runs recorded it (D-100).
   *
   * D-044 judged this from availability and named the cost: a surface says
   * what a run *could* touch, so a connection somebody switched on rides every
   * recipe learned since, used or not. Measured before this changed, that was
   * not theoretical — three of the seven recipes eligible to compile were
   * refused for carrying `browser`, and none of them plausibly opened one.
   *
   * Use is the better question and now answerable, so it is asked first.
   * Availability remains the answer for recipes learned before runs recorded
   * their tools: absent evidence is not evidence of absence, and treating it
   * as such would approve a compile that cannot exist — the one thing D-044
   * was built to stop.
   */
  const catalog = readConnections(CONNECTIONS_FILE);
  const needs = compileBlockers(recipe, catalog);
  if (needs.length > 0) {
    return c.json(
      {
        error: `that method used ${needs.join(' and ')}, and there is no door a compiled tool can be handed for that — it could never do this job. Compiled tools take the scaffolding; work that has to reach outside by some other route stays a session.`,
      },
      400,
    );
  }

  /**
   * The doors this method reached, which the tool is compiled against and
   * granted at run time (D-100, reopened on its own stated condition).
   *
   * The compiling job is granted them too, and must be: a session asked to
   * write a script against a door it cannot call can only guess at what comes
   * back, and the one thing that makes this tier safe is that the script was
   * tested before anyone approved it.
   */
  const doors = compileDoors(recipe, catalog);
  const endpoints = doorEndpoints(doors);

  // A recipe compiled before and retired is a second attempt, not a first.
  // Say so, and take a fresh name so the earlier one survives to be read.
  const previous = readTools(rt.dir).filter((t) => t.recipeKey === key && t.retiredReason);
  const name = freeToolName(rt.dir, toolNameFor(key));
  const prompt = promotionPrompt(
    recipe,
    previous.flatMap((t) => (t.retiredReason ? [t.retiredReason] : [])),
    doors.map((name) => ({
      name,
      endpoint: endpoints[name],
      tools: catalog.find((conn) => conn.name === name)?.tools,
    })),
  );
  const job = rt.queue.add({
    title: `Compile "${recipe.key.slice(0, 40)}" into a tool`,
    prompt,
    repoPath: rt.meta.repoPath || undefined,
    preferredRole: recipe.role,
    // The doors the tool is being written against, so the compiling session can
    // call them while testing rather than write against a description of them.
    ...(doors.length > 0 ? { tools: doors } : {}),
    // The compiler must not be handed its own half-written tool as a shortcut.
    noRouter: true,
    // A compile is longer work than the role that owns the recipe does day to
    // day, and both compiles on record ran out at the role's cap of 10.
    maxTurns: COMPILE_TURNS,
    // Reaches the ledger so compiles can one day be priced as their own kind
    // of work. Nothing reads it yet — see LedgerEntry.compile for why.
    compile: true,
    // Quoted like any other work. It was the one job in the app that ran
    // without a ceiling, which went unnoticed until a compile spent $1.26 and
    // still ran out of turns — unbounded because nobody had thought to bound
    // it, not because anyone decided it should be. Quoted as a session
    // outright rather than through the router, since `noRouter` above means
    // that is what it will be.
    quotedUsd: compileQuote(rt, recipe.role).ceilingUsd || undefined,
  });
  const earnedBy = rt.roster.find((s) => s.id === job.assignedTo)?.name;
  writeTool(rt.dir, {
    name,
    recipeKey: key,
    terms: recipe.terms,
    hasRepo: Boolean(rt.meta.repoPath),
    // Copied from the recipe rather than read off the level now: the surface
    // that matters is the one the *method* was found under, and this is the
    // only moment both are in hand. Absent when the recipe predates D-036,
    // which is a fact about the history and not something to invent.
    ...(recipe.capabilities ? { capabilities: recipe.capabilities } : {}),
    // What it may reach, as against what was merely available when the method
    // was found. Written only when there is something to grant, so a tool under
    // the original no-network contract keeps a manifest with no such field —
    // which is what every tool compiled before today already has.
    ...(doors.length > 0 ? { connections: doors } : {}),
    // Where it was earned, and by whom. Stamped here for the same reason the
    // capabilities are: this is the only moment both the level and the compile
    // job are in hand. The name is absent when the job has not been picked up
    // by anyone yet, which is a fact about the timing and not something to
    // invent.
    ...(rt.meta.id ? { earnedIn: rt.meta.id } : {}),
    ...(earnedBy ? { earnedBy } : {}),
    description: `Compiled from a recipe the crew landed ${recipe.successes} times.`,
    learnedAt: Date.now(),
    runs: 0,
    failures: 0,
    // Nothing is installed until this job is reviewed and promoted.
    pendingJobId: job.id,
  });
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title, ...queuedDetail(rt, job) });
  return c.json(
    {
      tool: name,
      job,
      // Why a second compile might go the same way as the first.
      ...(previous.length > 0
        ? {
            previouslyRetired: previous.map((t) => ({
              name: t.name,
              reason: t.retiredReason,
            })),
          }
        : {}),
    },
    201,
  );
});

/** Spend so far: what it cost us, what is chargeable, what we absorbed. */
app.get('/api/spend', (c) => {
  const entries = readLedger(SANDBOX_ROOT);
  return c.json({
    overall: totals(entries),
    byLevel: totalsBy(entries, 'levelId'),
    byTier: totalsBy(entries, 'tier'),
  });
});

app.get('/api/connections', (c) => c.json(connectionList()));

/** Every door's use off the trail (D-192), for the switches in Settings (UI.md, step 8). */
app.get('/api/doors/usage', (c) => c.json({ doors: readDoorUsage(SANDBOX_ROOT) }));

/**
 * Web fetches for a running session. The server owns extraction, trimming and
 * the allowlist so there is one implementation; the spawned runner asks here
 * rather than keeping a copy. Bound to localhost, like the rest of the API.
 */
app.post('/internal/fetch', async (c) => {
  const body = await c.req.json<{ url?: string }>();
  const url = body.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);
  const web = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'web');
  if (!web) return c.json({ error: 'web access is not configured' }, 404);
  const result = await fetchPage(url, { allow: web.allow, maxChars: web.maxChars });
  logDoor(SANDBOX_ROOT, 'web', 'fetch_page', { url }, result);
  return c.json(result);
});

/**
 * Code-host reads for a running session, for the same reason as /internal/fetch:
 * the server owns the call so it owns the size of the answer, and the token
 * never leaves this process. Localhost, like the rest of the API.
 */
app.post('/internal/github', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'github');
  if (!connection) return c.json({ error: 'the code host connection is not configured' }, 404);
  // The catalog's own list is the grant. A tool this connection does not
  // declare is refused here as well as by the allowlist, so the two cannot
  // drift into disagreeing about what was granted.
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callGithub(body.tool, body.args ?? {}, {
    http,
    token: process.env.GITHUB_TOKEN,
  });
  logDoor(SANDBOX_ROOT, 'github', body.tool, body.args ?? {}, result);
  return c.json(result);
});

/**
 * Web search for a running session, gated exactly as `/internal/github` is:
 * the server owns the call so it owns the size of the answer, and the key
 * never leaves this process.
 */
app.post('/internal/search', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'search');
  if (!connection) return c.json({ error: 'the search connection is not configured' }, 404);
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callSearch(body.tool, body.args ?? {}, {
    http,
    token: process.env.BRAVE_API_KEY,
  });
  logDoor(SANDBOX_ROOT, 'search', body.tool, body.args ?? {}, result);
  return c.json(result);
});

/**
 * US labour statistics, gated exactly as `/internal/github` and
 * `/internal/search` are. Its own door rather than the web one because the
 * registration key rides in a POST body and `fetchPage` is GET (D-187).
 */
app.post('/internal/bls', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'bls');
  if (!connection) return c.json({ error: 'the BLS connection is not configured' }, 404);
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callBls(body.tool, body.args ?? {}, {
    http,
    token: process.env.BLS_REGISTRATION_KEY,
  });
  logDoor(SANDBOX_ROOT, 'bls', body.tool, body.args ?? {}, result);
  return c.json(result);
});

/**
 * Calendar reads for a running session, gated exactly as the doors above. The
 * access token is minted from the stored refresh token per call and never
 * kept (google.ts's rule for sends, applied to reads). Deliberately absent
 * from DOORS: a compiled tool can never be granted this one, which is D-158's
 * uncompilable-by-construction — desk work is live-data judgement.
 */
app.post('/internal/calendar', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'calendar');
  if (!connection) return c.json({ error: 'the calendar connection is not configured' }, 404);
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callCalendar(body.tool, body.args ?? {}, { http, env: process.env });
  logDoor(SANDBOX_ROOT, 'calendar', body.tool, body.args ?? {}, result);
  return c.json(result);
});

/**
 * Mail reads for a running session — D-158's second reader, gated exactly as
 * `/internal/calendar` above: the access token is minted per call and never
 * kept, and the connection is deliberately absent from DOORS so a method that
 * read the mailbox can never compile into a $0 tool.
 */
app.post('/internal/mail', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'mail');
  if (!connection) return c.json({ error: 'the mail connection is not configured' }, 404);
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callMail(body.tool, body.args ?? {}, { http, env: process.env });
  logDoor(SANDBOX_ROOT, 'mail', body.tool, body.args ?? {}, result);
  return c.json(result);
});

app.post('/internal/render', async (c) => {
  const body = await c.req.json<{ tool?: string; args?: Record<string, unknown> }>();
  if (!body.tool) return c.json({ error: 'tool is required' }, 400);
  const connection = readConnections(CONNECTIONS_FILE).find((conn) => conn.name === 'render');
  if (!connection) return c.json({ error: 'the render connection is not configured' }, 404);
  if (!(connection.tools ?? []).includes(body.tool)) {
    return c.json({ error: `${body.tool} is not granted on this connection` }, 403);
  }
  const result = await callRender(body.tool, body.args ?? {});
  logDoor(SANDBOX_ROOT, 'render', body.tool, body.args ?? {}, result);
  return c.json(result);
});

app.get('/api/roles', (c) => c.json(registry.list()));

/**
 * Hand a skill to a role (D-089). Role-level on purpose — capability lives
 * in the baseline tier (D-050), so a skill handed to "worker" reaches every
 * worker on their next session, and the card's copy says exactly that. The
 * skill must already be installed; finding new ones stays the library's job.
 */
app.post('/api/roles/:name/skills', async (c) => {
  const role = registry.get(c.req.param('name'));
  if (!role) return c.json({ error: 'unknown role' }, 404);
  const body = await c.req.json<{ skill?: string }>();
  const skill = body.skill?.trim().toLowerCase();
  if (!skill) return c.json({ error: 'skill is required' }, 400);
  if (!listSkills(SKILLS_DIR).some((s) => s.name === skill)) {
    return c.json(
      { error: `"${skill}" is not an installed skill — install it from the library first` },
      400,
    );
  }
  if (role.skills.includes(skill)) {
    return c.json({ error: `${role.name} already has ${skill}` }, 400);
  }
  const updated = registry.install(roleTextWithSkill(ROLES_DIR, role.name, skill), {
    replace: true,
  });
  const { prompt: _prompt, ...info } = updated;
  return c.json(info);
});

app.get('/api/skills', (c) => c.json(listSkills(SKILLS_DIR)));

function installedNames(): { roles: string[]; skills: string[] } {
  return {
    roles: registry.list().map((r) => r.name),
    skills: listSkills(SKILLS_DIR).map((s) => s.name),
  };
}

app.get('/api/library', (c) => c.json(libraryStatus(library, Date.now())));

app.post('/api/library/refresh', async (c) => {
  await syncLibrary();
  return c.json(libraryStatus(library, Date.now()));
});

/**
 * The catalogue's shape, for browsing it without a query.
 *
 * Two answers from one route, because they are two views of the same fetch and
 * the expensive half is optional. Without `category` it returns the categories
 * and their counts — a few KB, the whole index being 372 of them. With one it
 * returns that category's entries as installable hits.
 *
 * Counts describe what is *indexed*, never what a repository holds: a source
 * is capped at MAX_PER_SOURCE and the overflow is already reported on the
 * status line, so a category promising files the library cannot show would be
 * this app's oldest bug — a figure nobody can act on.
 */
app.get('/api/library/browse', async (c) => {
  if (!library) await syncLibrary();
  const entries = library?.entries ?? [];
  const sources = library?.sources ?? [];
  const kindParam = c.req.query('kind');
  const kind = kindParam === 'role' || kindParam === 'skill' ? kindParam : undefined;
  const source = c.req.query('source') || undefined;
  const category = c.req.query('category');

  if (category === undefined) {
    // The kind filter narrows the categories too, so choosing "abilities"
    // cannot leave a chip on screen that opens empty.
    const shown = entriesIn(entries, sources, { kind, source });
    return c.json({
      categories: categorise(shown, sources),
      jobs: entries.filter((e) => e.kind === 'role').length,
      abilities: entries.filter((e) => e.kind === 'skill').length,
      indexed: indexedBySource(entries, sources),
    });
  }

  const manifest = loadManifest(SANDBOX_ROOT);
  const names = installedNames();
  return c.json(
    entriesIn(entries, sources, { category, kind, source }).map((entry) => ({
      entry,
      state: installState(manifest, names, entry),
    })),
  );
});

/** Plain-language search across the indexed sources. */
app.post('/api/library/search', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  if (!library) await syncLibrary();
  const { hits, gaps } = searchEntries(library?.entries ?? [], text);
  const manifest = loadManifest(SANDBOX_ROOT);
  const names = installedNames();
  return c.json({
    hits: hits.map((entry) => ({ entry, state: installState(manifest, names, entry) })),
    gaps,
  });
});

/**
 * The full text, before anything is written. An installed template is
 * instruction handed to an agent — the user reads it or it doesn't go in.
 */
app.post('/api/library/preview', async (c) => {
  const body = await c.req.json<{ repo?: string; path?: string; sha?: string }>();
  if (!body.repo || !body.path || !body.sha) {
    return c.json({ error: 'repo, path and sha are required' }, 400);
  }
  const entry = library?.entries.find(
    (e) => e.repo === body.repo && e.path === body.path && e.sha === body.sha,
  );
  if (!entry) return c.json({ error: 'not in the library index — refresh and try again' }, 404);
  try {
    const text = await fetchTemplate(http, entry.repo, entry.sha, entry.path);
    // A skill brings its folder. Say so before anything is written, or the
    // "nothing arrives unread" rule only covers the part that is markdown.
    const companions =
      entry.kind === 'skill'
        ? await listCompanions(
            http,
            entry.repo,
            entry.sha,
            entry.path,
            process.env.GITHUB_TOKEN,
          )
        : { files: [], truncated: 0 };
    const warnings = reviewWarnings(text);
    if (companions.files.length > 0) {
      warnings.push(
        `brings ${companions.files.length} more file${companions.files.length === 1 ? '' : 's'} from its folder — scripts it can run`,
      );
    }
    if (companions.truncated > 0) {
      warnings.push(`${companions.truncated} further file(s) are too many or too large to install`);
    }
    return c.json({ text, warnings, companions: companions.files });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/** Installs the exact commit the index recorded, and records where it came from. */
app.post('/api/library/install', async (c) => {
  const body = await c.req.json<{ repo?: string; path?: string; sha?: string }>();
  const entry = library?.entries.find(
    (e) => e.repo === body.repo && e.path === body.path && e.sha === body.sha,
  );
  if (!entry) return c.json({ error: 'not in the library index — refresh and try again' }, 404);
  try {
    const text = await fetchTemplate(http, entry.repo, entry.sha, entry.path);
    const installed =
      entry.kind === 'role' ? registry.install(text) : installSkill(SKILLS_DIR, text);

    // The rest of the skill's folder, read at the same commit as its
    // SKILL.md so the instructions and the scripts cannot disagree.
    let brought = 0;
    let missing = 0;
    if (entry.kind === 'skill') {
      const { files, truncated } = await listCompanions(
        http,
        entry.repo,
        entry.sha,
        entry.path,
        process.env.GITHUB_TOKEN,
      );
      missing = truncated;
      const dir = skillFolder(entry.path);
      for (const file of files) {
        try {
          const body = await fetchTemplate(http, entry.repo, entry.sha, file.path);
          writeSkillFile(SKILLS_DIR, installed.name, file.path.slice(dir.length), body);
          brought++;
        } catch (err) {
          // One unreadable helper must not undo an otherwise good install;
          // the counts returned tell the user it came in short.
          missing++;
          console.warn(`[agentlings] skipped ${file.path}: ${String(err)}`);
        }
      }
    }
    recordInstall(SANDBOX_ROOT, entry.kind, installed.name, {
      repo: entry.repo,
      path: entry.path,
      sha: entry.sha,
      source: entry.source,
      installedAt: Date.now(),
    });
    matchIndex = null; // the catalog changed; rebuild on next match
    // `missing` is not an error, but a skill that arrived short will fail at
    // run time with no clue why, so it is reported rather than swallowed.
    return c.json(
      { kind: entry.kind, name: installed.name, files: brought, ...(missing ? { missing } : {}) },
      201,
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post('/api/templates/install', async (c) => {
  const body = await c.req.json<{ url?: string; kind?: string }>();
  if (!body.url?.trim() || (body.kind !== 'role' && body.kind !== 'skill')) {
    return c.json({ error: 'url and kind ("role" | "skill") are required' }, 400);
  }
  let text: string;
  try {
    const res = await fetch(toRawUrl(body.url.trim()));
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    text = await res.text();
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
  try {
    const installed =
      body.kind === 'role' ? registry.install(text) : installSkill(SKILLS_DIR, text);
    matchIndex = null; // the catalog changed; rebuild on next match
    return c.json({ kind: body.kind, name: installed.name }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// The bind is the whole boundary: the /internal doors carry no auth, and
// with no hostname this listened on 0.0.0.0 — every route reachable from
// the LAN (found by the first architect run, measured by netstat; D-127).
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`[agentlings] server on http://localhost:${info.port}`);
});

// Refresh the library in the background when the cache is old; never on the
// boot path, and a failure here must not matter until someone searches.
if (libraryStatus(library, Date.now()).stale) {
  void syncLibrary().catch((err: unknown) => {
    console.log(`[agentlings] library sync failed: ${err instanceof Error ? err.message : err}`);
  });
}

const wss = new WebSocketServer({ server: server as HttpServer, path: '/ws' });
const subscriptions = new Map<WebSocket, string>();

function sendToLevel(levelId: string, msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const [socket, subscribed] of subscriptions) {
    if (subscribed === levelId && socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}

/** Whether anyone is actually looking at this level. */
function watching(levelId: string): boolean {
  for (const [socket, subscribed] of subscriptions) {
    if (subscribed === levelId && socket.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

wss.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const levelId = url.searchParams.get('level') ?? '';
  const rt = levels.get(levelId);
  if (!rt) {
    socket.close(SOCKET_LEVEL_GONE, 'unknown level');
    return;
  }
  subscriptions.set(socket, levelId);
  socket.on('close', () => subscriptions.delete(socket));
  socket.send(JSON.stringify({ type: 'world', state: rt.sim.state() } satisfies ServerMessage));
  socket.send(
    JSON.stringify({ type: 'events', events: rt.eventLog.history() } satisfies ServerMessage),
  );
});

/** The queue revision every watcher of a level has already been sent. */
const sentJobsRev = new Map<string, number>();

setInterval(() => {
  for (const rt of levels.values()) {
    // The sim steps whether or not anyone is watching — jobs run, agentlings
    // walk, work finishes. What is skipped is *describing* it: `sim.state()`
    // spreads and sorts every job in the level, and at 54 jobs that was 42KB
    // built and serialised ten times a second for an empty room.
    rt.sim.step();
    if (!watching(rt.meta.id)) {
      // Nobody has been told anything, so nobody is up to date. Whoever
      // connects next gets a full state, which re-syncs them.
      sentJobsRev.delete(rt.meta.id);
      continue;
    }
    // Agentlings move every tick and the job list does not. Send it only when
    // it has actually changed; a client keeps the last one it was given.
    const rev = rt.queue.revision();
    const withJobs = sentJobsRev.get(rt.meta.id) !== rev;
    sendToLevel(rt.meta.id, { type: 'world', state: rt.sim.frame(withJobs) });
    if (withJobs) sentJobsRev.set(rt.meta.id, rev);
  }
}, TICK_MS);

/**
 * The recurrence sweep (D-103). Due schedules fire through the same glue
 * `/work` uses, so a scheduled job is quoted, channel-settled and specced
 * exactly like a hand-queued one. Advance-then-attempt: the schedule moves
 * past its occurrence before the queueing is tried, so a firing that throws
 * is an error on the row and not a retry every thirty seconds — and a
 * server that slept through occurrences fires each schedule once on boot,
 * never a backlog.
 */
function sweepSchedules(now = Date.now()): void {
  for (const rt of levels.values()) {
    for (const schedule of dueNow(readSchedules(rt.dir), now)) {
      markFired(rt.dir, schedule.id, now);
      try {
        queueSentence(rt, schedule.prompt, {
          channel: schedule.channel,
          answers: schedule.answers,
          note: `queued by its schedule — ${describeCadence(schedule.cadence)}`,
        });
      } catch (err) {
        markFired(rt.dir, schedule.id, now, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

setInterval(sweepSchedules, SCHEDULE_SWEEP_MS);
// Boot is a sweep too: whatever came due while the server was off fires
// once, now, rather than waiting out the first interval.
sweepSchedules();
