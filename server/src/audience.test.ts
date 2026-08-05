import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mergeChats,
  mergeSends,
  readAudience,
  removePerson,
  telegramChats,
  writeAudience,
} from './audience';
import type { SendRecord } from './sends';

const send = (over: Partial<SendRecord> = {}): SendRecord => ({
  at: 1,
  levelId: 'training-ground',
  jobId: 'j',
  channel: 'telegram',
  to: '8633678680',
  ok: true,
  ...over,
});

describe('mergeChats (D-092)', () => {
  it('a new hello joins with viaStart and the name they go by', () => {
    const got = mergeChats([], [{ id: '86', name: 'Brian Thornton', username: 'bt' }]);
    expect(got).toEqual([
      { id: '86', name: 'Brian Thornton', username: 'bt', viaStart: true, sends: 0 },
    ]);
  });

  it('a returning hello refreshes the name and never loses the send count', () => {
    const known = [{ id: '86', name: '86', viaStart: false, sends: 3 }];
    const got = mergeChats(known, [{ id: '86', name: 'Brian Thornton' }]);
    expect(got).toEqual([{ id: '86', name: 'Brian Thornton', viaStart: true, sends: 3 }]);
  });
});

describe('mergeSends (D-092)', () => {
  it('counts delivered sends only, and a sends-only person wears the reviewed name', () => {
    const got = mergeSends(
      [],
      [
        send({ to: '71', name: 'Pepo Dussaillant' }),
        send({ to: '71', name: 'Pepo Dussaillant' }),
        send({ to: '99', ok: false, reason: 'chat not found' }),
        send({ to: '55', channel: 'gmail' }),
      ],
      'telegram',
    );
    expect(got).toEqual([{ id: '71', name: 'Pepo Dussaillant', viaStart: false, sends: 2 }]);
  });

  it('is idempotent — re-merging the whole audit does not double the counts', () => {
    const audit = [send({ to: '86', name: 'Brian' })];
    const once = mergeSends([], audit, 'telegram');
    const twice = mergeSends(once, audit, 'telegram');
    expect(twice).toEqual(once);
  });

  it('a reviewed name that differs becomes an alias, once, however often re-merged (D-094)', () => {
    const viaStart = [{ id: '67', name: 'Jose Dussaillant', viaStart: true, sends: 0 }];
    const audit = [
      send({ to: '67', name: 'Jose Dussaillant (Pepo)' }),
      send({ to: '67', name: 'Jose Dussaillant (Pepo)' }),
    ];
    const once = mergeSends(viaStart, audit, 'telegram');
    expect(once[0].aliases).toEqual(['Jose Dussaillant (Pepo)']);
    const twice = mergeSends(once, audit, 'telegram');
    expect(twice[0].aliases).toEqual(['Jose Dussaillant (Pepo)']);
  });

  it('a name that matches, or is the id, never becomes an alias', () => {
    const known = [{ id: '86', name: 'Brian Thornton', viaStart: true, sends: 0 }];
    const got = mergeSends(
      known,
      [send({ to: '86', name: 'Brian Thornton' }), send({ to: '86', name: '86' })],
      'telegram',
    );
    expect(got[0].aliases).toBeUndefined();
  });

  it('a tapped-Start name outranks the audit, but an id-as-name yields to it', () => {
    const viaStart = [{ id: '86', name: 'Brian Thornton', viaStart: true, sends: 0 }];
    expect(mergeSends(viaStart, [send({ to: '86', name: 'B.' })], 'telegram')[0].name).toBe(
      'Brian Thornton',
    );
    const anonymous = [{ id: '86', name: '86', viaStart: false, sends: 0 }];
    expect(mergeSends(anonymous, [send({ to: '86', name: 'B.' })], 'telegram')[0].name).toBe('B.');
  });
});

describe('the roster on disk', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-audience-'));
  });
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('round-trips, and an unknown channel reads as nobody', () => {
    const people = [{ id: '86', name: 'Brian', viaStart: true, sends: 1 }];
    writeAudience(root, 'telegram', people);
    expect(readAudience(root, 'telegram')).toEqual(people);
    expect(readAudience(root, 'gmail')).toEqual([]);
  });

  it('removing a person un-knows them and persists it', () => {
    writeAudience(root, 'telegram', [
      { id: '86', name: 'Brian', viaStart: true, sends: 0 },
      { id: '71', name: 'Pepo', viaStart: true, sends: 0 },
    ]);
    const kept = removePerson(root, 'telegram', '71');
    expect(kept.map((p) => p.id)).toEqual(['86']);
    expect(readAudience(root, 'telegram').map((p) => p.id)).toEqual(['86']);
  });
});

describe('telegramChats', () => {
  it('flattens updates to unique chats with composed names', async () => {
    const body = {
      result: [
        { message: { chat: { id: 8633678680, first_name: 'Brian', last_name: 'Thornton' } } },
        { message: { chat: { id: 8633678680, first_name: 'Brian', last_name: 'Thornton' } } },
        { message: { chat: { id: 71, first_name: 'Pepo', username: 'pepo' } } },
        { message: {} },
      ],
    };
    const got = await telegramChats('t', () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) }),
    );
    expect(got).toEqual([
      { id: '8633678680', name: 'Brian Thornton' },
      { id: '71', name: 'Pepo', username: 'pepo' },
    ]);
  });

  it('answers nobody on an API refusal rather than throwing', async () => {
    const got = await telegramChats('t', () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    );
    expect(got).toEqual([]);
  });
});
