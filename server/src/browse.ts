import type { CatalogEntry, LibraryCategory, SourceStatus } from '@agentlings/shared';

/**
 * Browsing the library: the catalogue arranged so it can be read by someone
 * with no query.
 *
 * Search answers "is there something for this"; nothing answered "what is
 * there". With 532 entries a flat list is not browsing, so this groups them —
 * and the grouping is **read off the file paths, never guessed from the
 * descriptions**. The sources already arrange themselves: VoltAgent files sit
 * in `categories/01-core-development/`, both wshobson repos in
 * `plugins/<name>/`. That is a fact about the repository, reproducible and
 * wrong only if the repository moves its own files. Deriving a taxonomy from
 * the prose would be this project's oldest mistake with extra steps: a
 * plausible answer nobody can check.
 */

/**
 * The category an entry belongs to, or null when its source arranges nothing.
 *
 * Per source on purpose. A rule general enough to cover all four would have to
 * guess which path segment carries meaning, and it guesses wrong the moment a
 * fifth source nests differently — `skills/pdf/SKILL.md` would yield "skills",
 * a category holding every skill Anthropic publishes and telling nobody
 * anything. An unknown source returns null and is grouped under its own label
 * by `categorise`, which is the honest answer: *these came from here, and here
 * does not sort them*.
 */
export function categoryOf(entry: CatalogEntry): string | null {
  const parts = entry.path.split('/');
  // categories/01-core-development/api-designer.md
  if (entry.source === 'voltagent-subagents' && parts.length >= 3 && parts[0] === 'categories') {
    return tidy(parts[1]);
  }
  // plugins/backend-development/agents/x.md, plugins/backend-development/skills/y/SKILL.md
  if (entry.source.startsWith('wshobson-') && parts.length >= 3 && parts[0] === 'plugins') {
    return tidy(parts[1]);
  }
  return null;
}

/** `01-core-development` → `core development`. The ordinal is sort order, not a name. */
function tidy(segment: string): string {
  return segment.replace(/^\d+-/, '').replace(/-/g, ' ').trim();
}

/**
 * The catalogue as categories, largest first.
 *
 * Largest first rather than alphabetical because the list is long-tailed —
 * measured on the real index, 100 categories with a median of 3 entries and 19
 * holding exactly one. A–Z would put `accessibility compliance` (1) above
 * `language specialists` (30) and bury everything worth seeing first below the
 * fold. Ties break alphabetically so the order is stable between syncs.
 *
 * `sourceLabels` names the fallback group for a source that arranges nothing —
 * an unknown source is grouped under its own name rather than dropped, so a
 * source added later appears in the UI on the day it is added, before anyone
 * has written a path rule for it.
 */
export function categorise(
  entries: readonly CatalogEntry[],
  sources: readonly SourceStatus[],
): LibraryCategory[] {
  const labels = new Map(sources.map((s) => [s.name, s.label]));
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const key = categoryOf(entry) ?? labels.get(entry.source) ?? entry.source;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([name, list]): LibraryCategory => ({
      name,
      jobs: list.filter((e) => e.kind === 'role').length,
      abilities: list.filter((e) => e.kind === 'skill').length,
      sources: [...new Set(list.map((e) => e.source))].sort(),
      // Its lowest trust, not its highest: a category is a thing you open
      // expecting the label to describe it, and one community file among ten
      // official ones is exactly the case a highest-wins badge would hide.
      trust: list.some((e) => e.trust !== 'official') ? 'community' : 'official',
    }))
    .sort((a, b) => b.jobs + b.abilities - (a.jobs + a.abilities) || a.name.localeCompare(b.name));
}

export interface BrowseFilter {
  category?: string;
  /** `role` or `skill`; absent means both. */
  kind?: CatalogEntry['kind'];
  source?: string;
}

/**
 * The entries a filter selects, in the order they will be read.
 *
 * Alphabetical within a category, unlike the categories themselves: inside one
 * there is no long tail to rescue, and a stable name order is what makes a
 * category you have opened twice look the same twice.
 */
export function entriesIn(
  entries: readonly CatalogEntry[],
  sources: readonly SourceStatus[],
  filter: BrowseFilter,
): CatalogEntry[] {
  const labels = new Map(sources.map((s) => [s.name, s.label]));
  return entries
    .filter((entry) => {
      if (filter.kind && entry.kind !== filter.kind) return false;
      if (filter.source && entry.source !== filter.source) return false;
      if (filter.category === undefined) return true;
      const key = categoryOf(entry) ?? labels.get(entry.source) ?? entry.source;
      return key === filter.category;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
