import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
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

  private file(agentlingName: string): string {
    return path.join(this.dir, `${agentlingName.toLowerCase()}.md`);
  }
}
