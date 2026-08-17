import { describe, expect, it } from 'vitest';
import { CALENDAR_TOOL_NAMES, callCalendar } from './calendar';
import type { Http } from './library';

/** A fake Calendar API: no network, recording what was actually asked. */
function fake(
  payload: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): { http: Http; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: Http = async (url, headers) => {
    calls.push({ url, headers });
    return { ok, status, text: async () => JSON.stringify(payload) };
  };
  return { http, calls };
}

/** A mint that answers without Google, recording that it was asked. */
function fakeMint(reply: { token: string } | { error: string } = { token: 'access-token' }) {
  const asked: object[] = [];
  return {
    asked,
    mint: async (args: object) => {
      asked.push(args);
      return reply;
    },
  };
}

const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
};

// A fixed clock: Sunday 16 August 2026, mid-afternoon.
const NOW = new Date(2026, 7, 16, 14, 30).getTime();

/** The shapes Google actually returns — 2026-08-17 is a Monday. */
const WEEK = {
  items: [
    {
      summary: 'Expenses review',
      location: 'Room 2',
      start: { dateTime: '2026-08-17T08:30:00-04:00' },
      end: { dateTime: '2026-08-17T09:15:00-04:00' },
      attendees: [
        { self: true, responseStatus: 'needsAction' },
        { responseStatus: 'accepted' },
        { responseStatus: 'accepted' },
      ],
    },
    {
      summary: 'Overnight deploy',
      start: { dateTime: '2026-08-17T23:00:00-04:00' },
      end: { dateTime: '2026-08-18T01:00:00-04:00' },
    },
    {
      summary: 'Feriado',
      start: { date: '2026-08-18' },
      end: { date: '2026-08-19' },
    },
    {
      summary: 'Offsite',
      start: { date: '2026-08-19' },
      end: { date: '2026-08-22' },
    },
    {
      start: { dateTime: '2026-08-20T10:00:00-04:00' },
      end: { dateTime: '2026-08-20T10:30:00-04:00' },
      attendees: [{ self: true, responseStatus: 'declined' }],
    },
  ],
};

describe('callCalendar', () => {
  it('asks for the window with the minted token, never the refresh token', async () => {
    const { http, calls } = fake(WEEK);
    const { mint, asked } = fakeMint();
    const got = await callCalendar(
      'calendar_events',
      { from: '2026-08-17', days: 7 },
      { http, env: ENV, now: NOW, mint },
    );
    expect(got.error).toBeUndefined();

    expect(asked).toEqual([
      { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' },
    ]);
    const [call] = calls;
    expect(call.headers.authorization).toBe('Bearer access-token');
    expect(call.url).toContain('/calendars/primary/events');
    expect(call.url).not.toContain('refresh-token');
    const params = new URL(call.url).searchParams;
    // Local midnights, computed here with the same constructor so the
    // expectation holds in any zone the test runs in.
    expect(params.get('timeMin')).toBe(new Date(2026, 7, 17).toISOString());
    expect(params.get('timeMax')).toBe(new Date(2026, 7, 24).toISOString());
    expect(params.get('singleEvents')).toBe('true');
    expect(params.get('orderBy')).toBe('startTime');
  });

  it('renders compact lines with times as the calendar states them', async () => {
    const { http } = fake(WEEK);
    const got = await callCalendar(
      'calendar_events',
      { from: '2026-08-17', days: 7 },
      { http, env: ENV, now: NOW, mint: fakeMint().mint },
    );
    const lines = got.text!.split('\n');
    expect(lines[0]).toBe('5 events between Mon 2026-08-17 and Sun 2026-08-23, times as the calendar states them:');
    expect(lines[1]).toBe('Mon 2026-08-17 08:30–09:15 — Expenses review — awaiting your reply — 3 invited — Room 2');
    expect(lines[2]).toBe('Mon 2026-08-17 23:00 – Tue 2026-08-18 01:00 — Overnight deploy');
    expect(lines[3]).toBe('Tue 2026-08-18 all day — Feriado');
    // All-day ends are exclusive at Google and inclusive to a reader.
    expect(lines[4]).toBe('Wed 2026-08-19 – Fri 2026-08-21 all day — Offsite');
    expect(lines[5]).toBe('Thu 2026-08-20 10:00–10:30 — (no title) — you declined — 1 invited');
  });

  it('defaults to today alone, from the clock it was handed', async () => {
    const { http, calls } = fake({ items: [] });
    const got = await callCalendar('calendar_events', {}, { http, env: ENV, now: NOW, mint: fakeMint().mint });
    const params = new URL(calls[0].url).searchParams;
    expect(params.get('timeMin')).toBe(new Date(2026, 7, 16).toISOString());
    expect(params.get('timeMax')).toBe(new Date(2026, 7, 17).toISOString());
    // An empty day is an answer, not an error.
    expect(got).toEqual({ text: 'No events on Sun 2026-08-16.' });
  });

  it('clamps days into 1-31 rather than refusing', async () => {
    const { http, calls } = fake({ items: [] });
    await callCalendar(
      'calendar_events',
      { from: '2026-08-17', days: 99 },
      { http, env: ENV, now: NOW, mint: fakeMint().mint },
    );
    const params = new URL(calls[0].url).searchParams;
    expect(params.get('timeMax')).toBe(new Date(2026, 7, 17 + 31).toISOString());
  });

  it('refuses a from that is not a day', async () => {
    const { http, calls } = fake({ items: [] });
    const options = { http, env: ENV, now: NOW, mint: fakeMint().mint };
    expect((await callCalendar('calendar_events', { from: '17/08/2026' }, options)).error).toContain(
      'YYYY-MM-DD',
    );
    expect((await callCalendar('calendar_events', { from: '2026-02-31' }, options)).error).toContain(
      'not a real day',
    );
    expect(calls).toEqual([]);
  });

  it('refuses without a connected Google before anything reaches the network', async () => {
    const { http, calls } = fake(WEEK);
    const { mint, asked } = fakeMint();
    const got = await callCalendar(
      'calendar_events',
      {},
      { http, env: { GOOGLE_OAUTH_CLIENT_ID: 'only-this' }, now: NOW, mint },
    );
    expect(got.error).toContain('Connect');
    expect(asked).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('hands a refused mint straight back — that sentence already names the fix', async () => {
    const { http, calls } = fake(WEEK);
    const { mint } = fakeMint({ error: 'Google has revoked this connection — Connect again.' });
    const got = await callCalendar('calendar_events', {}, { http, env: ENV, now: NOW, mint });
    expect(got.error).toBe('Google has revoked this connection — Connect again.');
    expect(calls).toEqual([]);
  });

  it('turns the API walls into sentences the user can act on', async () => {
    const disabled = fake(
      { error: { message: 'Google Calendar API has not been used in project 123 before or it is disabled.' } },
      { ok: false, status: 403 },
    );
    const options = { env: ENV, now: NOW, mint: fakeMint().mint };
    expect(
      (await callCalendar('calendar_events', {}, { ...options, http: disabled.http })).error,
    ).toContain('enable it in the Google console');

    const scopes = fake(
      { error: { message: 'Request had insufficient authentication scopes.' } },
      { ok: false, status: 403 },
    );
    expect(
      (await callCalendar('calendar_events', {}, { ...options, http: scopes.http })).error,
    ).toContain('Connect Google again');

    const other = fake({ error: { message: 'backend error' } }, { ok: false, status: 500 });
    expect(
      (await callCalendar('calendar_events', {}, { ...options, http: other.http })).error,
    ).toBe('Google refused the calendar — backend error');
  });

  it('says when the door could not be reached or the answer was unreadable', async () => {
    const boom: Http = async () => {
      throw new Error('socket hang up');
    };
    const options = { env: ENV, now: NOW, mint: fakeMint().mint };
    expect((await callCalendar('calendar_events', {}, { ...options, http: boom })).error).toContain(
      'could not reach',
    );

    const junk: Http = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    expect((await callCalendar('calendar_events', {}, { ...options, http: junk })).error).toContain(
      'unreadable',
    );
  });

  it('summarises past fifty lines and says when the page was not the whole window', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      summary: `Meeting ${i + 1}`,
      start: { dateTime: '2026-08-17T09:00:00-04:00' },
      end: { dateTime: '2026-08-17T09:30:00-04:00' },
    }));
    const { http } = fake({ items, nextPageToken: 'tok' });
    const got = await callCalendar(
      'calendar_events',
      { from: '2026-08-17', days: 31 },
      { http, env: ENV, now: NOW, mint: fakeMint().mint },
    );
    const lines = got.text!.split('\n');
    // head + 50 shown + the two tail notes
    expect(lines).toHaveLength(53);
    expect(lines.at(-2)).toBe('…and 10 more in this window');
    expect(lines.at(-1)).toContain('more than 250 events');
  });

  it('is the one tool the connection grants, and refuses any other name', async () => {
    expect(CALENDAR_TOOL_NAMES).toEqual(['calendar_events']);
    const { http } = fake(WEEK);
    const got = await callCalendar('list_events', {}, { http, env: ENV, mint: fakeMint().mint });
    expect(got.error).toContain('no such tool');
  });
});
