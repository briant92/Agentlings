import type { Agentling, RoleInfo, WorkPlan } from '@agentlings/shared';
import { MatchIndex, suggestSetup } from './match';

/**
 * Work intake: one sentence in, a queued job out. The user names an outcome
 * ("add tests for the payment module"); the app derives the title, matches
 * the role, and picks who takes it. Nothing here is guesswork the user can't
 * see — the plan is shown before anything is queued.
 */

const MAX_TITLE = 52;

/** A short title from the user's own words — never a summary they didn't write. */
export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (!clean) return 'Untitled job';
  // Cut at the first clause if there is one, then at a word boundary.
  const clause = clean.split(/[,;:]| — | - /)[0].trim() || clean;
  let title = clause;
  if (title.length > MAX_TITLE) {
    const cut = title.slice(0, MAX_TITLE);
    const space = cut.lastIndexOf(' ');
    title = (space > 20 ? cut.slice(0, space) : cut).trim() + '…';
  }
  return title[0].toUpperCase() + title.slice(1);
}

/**
 * Who takes the job: an idle holder of the matched role, then any holder,
 * then whoever is idle. Returns null only when the level has no crew.
 */
export function pickAgentling(crew: Agentling[], role: string | null): Agentling | null {
  if (crew.length === 0) return null;
  const idle = (a: Agentling) => a.state === 'idle';
  const holds = (a: Agentling) => a.role === role;
  return (
    crew.find((a) => holds(a) && idle(a)) ??
    crew.find(holds) ??
    crew.find(idle) ??
    crew[0]
  );
}

export function planWork(
  index: MatchIndex,
  roles: RoleInfo[],
  crew: Agentling[],
  levelRepoPath: string | undefined,
  text: string,
): WorkPlan {
  const match = suggestSetup(index, roles, text);
  const taker = pickAgentling(crew, match.role);
  return {
    title: titleFrom(text),
    role: match.role,
    agentling: taker ? { id: taker.id, name: taker.name, role: taker.role } : null,
    noOneHasRole: !!match.role && !crew.some((a) => a.role === match.role),
    confidence: match.confidence,
    // Asked once per level: undefined means never asked, '' means declined.
    needsRepo: levelRepoPath === undefined,
    repoPath: levelRepoPath ?? '',
    gaps: match.gaps,
  };
}
