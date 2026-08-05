import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { missingSecrets, type Connection } from './connections';

/**
 * What the user decided, as opposed to what the app shipped.
 *
 * Today that is one question — which connections the crew may reach — but the
 * shape is deliberately the general one: the catalog declares a default, this
 * file records only a departure from it, and nothing is written until the user
 * actually changes something. A preference absent here is not "off", it is
 * "whatever the catalog says", which is what lets a shipped default be changed
 * later without migrating anyone's settings.
 */
export interface StoredSettings {
  /** Connection name → the user's answer. */
  connections?: Record<string, boolean>;
  /**
   * Connection name → who it turned out to be ("brian@gmail.com"), recorded
   * when a connect flow learns it. Display only — never part of any gate.
   */
  identities?: Record<string, string>;
}

const FILE = 'settings.json';

export function readSettings(root: string): StoredSettings {
  const file = path.join(root, FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StoredSettings;
  } catch {
    return {};
  }
}

export function writeSettings(root: string, settings: StoredSettings): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, FILE), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/** The user's answer about one connection, or nothing if they never gave one. */
export function setConnection(
  settings: StoredSettings,
  name: string,
  enabled: boolean,
): StoredSettings {
  return { ...settings, connections: { ...settings.connections, [name]: enabled } };
}

/** Records who a connection turned out to be, for its card to say. */
export function setIdentity(
  settings: StoredSettings,
  name: string,
  identity: string,
): StoredSettings {
  return { ...settings, identities: { ...settings.identities, [name]: identity } };
}

/**
 * Whether a connection is live: the user's answer if they gave one, otherwise
 * the catalog's default — and never when a secret it declares is missing,
 * since a connection that cannot work is not a preference.
 *
 * This is the only place the question is answered. The quote, the router and
 * the executor all reach the same set through `grantedTools`, because a quote
 * that disagreed with the run about what the crew can reach would price a
 * different job from the one that happens: web access decides the free `fetch`
 * tier, so the two answers are dollars apart.
 */
export function connectionEnabled(
  connection: Connection,
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): boolean {
  if (missingSecrets(connection, env).length > 0) return false;
  return settings.connections?.[connection.name] ?? connection.defaultOn ?? false;
}

/** The connections live right now, in catalog order. */
export function enabledNames(
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): string[] {
  return connections.filter((c) => connectionEnabled(c, settings, env)).map((c) => c.name);
}

/**
 * What a job may reach: the connections that are on, narrowed to those the
 * caller named if it named any.
 *
 * Naming one can only ever *narrow*. That is a correction: this once let a
 * caller add any ready connection the user had not explicitly switched off,
 * reading D-005's "per-job opt-in" as a job being able to grant itself
 * something. Adding a browser is what made that plainly wrong — Settings
 * reports a connection as disabled, so a job reaching it anyway makes the
 * switch a lie, which is the D-032 defect one level up. Never switched on is
 * not the same as not switched off.
 *
 * Narrowing is still worth having, and is the honest reading of per-job
 * opt-in: a job that does not need the browser should not carry its tool
 * definitions, since every visible tool is overhead in every request.
 */
export function grantedTools(
  requested: string[] | undefined,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): string[] {
  const on = enabledNames(connections, settings, env);
  if (!requested?.length) return on;
  return on.filter((name) => requested.includes(name));
}
