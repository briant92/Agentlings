import { describe, expect, it } from 'vitest';
import { MAIL_TOOL_NAMES, callMail, previewMail } from './mail';
import type { Http } from './library';

/**
 * A fake Gmail: no network, answering the list and each message by id, and
 * recording what was actually asked.
 */
function fake(
  routes: Record<string, unknown>,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): { http: Http; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: Http = async (url, headers) => {
    calls.push({ url, headers });
    const id = /\/messages\/([^/?]+)/.exec(new URL(url).pathname)?.[1];
    return { ok, status, text: async () => JSON.stringify(id ? routes[id] : routes.list) };
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

// Arrival stamps built with the local constructor, and expectations rendered
// with the same clock the code uses, so the suite is green in any zone.
const ARRIVED = new Date(2026, 7, 17, 9, 14).getTime();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function when(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

/** The shapes Gmail actually returns. */
const INBOX = {
  list: { messages: [{ id: 'm1' }, { id: 'm2' }] },
  m1: {
    id: 'm1',
    snippet: 'el total es 95.700 &#8212; saludos',
    labelIds: ['UNREAD', 'INBOX'],
    internalDate: String(ARRIVED),
    payload: {
      headers: [
        { name: 'From', value: 'Ana García <ana@x.com>' },
        { name: 'Subject', value: 'Invoice August' },
      ],
    },
  },
  m2: {
    id: 'm2',
    snippet: '',
    labelIds: ['INBOX'],
    internalDate: String(ARRIVED - 3_600_000),
    payload: { headers: [{ name: 'From', value: 'noreply@bank.cl' }] },
  },
};

const LETTER = {
  m1: {
    id: 'm1',
    labelIds: ['UNREAD'],
    internalDate: String(ARRIVED),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: 'Ana García <ana@x.com>' },
        { name: 'To', value: 'brian@x.com' },
        { name: 'Subject', value: 'Invoice August' },
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain; charset="UTF-8"',
              body: { data: b64('Hola Brian,\nel total es 95.700.\n— Ana') },
            },
            { mimeType: 'text/html', body: { data: b64('<p>Hola <b>Brian</b></p>') } },
          ],
        },
        { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { size: 186368 } },
      ],
    },
  },
};

describe('callMail', () => {
  it('asks the list then one metadata call per hit, with the minted token, never the refresh token', async () => {
    const { http, calls } = fake(INBOX);
    const { mint, asked } = fakeMint();
    const got = await callMail('mail_search', { query: 'from:ana', max: 2 }, { http, env: ENV, mint });
    expect(got.error).toBeUndefined();

    expect(asked).toEqual([
      { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' },
    ]);
    expect(calls).toHaveLength(3);
    const list = new URL(calls[0].url);
    expect(calls[0].headers.authorization).toBe('Bearer access-token');
    expect(list.pathname).toContain('/users/me/messages');
    expect(list.searchParams.get('q')).toBe('from:ana');
    expect(list.searchParams.get('maxResults')).toBe('2');
    expect(calls[0].url).not.toContain('refresh-token');
    // Asked for only what a line renders, the calendar's rule.
    const get = new URL(calls[1].url);
    expect(get.pathname).toContain('/messages/m1');
    expect(get.searchParams.get('format')).toBe('metadata');
    expect(get.searchParams.getAll('metadataHeaders')).toEqual(['From', 'Subject']);
    expect(get.searchParams.get('fields')).toBe('id,snippet,labelIds,internalDate,payload/headers');
  });

  it('renders compact lines in the order Gmail answered, each ending in the id mail_read takes', async () => {
    const { http } = fake(INBOX);
    const got = await callMail(
      'mail_search',
      { query: 'from:ana', max: 2 },
      { http, env: ENV, mint: fakeMint().mint },
    );
    const lines = got.text!.split('\n');
    expect(lines[0]).toBe('2 messages for "from:ana", newest first, times local to this machine:');
    expect(lines[1]).toBe(
      `${when(ARRIVED)} — Ana García <ana@x.com> — Invoice August — unread — el total es 95.700 — saludos (id m1)`,
    );
    expect(lines[2]).toBe(`${when(ARRIVED - 3_600_000)} — noreply@bank.cl — (no subject) (id m2)`);
  });

  it('defaults the query to the inbox’s last day and clamps max into 1-50', async () => {
    const { http, calls } = fake({ list: {} });
    await callMail('mail_search', {}, { http, env: ENV, mint: fakeMint().mint });
    let params = new URL(calls[0].url).searchParams;
    expect(params.get('q')).toBe('in:inbox newer_than:1d');
    expect(params.get('maxResults')).toBe('25');

    await callMail('mail_search', { max: 999 }, { http, env: ENV, mint: fakeMint().mint });
    params = new URL(calls[1].url).searchParams;
    expect(params.get('maxResults')).toBe('50');
  });

  it('an empty mailbox is an answer, and costs no per-message calls', async () => {
    const { http, calls } = fake({ list: {} });
    const got = await callMail('mail_search', {}, { http, env: ENV, mint: fakeMint().mint });
    expect(got).toEqual({ text: 'No mail matches "in:inbox newer_than:1d".' });
    expect(calls).toHaveLength(1);
  });

  // The real API's zero-match shape, measured 2026-08-24 (D-248's proof found
  // it): a 204 with a ZERO-BYTE body when the fields mask leaves nothing to
  // say. Live since mail-read shipped and never seen, because the desk's
  // queries always matched something — a quiet trigger rule matches nothing
  // every two minutes forever, so nothing must read as an answer.
  it('a 204 with an empty body is "no matches", not "unreadable"', async () => {
    const http = async () => ({ ok: true, status: 204, text: async () => '' });
    const got = await callMail(
      'mail_search',
      { query: 'from:banco' },
      { http, env: ENV, mint: fakeMint().mint },
    );
    expect(got).toEqual({ text: 'No mail matches "from:banco".' });
  });

  it('says when the mailbox holds more matches than the page', async () => {
    const { http } = fake({ ...INBOX, list: { ...INBOX.list, nextPageToken: 'tok' } });
    const got = await callMail('mail_search', {}, { http, env: ENV, mint: fakeMint().mint });
    expect(got.text!.split('\n').at(-1)).toBe(
      '…the mailbox holds more matches than these 2 — narrow the query or raise max',
    );
  });

  it('refuses without a connected Google before anything reaches the network', async () => {
    const { http, calls } = fake(INBOX);
    const { mint, asked } = fakeMint();
    const got = await callMail(
      'mail_search',
      {},
      { http, env: { GOOGLE_OAUTH_CLIENT_ID: 'only-this' }, mint },
    );
    expect(got.error).toContain('Connect');
    expect(asked).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('refuses mail_read without an id before the mint is asked', async () => {
    const { http, calls } = fake(LETTER);
    const { mint, asked } = fakeMint();
    const got = await callMail('mail_read', {}, { http, env: ENV, mint });
    expect(got.error).toContain('id is required');
    expect(asked).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('hands a refused mint straight back — that sentence already names the fix', async () => {
    const { http, calls } = fake(INBOX);
    const { mint } = fakeMint({ error: 'Google has revoked this connection — Connect again.' });
    const got = await callMail('mail_search', {}, { http, env: ENV, mint });
    expect(got.error).toBe('Google has revoked this connection — Connect again.');
    expect(calls).toEqual([]);
  });

  it('turns the API walls into sentences the user can act on', async () => {
    const options = { env: ENV, mint: fakeMint().mint };
    // The wall every pre-consent call hits: the scope joined the walk after
    // this token was minted, and the sentence says the fresh sign-in is the fix.
    const scopes = fake(
      { list: { error: { message: 'Request had insufficient authentication scopes.' } } },
      { ok: false, status: 403 },
    );
    expect((await callMail('mail_search', {}, { ...options, http: scopes.http })).error).toContain(
      'Connect Google again',
    );

    const disabled = fake(
      { list: { error: { message: 'Gmail API has not been used in project 123 before or it is disabled.' } } },
      { ok: false, status: 403 },
    );
    expect((await callMail('mail_search', {}, { ...options, http: disabled.http })).error).toContain(
      'enable it in the Google console',
    );

    const other = fake({ list: { error: { message: 'backend error' } } }, { ok: false, status: 500 });
    expect((await callMail('mail_search', {}, { ...options, http: other.http })).error).toBe(
      'Google refused the mailbox — backend error',
    );
  });

  it('says when the mailbox could not be reached or the answer was unreadable', async () => {
    const boom: Http = async () => {
      throw new Error('socket hang up');
    };
    const options = { env: ENV, mint: fakeMint().mint };
    expect((await callMail('mail_search', {}, { ...options, http: boom })).error).toContain(
      'could not reach',
    );

    const junk: Http = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    expect((await callMail('mail_search', {}, { ...options, http: junk })).error).toContain(
      'unreadable',
    );
  });

  it('reads one mail: headers, the decoded text, attachments named and never fetched', async () => {
    const { http, calls } = fake(LETTER);
    const got = await callMail('mail_read', { id: 'm1' }, { http, env: ENV, mint: fakeMint().mint });
    expect(got.text!.split('\n')).toEqual([
      'From: Ana García <ana@x.com>',
      'To: brian@x.com',
      'Subject: Invoice August',
      `Received: ${when(ARRIVED)} — unread`,
      'Attachments (named, never fetched): invoice.pdf (182 KB)',
      '',
      'Hola Brian,',
      'el total es 95.700.',
      '— Ana',
    ]);
    // One call for the message and none for the attachment.
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get('format')).toBe('full');
  });

  it('reads an HTML-only mail as text, styles and tags gone', async () => {
    const html =
      '<div><style>p{color:red}</style><p>Hola <b>Brian</b></p><p>total&nbsp;95.700 &amp; IVA</p></div>';
    const { http } = fake({
      m9: {
        id: 'm9',
        internalDate: String(ARRIVED),
        payload: {
          headers: [{ name: 'From', value: 'a@b.c' }],
          mimeType: 'text/html',
          body: { data: b64(html) },
        },
      },
    });
    const got = await callMail('mail_read', { id: 'm9' }, { http, env: ENV, mint: fakeMint().mint });
    const body = got.text!.split('\n\n')[1];
    expect(body).toBe('Hola Brian\ntotal 95.700 & IVA');
  });

  it('trims a long body and says what it held', async () => {
    const { http } = fake({
      m9: {
        id: 'm9',
        internalDate: String(ARRIVED),
        payload: {
          headers: [{ name: 'From', value: 'a@b.c' }],
          mimeType: 'text/plain',
          body: { data: b64('a'.repeat(13000)) },
        },
      },
    });
    const got = await callMail('mail_read', { id: 'm9' }, { http, env: ENV, mint: fakeMint().mint });
    expect(got.text).toContain(
      '…trimmed — the mail holds 13000 characters, this is the first 12000.',
    );
  });

  it('grants exactly the two reading tools, and refuses any other name', async () => {
    expect(MAIL_TOOL_NAMES).toEqual(['mail_search', 'mail_read']);
    const { http } = fake(INBOX);
    const got = await callMail('list_messages', {}, { http, env: ENV, mint: fakeMint().mint });
    expect(got.error).toContain('no such tool');
  });
});

/**
 * The trigger preview (D-248): the desk's reach line runs through the same
 * search a session would, with the poll's own guard already applied — so the
 * preview and the firing can never disagree about what counts.
 */
describe('previewMail — what a trigger rule reaches (D-248)', () => {
  it('asks with the poll guard and the week window, and counts what came back', async () => {
    const { http, calls } = fake(INBOX);
    const got = await previewMail('from:banco', 10, { http, env: ENV, mint: fakeMint().mint });
    if ('error' in got) throw new Error(got.error);
    expect(new URL(calls[0].url).searchParams.get('q')).toBe('from:banco -from:me newer_than:7d');
    expect(got.count).toBe(2);
    expect(got.more).toBe(false);
    expect(got.newest).toContain('Invoice August');
    // The id is mail_read's business, not the desk's.
    expect(got.newest).not.toContain('(id ');
  });

  it('a zero-match 204 is a count of zero, not an error', async () => {
    const http: Http = async () => ({ ok: true, status: 204, text: async () => '' });
    const got = await previewMail('from:nobody', 10, { http, env: ENV, mint: fakeMint().mint });
    expect(got).toEqual({ count: 0, more: false });
  });

  it('refuses without Google, in the sentence the desk shows', async () => {
    const { http } = fake(INBOX);
    const got = await previewMail('from:banco', 10, { http, env: {}, mint: fakeMint().mint });
    expect('error' in got && got.error).toContain('Google is not connected');
  });
});
