import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Connection } from './connections';

/**
 * Connections the *user* added, as opposed to the ones this repo ships.
 *
 * **Why this exists.** `catalog/connections.json` was the only source, and
 * nothing could write it: the routes could switch a connection on or off and
 * store its secret, but there was no way to *add* one. So "reach the system I
 * actually use" meant editing a JSON file inside the repo and restarting —
 * which is not a product, it is a patch. MCP is a standard and the ecosystem
 * is large; the catalog should be a starting set, not the ceiling.
 *
 * Kept under `.agentlings/`, beside the ledger and the levels, because it is
 * this machine's state rather than the product's — a `git pull` must never
 * take a user's connections away, and a shipped catalog entry must never
 * arrive as a merge conflict in their file.
 */

/** Where a user's own connections live, given the sandbox root. */
export function userConnectionsFile(sandboxRoot: string): string {
  return path.join(sandboxRoot, 'connections.json');
}

export function readUserConnections(file: string): Connection[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { connections?: Connection[] };
    // The same shape guard `readConnections` applies to the shipped catalog: a
    // half-written entry is skipped rather than crashing every job on the box.
    return (parsed.connections ?? []).filter((c) => c && c.name && c.transport);
  } catch {
    return [];
  }
}

export function writeUserConnections(file: string, connections: Connection[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ connections }, null, 2)}\n`);
}

/**
 * The shipped catalog first, the user's own after.
 *
 * **A user entry may never take a shipped name.** Order alone would decide it
 * otherwise, and the loser would be silent: a connection called `github` that
 * points somewhere else inherits every grant, every recipe and every role
 * prompt that already names `github`, and nothing in the app would say so.
 * Collisions are refused at the door instead (`draftProblem`), and this filter
 * is the belt for a file edited by hand.
 */
export function mergeConnections(shipped: Connection[], user: Connection[]): Connection[] {
  const taken = new Set(shipped.map((c) => c.name));
  return [...shipped, ...user.filter((c) => !taken.has(c.name))];
}

/** A connection as the add form describes it, before it is proven to work. */
export interface ConnectionDraft {
  name?: unknown;
  label?: unknown;
  description?: unknown;
  transport?: unknown;
  command?: unknown;
  args?: unknown;
  url?: unknown;
  headers?: unknown;
  secrets?: unknown;
}

/** Names that would collide with something the app already means by them. */
const RESERVED = new Set(['web', 'render', 'browser']);

/**
 * What is wrong with a draft, or null.
 *
 * Checked before anything is run or written, because the next step after this
 * **starts a process or opens a socket** — a validation that happens afterwards
 * is a validation of the wreckage.
 */
export function draftProblem(
  draft: ConnectionDraft,
  existing: Connection[],
): string | null {
  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  if (!name) return 'give the connection a short name';
  // The name becomes part of every tool id the model sees (`mcp__<name>__<tool>`),
  // so anything outside this set would produce a tool nobody can call.
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) {
    return 'the name must be lower-case letters, digits and dashes, starting with a letter';
  }
  if (RESERVED.has(name) || existing.some((c) => c.name === name)) {
    return `there is already a connection called "${name}"`;
  }
  if (typeof draft.label !== 'string' || !draft.label.trim()) {
    return 'give the connection a label — it is what Settings shows';
  }

  if (draft.transport === 'stdio') {
    if (typeof draft.command !== 'string' || !draft.command.trim()) {
      return 'a local server needs a command to run';
    }
    if (draft.args !== undefined && !isStringArray(draft.args)) {
      return 'arguments must be a list of text';
    }
  } else if (draft.transport === 'http') {
    if (typeof draft.url !== 'string' || !draft.url.trim()) {
      return 'a remote server needs a URL';
    }
    let parsed: URL;
    try {
      parsed = new URL(draft.url);
    } catch {
      return 'that URL cannot be read';
    }
    if (parsed.protocol !== 'https:' && !isLoopback(parsed.hostname)) {
      // Plain http off this machine would put the credential on the wire in
      // clear. Loopback is exempt because that is how a server is tested
      // before it is hosted, and it never leaves the box.
      return 'use https for a remote server (plain http is allowed only on this machine)';
    }
    if (draft.headers !== undefined && !isStringRecord(draft.headers)) {
      return 'headers must be name and value pairs of text';
    }
  } else {
    return 'choose whether the server runs locally (stdio) or remotely (http)';
  }

  if (draft.secrets !== undefined) {
    if (!isStringRecord(draft.secrets)) return 'secrets must be name and reason pairs of text';
    for (const key of Object.keys(draft.secrets)) {
      // An env var name, because that is where the value will live (D-078).
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        return `"${key}" is not an environment variable name — use CAPITALS_WITH_UNDERSCORES`;
      }
    }
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/**
 * A validated draft plus the tools its server actually answered with.
 *
 * `tools` comes from **asking the server**, never from the form. D-044 requires
 * a connection to list what a job may call, so that granting one is not
 * granting everything it happens to expose — and for a server nobody curated,
 * the only honest source of that list is the server itself. It also means a
 * connection cannot be saved until it has been shown to work: the config is
 * proven before it is stored, rather than failing later inside somebody's job.
 */
export function connectionFromDraft(
  draft: ConnectionDraft,
  tools: string[],
): Connection {
  const base: Connection = {
    name: (draft.name as string).trim(),
    label: (draft.label as string).trim(),
    transport: draft.transport as 'stdio' | 'http',
    tools,
    // Off until Settings says otherwise. Adding a connection is saying "this
    // works", not "every job may now use it" — the grant is still per job.
    defaultOn: false,
  };
  if (typeof draft.description === 'string' && draft.description.trim()) {
    base.description = draft.description.trim();
  }
  if (isStringRecord(draft.secrets) && Object.keys(draft.secrets).length) {
    base.secrets = draft.secrets;
  }
  if (draft.transport === 'stdio') {
    base.command = (draft.command as string).trim();
    if (isStringArray(draft.args) && draft.args.length) base.args = draft.args;
  } else {
    base.url = (draft.url as string).trim();
    if (isStringRecord(draft.headers) && Object.keys(draft.headers).length) {
      base.headers = draft.headers;
    }
  }
  return base;
}
