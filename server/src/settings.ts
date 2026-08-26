import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NominaFormat, WirePayee, WireSettings } from '@agentlings/shared';
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
  /**
   * The supervised browser's two settings (D-255): bare hosts a run may
   * reach (and their subdomains), and the profile folder the person signed
   * into — absent means the default under the sandbox root. The app never
   * writes a credential into that folder; the browser does, when the person
   * logs in through the window.
   */
  browserAct?: { allow: string[]; profileDir?: string };
  /**
   * The wire's settings (D-268): the account a batch debits, the bank layout
   * it is composed in, and the payee allowlist. Absent means no charge
   * account and nobody approved — which refuses every batch, and is the right
   * default for money leaving.
   */
  wire?: { chargeAccount?: string; format?: NominaFormat; payees?: WirePayee[] };
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

/** Forgets who a connection was — the identity line goes with the secret (D-218). */
export function clearIdentity(settings: StoredSettings, name: string): StoredSettings {
  if (!settings.identities?.[name]) return settings;
  const identities = { ...settings.identities };
  delete identities[name];
  return { ...settings, identities };
}

/** Records the supervised browser's allowlist and profile folder; an empty folder means the default. */
export function setBrowserAct(
  settings: StoredSettings,
  value: { allow: string[]; profileDir: string },
): StoredSettings {
  const profileDir = value.profileDir.trim();
  return {
    ...settings,
    browserAct: { allow: value.allow, ...(profileDir ? { profileDir } : {}) },
  };
}

/**
 * The wire as everything reads it (D-268) — effective, never absent, so the
 * gate, the composer and the form all see one answer. An unset charge account
 * is the empty string rather than a missing field, because "not set yet" is
 * something the refusal has to be able to say.
 */
export function wireSettings(settings: StoredSettings): WireSettings {
  return {
    chargeAccount: settings.wire?.chargeAccount ?? '',
    format: settings.wire?.format ?? 'bci',
    payees: settings.wire?.payees ?? [],
  };
}

/**
 * Records the account a batch debits.
 *
 * The layout is deliberately not settable: one is built (D-268), and a route
 * validating a field with a single legal value is configurability nobody
 * asked for. When a second bank's column table lands, it gains a control
 * then — the stored field is read through `wireSettings` either way.
 */
export function setWire(settings: StoredSettings, chargeAccount: string): StoredSettings {
  return { ...settings, wire: { ...settings.wire, chargeAccount: chargeAccount.trim() } };
}

/**
 * Adds one payee, or replaces the one with that RUT.
 *
 * Replacing rather than appending is the point: two rows for one RUT would
 * make "which account does this payee use" a question with two answers, and
 * the composer takes the first — which is D-032's defect pointed at money.
 * Editing an account is therefore adding the payee again.
 */
export function addWirePayee(settings: StoredSettings, payee: WirePayee): StoredSettings {
  const payees = (settings.wire?.payees ?? []).filter((p) => p.rut !== payee.rut);
  return { ...settings, wire: { ...settings.wire, payees: [...payees, payee] } };
}

/** Takes one payee off the list, by RUT. */
export function removeWirePayee(settings: StoredSettings, rut: string): StoredSettings {
  const payees = (settings.wire?.payees ?? []).filter((p) => p.rut !== rut);
  return { ...settings, wire: { ...settings.wire, payees } };
}

/**
 * Bare lowercase hosts off a typed list — commas, spaces or newlines between
 * them, a pasted address reduced to its host. What the run's matcher sees
 * is only ever a host, so `https://Portal.Example.com/login` and
 * `portal.example.com` are one entry, and nothing that is not a host at all
 * gets in. Order kept, duplicates dropped.
 */
export function browserActHosts(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    let host = raw.toLowerCase();
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
      try {
        host = new URL(host).hostname;
      } catch {
        continue;
      }
    } else {
      host = host.split('/')[0]!.split(':')[0]!;
    }
    host = host.replace(/^\.+/, '').replace(/\.+$/, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) continue;
    if (!out.includes(host)) out.push(host);
  }
  return out;
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
 * What a job may reach: every connection that is on when the caller named
 * nothing, and exactly the named ones that are on when it passed a list —
 * so an empty list means none.
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
 *
 * An omitted list and an empty one are different answers. Omitted is a
 * caller that chose nothing — a person at the work bar — and gets what is
 * on; a list is a choice, and `[]` is the choice of no doors. This once
 * read the two the same (`!requested?.length`), so *none* could not be said
 * at all: D-254 found both schedule sweeps passing nothing and every rule
 * firing holding all eight doors, and the field #9 puts on a rule needs
 * an empty list to mean what it says.
 */
export function grantedTools(
  requested: string[] | undefined,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): string[] {
  // A sending channel is not something a job can reach, so it is not a tool
  // (D-097). Sends happen at approval, replayed by the server (D-075) — the
  // session gets no door here whether or not the connection is on, and the
  // job carries the channel on `Job.channel` rather than in this list.
  //
  // Excluded here rather than at the surface, so one answer serves the quote,
  // the router and the run: what a job may reach is asked in exactly one
  // place, which is the whole point of this function.
  const sending = new Set(connections.filter((c) => c.sendsOnly).map((c) => c.name));
  const on = enabledNames(connections, settings, env).filter((name) => !sending.has(name));
  // A supervised door (D-255) is never part of "whatever is on": a job holds
  // it only when its list NAMES it. So the switch in Settings makes it
  // holdable, not held — a person queuing an ordinary job does not get a
  // browser window opening on their screen, and a legacy schedule row (no
  // list, the old grant of everything) does not get a door no firing may
  // hold. The one way in is the work bar's own "watch" choice, or an API
  // caller naming it, both of which are a person choosing this job.
  const supervised = new Set(connections.filter((c) => c.supervised).map((c) => c.name));
  if (requested === undefined) return on.filter((name) => !supervised.has(name));
  return on.filter((name) => requested.includes(name));
}
