import { serve } from '@hono/node-server';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  AgentlingProfile,
  CrewMember,
  Job,
  LevelInfo,
  MergePreview,
  Quote,
  ServerMessage,
  SettingsInfo,
} from '@agentlings/shared';
import { TICK_MS } from '@agentlings/shared';
import { describeAuth, readStoredLogin, shouldRunRealSessions } from './auth';
import { describe, readConnections } from './connections';
import { activeCrew, crewMembers, syncRoster } from './crew';
import { quoteFor } from './estimate';
import { EventLog } from './events';
import { ClaudeAgentExecutor } from './executors/claude';
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
  priceFor,
  readLedger,
  totals,
  totalsBy,
  type Tier,
} from './ledger';
import { MatchIndex, searchEntries, suggestSetup } from './match';
import { absorptionNote, mergeLessons, proposeMerges } from './merge';
import { MemoryStore } from './memory';
import { JobQueue } from './queue';
import { refineMatch } from './refine';
import { installSkill, listSkills, RoleRegistry, toRawUrl, writeSkillFile } from './roles';
import { Sim } from './sim';
import { TOOL_CANDIDATE_RUNS, readRecipes, readToolCandidates } from './recipes';
import {
  RUN_SCRIPT,
  VERIFY_SCRIPT,
  installTool,
  isComplete,
  promotionPrompt,
  readTools,
  toolNameFor,
  usableTools,
  writeTool,
} from './tools';
import { decide } from './router';
import { fetchPage } from './web';
import { planWork, runnerRole } from './work';

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
    useClaude
      ? new ClaudeAgentExecutor(
          registry,
          memory,
          SKILLS_DIR,
          () => readKnowledge(dir),
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
      const costUsd = job.meter?.costUsd ?? 0;
      appendLedger(SANDBOX_ROOT, {
        at: Date.now(),
        jobId: job.id,
        levelId: meta.id,
        // The role that did the work, not the one the matcher asked for. A job
        // routed to a role nobody holds is picked up by whoever is free, and
        // the session runs as *their* role — filing it under the absent
        // specialist would build a history for work that never happened, and
        // rob the role that really did it of its own.
        jobClass: agentling.role,
        tier: job.meter?.tooled
          ? 'tool'
          : job.meter?.routed
            ? 'routed'
            : job.meter?.oneShot
              ? 'oneshot'
              : 'session',
        outcome,
        costUsd,
        priceUsd: priceFor(outcome, costUsd, job.quotedUsd),
        ...(job.quotedUsd ? { quotedUsd: job.quotedUsd } : {}),
        ...(job.meter?.turns !== undefined ? { turns: job.meter.turns } : {}),
        ...(job.meter?.turnsAllowed !== undefined
          ? { turnsAllowed: job.meter.turnsAllowed }
          : {}),
        hasRepo: Boolean(job.repoPath),
        ...(job.meter?.costUnknown ? { costUnknown: true } : {}),
        ...(job.meter?.model ? { model: job.meter.model } : {}),
      });
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

app.get('/api/settings', (c) =>
  c.json({
    executor: useClaude ? 'claude-agent-sdk' : 'simulated',
    auth,
  } satisfies SettingsInfo),
);

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
  const job = rt.queue.add({
    title: body.title.trim(),
    prompt: body.prompt.trim(),
    repoPath: body.repoPath?.trim() || undefined,
  });
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
  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  return c.json({ ...plan, quote: quoteFor_(rt, text, body.tools, runnerRole(plan)) });
});

/**
 * One sentence in, a queued job out. The project folder is asked for once per
 * level and remembered; '' records that the user declined.
 */
app.post('/api/levels/:lid/work', async (c) => {
  const rt = getLevel(c.req.param('lid'));
  if (!rt) return c.json({ error: 'unknown level' }, 404);
  const body = await c.req.json<{ text?: string; repoPath?: string; tools?: string[] }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);

  if (body.repoPath !== undefined) {
    const repoPath = body.repoPath.trim();
    if (repoPath && !existsSync(repoPath)) {
      return c.json({ error: `no folder at "${repoPath}"` }, 400);
    }
    rt.meta = { ...rt.meta, repoPath };
    writeMeta(rt.dir, rt.meta);
  }

  const plan = planWork(matcher(), registry.list(), rt.sim.agentlings, rt.meta.repoPath, text);
  const quote = quoteFor_(rt, text, body.tools, runnerRole(plan));
  const job = rt.queue.add({
    title: plan.title,
    prompt: text,
    repoPath: rt.meta.repoPath || undefined,
    preferredRole: plan.role ?? undefined,
    tools: body.tools,
    // The quote binds the session by deciding how many turns it may take —
    // the only budget that can be enforced before the money is spent.
    quotedUsd: quote.ceilingUsd || undefined,
  });
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
  const dir = rt.queue.sandboxDir(job.id);
  if (!existsSync(dir)) return c.json({ files: [] });
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      content: readFileSync(path.join(dir, entry.name), 'utf8'),
    }));
  return c.json({ files });
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
  if (body.action === 'promote' && promotable && pending.repoPath) {
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
  // A compiled tool is executable instruction, so it installs on the same
  // approval as any other output rather than the moment it is written.
  if (body.action === 'promote' && promotable) {
    const waiting = readTools(rt.dir).find((t) => t.pendingJobId === pending.id);
    if (waiting && !installTool(rt.dir, waiting, rt.queue.sandboxDir(pending.id))) {
      return c.json(
        { error: `the compiling run did not leave both ${RUN_SCRIPT} and ${VERIFY_SCRIPT}` },
        400,
      );
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
 * What a request would cost, worked out by asking the router what it would do
 * with it and looking up what that kind of work has cost before.
 */
function quoteFor_(rt: LevelRuntime, text: string, tools: string[] | undefined, role: string | null): Quote {
  const probe: Job = {
    id: '',
    title: '',
    prompt: text,
    status: 'queued',
    slot: -1,
    createdAt: 0,
    ...(rt.meta.repoPath ? { repoPath: rt.meta.repoPath } : {}),
    ...(tools?.length ? { tools } : {}),
  };
  const decision = decide(probe, {
    knowledge: readKnowledge(rt.dir),
    recipes: readRecipes(rt.dir),
    tools: usableTools(rt.dir),
    canFetch: tools?.includes('web') === true,
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
  return quoteFor(tier, jobClass, readLedger(SANDBOX_ROOT), {
    maxCeilingUsd: Number(process.env.AGENTLINGS_MAX_COST_USD) || undefined,
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
  if (readTools(rt.dir).some((t) => t.recipeKey === key && !t.retiredReason)) {
    return c.json({ error: 'a tool for that recipe already exists' }, 400);
  }

  const name = toolNameFor(key);
  const job = rt.queue.add({
    title: `Compile "${recipe.key.slice(0, 40)}" into a tool`,
    prompt: promotionPrompt(recipe),
    repoPath: rt.meta.repoPath || undefined,
    preferredRole: recipe.role,
    // The compiler must not be handed its own half-written tool as a shortcut.
    noRouter: true,
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
  return c.json({ tool: name, job }, 201);
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

app.get('/api/connections', (c) => c.json(describe(readConnections(CONNECTIONS_FILE), process.env)));

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

wss.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const levelId = url.searchParams.get('level') ?? '';
  const rt = levels.get(levelId);
  if (!rt) {
    socket.close(4004, 'unknown level');
    return;
  }
  subscriptions.set(socket, levelId);
  socket.on('close', () => subscriptions.delete(socket));
  socket.send(JSON.stringify({ type: 'world', state: rt.sim.state() } satisfies ServerMessage));
  socket.send(
    JSON.stringify({ type: 'events', events: rt.eventLog.history() } satisfies ServerMessage),
  );
});

setInterval(() => {
  for (const rt of levels.values()) {
    rt.sim.step();
    sendToLevel(rt.meta.id, { type: 'world', state: rt.sim.state() });
  }
}, TICK_MS);
