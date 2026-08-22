import type { AgentlingRecord } from '@agentlings/shared';

/**
 * The profile's memory and record, as facts (UI.md, step 18): the lessons
 * and the notes a discard banked in one list with the note tagged as what it
 * is, the header that counts them, and the line under the record fold. Pure,
 * so Ash's card can be pinned without a DOM.
 */

/**
 * A lesson line as the close-out writes it: date, prose, and — since D-089 —
 * the job that taught it, stamped at the end. Older lessons have no stamp
 * and render without a tag rather than with a guessed one.
 */
const LESSON_RE = /^(\d{4})-(\d{2})-(\d{2}) · (.*?)(?: \(job: (.+)\))?$/;

export interface LessonParts {
  /** "08-22" for the row; null when the line carries no date. */
  date: string | null;
  text: string;
  job: string | null;
}

export function lessonParts(line: string): LessonParts {
  const match = LESSON_RE.exec(line);
  if (!match) return { date: null, text: line, job: null };
  return { date: `${match[2]}-${match[3]}`, text: match[4], job: match[5] ?? null };
}

/** One row of the memory list: a lesson, or the note a discard banked (D-201). */
export interface MemoryEntry extends LessonParts {
  kind: 'lesson' | 'discard';
}

/**
 * Lessons and discard notes together, newest first. A discard's note is not
 * a lesson — it is the crew's record that a delivery was not what was wanted
 * — so it keeps its own tag; on the same day a lesson comes first, and a
 * line with no date goes last.
 */
export function memoryEntries(
  memory: readonly string[],
  discards: readonly string[],
): MemoryEntry[] {
  const of = (line: string, kind: MemoryEntry['kind']) => ({
    entry: { ...lessonParts(line), kind },
    when: LESSON_RE.exec(line)?.[0].slice(0, 10) ?? '',
  });
  const dated = [
    ...[...memory].reverse().map((line) => of(line, 'lesson')),
    ...[...discards].reverse().map((line) => of(line, 'discard')),
  ];
  return dated.sort((a, b) => b.when.localeCompare(a.when)).map((d) => d.entry);
}

/** The memory fold's count: "3 lessons · 1 discard note". */
export function memorySummary(lessons: number, discards: number): string {
  const head = `${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`;
  if (discards === 0) return head;
  return `${head} · ${discards} discard ${discards === 1 ? 'note' : 'notes'}`;
}

/**
 * The line under the record fold: runs · finished on its own · cut · kept.
 * The cut is the row's own flag — the turn budget or the clock (D-138) —
 * and never turns over the cap, which a finished run can carry (D-212).
 */
export function recordParts(
  record: Pick<AgentlingRecord, 'runs' | 'finished' | 'cut'>,
  kept: number,
): { text: string; strong: boolean }[] {
  return [
    { text: `${record.runs} ${record.runs === 1 ? 'run' : 'runs'}`, strong: true },
    {
      text: `${record.finished} finished on ${record.finished === 1 ? 'its' : 'their'} own`,
      strong: false,
    },
    { text: `${record.cut} cut short`, strong: true },
    { text: `${kept} kept`, strong: false },
  ];
}
