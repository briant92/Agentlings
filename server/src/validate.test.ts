import { describe, expect, it } from 'vitest';
import { validateConnectionSecret } from './validate';

/** A fetch stand-in that records calls and answers from a script. */
function fakeFetch(respond: () => { ok: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const res = respond();
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('validateConnectionSecret', () => {
  it('telegram: asks getMe and answers with the bot identity', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: { result: { username: 'agentlings_bot' } } }));
    const verdict = await validateConnectionSecret('telegram', { TELEGRAM_BOT_TOKEN: 'tok' }, fn);
    expect(verdict).toEqual({ ok: true, identity: '@agentlings_bot' });
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/getMe');
  });

  it('telegram: a rejected token points back at BotFather', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 401 }));
    const verdict = await validateConnectionSecret('telegram', { TELEGRAM_BOT_TOKEN: 'bad' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('Telegram rejected');
  });

  it('github: sends the house headers and answers with the login', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: { login: 'briant92' } }));
    const verdict = await validateConnectionSecret('github', { GITHUB_TOKEN: 'gp' }, fn);
    expect(verdict).toEqual({ ok: true, identity: 'briant92' });
    expect(calls[0].url).toBe('https://api.github.com/user');
    expect(calls[0].headers['user-agent']).toBe('agentlings');
    expect(calls[0].headers.authorization).toBe('Bearer gp');
  });

  it('github: 401 is a rejection, not an HTTP trivia answer', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 401 }));
    const verdict = await validateConnectionSecret('github', { GITHUB_TOKEN: 'bad' }, fn);
    expect(verdict.reason).toContain('GitHub rejected');
  });

  it('search: a working key is accepted without claiming an identity Brave never gives', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: {} }));
    const verdict = await validateConnectionSecret('search', { BRAVE_API_KEY: 'BSA' }, fn);
    expect(verdict).toEqual({ ok: true });
    expect(calls[0].headers['x-subscription-token']).toBe('BSA');
  });

  it('search: a rate-limited check refuses to store an unvalidated key, and says why', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 429 }));
    const verdict = await validateConnectionSecret('search', { BRAVE_API_KEY: 'BSA' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('wait a minute');
  });

  it('whatsapp-business: one call proves both halves and answers with the number', async () => {
    const { fn, calls } = fakeFetch(() => ({
      ok: true,
      body: { display_phone_number: '+1 555 025 3483' },
    }));
    const verdict = await validateConnectionSecret(
      'whatsapp-business',
      { WHATSAPP_TOKEN: 'wt', WHATSAPP_PHONE_NUMBER_ID: '123456' },
      fn,
    );
    expect(verdict).toEqual({ ok: true, identity: '+1 555 025 3483' });
    expect(calls[0].url).toContain('/123456?fields=display_phone_number');
    expect(calls[0].headers.authorization).toBe('Bearer wt');
  });

  it('whatsapp-business: a wrong id reads as both-values advice, not an HTTP number', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 404 }));
    const verdict = await validateConnectionSecret(
      'whatsapp-business',
      { WHATSAPP_TOKEN: 'wt', WHATSAPP_PHONE_NUMBER_ID: 'nope' },
      fn,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('check both values');
  });

  it('a network failure names the provider, never the value', async () => {
    const fn = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    const verdict = await validateConnectionSecret('telegram', { TELEGRAM_BOT_TOKEN: 'secret-tok' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('could not reach Telegram');
    expect(verdict.reason).not.toContain('secret-tok');
  });

  it('a connection with no validator says to use .env rather than storing blind', async () => {
    const { fn } = fakeFetch(() => ({ ok: true }));
    const verdict = await validateConnectionSecret('carrier-pigeon', {}, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('no validator');
  });
});

describe('slack validation (D-104)', () => {
  it('reads the verdict out of the 200 body and names bot and workspace', async () => {
    const { fn, calls } = fakeFetch(() => ({
      ok: true,
      body: { ok: true, user: 'agentlings', team: 'Thornton HQ' },
    }));
    const verdict = await validateConnectionSecret('slack', { SLACK_BOT_TOKEN: 'xoxb-1' }, fn);
    expect(verdict).toEqual({ ok: true, identity: 'agentlings in Thornton HQ' });
    expect(calls[0].url).toBe('https://slack.com/api/auth.test');
    expect(calls[0].headers.authorization).toBe('Bearer xoxb-1');
  });

  it('a bad token is a 200 too — the body says invalid_auth and the reason points at the xoxb token', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { ok: false, error: 'invalid_auth' } }));
    const verdict = await validateConnectionSecret('slack', { SLACK_BOT_TOKEN: 'bad' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('xoxb');
  });

  it('a non-200 answer falls back to the status', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 503 }));
    const verdict = await validateConnectionSecret('slack', { SLACK_BOT_TOKEN: 't' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('503');
  });
});
