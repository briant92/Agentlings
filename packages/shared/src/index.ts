// Domain model shared by server (authoritative) and web (rendering).

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
