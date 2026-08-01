import { existsSync, readFileSync } from 'node:fs';
import type { ConnectionInfo } from '@agentlings/shared';

/**
 * The connection registry: what a job may reach outside its sandbox. Nothing
 * is ambient — a job names the connections it wants and gets those and no
 * others, which is both the security boundary and the cost one, since every
 * tool a session can see is definition overhead in each of its requests.
 *
 * Secrets are referenced by environment variable name. Values never appear in
 * the registry, never cross the API, and only reach the connection they were
 * declared for.
 */

export interface Connection {
  name: string;
  label: string;
  description?: string;
  transport: 'builtin' | 'stdio';
  /** On for every job unless the user turns it off in Settings. */
  defaultOn?: boolean;
  /** builtin 'web' only. */
  allow?: string[];
  maxChars?: number;
  /**
   * The tools a job may call on this connection, without the `mcp__name__`
   * prefix. Required rather than optional: granting a connection used to mean
   * granting everything it exposes, so a server offering both reading and
   * acting could not be adopted for reading alone. Listing them here also
   * makes the catalog say what a connection can do without running it.
   */
  tools?: string[];
  /** stdio only. */
  command?: string;
  args?: string[];
  /** Environment variable name → why it is needed. */
  secrets?: Record<string, string>;
  // `maxOutputTokens` used to be declared here and was read by nothing. It is
  // gone rather than wired, because it cannot be honoured: the SDK talks to a
  // stdio server directly, so there is no point of ours in between to trim at.
  // A config field that promises enforcement it cannot deliver is worse than
  // its absence — the budget for a stdio server is that server's own flags.
}

export function readConnections(file: string): Connection[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { connections?: Connection[] };
    return (parsed.connections ?? []).filter((c) => c.name && c.transport);
  } catch {
    return [];
  }
}

/** A connection is usable only once every secret it declares is actually set. */
export function missingSecrets(
  connection: Connection,
  env: Record<string, string | undefined>,
): string[] {
  return Object.keys(connection.secrets ?? {}).filter((name) => !env[name]);
}

/**
 * What the UI lists: never the secret values, only whether they are present.
 *
 * Which connections are live is decided in settings.ts and passed in, rather
 * than worked out again here — one rule, and no import cycle between the
 * registry and the preferences that qualify it.
 */
export function describe(
  connections: Connection[],
  env: Record<string, string | undefined>,
  enabled: Set<string> = new Set(),
): ConnectionInfo[] {
  return connections.map((c) => {
    const missing = missingSecrets(c, env);
    return {
      name: c.name,
      label: c.label,
      description: c.description ?? '',
      builtin: c.transport === 'builtin',
      ready: missing.length === 0,
      missingSecrets: missing,
      defaultOn: c.defaultOn === true,
      enabled: enabled.has(c.name),
    };
  });
}

/** The connections a job asked for, dropping any that are unknown or unready. */
export function resolveForJob(
  requested: string[] | undefined,
  connections: Connection[],
  env: Record<string, string | undefined>,
): { granted: Connection[]; refused: { name: string; reason: string }[] } {
  const granted: Connection[] = [];
  const refused: { name: string; reason: string }[] = [];
  for (const name of requested ?? []) {
    const found = connections.find((c) => c.name === name);
    if (!found) {
      refused.push({ name, reason: 'no such connection' });
      continue;
    }
    const missing = missingSecrets(found, env);
    if (missing.length > 0) {
      refused.push({ name, reason: `needs ${missing.join(', ')} in .env` });
      continue;
    }
    granted.push(found);
  }
  return { granted, refused };
}

/**
 * The tool names a job may actually call, fully qualified.
 *
 * `allowedTools` is a strict allowlist, and the only MCP name that ever
 * reached it was a hardcoded `mcp__web__fetch_page` — so the registry's stdio
 * path could configure a server whose tools were then all refused. It was
 * never noticed because no stdio connection has ever been installed.
 *
 * A connection that lists no tools contributes none. That is deliberate: the
 * alternative is asking the SDK for everything a server offers, which is the
 * "grant a connection, grant all of it" behaviour this exists to end.
 */
export function mcpToolNames(granted: Connection[]): string[] {
  return granted.flatMap((c) => (c.tools ?? []).map((tool) => `mcp__${c.name}__${tool}`));
}

/** MCP server config for the granted stdio connections, secrets filled in. */
export function toMcpServers(
  granted: Connection[],
  env: Record<string, string | undefined>,
): Record<string, { type: 'stdio'; command: string; args: string[]; env: Record<string, string> }> {
  const servers: Record<
    string,
    { type: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  > = {};
  for (const connection of granted) {
    if (connection.transport !== 'stdio' || !connection.command) continue;
    const secrets: Record<string, string> = {};
    for (const name of Object.keys(connection.secrets ?? {})) {
      const value = env[name];
      if (value) secrets[name] = value;
    }
    servers[connection.name] = {
      type: 'stdio',
      command: connection.command,
      args: connection.args ?? [],
      env: secrets,
    };
  }
  return servers;
}
