import { createHash, randomBytes } from 'node:crypto';

/**
 * Google's loopback OAuth flow (D-080), against the user's OWN client —
 * D-076's rule: Agentlings never ships a shared client id, because that
 * would make it a multi-user app requesting restricted Gmail scopes, which
 * is Google verification and a paid security assessment. The password is
 * typed on Google's page in the user's own browser; what comes back here is
 * a code, and what is stored is a refresh token — validated by the exchange
 * itself before anything lands in .env (D-078's rule: nothing stores
 * unvalidated).
 */

export const GOOGLE_SECRETS = {
  clientId: 'GOOGLE_OAUTH_CLIENT_ID',
  clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
  refreshToken: 'GOOGLE_OAUTH_REFRESH_TOKEN',
} as const;

/**
 * One consent, five capabilities (D-076, D-158) — sends, reading mail,
 * calendar, saved contacts, and the people Gmail's own compose field knows
 * (D-123: "other contacts", everyone the user has emailed), so nobody
 * re-consents per feature.
 * `openid email` is what lets the exchange say who connected, for free.
 * A token minted before a scope joined this list does not grow it —
 * reconnecting once is what grants the new slice, and the audience GET says
 * so in a sentence until then. gmail.readonly is a restricted scope, so an
 * unverified own-client shows Google's warning interstitial on that walk —
 * the user's own account may continue through it.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

/**
 * Who the consent walk runs as: the body's client when one was typed, the
 * stored client otherwise (D-123). Scopes never grow on an existing token,
 * so widening them means walking consent again — and a connected card must
 * be able to do that without anyone re-pasting secrets the .env already
 * holds. An empty ask is a reconnect, not a mistake.
 */
export function startCredentials(
  body: { clientId?: string; clientSecret?: string },
  env: Record<string, string | undefined>,
): { clientId: string; clientSecret: string } {
  return {
    clientId: body.clientId?.trim() || env[GOOGLE_SECRETS.clientId] || '',
    clientSecret: body.clientSecret?.trim() || env[GOOGLE_SECRETS.clientSecret] || '',
  };
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALL_TIMEOUT_MS = 15_000;

/** A begun flow that has not come back yet. Ten minutes is plenty to consent. */
export const FLOW_TTL_MS = 10 * 60 * 1000;

export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PendingFlow {
  clientId: string;
  clientSecret: string;
  verifier: string;
  /**
   * The URI this walk was begun with. Kept because Google requires the
   * exchange to present the *same* one it was given, and since #28 that is a
   * function of the request rather than a constant — so the callback, which is
   * a different request, must not re-derive it. Two requests that disagree
   * would be a `redirect_uri_mismatch` nobody could read off either one.
   */
  redirectUri: string;
  at: number;
}

/**
 * Begun flows keyed by `state`, single-use and short-lived: `take` consumes,
 * so a replayed callback finds nothing, and an abandoned tab expires. The
 * client id and secret live only here until the exchange succeeds — a flow
 * that never comes back stores nothing anywhere (D-078).
 */
export class FlowStore {
  private flows = new Map<string, PendingFlow>();

  begin(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    now: number,
  ): { state: string; url: string } {
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    this.flows.set(state, { clientId, clientSecret, verifier, redirectUri, at: now });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      // Offline + consent is what makes Google return a refresh token even
      // when the user has consented before — without it a reconnect gets an
      // access token only and the connection dies with it.
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return { state, url: `${AUTH_URL}?${params.toString()}` };
  }

  /** The flow for this state, exactly once, and never after its TTL. */
  take(state: string, now: number): PendingFlow | null {
    const flow = this.flows.get(state);
    if (!flow) return null;
    this.flows.delete(state);
    if (now - flow.at > FLOW_TTL_MS) return null;
    return flow;
  }
}

/** The email inside an id_token, or null — a JWT is three base64url parts. */
export function idTokenEmail(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const parsed = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { email?: unknown };
    return typeof parsed.email === 'string' ? parsed.email : null;
  } catch {
    return null;
  }
}

async function tokenCall(
  form: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<{ body?: Record<string, unknown>; reason?: string }> {
  let res: Response;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { reason: `could not reach Google: ${detail}` };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { body };
  const description =
    typeof body.error_description === 'string'
      ? body.error_description
      : typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
  return { reason: description };
}

/**
 * Turns the callback's code into a refresh token and an identity. The
 * exchange succeeding is the validation — it proves the client id, the
 * secret and the consent all at once, which is why nothing is stored until
 * it has (D-078). No reason ever carries a secret value.
 */
export async function exchangeCode(args: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<{ refreshToken: string; email: string | null } | { error: string }> {
  const { body, reason } = await tokenCall(
    {
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: args.verifier,
    },
    args.fetchFn ?? fetch,
  );
  if (!body) return { error: `Google refused the sign-in — ${reason}` };
  const refreshToken = body.refresh_token;
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    return {
      error:
        'Google returned no refresh token. Remove Agentlings at myaccount.google.com/permissions, then Connect again.',
    };
  }
  const email = typeof body.id_token === 'string' ? idTokenEmail(body.id_token) : null;
  return { refreshToken, email };
}

/**
 * A short-lived access token from the stored refresh token — asked for at
 * send time, never kept. `invalid_grant` is what a revoked or testing-mode
 * expired consent looks like (D-076's 7-day trap), and the fix is a
 * sentence, not a stack trace.
 */
export async function accessTokenFromRefresh(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ token: string } | { error: string }> {
  const { body, reason } = await tokenCall(
    {
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
      grant_type: 'refresh_token',
    },
    args.fetchFn ?? fetch,
  );
  if (!body) {
    return {
      error:
        reason === 'invalid_grant' || reason?.includes('expired or revoked')
          ? 'Google has revoked this connection — open Settings and Connect Google again. An OAuth app left in Testing does this every 7 days.'
          : `Google refused the token — ${reason}`,
    };
  }
  const token = body.access_token;
  if (typeof token !== 'string' || token === '') {
    return { error: 'Google returned no access token' };
  }
  return { token };
}

/** A contact flattened to one reachable address — one row per email. */
export interface GoogleContact {
  id: string;
  name: string;
}

/** What one page of either People API list looks like, fields we read only. */
interface PeoplePage {
  connections?: PersonRow[];
  otherContacts?: PersonRow[];
  nextPageToken?: string;
  error?: { message?: string };
}
interface PersonRow {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
}

/**
 * Shared walker for the People API's two lists — same paging, same
 * flattening, same refusals-as-sentences. Names and addresses only, the
 * fields the roster holds and nothing more (D-122); a person with two
 * addresses is two reachable rows; no email means not reachable on this
 * channel, skipped. The API answers 403 until it is enabled in the user's
 * own console — the Calendar API's wall (D-104) — and a token minted before
 * a scope joined the consent answers "insufficient scopes" until the user
 * reconnects (D-123); both come back as the sentence to act on, never as a
 * silently empty book.
 */
async function listPeople(args: {
  accessToken: string;
  fetchFn?: typeof fetch;
  path: string;
  fieldsParam: 'personFields' | 'readMask';
  listField: 'connections' | 'otherContacts';
}): Promise<GoogleContact[] | { error: string }> {
  const doFetch = args.fetchFn ?? fetch;
  const byEmail = new Map<string, GoogleContact>();
  let pageToken: string | undefined;
  // 10 pages of 1,000 is a bound nobody's address book meets, not a cap.
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://people.googleapis.com/v1/${args.path}`);
    url.searchParams.set(args.fieldsParam, 'names,emailAddresses');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    let res: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      res = await doFetch(url.toString(), {
        headers: { authorization: `Bearer ${args.accessToken}` },
      });
    } catch {
      return { error: 'Google could not be reached — showing who is already known.' };
    }
    const body = (await res.json().catch(() => null)) as PeoplePage | null;
    if (!res.ok) {
      const message = body?.error?.message ?? `HTTP ${res.status}`;
      return {
        error: /insufficient/i.test(message)
          ? 'Google needs a fresh sign-in for this — open Settings, press Connect Google again, and approve reading the people you have emailed.'
          : /disabled|has not been used/i.test(message)
            ? 'Google says the People API is off for your project — enable it in the Google console (APIs & Services → Library → People API), then look again.'
            : `Google refused the contacts — ${message}`,
      };
    }
    for (const person of body?.[args.listField] ?? []) {
      const name = person.names?.[0]?.displayName?.trim();
      for (const address of person.emailAddresses ?? []) {
        const email = address.value?.trim();
        if (email && !byEmail.has(email)) byEmail.set(email, { id: email, name: name || email });
      }
    }
    pageToken = body?.nextPageToken;
    if (!pageToken) break;
  }
  return [...byEmail.values()];
}

/** The user's saved contacts — "My Contacts", curated by hand (D-122). */
export async function googleContacts(args: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<GoogleContact[] | { error: string }> {
  return listPeople({
    ...args,
    path: 'people/me/connections',
    fieldsParam: 'personFields',
    listField: 'connections',
  });
}

/**
 * The list Gmail's own compose field draws on (D-123): "other contacts",
 * auto-collected from everyone the user has emailed. Its own scope
 * (contacts.other.readonly) and its own readMask parameter — otherwise the
 * same walk as the saved book.
 */
export async function googleOtherContacts(args: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<GoogleContact[] | { error: string }> {
  return listPeople({
    ...args,
    path: 'otherContacts',
    fieldsParam: 'readMask',
    listField: 'otherContacts',
  });
}

/**
 * Tells Google the refresh token is no longer wanted (D-218), so forgetting
 * it here is the end of the grant rather than a copy going stale. The token
 * rides in the form body, never the URL (D-187's rule), and never in a
 * reason. Google answers 400 `invalid_token` for one it no longer knows —
 * already revoked, or expired in testing mode — which is the state wanted,
 * so that counts as done with a note; only not reaching Google, or a refusal
 * of another kind, is reported as a revoke that did not happen.
 */
export async function revokeToken(args: {
  token: string;
  fetchFn?: typeof fetch;
}): Promise<{ revoked: true; note?: string } | { revoked: false; reason: string }> {
  let res: Response;
  try {
    res = await (args.fetchFn ?? fetch)(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: args.token }).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { revoked: false, reason: `could not reach Google to revoke it: ${detail}` };
  }
  if (res.ok) return { revoked: true };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 400 && body.error === 'invalid_token') {
    return {
      revoked: true,
      note: 'Google no longer knew this token — it had already expired or been revoked',
    };
  }
  const description =
    typeof body.error_description === 'string'
      ? body.error_description
      : typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
  return { revoked: false, reason: `Google refused to revoke it — ${description}` };
}
