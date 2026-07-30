import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

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
      appendFileSync(file, `# ${agentlingName} — lessons\n\n`);
    }
    appendFileSync(file, `- ${lesson}\n`);
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
