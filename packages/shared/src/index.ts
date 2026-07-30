// Domain model shared by server (authoritative) and web (rendering).

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

export interface SettingsInfo {
  executor: 'claude-agent-sdk' | 'simulated';
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'promoted'
  | 'discarded';

export interface Job {
  id: string;
  title: string;
  prompt: string;
  /** Target repository for the real executor (ignored by SimulatedExecutor). */
  repoPath?: string;
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
}

export interface SkillInfo {
  name: string;
  description: string;
}

/** GET /api/agentlings/:id — everything the profile popup shows. */
export interface AgentlingProfile {
  agentling: Agentling;
  role: RoleInfo | null;
  /** Most recent memory lessons, oldest first. */
  memory: string[];
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

export type ServerMessage =
  | { type: 'world'; state: WorldState }
  | { type: 'events'; events: JobEvent[] };

// World geometry, in logical units the client scales to its canvas.
export const WORLD_WIDTH = 1000;
export const SPAWN_X = 80;
export const EXIT_X = 940;
export const STATION_BASE_X = 240;
export const STATION_SPACING = 130;
export const MAX_STATIONS = 5;
export const TICK_MS = 100;
