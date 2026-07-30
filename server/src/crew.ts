import type { Agentling, CrewMember } from '@agentlings/shared';
import type { CrewSeed } from './levels';

/**
 * The roster is the record; the sim only ever holds the crew who are awake.
 * These two functions are the seam between them — kept pure so the rules
 * about what survives a restart, a rest, or a departure are testable.
 */

/** Live career figures written back over the stored roster. */
export function syncRoster(roster: CrewSeed[], live: Agentling[]): CrewSeed[] {
  const byId = new Map(live.map((a) => [a.id, a]));
  return roster.map((seed) => {
    const a = byId.get(seed.id);
    if (!a) return seed; // resting: nothing in the sim to learn from
    return {
      ...seed,
      role: a.role,
      jobDescription: a.jobDescription,
      jobsDone: a.jobsDone,
      jobsFailed: a.jobsFailed,
    };
  });
}

/** What the Crew panel shows: everyone, awake or not, with their record. */
export function crewMembers(
  roster: CrewSeed[],
  live: Agentling[],
  lessonCount: (name: string) => number,
): CrewMember[] {
  const byId = new Map(live.map((a) => [a.id, a]));
  return roster.map((seed) => {
    const a = byId.get(seed.id);
    return {
      id: seed.id,
      name: seed.name,
      color: seed.color,
      role: a?.role ?? seed.role,
      jobDescription: a?.jobDescription ?? seed.jobDescription,
      jobsDone: a?.jobsDone ?? seed.jobsDone ?? 0,
      jobsFailed: a?.jobsFailed ?? seed.jobsFailed ?? 0,
      hiredAt: seed.hiredAt ?? 0,
      lastWorkedAt: seed.lastWorkedAt,
      resting: seed.resting === true,
      busy: a?.state === 'working',
      lessons: lessonCount(seed.name),
    };
  });
}

/** Awake crew, in roster order — what the sim is built from. */
export function activeCrew(roster: CrewSeed[]): CrewSeed[] {
  return roster.filter((seed) => seed.resting !== true);
}
