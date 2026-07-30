import type { CrewMember, MergeProposal } from '@agentlings/shared';

/**
 * Merging two agentlings who do the same work. Detection proposes, it never
 * acts: two scribes can be doing genuinely different things, so every
 * proposal carries the reasons it was made and the user decides.
 *
 * Same role is a requirement rather than a signal — the role is the tools and
 * abilities, so different roles are different capabilities, not an overlap.
 */

/** Below this, the pair is not worth putting in front of anyone. */
export const OVERLAP_THRESHOLD = 0.6;

const STOPWORDS = new Set(
  `a an and the to of for in on at is are be my me i it that this with do does
   what when all any so we us you your from into over about keep make take`
    .split(/\s+/)
    .filter(Boolean),
);

function words(text: string | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function shared(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((w) => b.has(w));
}

/**
 * How much two crew members look like the same hire, and why. Score is 0 for
 * anyone who couldn't be merged sensibly.
 */
export function overlap(a: CrewMember, b: CrewMember): { score: number; reasons: string[] } {
  if (a.id === b.id || a.role !== b.role) return { score: 0, reasons: [] };

  const reasons = [`both are ${a.role}s`];
  const wa = words(a.jobDescription);
  const wb = words(b.jobDescription);

  // Neither was told what they were for: nothing distinguishes them at all.
  if (wa.size === 0 && wb.size === 0) {
    reasons.push('neither has been given a job description');
    return { score: 0.65, reasons };
  }

  // One of them has no description, so there is nothing to contradict.
  if (wa.size === 0 || wb.size === 0) {
    reasons.push('one of them has no job description');
    return { score: 0.5, reasons };
  }

  const both = shared(wa, wb);
  const union = new Set([...wa, ...wb]).size;
  const jaccard = union === 0 ? 0 : both.length / union;
  if (both.length > 0) reasons.push(`both hired to: ${both.slice(0, 5).join(' · ')}`);
  else reasons.push('their job descriptions have nothing in common');

  return { score: Math.round((0.4 + 0.6 * jaccard) * 100) / 100, reasons };
}

/** Who survives by default: the stronger record, then the longer memory. */
export function preferKeeper(a: CrewMember, b: CrewMember): [CrewMember, CrewMember] {
  if (a.jobsDone !== b.jobsDone) return a.jobsDone > b.jobsDone ? [a, b] : [b, a];
  if (a.lessons !== b.lessons) return a.lessons > b.lessons ? [a, b] : [b, a];
  return a.hiredAt <= b.hiredAt ? [a, b] : [b, a];
}

/**
 * The overlaps worth showing. Each agentling appears in at most one proposal
 * per round — offering "merge A into B" and "merge A into C" at once is a
 * puzzle, not a suggestion.
 */
export function proposeMerges(crew: CrewMember[]): MergeProposal[] {
  const pairs: MergeProposal[] = [];
  for (let i = 0; i < crew.length; i++) {
    for (let j = i + 1; j < crew.length; j++) {
      if (crew[i].busy || crew[j].busy) continue;
      const { score, reasons } = overlap(crew[i], crew[j]);
      if (score < OVERLAP_THRESHOLD) continue;
      const [keep, absorb] = preferKeeper(crew[i], crew[j]);
      pairs.push({ keep: keep.id, absorb: absorb.id, score, reasons });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const spoken = new Set<string>();
  return pairs.filter((p) => {
    if (spoken.has(p.keep) || spoken.has(p.absorb)) return false;
    spoken.add(p.keep);
    spoken.add(p.absorb);
    return true;
  });
}

const DATE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Two memories into one: oldest first, duplicates dropped. Undated lines keep
 * their order and stay ahead of dated ones rather than being invented a date.
 */
export function mergeLessons(keep: string[], absorb: string[]): string[] {
  const all = [...keep, ...absorb];
  const seen = new Set<string>();
  const unique = all.filter((line) => {
    const key = line.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique
    .map((line, i) => ({ line, date: DATE.exec(line)?.[1] ?? '', i }))
    .sort((x, y) => (x.date === y.date ? x.i - y.i : x.date < y.date ? -1 : 1))
    .map((entry) => entry.line);
}

/** The line that records where the absorbed agentling's history came from. */
export function absorptionNote(absorbed: CrewMember, at = new Date()): string[] {
  const date = at.toISOString().slice(0, 10);
  const lines = [
    `${date} · merged with ${absorbed.name}, who delivered ${absorbed.jobsDone}`,
  ];
  if (absorbed.jobDescription) {
    lines.push(`${date} · ${absorbed.name} was hired to: ${absorbed.jobDescription}`);
  }
  return lines;
}
