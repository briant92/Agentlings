/**
 * What a run could do, as a sorted list of tokens.
 *
 * A recipe is a method, and a method is only as good as what was available
 * when it was found. D-036 closed one axis of that — the connections a job
 * could reach — and left the rest open: a role's tools, its skills and the
 * document libraries all change what a good method is, and none of them
 * demoted anything.
 *
 * One flat token list rather than a record with a field per axis, because the
 * only operation is "is this the same surface as before". Adding an axis later
 * is a new prefix and no migration, and the list stays readable on disk, which
 * matters when a recipe demotes and someone asks why.
 *
 * Deliberately absent: the model and the turn cap. They change how *well* a
 * run does something, not what it can do — and a leashed run takes
 * RECIPE_TURNS regardless of its role's cap, so recording that one would
 * demote on a number the run never uses.
 */
export function capabilityTokens(parts: {
  /** Connections granted to the job, e.g. web, browser. */
  connections?: string[];
  /** SDK tools the role grants, e.g. Read, Bash, WebFetch. */
  tools?: string[];
  /** Skills present on disk for the role. */
  skills?: string[];
  /** Libraries a sandbox can resolve from the project root. */
  libraries?: string[];
}): string[] {
  return [
    ...(parts.connections ?? []).map((c) => `conn:${c}`),
    ...(parts.tools ?? []).map((t) => `tool:${t}`),
    ...(parts.skills ?? []).map((s) => `skill:${s}`),
    ...(parts.libraries ?? []).map((l) => `lib:${l}`),
  ].sort();
}

/**
 * The connections a stored surface says the run *could* reach.
 *
 * Availability, not use — which is the whole difficulty. A compiled tool is
 * two plain-node modules with "no dependencies, no shell commands, no
 * network", so a method that genuinely reached a connection can never become
 * one; but the surface cannot say whether it did. `web` ships on, so it
 * appears on almost every recipe, including ones that never fetched anything.
 *
 * So callers must decide which of these are informative. `ambient` is how:
 * pass the connections that are on unless the user says otherwise, and their
 * presence tells you nothing. What is left was switched on deliberately, and a
 * method found with it is a method that plausibly needed it. (D-044)
 */
export function connectionsIn(
  capabilities: string[] | undefined,
  ambient: string[] = [],
): string[] {
  return (capabilities ?? [])
    .filter((token) => token.startsWith('conn:'))
    .map((token) => token.slice('conn:'.length))
    .filter((name) => !ambient.includes(name));
}

/** Whether two surfaces are the same one. */
export function sameSurface(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return false;
  return a.length === b.length && a.every((token, i) => token === b[i]);
}
