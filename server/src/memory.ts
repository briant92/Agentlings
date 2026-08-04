import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A note with its date prefix off — what it says, not when it said it.
 *
 * The dedup key for the two note files: the same words banked again on a later
 * date replace the original rather than piling up beside it. Exact match only,
 * and that is a measured limit rather than a shortcut — against the real
 * corpora (2026-08-04), known rewordings of one lesson score 0.3–0.5 under
 * `similarity()` while hq's genuinely distinct notes have hundreds of pairs in
 * the same band, so no threshold separates them. Catching a *reworded* repeat
 * is the close-out's job, which can read (D-073).
 */
export function undated(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2} · /, '');
}

/**
 * Per-agentling memory: one markdown file of "- " lessons per worker.
 * M0 stubs a career-log line per job; the M1 executor reads these into the
 * session and writes real lessons back.
 */
export class MemoryStore {
  constructor(private dir: string) {}

  lessons(agentlingName: string): string[] {
    const file = this.file(agentlingName);
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2));
  }

  append(agentlingName: string, lesson: string): void {
    mkdirSync(this.dir, { recursive: true });
    const file = this.file(agentlingName);
    if (!existsSync(file)) {
      writeFileSync(file, `# ${agentlingName} — lessons\n\n- ${lesson}\n`);
      return;
    }
    // The same note on a new date replaces the old one instead of joining it.
    // A recurring job banks its lesson every run, and a session is handed the
    // five *newest* lessons — so without this, all five slots fill with copies
    // of one fact the moment a job repeats (D-073: eight copies of one
    // publication-lag lesson after ten runs of one sentence). Only the "- "
    // duplicate is dropped: the file is a document a person can note in, and
    // everything that is not a lesson line stays exactly where it was.
    const fresh = undated(lesson);
    const kept = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !(line.startsWith('- ') && undated(line.slice(2)) === fresh));
    while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
    writeFileSync(file, `${kept.join('\n')}\n- ${lesson}\n`);
  }

  /** Replaces a whole memory — used when a merge rewrites the survivor's. */
  write(agentlingName: string, lessons: string[]): void {
    mkdirSync(this.dir, { recursive: true });
    const body = lessons.map((lesson) => `- ${lesson}\n`).join('');
    writeFileSync(this.file(agentlingName), `# ${agentlingName} — lessons\n\n${body}`);
  }

  /**
   * Letting someone go moves their lessons aside rather than shredding them.
   * The app forgets; the file is still there if it was a mistake. Returns the
   * archive path, or null when there was nothing to keep.
   */
  archive(agentlingName: string, at = new Date()): string | null {
    const file = this.file(agentlingName);
    if (!existsSync(file)) return null;
    const dir = path.join(this.dir, 'archive');
    mkdirSync(dir, { recursive: true });
    const stamp = at.toISOString().slice(0, 10);
    let target = path.join(dir, `${agentlingName.toLowerCase()}-${stamp}.md`);
    for (let n = 2; existsSync(target); n++) {
      target = path.join(dir, `${agentlingName.toLowerCase()}-${stamp}-${n}.md`);
    }
    renameSync(file, target);
    return target;
  }

  private file(agentlingName: string): string {
    return path.join(this.dir, `${agentlingName.toLowerCase()}.md`);
  }
}
