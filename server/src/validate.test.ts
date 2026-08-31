import { describe, expect, it } from 'vitest';
import { modelsFor, validateConnectionSecret } from './validate';

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

describe('the model engine (#32)', () => {
  const MODELS = {
    data: [
      { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
      { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
    ],
  };

  it('proves the key with the cheapest call there is, and spends no tokens', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: MODELS }));
    const verdict = await validateConnectionSecret('anthropic', { ANTHROPIC_API_KEY: 'sk-x' }, fn);
    expect(verdict.ok).toBe(true);
    // Listing models costs nothing. A validator that proved the key by asking
    // for a completion would bill a person for typing their key in.
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/models');
    expect(calls[0].headers['x-api-key']).toBe('sk-x');
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('says how many models the key reaches, since a key has no name', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: MODELS }));
    const verdict = await validateConnectionSecret('anthropic', { ANTHROPIC_API_KEY: 'sk-x' }, fn);
    expect(verdict.identity).toBe('2 models available');
  });

  it('a rejected key is refused, and says to check it was copied whole', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 401 }));
    const verdict = await validateConnectionSecret('anthropic', { ANTHROPIC_API_KEY: 'nope' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('rejected');
  });

  it('a key that cannot list models is refused for that reason, not as invalid', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 403 }));
    const verdict = await validateConnectionSecret('anthropic', { ANTHROPIC_API_KEY: 'sk-x' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('permissions');
  });

  it('an unreachable provider is a refusal, never a pass', async () => {
    // "We could not ask" and "the key is good" must never be the same answer
    // (D-246). A validator that shrugged here would store an unchecked key.
    const fn = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    const verdict = await validateConnectionSecret('anthropic', { ANTHROPIC_API_KEY: 'sk-x' }, fn);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('could not reach Anthropic');
  });
});

describe('modelsFor (#32)', () => {
  it('returns what the key can reach, labelled as the provider names them', async () => {
    const { fn } = fakeFetch(() => ({
      ok: true,
      body: { data: [{ id: 'claude-opus-5', display_name: 'Claude Opus 5' }] },
    }));
    expect(await modelsFor({ ANTHROPIC_API_KEY: 'sk-x' }, fn)).toEqual([
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
    ]);
  });

  it('falls back to the id when the provider sends no display name', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { data: [{ id: 'claude-x' }] } }));
    expect(await modelsFor({ ANTHROPIC_API_KEY: 'sk-x' }, fn)).toEqual([
      { id: 'claude-x', label: 'claude-x' },
    ]);
  });

  it('is empty when the key is refused, so the picker offers nothing rather than a guess', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 401 }));
    expect(await modelsFor({ ANTHROPIC_API_KEY: 'bad' }, fn)).toEqual([]);
  });

  it('drops an entry with no id rather than inventing one', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { data: [{ display_name: 'Nameless' }] } }));
    expect(await modelsFor({ ANTHROPIC_API_KEY: 'sk-x' }, fn)).toEqual([]);
  });
});
