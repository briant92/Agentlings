import type { Http } from './library';
import { GOOGLE_SECRETS, accessTokenFromRefresh } from './google';
import { fetchTriggerMail, listMailIds, type TriggerMail } from './mail';
import type { Schedule } from './schedules';

/**
 * The mail-trigger poll (D-248): the server, not a session, asks Gmail what
 * arrived — the same shape as the D-103 sweep, extended from "a time came
 * due" to "a mail came in". No LLM is anywhere in the loop; a firing costs
 * money only because the job it queues does, exactly like a cadence firing.
 *
 * Three guards are unconditional, because the failure they close is a loop
 * that spends money on its own echo:
 * - `-from:me` rides every poll query, so the user's own sends — including
 *   every reply this app's outbox ever sends — can never fire a rule.
 * - A message id fires once, held in the rule's seen ring; Gmail's `after:`
 *   is second-granular, so the watermark alone is not the boundary.
 * - A daily cap per rule. Mail past the cap never fires later either — a
 *   backlog firing at midnight is the surprise the cap exists to prevent —
 *   and the row says how many were skipped rather than skipping silently.
 */

/** How often the server polls the rules. Slower than the cadence sweep on purpose: each poll is a token mint plus Gmail calls. */
export const MAIL_TRIGGER_SWEEP_MS = 120_000;

/** Firings one rule may cause per local day. */
export const MAX_TRIGGER_FIRES_PER_DAY = 10;

/** Matches one poll bothers listing — more than this arriving between polls is a broad rule, and the cap is about to say so anyway. */
export const TRIGGER_POLL_MAX = 10;

/** The query as it actually reaches Gmail: the rule's own terms, never the user's own sends, nothing before the watermark. */
export function triggerQuery(query: string, sinceMs: number): string {
  return `${query} -from:me after:${Math.floor(sinceMs / 1000)}`;
}

/** The local calendar day the cap counts in, as YYYY-MM-DD. */
export function localDay(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Mint = (args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) => Promise<{ token: string } | { error: string }>;

export interface TriggerPoll {
  /** Oldest first, so multiple arrivals queue in the order they came. */
  fired: TriggerMail[];
  /** Matches the daily cap refused. Recorded on the row, never fired later. */
  skippedByCap: number;
  /** New watermark and seen ring, for noteTriggerPoll. */
  sinceMs: number;
  seen: string[];
  day: string;
}

/**
 * One rule, one poll. Pure over the row — nothing here writes; the caller
 * records the result through noteTriggerPoll and queues the firings. Any
 * fetch failing aborts the whole poll with nothing advanced, so the next
 * poll retries the same window rather than half-remembering this one.
 */
export async function pollTrigger(
  schedule: Schedule,
  now: number,
  options: { http: Http; env: Record<string, string | undefined>; mint?: Mint },
): Promise<TriggerPoll | { error: string }> {
  if (!schedule.trigger) return { error: 'not a mail-triggered schedule' };
  const clientId = options.env[GOOGLE_SECRETS.clientId];
  const clientSecret = options.env[GOOGLE_SECRETS.clientSecret];
  const refreshToken = options.env[GOOGLE_SECRETS.refreshToken];
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      error:
        'Google is not connected, so mail cannot fire this — open Settings and press Connect on the Google connection.',
    };
  }
  const mint: Mint = options.mint ?? accessTokenFromRefresh;
  const access = await mint({ clientId, clientSecret, refreshToken });
  if ('error' in access) return { error: access.error };

  const state = schedule.triggerState ?? { sinceMs: schedule.createdAt, seen: [] };
  const listed = await listMailIds(
    options.http,
    access.token,
    triggerQuery(schedule.trigger.mail, state.sinceMs),
    TRIGGER_POLL_MAX,
  );
  if ('error' in listed) return listed;

  const seen = new Set(state.seen);
  const fresh = listed.ids.filter((id) => !seen.has(id));
  const day = localDay(now);
  const already = state.day === day ? (state.count ?? 0) : 0;
  const capacity = Math.max(0, MAX_TRIGGER_FIRES_PER_DAY - already);

  const mails: TriggerMail[] = [];
  for (const id of fresh) {
    const mail = await fetchTriggerMail(options.http, access.token, id);
    if ('error' in mail) return mail;
    mails.push(mail);
  }
  mails.sort((a, b) => a.arrivedMs - b.arrivedMs);
  const fired = mails.slice(0, capacity);
  const skippedByCap = mails.length - fired.length;

  const sinceMs = mails.reduce((max, m) => Math.max(max, m.arrivedMs), state.sinceMs);
  return {
    fired,
    skippedByCap,
    sinceMs,
    // Capped ones enter the ring too: past the cap means never, not later.
    seen: [...state.seen, ...mails.map((m) => m.id)],
    day,
  };
}
