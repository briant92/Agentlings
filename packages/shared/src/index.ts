// Domain model shared by server (authoritative) and web (rendering).

export * from './pack';
export * from './palette';

/** Visual palette a level is born with; the client owns the actual colors. */
export type ThemeKey = 'cave' | 'chalkboard' | 'household' | 'marble';

/** One card on the level-select screen. */
export interface LevelInfo {
  id: string;
  name: string;
  project: string;
  theme: ThemeKey;
  createdAt: number;
  crew: number;
  /** Crew sprite tints for the card's dots. */
  colors: number[];
  jobsDone: number;
  jobsRunning: number;
}

/** Where a session's credentials come from, and whether they still work. */
export interface AuthStatus {
  ok: boolean;
  source: 'api-key' | 'oauth-token' | 'stored-login' | 'none';
  /** Plain language, only when something needs fixing. */
  problem?: string;
}

export interface SettingsInfo {
  executor: 'claude-agent-sdk' | 'simulated';
  auth: AuthStatus;
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'done'
  /**
   * Ran out of turns, but left a diff worth reviewing. Its own outcome, not a
   * failure: a short-leash run trades the write-up for a much cheaper run, and
   * calling the result a failure hides work that is ready to promote.
   */
  | 'partial'
  | 'failed'
  | 'promoted'
  | 'discarded';

/**
 * What one session actually cost. Recorded per job from the first run, so
 * which workflows are expensive is a fact rather than a guess.
 */
export interface JobMeter {
  costUsd?: number;
  turns?: number;
  /**
   * The turn limit this session was given. Not the same quantity as `turns`,
   * which the SDK reports higher — a cap of 4 can come back as 6. Pricing a
   * budget needs the number we control, not the one it reports.
   */
  turnsAllowed?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  /** The model that actually ran it. */
  model?: string;
  /** True when code answered it and no session ran at all. */
  routed?: boolean;
  /** True when a recipe let it run as a single call instead of a loop. */
  oneShot?: boolean;
  /** Which recipe it was a repeat of, when `oneShot`. Reaches the ledger. */
  recipeKey?: string;
  /** True when a compiled tool did the whole job, with no model involved. */
  tooled?: boolean;
  /**
   * A tool claimed the job, could not prove its work, and a session had to do
   * it after all. The user was quoted nothing on the strength of that tool, so
   * the run is absorbed rather than billed.
   */
  toolFellBack?: boolean;
  /** The run spent money that could not be measured — see LedgerEntry. */
  costUnknown?: boolean;
  /**
   * Part of `costUsd`, spent by the close-out pass rather than by the session.
   * Kept separate so the per-turn rate prices the session alone: the write-up
   * is a fixed errand, not something the turn budget can buy more or less of.
   */
  closeOutUsd?: number;
}

/** A connection a job can opt into. Secret values never appear here. */
export interface ConnectionInfo {
  name: string;
  label: string;
  description: string;
  builtin: boolean;
  /** False when a secret it declares is missing from .env. */
  ready: boolean;
  missingSecrets: string[];
}

/**
 * A file the user attached to a job.
 *
 * It lands in `input/` inside the sandbox rather than at its root, which is
 * how the repo clone and fetched pages already work — and it matters here
 * beyond tidiness: everything that asks "did this run deliver anything"
 * looks at top-level files, so an input sitting at the root would be counted
 * as output the job never produced.
 */
export interface JobAttachment {
  name: string;
  bytes: number;
}

/** As many as one job may carry, and how large each may be. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * One file a job left in its sandbox.
 *
 * `content` is present only for text. A job that produces a document — a PDF,
 * a spreadsheet — used to be read as UTF-8 like everything else and arrived as
 * mojibake, so the file is announced here and fetched on its own instead.
 */
export interface JobOutputFile {
  name: string;
  bytes: number;
  binary: boolean;
  /** The file itself, for text only. */
  content?: string;
}

/** What a finished job actually changed, for explaining it in plain words. */
export interface JobChanges {
  files: number;
  added: number;
  removed: number;
  names: string[];
}

export interface Job {
  id: string;
  title: string;
  prompt: string;
  /** Target repository for the real executor (ignored by SimulatedExecutor). */
  repoPath?: string;
  /** Role the intake matched; the sim routes the job to that role first. */
  preferredRole?: string;
  /** Connections this job opted into by name. Absent means sandbox only. */
  tools?: string[];
  /** Set when the user asked for a proper session after a routed answer. */
  noRouter?: boolean;
  /** A turn cap this job needs in its own right, overriding the role's. */
  maxTurns?: number;
  /**
   * Answers the user gave before the run, handed to the session on top of the
   * prompt.
   *
   * Kept out of `prompt` deliberately: a recipe is keyed on the prompt, so
   * folding these in would give a clarified job a different key from the same
   * job asked plainly, and the crew would stop recognising work it has already
   * done.
   */
  clarifications?: string[];
  /** Files the user attached, waiting in `input/` inside the sandbox. */
  attachments?: JobAttachment[];
  /**
   * This job compiles a recipe into a tool. Recorded rather than acted on: a
   * compile is its own kind of work — it writes two programs that must agree —
   * and a ledger cannot be reconstructed after the fact, so the shape is kept
   * from now on even though the quote still prices compiles with ordinary
   * sessions. Measured 2026-07-31, the difference is 8% over four runs, which
   * is too little and too few to price on yet.
   */
  compile?: boolean;
  /** The ceiling quoted before the work; enforced, and never billed above. */
  quotedUsd?: number;
  /** Filled in when the job completes and left a patch behind. */
  changes?: JobChanges;
  /** What the session cost — recorded whether it succeeded or failed. */
  meter?: JobMeter;
  status: JobStatus;
  /** Station slot in the world; -1 while waiting for a free station or after finishing. */
  slot: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Agentling id once picked up. */
  assignedTo?: string;
  /** One-line result summary once done. */
  summary?: string;
  error?: string;
}

export type AgentlingState = 'idle' | 'walking' | 'working' | 'delivering';

export interface Agentling {
  id: string;
  name: string;
  /** Sprite tint, 0xRRGGBB. */
  color: number;
  state: AgentlingState;
  x: number;
  targetX: number;
  jobId?: string;
  /** Role name from roles/*.md; persisted across restarts in the roster. */
  role: string;
  /** What the user said this agentling was hired to do, in their own words. */
  jobDescription?: string;
  jobsDone: number;
  jobsFailed: number;
}

/** Parsed role definition (Claude subagent frontmatter format, roles/*.md). */
export interface RoleInfo {
  name: string;
  description: string;
  tools: string[];
  skills: string[];
  model?: string;
  /** Turn budget for this role's sessions; clamped by the executor. */
  maxTurns?: number;
}

export interface SkillInfo {
  name: string;
  description: string;
}

/** One role or ability found in a source repo, pinned to the commit it was read at. */
export interface CatalogEntry {
  id: string;
  kind: 'role' | 'skill';
  name: string;
  description: string;
  repo: string;
  path: string;
  sha: string;
  source: string;
  trust: string;
  /** The source repo's licence — installing copies the file into your project. */
  license?: string;
}

export interface SourceStatus {
  name: string;
  label: string;
  repo: string;
  kind: 'role' | 'skill';
  trust: string;
  license?: string;
  sha?: string;
  count: number;
  ok: boolean;
  error?: string;
  /** Entries beyond the per-source cap, so nothing is dropped silently. */
  truncated?: number;
}

export interface LibraryStatus {
  fetchedAt: number;
  stale: boolean;
  sources: SourceStatus[];
  total: number;
}

/** A search hit, with whether it is already installed and from which commit. */
export interface LibraryHit {
  entry: CatalogEntry;
  state: 'new' | 'installed' | 'outdated';
}

export interface LibrarySearchResult {
  hits: LibraryHit[];
  /** Words no source covers either — worth saying rather than showing nothing. */
  gaps: string[];
}

/**
 * Tier 2's answer: the same sentence checked by one short Claude call. Always
 * optional — the local matcher answers without it.
 */
export interface Refinement {
  role: string | null;
  skills: string[];
  /** One plain-language line about what this agentling would be for. */
  summary?: string;
  confidence: number;
}

/** What the concept matcher proposes for a sentence the user typed. */
export interface MatchSuggestion {
  /** Best-matching role, or null when nothing was confident enough. */
  role: string | null;
  roleDescription: string;
  skills: string[];
  /** 0–1; below MIN_CONFIDENCE the UI asks instead of asserting. */
  confidence: number;
  /** The user's own words that drove the match — shown as the reason. */
  matchedTerms: string[];
  /** Words nothing in the library covers; later these drive library search. */
  gaps: string[];
  alternatives: { name: string; description: string }[];
}

/** One crew member as the Crew panel sees them — resting ones included. */
export interface CrewMember {
  id: string;
  name: string;
  color: number;
  role: string;
  jobDescription?: string;
  jobsDone: number;
  jobsFailed: number;
  hiredAt: number;
  /** Last time they finished a job, for spotting who has gone quiet. */
  lastWorkedAt?: number;
  resting: boolean;
  /** Mid-job: crew actions are blocked until they finish. */
  busy: boolean;
  lessons: number;
}

/** A pair the app thinks are doing the same job, with why it thinks so. */
export interface MergeProposal {
  /** Agentling id kept by default — the stronger record. */
  keep: string;
  /** Agentling id folded in and taken off the roster. */
  absorb: string;
  score: number;
  reasons: string[];
}

/** Exactly what a merge would leave behind, shown before it happens. */
export interface MergePreview {
  keep: CrewMember;
  absorb: CrewMember;
  /** Combined figures the survivor ends up with. */
  jobsDone: number;
  jobsFailed: number;
  lessons: number;
  /** True when the two hold different roles, so one job is being dropped. */
  differentRoles: boolean;
}

/** GET /api/agentlings/:id — everything the profile popup shows. */
export interface AgentlingProfile {
  agentling: Agentling;
  role: RoleInfo | null;
  /** Most recent memory lessons, oldest first. */
  memory: string[];
}

/** What a job will cost, quoted before it runs. The ceiling is enforced. */
export interface Quote {
  tier: 'routed' | 'tool' | 'oneshot' | 'session';
  /** The most it can be charged; the session is stopped at this. */
  ceilingUsd: number;
  /** What it has typically cost, when there is history. */
  expectedUsd?: number;
  /** How many times this exact kind of job has been done. */
  samples: number;
  certainty: 'certain' | 'high' | 'estimated';
  /** Plain-language line: money, with the confidence stated. */
  wording: string;
}

/** Spend for a level or the whole app. Cost is ours; price is chargeable. */
export interface SpendTotals {
  jobs: number;
  costUsd: number;
  priceUsd: number;
  /** Cost of failed work, absorbed rather than charged. */
  absorbedUsd: number;
  /** Jobs answered without a session at all. */
  free: number;
}

/**
 * One thing worth settling before a job runs.
 *
 * Answering is always optional. These narrow the work so the run explores
 * less; a question that blocked the intake would cost more than the turn it
 * saved.
 */
export interface ClarifyQuestion {
  /** Stable across recomputation, since the rules are deterministic. */
  id: string;
  ask: string;
  /** Why it is being asked, when that is not obvious. */
  hint?: string;
  /** Suggested answers; `answer` is what the session is actually told. */
  options: { label: string; answer: string }[];
  /** The user may type something instead of picking. */
  freeText?: boolean;
}

/** Preview of what the app will do with a sentence, before it queues anything. */
export interface WorkPlan {
  /** Short title derived from the sentence. */
  title: string;
  /** Role the matcher chose, or null when it isn't sure. */
  role: string | null;
  /** Who will pick it up, once the sim gets to it. */
  agentling: { id: string; name: string; role: string } | null;
  /** True when nobody in this level's crew holds the matched role. */
  noOneHasRole: boolean;
  confidence: number;
  /** True when this level has never been asked for a project folder. */
  needsRepo: boolean;
  /** The level's project folder; '' means asked and declined. */
  repoPath: string;
  /** What this will cost, before it runs. */
  quote: Quote;
  gaps: string[];
  /** Worth settling before it runs; always optional to answer. */
  questions: ClarifyQuestion[];
}

export interface WorldState {
  tick: number;
  agentlings: Agentling[];
  jobs: Job[];
}

export type JobEventType = 'queued' | 'started' | 'progress' | 'done' | 'failed' | 'resolved';

/** One line in the reporting terminal. Movement stays visual-only in the world. */
export interface JobEvent {
  /** Monotonic per server run; clients dedupe replays by id. */
  id: number;
  at: number;
  type: JobEventType;
  jobId: string;
  title: string;
  /** Agentling name for started/progress/done/failed. */
  agentling?: string;
  /** Progress text, result summary, failure reason, or resolve action. */
  detail?: string;
}

/**
 * One tick on the wire.
 *
 * Agentlings move every tick; the job list changes a few times an hour, and
 * re-sending it ten times a second to say so was 98% of the traffic — 42KB a
 * frame at 54 jobs. So `jobs` rides along only when the queue's revision has
 * moved, and a client keeps the last list it was given. The first frame a
 * socket receives always carries one, so there is nothing to miss.
 */
export interface WorldFrame {
  tick: number;
  agentlings: Agentling[];
  /** Present only when the queue changed since this client was last told. */
  jobs?: Job[];
}

export type ServerMessage =
  | { type: 'world'; state: WorldFrame }
  | { type: 'events'; events: JobEvent[] };

// World geometry, in logical units the client scales to its canvas.
export const WORLD_WIDTH = 1000;
export const SPAWN_X = 80;
export const EXIT_X = 940;
export const STATION_BASE_X = 240;
export const STATION_SPACING = 130;
export const MAX_STATIONS = 5;
export const TICK_MS = 100;
/**
 * Close code for "that level does not exist". A socket closed with it must not
 * be retried — the client used to reconnect every second forever, sitting on
 * "connecting…" for a level that was never coming back. Shared so the two ends
 * cannot drift: a server that closes with one number and a client that watches
 * for another is the same hang with more steps.
 */
export const SOCKET_LEVEL_GONE = 4004;
/** Localhost API port; the spawned runner calls back here for web fetches. */
export const SERVER_PORT = 4600;
