import type { AuthStatus, ConnectionInfo, DoorUsage } from '@agentlings/shared';

/**
 * The Settings boards, as facts (UI.md, step 15): which tab a connection
 * belongs on, what the door trail says beside each read door, what a
 * connection that is not ready still needs, and who the executor is signed
 * in as. Pure, so every line can be pinned without a DOM.
 */

export type Tab = 'reads' | 'sends' | 'app';

/** The board the browser last left open, else reads — where a door is flipped. */
export function tabOf(saved: string | null): Tab {
  return saved === 'sends' || saved === 'app' ? saved : 'reads';
}

/** Reads and sends in the catalog's order, by the connection's own kind (UI.md, step 7). */
export function byKind(connections: readonly ConnectionInfo[]): {
  reads: ConnectionInfo[];
  sends: ConnectionInfo[];
} {
  return {
    reads: connections.filter((c) => c.kind === 'read'),
    sends: connections.filter((c) => c.kind === 'send'),
  };
}

/**
 * The reads board's two tiers (D-226): a read that holds no secret and is on
 * by default (`web`, `render` — nothing to configure, nothing to decide)
 * reads as one summary line rather than a row apiece; everything else is a
 * source the user actually manages, and keeps its own row. Both conditions
 * are needed: `browser` holds no secret either, but it is off until chosen,
 * so it is a decision and not an always-on.
 */
export function splitReads(reads: readonly ConnectionInfo[]): {
  alwaysOn: ConnectionInfo[];
  sources: ConnectionInfo[];
} {
  const always = (c: ConnectionInfo) => !c.credentialed && c.defaultOn;
  return {
    alwaysOn: reads.filter(always),
    sources: reads.filter((c) => !always(c)),
  };
}

/** When the door trail began: the earliest call on any door, or null before the first. */
export function trailBegan(doors: readonly DoorUsage[]): number | null {
  if (doors.length === 0) return null;
  return Math.min(...doors.map((d) => d.firstAt));
}

/** "Aug 18" — the same slice the backoffice rows and the facts strip read. */
function day(at: number): string {
  return new Date(at).toDateString().slice(4, 10);
}

/** "today 08:13", else "Aug 18 17:03". */
function when(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toTimeString().slice(0, 5);
  return d.toDateString() === new Date(now).toDateString() ? `today ${time}` : `${day(at)} ${time}`;
}

/**
 * The row's fact: how often the door was knocked on and when last, or that
 * nobody has since the trail began — which is a fact about the door, not a
 * blank. Null before any door was ever called: there is no trail to read.
 *
 * `trailed` is whether this connection's calls pass the door trail at all: a
 * builtin door is served by the server, which logs it (D-192); a stdio
 * connection like the browser runs as its own MCP process and never comes
 * this way, so the trail's silence says nothing about it and no claim is
 * made (review of 2026-08-22).
 */
export type UsageFact = { used: number; last: string } | { unusedSince: string };

export function usageFact(
  usage: DoorUsage | undefined,
  began: number | null,
  now: number,
  trailed: boolean,
): UsageFact | null {
  if (usage) return { used: usage.calls, last: when(usage.lastAt, now) };
  if (began === null || !trailed) return null;
  return { unusedSince: day(began) };
}

/**
 * The open row's line: since when, calls per tool (most first), refusals,
 * and the last call. A refusal is a call the door answered with an error —
 * the trail's own `ok: false` (D-192).
 */
export function usageDetail(
  usage: DoorUsage | undefined,
  began: number | null,
  now: number,
  trailed: boolean,
): string | null {
  if (!usage && !trailed) return 'not on the door trail — it runs as its own process, so no call is counted here';
  if (began === null) return null;
  const since = `since the trail began on ${day(began)}`;
  if (!usage) return `no call ${since}`;
  const tools = Object.entries(usage.tools)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tool, n]) => `${tool} ${n}`);
  const refused = usage.errors === 0 ? 'none refused' : `${usage.errors} refused`;
  return [since, ...tools, refused, `last call ${when(usage.lastAt, now)}`].join(' · ');
}

/** The note under the reads board: where the counts come from, or that there are none yet. */
export function trailNote(doors: readonly DoorUsage[] | null): string {
  if (doors === null) return '';
  const began = trailBegan(doors);
  if (began === null) return 'No door has been called yet — counts appear here from the first call.';
  return `Counts come from the door trail, which began on ${day(began)}.`;
}

/** What a connection that is not ready still needs, and the words on its link. */
export function needsLine(connection: Pick<ConnectionInfo, 'missingSecrets'>): {
  text: string;
  link: string;
} {
  const n = connection.missingSecrets.length;
  return n === 1
    ? { text: `needs ${connection.missingSecrets[0]}`, link: 'add it here' }
    : { text: `needs ${n} secrets`, link: 'add them here' };
}

/** Where the sessions' credentials come from, in plain words beside the executor. */
export function authWording(source: AuthStatus['source']): string {
  switch (source) {
    case 'api-key':
      return 'signed in with an API key from .env';
    case 'oauth-token':
      return 'signed in with an OAuth token from .env';
    case 'stored-login':
      return 'signed in with your stored Claude login';
    case 'none':
      return 'no credentials found';
  }
}

/**
 * The Disconnect link's label (D-218): plain until armed, then the question
 * with who else goes — the Google trio share one sign-in, so forgetting it on
 * one row forgets it on all three, and the label says so before the press.
 */
export function disconnectLabel(
  connection: Pick<ConnectionInfo, 'sharesSecretsWith'>,
  armed: boolean,
  busy: boolean,
): string {
  if (busy) return 'disconnecting…';
  if (!armed) return 'disconnect';
  const others = connection.sharesSecretsWith;
  return others.length === 0 ? 'sure? disconnect' : `sure? disconnect — also ${others.join(', ')}`;
}

/** What disconnecting does, in one clause beside the link. */
export function disconnectWording(connection: Pick<ConnectionInfo, 'name' | 'sharesSecretsWith'>): string {
  const google = connection.name === 'google' || connection.sharesSecretsWith.includes('google');
  return google
    ? 'revokes the sign-in at Google and forgets its three lines in .env; the switch goes off'
    : 'forgets the token in .env — the line stays, commented, for the next paste; the switch goes off';
}
