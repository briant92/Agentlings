import type { Http } from './library';
import type { ToolSpec } from './github';
import { GOOGLE_SECRETS, accessTokenFromRefresh } from './google';

/**
 * Reading the user's own mail — the second reading sibling on the Google
 * consent (D-158), built on the calendar's exact frame.
 *
 * Unlike the calendar, the stored consent does not already carry this scope:
 * `gmail.readonly` joins the walk with this connection, so a token minted
 * before it needs one fresh Connect — until then Google answers "insufficient
 * scopes" and the wall below turns that into the sentence naming the fix.
 *
 * Two tools rather than one, on the house's own split (D-053: search returns
 * pointers, reading is a separate step): `mail_search` finds messages with
 * Gmail's native query language and answers compact lines, `mail_read` takes
 * one id from those lines and answers the message's text. Attachments are
 * named, never fetched — a run that needs a file's content asks the user.
 *
 * Deliberately absent from DOORS: mail is live-data judgement work, so a
 * method that read the mailbox must never compile into a $0 tool — D-158's
 * uncompilable-by-construction, same as the calendar.
 */

const DEFAULT_QUERY = 'in:inbox newer_than:1d';
const DEFAULT_MAX = 25;
const MAX_MAX = 50;
/** One message's rendered text is capped like a code-host page (D-053). */
const MAX_BODY_CHARS = 12000;
const MESSAGES = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const THREADS = 'https://gmail.googleapis.com/gmail/v1/users/me/threads';

export const MAIL_TOOLS: ToolSpec[] = [
  {
    name: 'mail_search',
    description:
      "Search the user's own Gmail with Gmail's query language (from:ana@x.com, is:unread, subject:invoice, has:attachment, newer_than:7d) — newest first, one compact line per message: when it arrived, sender, subject, unread, the first words, and the id mail_read takes. Defaults to the inbox's last day.",
    params: [
      {
        name: 'query',
        type: 'string',
        describe: `a Gmail search query (default "${DEFAULT_QUERY}")`,
      },
      {
        name: 'max',
        type: 'number',
        describe: `how many messages, 1-${MAX_MAX} (default ${DEFAULT_MAX})`,
      },
    ],
  },
  {
    name: 'mail_read',
    description:
      'Read one mail by the id mail_search returned: sender, recipients, subject, when it arrived, and the message text. Attachments are named, never fetched.',
    params: [
      {
        name: 'id',
        type: 'string',
        required: true,
        describe: 'a message id from mail_search',
      },
    ],
  },
];

export const MAIL_TOOL_NAMES = MAIL_TOOLS.map((t) => t.name);

export interface MailResult {
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
 * "Sun 2026-08-17 09:14" from Gmail's arrival stamp, in this machine's own
 * clock. The calendar reads times textually because a calendar states its
 * zone; a mail states none, and this app runs on the machine whose mailbox it
 * reads (D-169), so local receipt time is the honest rendering.
 */
function when(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The few entities Gmail's snippets and simple HTML bodies actually carry. */
function unescapeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * A mail that only exists as HTML still gets read: styles and scripts go,
 * block ends become line breaks, tags become spaces, entities resolve, and
 * whitespace collapses. Crude on purpose — layout is not the content.
 */
function htmlToText(html: string): string {
  const noBlocks = html.replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const broken = noBlocks.replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>|<br\s*\/?>/gi, '\n');
  const stripped = broken.replace(/<[^>]+>/g, ' ');
  const lines = unescapeEntities(stripped)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  return lines
    .filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== ''))
    .join('\n')
    .trim();
}

interface RawPart {
  mimeType?: unknown;
  filename?: unknown;
  body?: { data?: unknown; size?: unknown; attachmentId?: unknown };
  parts?: RawPart[];
}

interface RawMessage {
  id?: unknown;
  threadId?: unknown;
  snippet?: unknown;
  labelIds?: unknown;
  internalDate?: unknown;
  payload?: RawPart & { headers?: { name?: unknown; value?: unknown }[] };
}

/** Depth-first, so a multipart/alternative's leaves arrive in Gmail's order. */
function flatten(part: RawPart | undefined): RawPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

function decodeBody(part: RawPart): string {
  const data = str(part.body?.data);
  if (!data) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function header(message: RawMessage, name: string): string {
  const found = (message.payload?.headers ?? []).find(
    (h) => str(h.name).toLowerCase() === name.toLowerCase(),
  );
  return str(found?.value);
}

function unread(message: RawMessage): boolean {
  return Array.isArray(message.labelIds) && message.labelIds.includes('UNREAD');
}

export function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One search hit as one compact line, ending in the id `mail_read` takes. */
function line(message: RawMessage): string {
  const arrived = Number(str(message.internalDate));
  const parts = [
    `${Number.isFinite(arrived) && arrived > 0 ? when(arrived) : '(no date)'} — ${header(message, 'From') || '(no sender)'} — ${header(message, 'Subject') || '(no subject)'}`,
  ];
  if (unread(message)) parts.push('unread');
  const snippet = unescapeEntities(str(message.snippet));
  if (snippet) parts.push(snippet);
  return `${parts.join(' — ')} (id ${str(message.id)})`;
}

/**
 * The mail walls, word for word where the calendar's fit (D-104, D-123): the
 * fix is a sentence the user can act on, never a silently empty mailbox.
 */
function wall(status: number, message: string): string {
  if (/insufficient/i.test(message)) {
    return 'Google needs a fresh sign-in for this — open Settings and press Connect Google again. Reading mail is a consent the stored sign-in does not carry yet.';
  }
  if (/disabled|has not been used/i.test(message)) {
    return 'Google says the Gmail API is off for your project — enable it in the Google console (APIs & Services → Library → Gmail API), then try again.';
  }
  return `Google refused the mailbox — ${message || `HTTP ${status}`}`;
}

async function fetchJson(
  http: Http,
  url: string,
  token: string,
): Promise<{ payload: Record<string, unknown> } | { error: string }> {
  let res;
  try {
    res = await http(url, { authorization: `Bearer ${token}`, accept: 'application/json' });
  } catch (err) {
    return {
      error: `could not reach Gmail: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let payload: Record<string, unknown> & { error?: { message?: string } };
  try {
    // A zero-match list is a 204 with a zero-byte body when the fields mask
    // leaves nothing to say (measured against the real API, 2026-08-24 —
    // found by D-248's proof, live since mail-read shipped, never seen
    // because the desk's queries always matched something). Nothing is a
    // valid answer, not something unreadable — and it is the steady state
    // of every quiet trigger rule.
    const raw = await res.text();
    payload = raw.trim() === '' ? {} : (JSON.parse(raw) as typeof payload);
  } catch {
    return { error: 'Gmail sent something unreadable' };
  }
  if (!res.ok) return { error: wall(res.status, payload.error?.message ?? '') };
  return { payload };
}

/**
 * Both mail tools behind one call, like the calendar: `http` is injected so
 * tests need no network, `mint` so they need no Google. An access token is
 * minted from the stored refresh token per call and never kept.
 */
export async function callMail(
  tool: string,
  args: Record<string, unknown>,
  options: { http: Http; env: Record<string, string | undefined>; mint?: Mint },
): Promise<MailResult> {
  if (tool !== 'mail_search' && tool !== 'mail_read') return { error: `no such tool: ${tool}` };

  // Refused before anything reaches the network, like the calendar: a
  // configuration answer now beats a refusal from Google at run time.
  const clientId = options.env[GOOGLE_SECRETS.clientId];
  const clientSecret = options.env[GOOGLE_SECRETS.clientSecret];
  const refreshToken = options.env[GOOGLE_SECRETS.refreshToken];
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      error:
        'Google is not connected, so the crew cannot read mail — open Settings and press Connect on the Google connection. Reading rides the same sign-in as sending.',
    };
  }

  if (tool === 'mail_read' && !str(args.id)) {
    return { error: 'id is required — pass a message id from mail_search' };
  }

  const mint: Mint = options.mint ?? accessTokenFromRefresh;
  const access = await mint({ clientId, clientSecret, refreshToken });
  if ('error' in access) return { error: access.error };

  return tool === 'mail_search'
    ? search(args, options.http, access.token)
    : read(str(args.id), options.http, access.token);
}

/**
 * The hits for a query as compact lines, newest first, plus whether the
 * mailbox held more than were listed. The body of `mail_search`, split out so
 * the trigger preview (D-248) can count and quote the newest match through
 * exactly the search a session would run — one search, two callers.
 */
export async function searchLines(
  http: Http,
  token: string,
  query: string,
  max: number,
): Promise<{ lines: string[]; more: boolean } | { error: string }> {
  const listUrl = new URL(MESSAGES);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(max));
  listUrl.searchParams.set('fields', 'messages(id),nextPageToken');
  const listed = await fetchJson(http, listUrl.toString(), token);
  if ('error' in listed) return listed;

  const ids = (Array.isArray(listed.payload.messages) ? (listed.payload.messages as { id?: unknown }[]) : [])
    .map((m) => str(m.id))
    .filter((id) => id !== '');
  if (ids.length === 0) return { lines: [], more: false };

  // One metadata call per hit, in parallel — Gmail's list answers ids alone.
  // Asked for only the fields a line renders (the calendar's rule), so a
  // newsletter-heavy inbox costs what a bare one does.
  const fetched = await Promise.all(
    ids.map((id) => {
      const getUrl = new URL(`${MESSAGES}/${encodeURIComponent(id)}`);
      getUrl.searchParams.set('format', 'metadata');
      getUrl.searchParams.append('metadataHeaders', 'From');
      getUrl.searchParams.append('metadataHeaders', 'Subject');
      getUrl.searchParams.set('fields', 'id,snippet,labelIds,internalDate,payload/headers');
      return fetchJson(http, getUrl.toString(), token);
    }),
  );
  const failed = fetched.find((f) => 'error' in f);
  if (failed && 'error' in failed) return failed;

  return {
    lines: fetched.map((f) => line(('payload' in f ? f.payload : {}) as RawMessage)),
    more: str(listed.payload.nextPageToken) !== '',
  };
}

async function search(
  args: Record<string, unknown>,
  http: Http,
  token: string,
): Promise<MailResult> {
  const query = str(args.query) || DEFAULT_QUERY;
  const wanted = typeof args.max === 'number' ? Math.trunc(args.max) : DEFAULT_MAX;
  const max = Math.max(1, Math.min(MAX_MAX, wanted || DEFAULT_MAX));

  const got = await searchLines(http, token, query, max);
  if ('error' in got) return got;
  if (got.lines.length === 0) return { text: `No mail matches "${query}".` };
  const head = `${got.lines.length} message${got.lines.length === 1 ? '' : 's'} for "${query}", newest first, times local to this machine:`;
  const tail = got.more
    ? [`…the mailbox holds more matches than these ${got.lines.length} — narrow the query or raise max`]
    : [];
  return { text: [head, ...got.lines, ...tail].join('\n') };
}

/**
 * What a trigger query would reach (D-248): how many of the last week's
 * mails match — with the poll's own `-from:me` already applied, so the
 * preview and the poll can never disagree about what counts — and the newest
 * one in words. `count` is capped at `max`; `more` says the mailbox held
 * beyond it, which for a rule that fires a paid job is the fact that matters.
 */
export async function previewMail(
  query: string,
  max: number,
  options: { http: Http; env: Record<string, string | undefined>; mint?: Mint },
): Promise<{ count: number; more: boolean; newest?: string } | { error: string }> {
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
  const got = await searchLines(
    options.http,
    access.token,
    `${query} -from:me newer_than:7d`,
    max,
  );
  if ('error' in got) return got;
  // The line ends in the id mail_read takes; the desk has no use for it.
  const newest = got.lines[0]?.replace(/\s*\(id [^)]*\)\s*$/, '');
  return {
    count: got.lines.length,
    more: got.more,
    ...(newest ? { newest } : {}),
  };
}

async function read(id: string, http: Http, token: string): Promise<MailResult> {
  const url = new URL(`${MESSAGES}/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'full');
  url.searchParams.set('fields', 'id,labelIds,internalDate,payload');
  const got = await fetchJson(http, url.toString(), token);
  if ('error' in got) return got;
  return { text: renderMail(got.payload as RawMessage) };
}

/**
 * One full message as text — `mail_read`'s answer, and word for word what a
 * trigger firing writes to `input/mail.txt` (D-248). One function on D-030's
 * rule: two renderings of "the mail" would drift into two documents.
 */
function renderMail(message: RawMessage, attachmentsLine = true): string {
  const parts = flatten(message.payload);
  const attachments = parts
    .filter((p) => str(p.filename) !== '')
    .map((p) => {
      const size = typeof p.body?.size === 'number' ? p.body.size : 0;
      return size > 0 ? `${str(p.filename)} (${human(size)})` : str(p.filename);
    });
  const bodyParts = parts.filter((p) => str(p.filename) === '');
  const plain = bodyParts
    .filter((p) => str(p.mimeType).toLowerCase().startsWith('text/plain'))
    .map(decodeBody)
    .join('\n')
    .trim();
  const html = bodyParts
    .filter((p) => str(p.mimeType).toLowerCase().startsWith('text/html'))
    .map(decodeBody)
    .join('\n');
  const body = plain || htmlToText(html) || '(no readable text in this mail)';
  const shown =
    body.length > MAX_BODY_CHARS
      ? `${body.slice(0, MAX_BODY_CHARS)}\n…trimmed — the mail holds ${body.length} characters, this is the first ${MAX_BODY_CHARS}.`
      : body;

  const arrived = Number(str(message.internalDate));
  const head = [
    `From: ${header(message, 'From') || '(no sender)'}`,
    ...(header(message, 'To') ? [`To: ${header(message, 'To')}`] : []),
    ...(header(message, 'Cc') ? [`Cc: ${header(message, 'Cc')}`] : []),
    `Subject: ${header(message, 'Subject') || '(no subject)'}`,
    `Received: ${Number.isFinite(arrived) && arrived > 0 ? when(arrived) : '(no date)'}${unread(message) ? ' — unread' : ''}`,
    // The tool's truth. A trigger firing fetches them (D-286) and says what
    // rode and what stayed behind at the foot of the same file, so it asks
    // for the head without this line rather than contradicting itself.
    ...(attachmentsLine && attachments.length > 0
      ? [`Attachments (named, never fetched): ${attachments.join(', ')}`]
      : []),
  ];
  return [...head, '', shown].join('\n');
}

/**
 * One arrived mail as a trigger firing sees it (D-248): the identifiers the
 * reply path threads to, and the message rendered exactly as `mail_read`
 * renders one — the trigger's `input/mail.txt` and a session's own reading of
 * the same mail must never be two different documents.
 */
export interface TriggerMail {
  id: string;
  threadId: string;
  /** The RFC 822 Message-ID header, when the mail carried one. */
  msgId?: string;
  from: string;
  subject: string;
  arrivedMs: number;
  text: string;
  /** What the mail carried, by name — fetched by the poll under the job's caps (D-286). */
  attachments: TriggerAttachment[];
}

/** One attachment as Gmail names it: bytes inline when it sent them, an id to fetch otherwise. */
export interface TriggerAttachment {
  name: string;
  size: number;
  attachmentId?: string;
  data?: Buffer;
}

/** The ids a trigger query matches right now, newest first — ids alone, like search. */
export async function listMailIds(
  http: Http,
  token: string,
  query: string,
  max: number,
): Promise<{ ids: string[] } | { error: string }> {
  const listUrl = new URL(MESSAGES);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(max));
  listUrl.searchParams.set('fields', 'messages(id)');
  const listed = await fetchJson(http, listUrl.toString(), token);
  if ('error' in listed) return listed;
  const ids = (
    Array.isArray(listed.payload.messages) ? (listed.payload.messages as { id?: unknown }[]) : []
  )
    .map((m) => str(m.id))
    .filter((id) => id !== '');
  return { ids };
}

export async function fetchTriggerMail(
  http: Http,
  token: string,
  id: string,
): Promise<TriggerMail | { error: string }> {
  const url = new URL(`${MESSAGES}/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'full');
  url.searchParams.set('fields', 'id,threadId,labelIds,internalDate,payload');
  const got = await fetchJson(http, url.toString(), token);
  if ('error' in got) return got;
  const message = got.payload as RawMessage;
  const threadId = str(message.threadId);
  if (!threadId) return { error: `Gmail answered message ${id} without a thread id` };
  const rendered = renderMail(message, false);
  const arrived = Number(str(message.internalDate));
  const attachments: TriggerAttachment[] = flatten(message.payload)
    .filter((p) => str(p.filename) !== '')
    .map((p) => {
      const inline = str(p.body?.data);
      const size = typeof p.body?.size === 'number' ? p.body.size : 0;
      return {
        name: str(p.filename),
        size,
        ...(str(p.body?.attachmentId) ? { attachmentId: str(p.body?.attachmentId) } : {}),
        ...(inline ? { data: Buffer.from(inline, 'base64url') } : {}),
      };
    });
  return {
    id: str(message.id) || id,
    threadId,
    ...(header(message, 'Message-ID') ? { msgId: header(message, 'Message-ID') } : {}),
    from: header(message, 'From') || '(no sender)',
    subject: header(message, 'Subject') || '(no subject)',
    arrivedMs: Number.isFinite(arrived) && arrived > 0 ? arrived : 0,
    text: rendered,
    attachments,
  };
}

/** The bytes of one attachment, by the id the message named (D-286). */
export async function fetchAttachment(
  http: Http,
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer | { error: string }> {
  const url = `${MESSAGES}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const got = await fetchJson(http, url, token);
  if ('error' in got) return got;
  const data = str(got.payload.data);
  if (!data) return { error: `Gmail answered attachment ${attachmentId} without its bytes` };
  return Buffer.from(data, 'base64url');
}

/**
 * The whole conversation a mail belongs to, oldest first, every message
 * through the one renderer (D-286). The attachments of the earlier messages
 * stay named and unfetched — only the mail that fired hands a job files.
 */
export async function fetchThread(
  http: Http,
  token: string,
  threadId: string,
): Promise<{ text: string; count: number } | { error: string }> {
  const url = new URL(`${THREADS}/${encodeURIComponent(threadId)}`);
  url.searchParams.set('format', 'full');
  url.searchParams.set('fields', 'messages(id,threadId,labelIds,internalDate,payload)');
  const got = await fetchJson(http, url.toString(), token);
  if ('error' in got) return got;
  const messages = (Array.isArray(got.payload.messages) ? got.payload.messages : []) as RawMessage[];
  const ordered = messages
    .map((m) => ({ m, at: Number(str(m.internalDate)) || 0 }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.m);
  const text = ordered
    .map((m, i) => `———— message ${i + 1} of ${ordered.length} ————\n\n${renderMail(m)}`)
    .join('\n\n');
  return { text, count: ordered.length };
}
