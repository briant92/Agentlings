import { serve } from '@hono/node-server';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Agentling,
  AgentlingProfile,
  Cadence,
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
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
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
import { capabilityTokens, compileBlockers } from './capability';
import { CHANNELS, executeOutbox, outboxRefusal, sendPriceUsd } from './channels';
import { describe, missingSecrets, readConnections } from './connections';
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
import { channelShelf, detectChannelAsk, mentionsChannel } from './channel';
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
import { ClaudeAgentExecutor, COMPILE_TURNS, mapTools } from './executors/claude';
import type { Executor } from './executors/executor';
import { RoutedExecutor } from './executors/routed';
import { SimulatedExecutor } from './executors/simulated';
import { categorise, entriesIn, indexedBySource } from './browse';
import { deliveriesFor } from './deliveries';
import { applyPatch, patchFile } from './gitwork';
import {
  appendKnowledge,
  createLevelFiles,
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
  costPerTurn,
  ledgerRow,
  readLedger,
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
  safeOutputPath,
} from './outputs';
import { pickFolder } from './pickFolder';
import { previewFile } from './preview';
import { isJournal, productivityOf, recordOf } from './productivity';
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
  telegramChats,
  writeAudience,
} from './audience';
import { appendSends, readSends } from './sends';
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
import { callSearch } from './search';
import { fetchPage } from './web';
import { AUTHOR_ROLE } from './packcontract';
import {
  continuationBrief,
  forceRole,
  planWork,
  queuedJobSpec,
  redoJobSpec,
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
const http: Http = (url, headers) => fetch(url, { headers });

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
          (channel) => readAudience(SANDBOX_ROOT, channel),
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
      appendKnowledge(
        dir,
        `${date} · ${agentling.name} (${agentling.role}) ${outcome === 'done' ? 'delivered' : 'failed'} "${jobTitle}"${lesson ? ` — ${lesson}` : ''}`,
      );

      // Every job goes in the ledger, including the ones we absorb — the
      // difference between cost and price is only visible if both are kept.
      appendLedger(SANDBOX_ROOT, ledgerRow(job, meta.id, agentling.role, outcome, Date.now()));
      // The one path that sends without review, gated hard (D-082). Fire and
      // forget: a send must never block the finish bookkeeping around it.
      void autoSendIfApproved(dir, queue, eventLog, meta.id, job);
      // A delivered step queues the next through the same glue; a failed
      // one halts the chain with the reason in the feed (D-105).
      const chainRuntime = levels.get(meta.id);
      if (chainRuntime) queueNextStep(chainRuntime, job);
      // Persist the career as it happens, so a restart no longer wipes it.
      const runtime = levels.get(meta.id);
      if (runtime) {
        const seed = runtime.roster.find((s) => s.id === agentling.id);
        if (seed) seed.lastWorkedAt = Date.now();
        saveRoster(runtime);
      }
    },
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
    const outbox = job.outbox!;
    const approval = readApprovals(dir).find(
      (a) => a.key === approvalKey(queue.rootPrompt(job.id) ?? job.prompt),
    );
    if (!autoSendable(approval, outbox)) return;
    const refusal = outboxRefusal(
      outbox,
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
    const run = await executeOutbox(outbox, job.outboxSent?.sentTo ?? [], { env: process.env });
    const at = Date.now();
    const usd = sendPriceUsd(outbox.channel, process.env);
    const messageOf = (to: string) => outbox.messages.find((m) => m.to === to);
    appendSends(SANDBOX_ROOT, [
      ...run.sentTo.map((to) => ({
        at,
        levelId,
        jobId: job.id,
        channel: outbox.channel,
        to,
        ...(messageOf(to)?.name ? { name: messageOf(to)?.name } : {}),
        ...(messageOf(to)?.body ? { body: messageOf(to)?.body } : {}),
        ok: true,
        ...(usd ? { usd } : {}),
      })),
      ...run.failed.map((f) => ({
        at,
        levelId,
        jobId: job.id,
        channel: outbox.channel,
        to: f.to,
        ok: false,
        reason: f.reason,
      })),
    ]);
    queue.recordOutboxSends(job.id, run);
    if (run.failed.length > 0) {
      eventLog.emit({
        type: 'progress',
        jobId: job.id,
        title: job.title,
        detail: `standing approval sent ${run.sentTo.length} of ${run.sentTo.length + run.failed.length} — the rest waits for your review`,
      });
      return;
    }
    queue.resolve(job.id, 'promote');
    recordApproval(dir, queue.rootPrompt(job.id) ?? job.prompt, outbox, at);
    eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: `sent automatically — ${run.sentTo.length} via ${outbox.channel}, standing approval`,
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

// Recover the diffs of runs the last process was killed in the middle of.
// Not awaited: the server should come up now, and a job that has been waiting
// since a crash can wait another second for its patch.
for (const rt of levels.values()) {
  void rt.queue.harvestInterrupted().then((n) => {
    if (n > 0) console.log(`[agentlings] recovered changes from ${n} interrupted job(s)`);
  });
}

function levelInfo(rt: LevelRuntime): LevelInfo {
  const jobs = rt.queue.list();
  return {
    ...rt.meta,
    crew: rt.sim.agentlings.length,
    colors: rt.sim.agentlings.map((a) => a.color),
    jobsDone: rt.sim.agentlings.reduce((sum, a) => sum + a.jobsDone, 0),
    jobsRunning: jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
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
  return readAudience(SANDBOX_ROOT, channel).flatMap((person) => [
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
  const channel = c.req.param('channel');
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
  c.json({ people: removePerson(SANDBOX_ROOT, c.req.param('channel'), c.req.param('id')) }),
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
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
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
  const draft =
    body.authoring === true && registry.get(AUTHOR_ROLE)
      ? forceRole(matchedDraft, AUTHOR_ROLE, rt.sim.agentlings)
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
    // A detected send asks its facts even when the ask fell to a fork — the
    // asked name stands in for the channel so the hint has something to say,
    // and a confirmed near-miss (D-093) counts like a detection.
    questions: questionsFor(text, {
      hasRepo: !!rt.meta.repoPath,
      tier: quote.tier,
      channel: askChannel,
      names,
    }),
    ...(channelAsk ? { channelAsk } : {}),
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
  } = {},
): Job {
  // The split happens inside the glue (D-105), so every way in composes:
  // a scheduled composite sentence splits at fire time exactly as a typed
  // one splits at Start. A chain-queued step arrives with its chain already
  // decided and is never re-split.
  let text = fullText;
  let steps = opts.steps;
  let step = opts.step;
  if (!opts.noSplit && steps === undefined && step === undefined) {
    const split = splitSteps(fullText);
    if (split) {
      text = split[0];
      steps = split.slice(1);
      step = { n: 1, of: split.length };
    }
  }
  const matched = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  const plan =
    opts.role && registry.get(opts.role)
      ? forceRole(matched, opts.role, rt.sim.agentlings)
      : matched;
  const tools = granted(opts.tools);
  const requestedChannel = opts.channel;
  const channelAsk = requestedChannel
    ? null
    : detectChannelAsk(
        text,
        readConnections(CONNECTIONS_FILE),
        readSettings(SANDBOX_ROOT),
        process.env,
      );
  const channel =
    requestedChannel && CHANNELS[requestedChannel]
      ? requestedChannel
      : channelAsk?.channel && CHANNELS[channelAsk.channel]
        ? channelAsk.channel
        : undefined;
  // Read from the same sentence and the same answers the card was quoted on,
  // through the one function both ways in share — a desk that promised free
  // and a queue that then billed a session would be the worst of both (D-097).
  const names = rosterNames(channel ?? channelAsk?.asked);
  const send = sendFacts(text, { channel, names }, opts.answers);
  const quote = quoteFor_(
    QUOTE_CTX,
    rt.dir,
    text,
    tools,
    runnerRole(plan),
    rt.meta.repoPath || undefined,
    false,
    undefined,
    send ?? undefined,
    channel,
  );
  const job = rt.queue.add(
    queuedJobSpec({
      title: plan.title,
      prompt: text,
      repoPath: rt.meta.repoPath || undefined,
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
          names,
        },
        opts.answers,
      ),
      attachments: opts.attachments ?? [],
      channel,
      ...(send ? { send } : {}),
      ...(opts.brief ? { brief: opts.brief } : {}),
      ...(steps?.length ? { steps } : {}),
      ...(step ? { step } : {}),
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
    }),
  );
  rt.eventLog.emit({
    type: 'queued',
    jobId: job.id,
    title: job.title,
    ...(opts.note ? { detail: opts.note } : {}),
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
    /** A picture to work from, when the user picked "pre-rendered" (D-113). */
    reference?: { name?: string; data?: string };
  }>();
  const description = body.description?.trim();
  if (!description) return c.json({ error: 'say what the world should be' }, 400);

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
    brief: packBrief(scanPacks(ROOT).installed.map((p) => p.slug), reference),
    attachments,
    // A description is prose about a place. Splitting it on the word "then"
    // would turn "a deck, then the sea beyond it" into two jobs (D-105).
    noSplit: true,
    // Authoring is design work, and the sentence cannot say so — it arrives
    // by a button. Naming the role here is also what finally gives the class
    // a ledger of its own, after two runs priced 3x under as `worker`.
    role: AUTHOR_ROLE,
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
    /** The user chose "run as one job" on the steps row (D-105). */
    single?: boolean;
  }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);

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

  // Everything from the plan to the queued event is the shared glue above —
  // one body for every way a sentence becomes a job, so the ways in cannot
  // drift. The schedule sweep is the other caller (D-103).
  const job = queueSentence(rt, text, {
    tools: body.tools,
    channel: typeof body.channel === 'string' ? body.channel : undefined,
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
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
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
  const job = rt.queue.add(
    queuedJobSpec({
      title: previous.title,
      prompt,
      repoPath: previous.repoPath,
      tools,
      plan: { ...plan, role: previous.preferredRole ?? plan.role },
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
      channel:
        previous.channel ??
        detectChannelAsk(reply, readConnections(CONNECTIONS_FILE), readSettings(SANDBOX_ROOT), process.env)
          ?.channel,
    }),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
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
  if (!previous.meter?.outOfTurns) {
    return c.json({ error: 'that run did not stop for want of turns' }, 400);
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
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
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
  if (!previous.meter?.outOfTurns) {
    return c.json({ error: 'that run did not stop for want of turns' }, 400);
  }
  return c.json({ quote: continuationSpec(rt, previous).quote });
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
  return c.json({ files: describeOutputs(rt.queue.sandboxDir(job.id)) });
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
  if (body.action !== 'promote' && body.action !== 'discard') {
    return c.json({ error: 'action must be "promote" or "discard"' }, 400);
  }
  const pending = rt.queue.get(c.req.param('id'));
  if (!pending) return c.json({ error: 'unknown job' }, 404);
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
  if (body.action === 'discard') {
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
  if (body.action === 'promote' && promotable && pending.outbox && !waitingTool) {
    const outbox = pending.outbox;
    const alreadySent = pending.outboxSent?.sentTo ?? [];
    const remaining = outbox.messages.filter((m) => !alreadySent.includes(m.to));
    if (remaining.length > 0) {
      const refusal = outboxRefusal(
        outbox,
        readConnections(CONNECTIONS_FILE),
        readSettings(SANDBOX_ROOT),
        process.env,
      );
      if (refusal) return c.json({ error: `outbox not sent — ${refusal}` }, 400);
      const run = await executeOutbox(outbox, alreadySent, { env: process.env });
      const at = Date.now();
      // The user's own declared rate, when they set one — never a guess
      // (D-081). Only sends that happened carry it.
      const usd = sendPriceUsd(outbox.channel, process.env);
      const messageOf = (to: string) => outbox.messages.find((m) => m.to === to);
      appendSends(SANDBOX_ROOT, [
        ...run.sentTo.map((to) => ({
          at,
          levelId: rt.meta.id,
          jobId: pending.id,
          channel: outbox.channel,
          to,
          ...(messageOf(to)?.name ? { name: messageOf(to)?.name } : {}),
          ...(messageOf(to)?.body ? { body: messageOf(to)?.body } : {}),
          ok: true,
          ...(usd ? { usd } : {}),
        })),
        ...run.failed.map((f) => ({
          at,
          levelId: rt.meta.id,
          jobId: pending.id,
          channel: outbox.channel,
          to: f.to,
          ok: false,
          reason: f.reason,
        })),
      ]);
      rt.queue.recordOutboxSends(pending.id, run);
      sentNow = run.sentTo.length;
      if (run.failed.length > 0) {
        const detail = run.failed.map((f) => `${f.to}: ${f.reason}`).join('; ');
        return c.json(
          {
            error: `sent ${run.sentTo.length} of ${remaining.length} — ${detail}. Approve again to retry the failures; nobody is messaged twice.`,
          },
          400,
        );
      }
    }
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
  if (body.action === 'promote' && promotable && pending.packDraft && !waitingTool) {
    // The reviewer may rename it on the way through. A pack's name is the one
    // thing about it that is not a matter of taste — it has to be unique — so
    // colliding must be something you can fix at the review rather than a dead
    // end that leaves discarding as the only move.
    const renamed = body.packSlug?.trim();
    const draft = renamed ? { ...pending.packDraft, slug: renamed } : pending.packDraft;
    if (renamed) {
      const says = slugProblem(renamed, scanPacks(ROOT).installed.map((p) => p.slug));
      if (says) return c.json({ error: `pack not installed — ${says}` }, 400);
    }
    const result = installPack(ROOT, draft);
    if ('error' in result) return c.json({ error: `pack not installed — ${result.error}` }, 400);
    if (!result.already) installedPack = draft.slug;
    // Remember the name it went in under, so the job's record matches the
    // world that now exists rather than the one it asked to be.
    if (renamed) pending.packDraft = draft;
  }
  // A compiling run's deliverable is the tool, never the clone it tried the
  // tool out in. Found the hard way: the session sensibly ran its own script
  // to check it worked, which left the output file in its clone, and promoting
  // the compile carried that stray file into the real repository. Its brief
  // says to change nothing else, so nothing else is what gets applied.
  if (body.action === 'promote' && promotable && pending.repoPath && !waitingTool) {
    const patch = patchFile(rt.queue.sandboxDir(pending.id));
    if (existsSync(patch)) {
      try {
        await applyPatch(pending.repoPath, patch);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return c.json({ error: `patch did not apply: ${detail}` }, 400);
      }
    }
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
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      // Your verb, not the ledger's. "promoted" is what the record calls it;
      // "approved" is what you did, and the feed is a list of your decisions.
      detail:
        body.action === 'promote'
          ? sentNow > 0
            ? `approved — sent ${sentNow} via ${pending.outbox?.channel}`
            : installedPack
              ? `approved — installed the ${installedPack} world`
              : 'approved'
          : 'discarded — nothing applied, the work stays in the sandbox',
      by: 'you',
    });
    return c.json({ ...job, ...(approval ? { sendApproval: approval } : {}) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
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
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 50) : 12;
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
  const needs = compileBlockers(recipe, readConnections(CONNECTIONS_FILE));
  if (needs.length > 0) {
    return c.json(
      {
        error: `that method used ${needs.join(' and ')}, and a compiled tool is plain node with no network — it could never do this job. Compiled tools take the scaffolding; work that has to reach outside stays a session.`,
      },
      400,
    );
  }

  // A recipe compiled before and retired is a second attempt, not a first.
  // Say so, and take a fresh name so the earlier one survives to be read.
  const previous = readTools(rt.dir).filter((t) => t.recipeKey === key && t.retiredReason);
  const name = freeToolName(rt.dir, toolNameFor(key));
  const prompt = promotionPrompt(
    recipe,
    previous.flatMap((t) => (t.retiredReason ? [t.retiredReason] : [])),
  );
  const job = rt.queue.add({
    title: `Compile "${recipe.key.slice(0, 40)}" into a tool`,
    prompt,
    repoPath: rt.meta.repoPath || undefined,
    preferredRole: recipe.role,
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
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
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
  return c.json(await fetchPage(url, { allow: web.allow, maxChars: web.maxChars }));
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
  return c.json(
    await callGithub(body.tool, body.args ?? {}, {
      http,
      token: process.env.GITHUB_TOKEN,
    }),
  );
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
  return c.json(
    await callSearch(body.tool, body.args ?? {}, { http, token: process.env.BRAVE_API_KEY }),
  );
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
  const updated = registry.install(roleTextWithSkill(ROLES_DIR, role.name, skill));
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

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
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
