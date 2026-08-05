import { describe, expect, it } from 'vitest';
import { CHANNELS, executeOutbox, outboxRefusal } from './channels';
import type { Connection } from './connections';

/** A fetch stand-in that records calls and answers from a script. */
function fakeFetch(respond: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; payload: unknown }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, payload: init?.body ? JSON.parse(String(init.body)) : undefined });
    const res = respond(url);
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('the telegram channel', () => {
  it('posts the message to the bot API, chat id and text only', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await CHANNELS.telegram.send(
      { to: '12345', name: 'Ana', body: 'padel on Thursday' },
      { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn: fn },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/sendMessage');
    // The display name is for the review card and never reaches the channel.
    expect(calls[0].payload).toEqual({ chat_id: '12345', text: 'padel on Thursday' });
  });

  it('refuses to run without its token', async () => {
    const { fn } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: {}, fetchFn: fn }),
    ).rejects.toThrow('TELEGRAM_BOT_TOKEN');
  });

  it("surfaces Telegram's own sentence for a refusal", async () => {
    const { fn } = fakeFetch(() => ({
      ok: false,
      status: 400,
      body: { description: 'chat not found' },
    }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn }),
    ).rejects.toThrow('chat not found');
  });

  it('falls back to the HTTP status when the refusal has no sentence', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 502, body: {} }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn }),
    ).rejects.toThrow('HTTP 502');
  });
});

describe('executeOutbox', () => {
  const outbox = {
    channel: 'telegram',
    messages: [
      { to: '1', body: 'a' },
      { to: '2', body: 'b' },
      { to: '3', body: 'c' },
    ],
  };

  it('skips recipients already sent to — approving twice never messages twice', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    const run = await executeOutbox(outbox, ['1', '3'], {
      env: { TELEGRAM_BOT_TOKEN: 't' },
      fetchFn: fn,
    });
    expect(run).toEqual({ sentTo: ['2'], failed: [] });
    expect(calls).toHaveLength(1);
  });

  it('a failure does not stop the rest, and comes back by recipient', async () => {
    let n = 0;
    const { fn } = fakeFetch(() => {
      n += 1;
      return n === 2 ? { ok: false, status: 400, body: { description: 'chat not found' } } : { ok: true };
    });
    const run = await executeOutbox(outbox, [], { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn });
    expect(run.sentTo).toEqual(['1', '3']);
    expect(run.failed).toEqual([{ to: '2', reason: 'chat not found' }]);
  });

  it('answers in the same shape for a channel that does not exist', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    const run = await executeOutbox(
      { channel: 'carrier-pigeon', messages: [{ to: '1', body: 'x' }] },
      [],
      { env: {}, fetchFn: fn },
    );
    expect(run.sentTo).toEqual([]);
    expect(run.failed).toEqual([{ to: '1', reason: 'no channel "carrier-pigeon"' }]);
    expect(calls).toHaveLength(0);
  });
});

/**
 * The gate the resolve route asks before replaying anything. Every refusal
 * must name its fix, because the job stays reviewable behind it.
 */
describe('outboxRefusal', () => {
  const telegram: Connection = {
    name: 'telegram',
    label: 'Send Telegram messages',
    transport: 'builtin',
    tools: [],
    secrets: { TELEGRAM_BOT_TOKEN: 'why' },
  };
  const outbox = { channel: 'telegram', messages: [{ to: '1', body: 'x' }] };
  const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

  it('refuses a channel that does not exist', () => {
    expect(
      outboxRefusal({ ...outbox, channel: 'carrier-pigeon' }, [telegram], {}, TOKEN),
    ).toContain('no channel');
  });

  it('refuses when the catalog has no connection for the channel', () => {
    expect(outboxRefusal(outbox, [], {}, TOKEN)).toContain('no "telegram" connection');
  });

  it('refuses a missing secret, naming it', () => {
    expect(outboxRefusal(outbox, [telegram], { connections: { telegram: true } }, {})).toContain(
      'TELEGRAM_BOT_TOKEN',
    );
  });

  it('refuses a connection that is switched off — never switched on counts as off', () => {
    expect(outboxRefusal(outbox, [telegram], {}, TOKEN)).toContain('switched off in Settings');
  });

  it('is null when the connection is ready and on', () => {
    expect(outboxRefusal(outbox, [telegram], { connections: { telegram: true } }, TOKEN)).toBeNull();
  });
});
