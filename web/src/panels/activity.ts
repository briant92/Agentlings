import type { Agentling, Job, JobEvent, WorldState } from '@agentlings/shared';

/**
 * What each agentling is doing, in plain words.
 *
 * Every line here is read off state the app already holds — the sim's own
 * state, the job's title, and the last progress line the executor emitted.
 * Nothing is invented: an agentling that is waiting for something the app has
 * no notion of would need that notion built first, and a made-up status is
 * worse than a vague one because it cannot be acted on.
 */

export interface Activity {
  /** One word for the state, coloured in the rail. */
  state: string;
  /** The job in hand, when there is one. */
  title?: string;
  /** The freshest thing known about what they are actually doing. */
  detail: string;
}

/** The latest progress line per job, which is all the rail ever shows. */
export function latestProgress(events: readonly JobEvent[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const event of events) {
    if (event.type === 'progress' && event.detail) latest.set(event.jobId, event.detail);
  }
  return latest;
}

/**
 * `walking` covers both legs of a job — out to the station and back to the
 * door with the result — and the sim distinguishes them by state, so the rail
 * can too rather than saying "walking" twice for opposite things.
 */
export function activityFor(
  agentling: Agentling,
  jobs: readonly Job[],
  progress: ReadonlyMap<string, string>,
): Activity {
  const job = agentling.jobId ? jobs.find((j) => j.id === agentling.jobId) : undefined;
  const title = job?.title;
  const detail = job ? progress.get(job.id) : undefined;

  switch (agentling.state) {
    case 'working':
      return {
        state: 'working',
        ...(title ? { title } : {}),
        detail: detail ?? 'getting started',
      };
    case 'walking':
      return { state: 'walking', ...(title ? { title } : {}), detail: 'heading to the job' };
    case 'delivering':
      return {
        state: 'delivering',
        ...(title ? { title } : {}),
        detail: detail ?? 'taking the result to the door',
      };
    default:
      return { state: 'idle', detail: 'on patrol, waiting for work' };
  }
}

/** The whole rail in one call, in the order the world holds them. */
export function crewActivity(
  world: WorldState | null,
  events: readonly JobEvent[],
): { agentling: Agentling; activity: Activity }[] {
  if (!world) return [];
  const progress = latestProgress(events);
  return world.agentlings.map((agentling) => ({
    agentling,
    activity: activityFor(agentling, world.jobs, progress),
  }));
}
