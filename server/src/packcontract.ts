import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateLevelPack, type LevelPack } from '@agentlings/shared';
import { THEME_KEYS } from './levels';

/**
 * The pack contract: how a run hands over a world it has authored (M4).
 *
 * The same shape as the outbox (D-075) and for the same reason. A session
 * never installs anything: it writes this file at the sandbox root, where it
 * counts as a deliverable by the existing top-level rule, review shows it, and
 * **Approve is the install** — the server copies it into `web/public/packs/`,
 * exactly as a reviewed patch is replayed by `git apply` and a reviewed outbox
 * by the channel client.
 *
 * Its own file rather than a field on `Outbox`, deliberately. An outbox is
 * message-shaped — recipients, bodies, subjects — and a pack has none of that.
 * Collapsing the two because both mean "a thing Approve performs" is the
 * mistake D-030 names: two notions that only sound alike.
 *
 * Validation is strict and every refusal names its reason, because this file
 * is written by a model and a malformed pack that read as "no pack" would
 * promote a job while dropping the whole point of it.
 */
export const PACK_FILE = 'PACK.json';

/** A pack a run is offering, plus the folder name it wants to be installed under. */
export interface PackDraft {
  slug: string;
  pack: LevelPack;
}

export type PackDraftRead =
  | { draft: PackDraft; error?: undefined }
  | { draft?: undefined; error: string };

/**
 * A slug becomes a directory name, so this is a security boundary as well as
 * a tidiness one: anything with a separator, a drive letter or a `..` in it
 * would let a sandbox choose where on disk Approve writes.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 40;

export function slugProblem(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return '"slug" is required — the folder name the pack installs under';
  }
  if (slug.length > MAX_SLUG) return `"slug" is longer than ${MAX_SLUG} characters`;
  if (!SLUG_RE.test(slug)) {
    return `"slug" must be lower-case words joined by hyphens, like "moby-dick" — got "${slug}"`;
  }
  if ((THEME_KEYS as string[]).includes(slug)) {
    return `"${slug}" is the name of a built-in theme; choose another`;
  }
  return null;
}

/** The contract over an already-parsed value, so a draft built in code meets it too. */
export function checkPackDraft(parsed: unknown): PackDraftRead {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'must be a JSON object with "slug" and "pack"' };
  }
  const { slug, pack } = parsed as { slug?: unknown; pack?: unknown };

  const slugSays = slugProblem(slug);
  if (slugSays) return { error: slugSays };

  if (typeof pack !== 'object' || pack === null || Array.isArray(pack)) {
    return { error: '"pack" is required — the level pack itself' };
  }

  // The same checker the CLI and the loader use. One implementation, so a pack
  // that Approve installs cannot be one the app would then refuse to load.
  const problems = validateLevelPack(pack).filter((p) => p.level === 'error');
  if (problems.length > 0) {
    return { error: problems.map((p) => p.message).join('; ') };
  }
  return { draft: { slug: slug as string, pack: pack as LevelPack } };
}

/** Parses PACK.json from a sandbox: null when absent, the reason when invalid. */
export function readPackDraft(dir: string): PackDraftRead | null {
  const file = path.join(dir, PACK_FILE);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  return checkPackDraft(parsed);
}
