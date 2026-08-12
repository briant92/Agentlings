import { DOORS } from './connections';

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

/**
 * The connections a method actually *reached*, from the tools it called.
 *
 * D-044 had to judge compilability from availability, and said plainly why:
 * "the surface cannot say whether it did [reach one]". It can now — a run
 * records the tools it called (D-100), and the catalog already declares which
 * tools belong to which connection, so the two join.
 *
 * Ambient plays no part here, and that is the whole gain. `web` was subtracted
 * from a surface because it is on everywhere and so carries no information;
 * a run that genuinely *called* `fetch_page` has told us something, and this
 * reports it. D-044's own stated limit — "a job that genuinely fetched a page
 * with nothing but `web` still passes this gate and will produce a failing
 * compile" — closes here.
 *
 * Names are matched both bare and MCP-prefixed, because a stdio connection's
 * tools reach the session as `mcp__<name>__<tool>` while a builtin's arrive
 * under their own name.
 */
export function connectionsUsed(
  usedTools: string[] | undefined,
  connections: { name: string; tools?: string[] }[],
): string[] {
  if (!usedTools?.length) return [];
  const used = new Set(usedTools);
  return connections
    .filter(
      (conn) =>
        used.has(conn.name) ||
        [...used].some((tool) => tool.startsWith(`mcp__${conn.name}__`)) ||
        (conn.tools ?? []).some((tool) => used.has(tool) || used.has(`mcp__${conn.name}__${tool}`)),
    )
    .map((conn) => conn.name);
}

/**
 * What a method reached outside its sandbox, before asking what that means.
 *
 * The compile gate's whole question, in one place rather than inline in the
 * route — route wiring is not tested, and every fault of the last two days
 * has been a correct function nobody exercised.
 *
 * Use first, availability second, and the fallback is the careful half: a
 * recipe whose runs all predate the recording (D-100) has told us nothing
 * about what it reached, and absent evidence is not evidence of absence.
 * Reading it as "used nothing" would approve a compile that cannot exist,
 * which is the one thing D-044 was built to stop.
 *
 * Private, because "reached something" is no longer a verdict on its own: the
 * two exported readings below split it, and having one name for the raw list
 * keeps them from drifting into disagreeing about what a method touched.
 */
function connectionsReached(
  recipe: { capabilities?: string[]; usedTools?: string[] },
  connections: { name: string; tools?: string[]; defaultOn?: boolean }[],
): string[] {
  if (recipe.usedTools?.length) return connectionsUsed(recipe.usedTools, connections);
  const ambient = connections.filter((conn) => conn.defaultOn === true).map((conn) => conn.name);
  return connectionsIn(recipe.capabilities, ambient);
}

/**
 * The connections that stop a method becoming a compiled tool, or none.
 *
 * Narrower than it was: a connection this server owns a door for is no longer a
 * blocker but a grant, handled by `compileDoors` below. What is left is the
 * case D-044 was actually built for — a method that reached something no script
 * can be handed, so no script could do the job however it were written.
 */
export function compileBlockers(
  recipe: { capabilities?: string[]; usedTools?: string[] },
  connections: { name: string; tools?: string[]; defaultOn?: boolean }[],
): string[] {
  const reached = connectionsReached(recipe, connections);
  // On the fallback path nothing is known, only available — so a door cannot
  // be granted, and therefore cannot be subtracted either. Clearing `github`
  // here while `compileDoors` declined to grant it would compile a tool with
  // no way to do its job: a guaranteed pair of failures and an automatic
  // retirement, where the old answer was an honest refusal. Silence blocks.
  if (!recipe.usedTools?.length) return reached;
  return reached.filter((name) => !(name in DOORS));
}

/**
 * The doors a compiled tool must be granted to do this method's job.
 *
 * The other half of the same question, and the reason the answer above shrank.
 * D-100 refused tools the doors on a measurement — every compile-eligible
 * recipe *also* carried `browser`, which no plain-node script can drive
 * whatever doors it holds, so the grant would have unlocked nothing. Its stated
 * reopen condition was a recipe refused for a door it genuinely used and
 * nothing else, and four now are.
 *
 * So a reached connection splits two ways rather than one. A door-backed one is
 * a *grant*: the server still makes the call, still checks the catalog, still
 * owns the key, and the script gets an endpoint and nothing more. Anything else
 * is still a blocker, and for the original reason — there is no door to hand
 * over, so no script could do the job however it were written.
 *
 * Returned as the connections rather than the paths because this is what the
 * manifest records and what the router later re-checks: a tool compiled against
 * a connection that is now switched off must not run on stale reach.
 */
export function compileDoors(
  recipe: { capabilities?: string[]; usedTools?: string[] },
  connections: { name: string; tools?: string[]; defaultOn?: boolean }[],
): string[] {
  // Demonstrated use only. Granting on availability would hand a door to a
  // script that never showed it needed one, and — because this list is what the
  // router later re-checks — would then refuse that tool the day an unused
  // connection was switched off. Both halves of the substitution D-100 undid.
  if (!recipe.usedTools?.length) return [];
  return connectionsReached(recipe, connections).filter((name) => name in DOORS);
}

/** Whether two surfaces are the same one. */
export function sameSurface(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return false;
  return a.length === b.length && a.every((token, i) => token === b[i]);
}
