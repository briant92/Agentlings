import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '@agentlings/shared';

/**
 * A standing input: what a schedule reads afresh every time it fires (D-246).
 *
 * A schedule carries a prompt and a channel and nothing else (D-103), so
 * recurring work can only reach what is ambient — and a bank statement is not.
 * The reconciliation line ran sixteen times on hand-attached files and could
 * never be put on a cadence for exactly that reason: "every month, reconcile
 * the books" was unbuildable at any amount of prompting.
 *
 * It is a folder and a rule rather than a path because that is what a monthly
 * download actually looks like: the bank writes `estado-cuenta-2026-09.xlsx`
 * beside last month's rather than overwriting it, so a fixed path would
 * reconcile August forever and never say it was doing so.
 *
 * The server reads it, exactly as it reads an attachment, and hands the bytes
 * to the job's `input/`. No session gets a tool that reaches the disk — this
 * widens what a schedule can carry without widening what a run can touch, so
 * D-132's rule (nothing but a filename leaves a folder the user merely pointed
 * at) is untouched: these files are named as deliberately as attached ones.
 */
export interface StandingInput {
  /** An absolute folder on this machine. */
  dir: string;
  /**
   * Case-insensitive substring of the filename. Absent means every file
   * qualifies, which is right for a folder holding one kind of thing and
   * wrong for a Downloads folder — the caller decides which it has.
   */
  match?: string;
  /**
   * The name it lands under in `input/`.
   *
   * Required rather than defaulted to the source name, because the whole
   * point is that the source name changes. The prompt rides verbatim (D-072),
   * so it has to be able to say `input/statement.xlsx` in September as well as
   * in August; landing the file under its real name would make the sentence
   * wrong one month after it was written.
   */
  as: string;
}

/**
 * Excel writes `~$movimientos.xlsx` beside a workbook while it is open, and
 * that lock file is *newer* than the workbook — so the newest-match rule would
 * pick it every time the user happened to have the sheet open, and pick it in
 * preference to the real data. It is not even the same format: a couple of
 * hundred bytes naming whoever holds the lock, which the xlsx reader refuses.
 * Skipped by prefix, which is how Office names every one of them.
 */
const LOCK_PREFIX = '~$';

/** Whether a directory entry is a candidate at all. */
function usable(dir: string, name: string): boolean {
  if (name.startsWith(LOCK_PREFIX)) return false;
  try {
    return statSync(path.join(dir, name)).isFile();
  } catch {
    // Vanished between the listing and the stat. Not a candidate, not a fault.
    return false;
  }
}

/**
 * The newest file in `dir` whose name contains `match`, or null when nothing
 * qualifies. Newest by mtime rather than by name, because a filename's date
 * format is the bank's choice and its ordering is not ours to assume.
 */
export function newestMatch(dir: string, match?: string): string | null {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const wanted = match?.toLowerCase();
  let best: { name: string; mtime: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (wanted && !name.toLowerCase().includes(wanted)) continue;
    if (!usable(dir, name)) continue;
    const mtime = statSync(path.join(dir, name)).mtimeMs;
    if (!best || mtime > best.mtime) best = { name, mtime };
  }
  return best?.name ?? null;
}

/**
 * What a firing may carry, checked at the moment it is set rather than at the
 * moment it fires — a schedule that could never work should be refused when
 * someone makes it, not silently every month at 08:10.
 */
export function validateStanding(inputs: StandingInput[]): string | null {
  if (inputs.length > MAX_ATTACHMENTS) {
    return `too many standing inputs — ${MAX_ATTACHMENTS} at most`;
  }
  const names = new Set<string>();
  for (const input of inputs) {
    if (!input.dir?.trim()) return 'a standing input needs a folder';
    if (!path.isAbsolute(input.dir)) return `"${input.dir}" is not an absolute folder`;
    const as = input.as?.trim();
    if (!as) return 'a standing input needs a name to land under';
    // It becomes a filename inside the sandbox's input/, so it must be one:
    // a separator here would write outside the folder the run is given.
    if (as !== path.basename(as) || as === '.' || as === '..') {
      return `"${as}" is not a plain filename`;
    }
    if (names.has(as)) return `two standing inputs both land as "${as}"`;
    names.add(as);
  }
  return null;
}

/**
 * Read every standing input as it stands right now.
 *
 * Throws rather than skipping, and that is the deliberate part: a
 * reconciliation whose statement is missing but whose ledger is present would
 * otherwise run, find nothing to match, and report a clean result — the
 * quietest possible failure, and the one this project keeps re-learning. A
 * firing that cannot see all of its inputs does not happen at all, and the
 * schedule row says why.
 */
export function resolveStanding(inputs: StandingInput[]): { name: string; data: Buffer }[] {
  const files: { name: string; data: Buffer }[] = [];
  for (const input of inputs) {
    if (!existsSync(input.dir)) {
      throw new Error(`standing input "${input.as}": no folder at ${input.dir}`);
    }
    const found = newestMatch(input.dir, input.match);
    if (!found) {
      throw new Error(
        input.match
          ? `standing input "${input.as}": nothing matching "${input.match}" in ${input.dir}`
          : `standing input "${input.as}": ${input.dir} is empty`,
      );
    }
    const data = readFileSync(path.join(input.dir, found));
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `standing input "${input.as}": ${found} is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
      );
    }
    files.push({ name: input.as, data });
  }
  return files;
}
