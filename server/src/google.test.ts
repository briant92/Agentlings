import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  accessTokenFromRefresh,
  base64url,
  exchangeCode,
  FLOW_TTL_MS,
  FlowStore,
  GOOGLE_SCOPES,
  idTokenEmail,
} from './google';

function fakeFetch(respond: () => { ok: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init?.body ?? '')) });
    const res = respond();
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** A JWT is three base64url parts; only the payload matters here. */
function jwtWith(payload: unknown): string {
  return `x.${base64url(Buffer.from(JSON.stringify(payload), 'utf8'))}.y`;
}

describe('FlowStore', () => {
  const REDIRECT = 'http://127.0.0.1:4600/api/oauth/google/callback';

  it('builds the consent URL Google actually honours', () => {
    const { state, url } = new FlowStore().begin('id-1', 'secret-1', REDIRECT, 1000);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('id-1');
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(parsed.searchParams.get('state')).toBe(state);
    // Offline + consent is what makes a refresh token come back on reconnects.
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    // One consent, three capabilities (D-076) — plus identity.
    const scope = parsed.searchParams.get('scope') ?? '';
    for (const s of GOOGLE_SCOPES) expect(scope).toContain(s);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('the challenge really is S256 of the verifier it keeps', () => {
    const store = new FlowStore();
    const { state, url } = store.begin('id', 'sec', REDIRECT, 1000);
    const flow = store.take(state, 1000)!;
    const expected = base64url(createHash('sha256').update(flow.verifier).digest());
    expect(new URL(url).searchParams.get('code_challenge')).toBe(expected);
  });

  it('a flow is taken exactly once — a replayed callback finds nothing', () => {
    const store = new FlowStore();
    const { state } = store.begin('id', 'sec', REDIRECT, 1000);
    expect(store.take(state, 2000)).not.toBeNull();
    expect(store.take(state, 2000)).toBeNull();
  });

  it('an abandoned tab expires', () => {
    const store = new FlowStore();
    const { state } = store.begin('id', 'sec', REDIRECT, 1000);
    expect(store.take(state, 1000 + FLOW_TTL_MS + 1)).toBeNull();
  });

  it('an unknown state finds nothing', () => {
    expect(new FlowStore().take('never-issued', 1000)).toBeNull();
  });
});

describe('idTokenEmail', () => {
  it('reads the email out of the payload', () => {
    expect(idTokenEmail(jwtWith({ email: 'brian@gmail.com', sub: '1' }))).toBe('brian@gmail.com');
  });

  it('is null for garbage, absent claims, and non-string emails', () => {
    expect(idTokenEmail('not-a-jwt')).toBeNull();
    expect(idTokenEmail(jwtWith({ sub: '1' }))).toBeNull();
    expect(idTokenEmail(jwtWith({ email: 7 }))).toBeNull();
  });
});

describe('exchangeCode', () => {
  const args = {
    code: 'code-1',
    verifier: 'ver-1',
    clientId: 'id-1',
    clientSecret: 'secret-value',
    redirectUri: 'http://127.0.0.1:4600/cb',
  };

  it('posts the grant and answers with the refresh token and identity', async () => {
    const { fn, calls } = fakeFetch(() => ({
      ok: true,
      body: { refresh_token: 'rt-1', id_token: jwtWith({ email: 'brian@gmail.com' }) },
    }));
    const got = await exchangeCode({ ...args, fetchFn: fn });
    expect(got).toEqual({ refreshToken: 'rt-1', email: 'brian@gmail.com' });
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0].form.get('grant_type')).toBe('authorization_code');
    expect(calls[0].form.get('code_verifier')).toBe('ver-1');
    expect(calls[0].form.get('redirect_uri')).toBe(args.redirectUri);
  });

  it('a success with no refresh token is a refusal that names the fix', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { access_token: 'at' } }));
    const got = await exchangeCode({ ...args, fetchFn: fn });
    expect('error' in got && got.error).toContain('myaccount.google.com/permissions');
  });

  it("surfaces Google's own sentence and never the secret", async () => {
    const { fn } = fakeFetch(() => ({
      ok: false,
      status: 400,
      body: { error: 'invalid_client', error_description: 'The OAuth client was not found.' },
    }));
    const got = await exchangeCode({ ...args, fetchFn: fn });
    expect('error' in got && got.error).toContain('The OAuth client was not found');
    expect('error' in got && got.error).not.toContain('secret-value');
  });
});

describe('accessTokenFromRefresh', () => {
  const args = { clientId: 'id', clientSecret: 'sec', refreshToken: 'rt' };

  it('answers with the short-lived token', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: { access_token: 'at-1' } }));
    const got = await accessTokenFromRefresh({ ...args, fetchFn: fn });
    expect(got).toEqual({ token: 'at-1' });
    expect(calls[0].form.get('grant_type')).toBe('refresh_token');
  });

  it('invalid_grant reads as the 7-day trap, with the fix named', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 400, body: { error: 'invalid_grant' } }));
    const got = await accessTokenFromRefresh({ ...args, fetchFn: fn });
    expect('error' in got && got.error).toContain('Connect Google again');
    expect('error' in got && got.error).toContain('7 days');
  });
});
