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
 * One consent, three capabilities (D-076) — sends now, calendar and
 * contacts when their slices land, so nobody re-consents per feature.
 * `openid email` is what lets the exchange say who connected, for free.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
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
    this.flows.set(state, { clientId, clientSecret, verifier, at: now });
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
