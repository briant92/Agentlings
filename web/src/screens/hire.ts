/**
 * A hire that starts from a position (D-229): Meet the crew names the trade
 * and the human job, the level picker chooses where, and the level's Hire
 * modal opens with both already filled. Carried across the three screens as
 * one value so each can read it and none has to rebuild it.
 */
export interface HireFor {
  /** The trade to hire. */
  role: string;
  /** The job description the new agentling starts with — the position's title. */
  text: string;
}

/** The line over the level picker while a hire is pending. */
export function hireBanner(hire: HireFor | null): string | null {
  if (!hire) return null;
  const a = /^[aeiou]/i.test(hire.role) ? 'an' : 'a';
  return `Hiring ${a} ${hire.role} as ${hire.text} — pick the level it joins`;
}
