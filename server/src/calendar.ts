import type { Http } from './library';
import type { ToolSpec } from './github';
import { GOOGLE_SECRETS, accessTokenFromRefresh } from './google';

/**
 * Reading the user's own calendar — the first reading sibling on the Google
 * consent (D-158).
 *
 * The consent stored by the Connect flow has carried `calendar.events` since
 * the first Connect, and that scope grants reading as well as writing, so this
 * connection needs no OAuth step of its own: it reuses the three stored
 * secrets and is ready exactly when `google` is. What it deliberately does not
 * reuse is the switch or the grant — `google` stays a sender that grants a
 * session nothing, and one switch must never gate both reading and sending.
 *
 * Built like the code host, the search box and the statistics service: the
 * catalog's `tools` list is the grant checked at the door, the server makes
 * the call so it owns the size of the answer, and the credential never leaves
 * this process — an access token is minted from the stored refresh token per
 * call and never kept (google.ts's rule for sends, applied to reads).
 *
 * Deliberately absent from DOORS: a desk brief is live-data judgement work,
 * so a method that read the calendar must never compile into a $0 tool —
 * D-158's uncompilable-by-construction. The one caller this will ever have is
 * a session, which is why the result is `text` alone and not the two-caller
 * shape the BLS door carries.
 */

const DEFAULT_DAYS = 1;
const MAX_DAYS = 31;
/** Google's page size; the door reads one page and says when more exist. */
const PAGE = 250;
/** Lines shown before the tail is summarised — a day rarely holds ten. */
const SHOWN = 50;
const ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const CALENDAR_TOOLS: ToolSpec[] = [
  {
    name: 'calendar_events',
    description:
      "Read the user's own Google Calendar (the primary one): events between two days, soonest first — times as the calendar states them, title, whether a reply is still owed, how many people are invited, location. Defaults to today.",
    params: [
      {
        name: 'from',
        type: 'string',
        describe: 'first day to read, YYYY-MM-DD (default today)',
      },
      {
        name: 'days',
        type: 'number',
        describe: `how many days from there, 1-${MAX_DAYS} (default ${DEFAULT_DAYS} — that day alone)`,
      },
    ],
  },
];

export const CALENDAR_TOOL_NAMES = CALENDAR_TOOLS.map((t) => t.name);

export interface CalendarResult {
  text?: string;
  error?: string;
}

/** Injected so tests need no Google; defaults to the real refresh exchange. */
type Mint = (args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) => Promise<{ token: string } | { error: string }>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Mon 2026-08-17" from "2026-08-17". UTC on purpose: the weekday of a
 * calendar date is pure date arithmetic, and going through the machine's zone
 * would make the label depend on where the test runs.
 */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${ymd}`;
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The window, in the server's own zone — this app runs on the machine whose
 * calendar it reads (D-169), so local midnight is the user's midnight. Day
 * labels come from the Date's own components rather than `toISOString`, which
 * shifts a local midnight across the date line east of UTC.
 */
function window(
  from: unknown,
  days: number,
  now: number,
): { timeMin: string; timeMax: string; firstDay: string; lastDay: string } | { error: string } {
  let start: Date;
  if (from !== undefined) {
    const match = typeof from === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(from) : null;
    if (!match) return { error: 'from must be a day shaped YYYY-MM-DD' };
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    start = new Date(y, m - 1, d);
    if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) {
      return { error: `${from} is not a real day` };
    }
  } else {
    const today = new Date(now);
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstDay = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    firstDay,
    lastDay: addDays(firstDay, days - 1),
  };
}

interface RawEvent {
  summary?: unknown;
  location?: unknown;
  start?: { date?: unknown; dateTime?: unknown };
  end?: { date?: unknown; dateTime?: unknown };
  attendees?: { self?: unknown; responseStatus?: unknown }[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * One event as one compact line. Times are read textually off what Google
 * states — the calendar's own zone — rather than converted through the
 * machine's: a brief that says 08:30 must say what the calendar says.
 */
function line(e: RawEvent): string | null {
  const allDayStart = str(e.start?.date);
  const timedStart = str(e.start?.dateTime);
  let when: string;
  if (allDayStart) {
    // Google's all-day `end.date` is exclusive; the reader wants the last day.
    const lastDay = str(e.end?.date) ? addDays(str(e.end?.date), -1) : allDayStart;
    when =
      lastDay > allDayStart
        ? `${dayLabel(allDayStart)} – ${dayLabel(lastDay)} all day`
        : `${dayLabel(allDayStart)} all day`;
  } else if (timedStart) {
    const startDay = timedStart.slice(0, 10);
    const startTime = /T(\d{2}:\d{2})/.exec(timedStart)?.[1] ?? '';
    const timedEnd = str(e.end?.dateTime);
    const endDay = timedEnd.slice(0, 10);
    const endTime = /T(\d{2}:\d{2})/.exec(timedEnd)?.[1] ?? '';
    when = !endTime
      ? `${dayLabel(startDay)} ${startTime}`
      : endDay === startDay
        ? `${dayLabel(startDay)} ${startTime}–${endTime}`
        : `${dayLabel(startDay)} ${startTime} – ${dayLabel(endDay)} ${endTime}`;
  } else {
    return null;
  }

  const title = str(e.summary) || '(no title)';
  const parts = [`${when} — ${title}`];
  const mine = (e.attendees ?? []).find((a) => a.self === true);
  const response = str(mine?.responseStatus);
  if (response === 'needsAction') parts.push('awaiting your reply');
  else if (response === 'declined') parts.push('you declined');
  else if (response === 'tentative') parts.push('you said maybe');
  const invited = e.attendees?.length ?? 0;
  if (invited > 0) parts.push(`${invited} invited`);
  const location = str(e.location);
  if (location) parts.push(location);
  return parts.join(' — ');
}

/**
 * One page of the primary calendar as compact lines. `http` is injected so
 * tests need no network; `mint` so they need no Google.
 */
export async function callCalendar(
  tool: string,
  args: Record<string, unknown>,
  options: { http: Http; env: Record<string, string | undefined>; now?: number; mint?: Mint },
): Promise<CalendarResult> {
  if (tool !== 'calendar_events') return { error: `no such tool: ${tool}` };

  const wanted = typeof args.days === 'number' ? Math.trunc(args.days) : DEFAULT_DAYS;
  const days = Math.max(1, Math.min(MAX_DAYS, wanted || DEFAULT_DAYS));
  const span = window(args.from, days, options.now ?? Date.now());
  if ('error' in span) return { error: span.error };

  // Refused before anything reaches the network, like the BLS key: a
  // configuration answer now beats a refusal from Google at run time.
  const clientId = options.env[GOOGLE_SECRETS.clientId];
  const clientSecret = options.env[GOOGLE_SECRETS.clientSecret];
  const refreshToken = options.env[GOOGLE_SECRETS.refreshToken];
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      error:
        'Google is not connected, so the crew cannot read the calendar — open Settings and press Connect on the Google connection. Reading rides the same sign-in as sending.',
    };
  }

  const mint: Mint = options.mint ?? accessTokenFromRefresh;
  const access = await mint({ clientId, clientSecret, refreshToken });
  if ('error' in access) return { error: access.error };

  const url = new URL(ENDPOINT);
  url.searchParams.set('timeMin', span.timeMin);
  url.searchParams.set('timeMax', span.timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(PAGE));
  // Owning the size in both directions: Google is asked for only the fields
  // a line renders, so a description-heavy calendar costs what a bare one does.
  url.searchParams.set(
    'fields',
    'items(summary,location,start,end,attendees(self,responseStatus)),nextPageToken',
  );

  let res;
  try {
    res = await options.http(url.toString(), {
      authorization: `Bearer ${access.token}`,
      accept: 'application/json',
    });
  } catch (err) {
    return {
      error: `could not reach Google Calendar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let payload: { items?: unknown; nextPageToken?: unknown; error?: { message?: string } };
  try {
    payload = JSON.parse(await res.text()) as typeof payload;
  } catch {
    return { error: 'Google Calendar sent something unreadable' };
  }

  if (!res.ok) {
    // The People API's walls, word for word (D-104, D-123): the fix is a
    // sentence the user can act on, never a silently empty day.
    const message = payload.error?.message ?? `HTTP ${res.status}`;
    if (/insufficient/i.test(message)) {
      return {
        error:
          'Google needs a fresh sign-in for this — open Settings and press Connect Google again.',
      };
    }
    if (/disabled|has not been used/i.test(message)) {
      return {
        error:
          'Google says the Calendar API is off for your project — enable it in the Google console (APIs & Services → Library → Google Calendar API), then try again.',
      };
    }
    return { error: `Google refused the calendar — ${message}` };
  }

  const lines = (Array.isArray(payload.items) ? (payload.items as RawEvent[]) : [])
    .map(line)
    .filter((l): l is string => l !== null);

  const range =
    span.firstDay === span.lastDay
      ? `on ${dayLabel(span.firstDay)}`
      : `between ${dayLabel(span.firstDay)} and ${dayLabel(span.lastDay)}`;
  if (lines.length === 0) return { text: `No events ${range}.` };

  const head = `${lines.length} event${lines.length === 1 ? '' : 's'} ${range}, times as the calendar states them:`;
  const shown = lines.slice(0, SHOWN);
  const tail: string[] = [];
  if (lines.length > SHOWN) tail.push(`…and ${lines.length - SHOWN} more in this window`);
  if (str(payload.nextPageToken)) {
    tail.push(`the window holds more than ${PAGE} events — ask for fewer days`);
  }
  return { text: [head, ...shown, ...tail].join('\n') };
}
