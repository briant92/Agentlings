import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateLevelPack, type LevelPack, type PackProblem } from '@agentlings/shared';
import { BUILTIN_THEMES } from '@agentlings/shared';
import { checkPlates } from './plates';

/**
 * Installed level packs: whole worlds a level can be set in, alongside the
 * four built in.
 *
 * They live beside the agentling art packs rather than in the sandbox because
 * a backdrop is an image the browser has to fetch, and `web/public` is the one
 * place already served statically in both dev and a build. Reading them here
 * rather than letting the client list a directory is the same division as
 * D-102's folder picker: the server has a filesystem, a browser does not.
 */

export interface InstalledPack {
  /** The folder name, and what a level stores as its theme. */
  slug: string;
  pack: LevelPack;
}

export interface RejectedPack {
  slug: string;
  problems: PackProblem[];
}

export interface PackScan {
  installed: InstalledPack[];
  rejected: RejectedPack[];
}

export function packsDir(root: string): string {
  return path.join(root, 'web', 'public', 'packs');
}

/**
 * Reads every pack, keeping the ones that check out and reporting the rest.
 *
 * A bad pack is skipped rather than fatal, exactly as a bad art pack is: the
 * app falls back to what it has built in, so a broken pack degrades the world
 * it was for and leaves every other level alone. What it must not do is fail
 * silently, hence `rejected` — the reason is carried, not swallowed.
 */
export function scanPacks(root: string): PackScan {
  const dir = packsDir(root);
  const installed: InstalledPack[] = [];
  const rejected: RejectedPack[] = [];
  if (!existsSync(dir)) return { installed, rejected };

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const file = path.join(dir, slug, 'pack.json');
    const fail = (message: string) =>
      rejected.push({ slug, problems: [{ level: 'error', message }] });

    // A pack that shadows a built-in would make "cave" ambiguous, and which
    // one won would depend on directory order.
    if ((BUILTIN_THEMES as readonly string[]).includes(slug)) {
      fail(`"${slug}" is the name of a built-in theme; rename the folder`);
      continue;
    }
    if (!existsSync(file)) {
      fail('no pack.json in the folder');
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      fail(`pack.json is not valid JSON: ${(error as Error).message}`);
      continue;
    }

    const problems = validateLevelPack(parsed);
    if (problems.some((p) => p.level === 'error')) {
      rejected.push({ slug, problems });
      continue;
    }
    // The raster half: the shape checker cannot see the folder, this can.
    problems.push(...checkPlates(parsed as LevelPack, path.join(dir, slug)));
    if (problems.some((p) => p.level === 'error')) {
      rejected.push({ slug, problems });
      continue;
    }
    installed.push({ slug, pack: parsed as LevelPack });
  }
  return { installed, rejected };
}

/** Whether a level may be created in this look: a built-in, or an installed pack. */
export function themeExists(root: string, theme: string): boolean {
  if ((BUILTIN_THEMES as readonly string[]).includes(theme)) return true;
  return scanPacks(root).installed.some((p) => p.slug === theme);
}

export type InstallResult = { installed: true; already: boolean } | { error: string };

/**
 * Installs a reviewed pack — what Approve performs (M4).
 *
 * Writing an already-identical pack again succeeds rather than refusing, so a
 * second Approve after a partly-failed one is safe. That is the same rule the
 * outbox follows with `sentTo`: a retry must never be blocked by the work the
 * first attempt already did, and must never do it twice.
 *
 * Anything else already at that slug is refused and left alone. Overwriting
 * someone's installed world because a session picked the same name is not a
 * thing an approval should be able to do silently.
 */
export function installPack(root: string, draft: { slug: string; pack: LevelPack }): InstallResult {
  const dir = path.join(packsDir(root), draft.slug);
  const file = path.join(dir, 'pack.json');
  const contents = `${JSON.stringify(draft.pack, null, 2)}\n`;

  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === contents) return { installed: true, already: true };
    // Name the world the way the palette names it, not by its folder. The
    // first time this fired, the message said only "moby-dick" — a string the
    // user had never seen, for a world the app calls "The Pequod" — and told
    // them to delete a directory, which the app cannot do and they should not
    // need a terminal for. They went looking in the Level panel, where a pack
    // never appears, and discarded a good pack for want of a way through.
    let occupant = draft.slug;
    try {
      occupant = (JSON.parse(readFileSync(file, 'utf8')) as LevelPack).name || draft.slug;
    } catch {
      // A pack too broken to name is still a pack in the way.
    }
    return {
      error: `the name "${draft.slug}" already belongs to the world “${occupant}” on your palette. Give this one a different name and approve again.`,
    };
  }
  if ((BUILTIN_THEMES as readonly string[]).includes(draft.slug)) {
    return { error: `"${draft.slug}" is the name of a built-in theme` };
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, contents);
  return { installed: true, already: false };
}
