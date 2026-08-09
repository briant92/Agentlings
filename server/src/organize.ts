import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Reaching a real folder to reorganize it (D-132, EXPANSION P5).
 *
 * The session never gets a tool that reads or writes the real folder. Instead
 * the server walks it once into a read-only inventory — **names, types, sizes
 * and dates only, never contents** (Brian's Q1: nothing but a filename leaves
 * the disk, so §11's no-redaction gap never bites) — and hands that inventory
 * to the run in its brief, the way the repo listing is handed over. The run
 * proposes MOVES.json against it; the server moves the files at Approve.
 */

/** Files the inventory will show before it says "and N more". */
export const INVENTORY_CAP = 400;

/** A tidying verb, and a folder reference — both are needed to claim (D-132). */
const ORGANIZE_VERB = /\b(organi[sz]e|reorgani[sz]e|tidy|declutter|rearrange|sort|clean|clear)\b/i;
const FOLDER_NOUN =
  /\b(folders?|sub-?folders?|director(y|ies)|downloads|desktop|documents|photos|pictures|screenshots)\b/i;

/**
 * Whether a sentence wants a folder reorganized. Under-fires on purpose: a
 * tidying verb alone is not enough, because "clean up the whole project" and
 * "sort out the bug" are code work, not folder work. It claims only when a
 * folder is actually referenced — "tidy my downloads", "organize this
 * folder" — and even then the folder itself is picked from the native dialog,
 * never typed. So "clean up my desktop" claims and "clean up the code" does
 * not, on the noun, not the verb.
 */
export function wantsOrganize(prompt: string): boolean {
  return ORGANIZE_VERB.test(prompt) && FOLDER_NOUN.test(prompt);
}

interface Entry {
  rel: string;
  bytes: number;
  mtime: number;
  dir: boolean;
}

function walk(root: string, cap: number): { entries: Entry[]; skipped: number } {
  const entries: Entry[] = [];
  let skipped = 0;
  const recurse = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return; // an unreadable subfolder is skipped, not fatal (store.ts's rule)
    }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      // Symlinks are left out: following one could move a file that lives
      // outside the root, and the whole guarantee is that nothing does.
      if (st.isSymbolicLink()) continue;
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (st.isDirectory()) {
        if (entries.length < cap) entries.push({ rel, bytes: 0, mtime: st.mtimeMs, dir: true });
        else skipped++;
        recurse(abs);
      } else if (st.isFile()) {
        if (entries.length < cap) entries.push({ rel, bytes: st.size, mtime: st.mtimeMs, dir: false });
        else skipped++;
      }
    }
  };
  recurse(root);
  return { entries, skipped };
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface Inventory {
  lines: string[];
  files: number;
  folders: number;
  skipped: number;
}

/**
 * The metadata inventory of a folder, as lines a run can reason over. Each file
 * carries its relative path, extension, size and modified-date; each folder its
 * path. No content is read.
 */
export function folderInventory(root: string, cap = INVENTORY_CAP): Inventory {
  const { entries, skipped } = walk(root, cap);
  const lines: string[] = [];
  let files = 0;
  let folders = 0;
  for (const e of entries) {
    if (e.dir) {
      folders++;
      lines.push(`${e.rel}/  (folder)`);
    } else {
      files++;
      const ext = path.extname(e.rel).slice(1).toLowerCase() || 'no extension';
      const date = new Date(e.mtime).toISOString().slice(0, 10);
      lines.push(`${e.rel}  (${ext}, ${human(e.bytes)}, ${date})`);
    }
  }
  return { lines, files, folders, skipped };
}

/**
 * The organizing contract, told in the brief because a capability nobody is
 * told about is not one (D-031). Included only when a job carries a folder to
 * organize; without it a run has no way to know MOVES.json exists.
 */
export function organizeBrief(inv: Inventory): string {
  const parts = [
    '## Organizing a folder',
    `You are proposing a tidier layout for a real folder of ${inv.files} file${inv.files === 1 ? '' : 's'}` +
      `${inv.folders > 0 ? ` in ${inv.folders} folder${inv.folders === 1 ? '' : 's'}` : ''}. You cannot touch it — you write a plan, and it is carried out only after the user approves.`,
    'Write MOVES.json in the working directory: `{ "moves": [ ... ] }`, where each op is one of:',
    '- `{ "op": "mkdir", "path": "invoices" }` — make a folder (relative to the organized folder\'s root)',
    '- `{ "op": "move", "from": "IMG_1.jpg", "to": "photos/IMG_1.jpg" }` — move or rename a file',
    'Rules: every path is relative to the folder\'s root; never use ".." or an absolute path; never move a file onto an existing one; **there is no delete and no copy** — a tidy-up only ever makes folders and moves things into them. Explain your scheme in RESULT.md.',
    '',
    'The folder holds (names, types, sizes and dates — you cannot see inside the files):',
    ...inv.lines,
  ];
  if (inv.skipped > 0) parts.push(`… and ${inv.skipped} more not listed.`);
  return parts.join('\n');
}
