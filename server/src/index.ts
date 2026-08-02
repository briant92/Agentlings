import { serve } from '@hono/node-server';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Agentling,
  AgentlingProfile,
  CrewMember,
  Job,
  LevelInfo,
  MergePreview,
  Quote,
  ServerMessage,
  ConnectionInfo,
  SettingsInfo,
} from '@agentlings/shared';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  SOCKET_LEVEL_GONE,
  TICK_MS,
} from '@agentlings/shared';
import { describeAuth, readStoredLogin, shouldRunRealSessions } from './auth';
import { capabilityTokens, connectionsIn } from './capability';
import { describe, readConnections } from './connections';
import {
  enabledNames,
  grantedTools,
  readSettings,
  setConnection,
  writeSettings,
} from './settings';
import { clarificationLines, questionsFor } from './clarify';
import { activeCrew, crewMembers, syncRoster } from './crew';
import { quoteFor } from './estimate';
import { EventLog } from './events';
import { ClaudeAgentExecutor, COMPILE_TURNS, RECIPE_TURNS, turnsFor, mapTools } from './executors/claude';
import type { Executor } from './executors/executor';
import { RoutedExecutor } from './executors/routed';
import { SimulatedExecutor } from './executors/simulated';
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
  rateFor,
  readLedger,
  totals,
  totalsBy,
  type Tier,
} from './ledger';
import { MatchIndex, searchEntries, suggestSetup } from './match';
import { absorptionNote, mergeLessons, proposeMerges } from './merge';
import { MemoryStore } from './memory';
import { contentTypeFor, listOutputs, opensInBrowser, safeOutputPath } from './outputs';
import { JobQueue } from './queue';
import { refineMatch } from './refine';
import { installSkill, listSkills, RoleRegistry, toRawUrl, writeSkillFile } from './roles';
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
  usableTools,
  writeTool,
} from './tools';
import { decide } from './router';
import { callGithub } from './github';
import { fetchPage } from './web';
import { planWork, queuedJobSpec, runnerRole } from './work';

const PORT = 4600;
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // repo root
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');
const ROLES_DIR = path.join(ROOT, 'roles');
const SKILLS_DIR = path.join(ROOT, 'skills');
const SOURCES_FILE = path.join(ROOT, 'catalog', 'sources.json');
const CONNECTIONS_FILE = path.join(ROOT, 'catalog', 'connections.json');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
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
        )
      : simulated,
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
      const line = lesson
        ? `${date} · ${lesson}`
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

migrateLegacy(SANDBOX_ROOT);
for (const dir of listLevelDirs(SANDBOX_ROOT)) makeLevel(dir);
if (levels.size === 0) {
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

/** The registry as the UI sees it, qualified by what the user has switched. */
function connectionList(): ConnectionInfo[] {
  const connections = readConnections(CONNECTIONS_FILE);
  const settings = readSettings(SANDBOX_ROOT);
  return describe(
    connections,
    process.env,
    new Set(enabledNames(connections, settings, process.env)),
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

app.get('/api/levels', (c) =>
  c.json(
    [...levels.values()]
      .sort((a, b) => a.meta.createdAt - b.meta.createdAt)
      .map((rt) => levelInfo(rt)),
  ),
);

app.post('/api/levels', async (c) => {
  const body = await c.req.json<{ name?: string; project?: string; theme?: string }>();
  const theme = THEME_KEYS.find((t) => t === body.theme);
  if (!body.name?.trim() || !theme) {
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
      quote: quoteFor_(rt, prompt, tools, runnerRole(plan), repoPath),
    }),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
});

/** What the app would do with a sentence — shown before anything is queued. */
app.post('/api/levels/:lid/work/plan', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ text?: string; tools?: string[] }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);
  const draft = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  // The quote decides whether asking is worth it at all, and the quote needs
  // the role the draft settles — so the questions are filled in last.
  const quote = quoteFor_(
    rt,
    text,
    granted(body.tools),
    runnerRole(draft),
    rt.meta.repoPath || undefined,
  );
  return c.json({
    ...draft,
    quote,
    questions: questionsFor(text, { hasRepo: !!rt.meta.repoPath, tier: quote.tier }),
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

app.post('/api/levels/:lid/work', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{
    text?: string;
    repoPath?: string;
    tools?: string[];
    answers?: Record<string, string>;
    files?: { name?: string; data?: string }[];
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

  // The title is derived here and the repository is the level's; everything
  // else about how a job is specced — the ceiling that binds it, the role that
  // will run it — is shared with the other way in, so the two cannot drift.
  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  const tools = granted(body.tools);
  const quote = quoteFor_(rt, text, tools, runnerRole(plan), rt.meta.repoPath || undefined);
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
        { hasRepo: !!rt.meta.repoPath, tier: quote.tier },
        body.answers,
      ),
      attachments,
    }),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
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
  const job = rt.queue.add({
    title: previous.title,
    prompt: previous.prompt,
    repoPath: previous.repoPath,
    preferredRole: previous.preferredRole,
    tools: previous.tools,
    noRouter: true,
  });
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
      quote: quoteFor_(rt, prompt, tools, previous.preferredRole ?? runnerRole(plan), previous.repoPath),
      continues: previous.id,
    }),
  );
  rt.eventLog.emit({ type: 'queued', jobId: job.id, title: job.title });
  return c.json(job, 201);
});

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
  return c.json({ files: listOutputs(rt.queue.sandboxDir(job.id)) });
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

app.post('/api/levels/:lid/jobs/:id/resolve', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ action?: string }>();
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
    rt.eventLog.emit({
      type: 'resolved',
      jobId: job.id,
      title: job.title,
      detail: body.action === 'promote' ? 'promoted' : 'discarded',
    });
    return c.json(job);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
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
    memory: rt.memory.lessons(agentling.name),
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

function quoteFor_(
  rt: LevelRuntime,
  text: string,
  tools: string[] | undefined,
  role: string | null,
  repoPath: string | undefined,
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
  const decision = decide(probe, {
    knowledge: readKnowledge(rt.dir),
    // The quote has to see the same corpus the run will, or it prices a
    // session for work the store is about to answer for nothing.
    store: storeLines(rt.dir, Date.now()),
    recipes: readRecipes(rt.dir),
    tools: usableTools(rt.dir),
    canFetch: tools?.includes('web') === true,
    // The same surface the run will have. Without it the quote demotes every
    // recipe the executor would honour, and prices a session for a one-shot.
    capabilities: surfaceFor(probe, role),
  });
  const tier: Tier =
    decision.kind === 'answer' || decision.kind === 'fetch'
      ? 'routed'
      : decision.kind === 'tool'
        ? 'tool'
        : decision.kind === 'oneshot'
          ? 'oneshot'
          : 'session';
  const jobClass = decision.kind === 'oneshot' ? decision.recipeKey : (role ?? 'unclassified');
  const ledger = readLedger(SANDBOX_ROOT);
  // What this run is about to be allowed to spend, worked out exactly as the
  // executor will: the leash it will be given, priced at what a turn of this
  // role's work in this shape and on this tier has really cost. The quote may
  // not come in under that, or it would be quoting for turns it has already
  // decided to grant.
  const leash = decision.kind === 'oneshot' ? RECIPE_TURNS : turnsFor(role ? registry.get(role) : undefined);
  const rate = rateFor(
    ledger,
    role ?? '',
    decision.kind === 'oneshot' ? 'oneshot' : 'session',
    Boolean(repoPath),
  );
  return quoteFor(tier, jobClass, ledger, {
    maxCeilingUsd: Number(process.env.AGENTLINGS_MAX_COST_USD) || undefined,
    ...(rate.samples > 0 ? { floorUsd: leash * rate.usd } : {}),
  });
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
app.get('/api/levels/:lid/knowledge', (c) => {
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
  const index = sync(paths, Date.now());
  writeIndex(rt.dir, index);
  return c.json({ sources: paths, missing, entries: index.entries.length, skipped: index.skipped });
});

/** Re-read the folders. The crew reads the index, so nothing changes until this runs. */
app.post('/api/levels/:lid/knowledge/sync', (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const sources = rt.meta.knowledgeSources ?? [];
  if (sources.length === 0) return c.json({ error: 'no folders to index' }, 400);
  const index = sync(sources, Date.now());
  writeIndex(rt.dir, index);
  return c.json({ entries: index.entries.length, skipped: index.skipped, syncedAt: index.syncedAt });
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
  const ambient = readConnections(CONNECTIONS_FILE)
    .filter((conn) => conn.defaultOn === true)
    .map((conn) => conn.name);
  const needs = connectionsIn(recipe.capabilities, ambient);
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
  writeTool(rt.dir, {
    name,
    recipeKey: key,
    terms: recipe.terms,
    hasRepo: Boolean(rt.meta.repoPath),
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

app.get('/api/roles', (c) => c.json(registry.list()));

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
