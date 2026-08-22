import type { CrewMember, RoleInfo, SkillInfo } from '@agentlings/shared';

/**
 * The Library's rows, as facts (UI.md, step 5): who on this level holds each
 * job, what leash a job runs on, and how many jobs list each ability. A role
 * nobody holds does nothing, and an ability no job lists reaches no run
 * (AGENTLING.md) — both were invisible in a list that only described them.
 */

/** Who holds each role on the level, by name — resting members included. */
export function heldBy(crew: readonly CrewMember[]): Map<string, string[]> {
  const held = new Map<string, string[]>();
  for (const member of crew) {
    held.set(member.role, [...(held.get(member.role) ?? []), member.name]);
  }
  return held;
}

/** The header's summary: "7 held on Home Chores · 3 held by nobody". */
export function heldSummary(
  roles: readonly Pick<RoleInfo, 'name'>[],
  held: ReadonlyMap<string, string[]>,
  levelName: string,
): string {
  const count = roles.filter((r) => (held.get(r.name)?.length ?? 0) > 0).length;
  const nobody = roles.length - count;
  return `${count} held on ${levelName}${nobody > 0 ? ` · ${nobody} held by nobody` : ''}`;
}

/** The leash a role's sessions run on, off the role file: turns · minutes · cost cap · model. */
export function leash(role: Pick<RoleInfo, 'maxTurns' | 'timeoutMinutes' | 'maxCostUsd' | 'model'>): string {
  const parts: string[] = [];
  if (role.maxTurns !== undefined) parts.push(`${role.maxTurns} turns`);
  if (role.timeoutMinutes !== undefined) parts.push(`${role.timeoutMinutes} min`);
  if (role.maxCostUsd !== undefined) parts.push(`up to $${role.maxCostUsd}`);
  if (role.model) parts.push(shortModel(role.model));
  return parts.join(' · ');
}

/** "claude-haiku-4-5-20251001" reads as "haiku" on a row. */
export function shortModel(model: string): string {
  const match = /haiku|sonnet|opus|fable|mythos/.exec(model);
  return match ? match[0] : model;
}

/** How many jobs list each ability, most used first; zero is a fact worth the row. */
export function abilityUse(
  roles: readonly Pick<RoleInfo, 'skills'>[],
  skills: readonly Pick<SkillInfo, 'name'>[],
): { name: string; jobs: number }[] {
  return skills
    .map((s) => ({ name: s.name, jobs: roles.filter((r) => r.skills.includes(s.name)).length }))
    .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
}

/** The abilities header's summary: the most used, and the ones no job lists. */
export function abilitySummary(use: readonly { name: string; jobs: number }[]): string {
  if (use.length === 0) return '';
  const top = use[0];
  const none = use.filter((u) => u.jobs === 0).map((u) => u.name);
  const lead = `${top.name} on ${top.jobs} ${top.jobs === 1 ? 'job' : 'jobs'}`;
  return none.length > 0 ? `${lead} · ${none.join(', ')} on none` : lead;
}
