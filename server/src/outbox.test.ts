import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_OUTBOX_MESSAGES } from '@agentlings/shared';
import { OUTBOX_FILE, readOutbox } from './outbox';

describe('readOutbox', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-outbox-'));
  });

  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const write = (content: string) => writeFileSync(path.join(dir, OUTBOX_FILE), content);

  it('is null when the run wrote no outbox', () => {
    expect(readOutbox(dir)).toBeNull();
  });

  it('parses a valid outbox and keeps only the fields the contract names', () => {
    write(
      JSON.stringify({
        channel: ' Telegram ',
        messages: [
          { to: ' 12345 ', name: ' Ana ', body: 'padel on Thursday', extra: 'dropped' },
          { to: '67890', body: 'padel on Thursday' },
        ],
        stray: true,
      }),
    );
    const read = readOutbox(dir);
    expect(read?.error).toBeUndefined();
    expect(read?.outbox).toEqual({
      channel: 'telegram',
      messages: [
        { to: '12345', name: 'Ana', body: 'padel on Thursday' },
        { to: '67890', body: 'padel on Thursday' },
      ],
    });
  });

  it('keeps a mail-shaped subject, trimmed, and only when it says something', () => {
    write(
      JSON.stringify({
        channel: 'gmail',
        messages: [
          { to: 'ana@example.com', subject: ' Padel Thursday ', body: 'See you' },
          { to: 'luis@example.com', subject: '  ', body: 'See you' },
        ],
      }),
    );
    const read = readOutbox(dir);
    expect(read?.outbox?.messages[0].subject).toBe('Padel Thursday');
    expect(read?.outbox?.messages[1].subject).toBeUndefined();
  });

  it('refuses a subject that is not a string, or longer than any subject line', () => {
    write(JSON.stringify({ channel: 'gmail', messages: [{ to: 'a@b.c', subject: 7, body: 'x' }] }));
    expect(readOutbox(dir)?.error).toContain('"subject"');
    write(
      JSON.stringify({
        channel: 'gmail',
        messages: [{ to: 'a@b.c', subject: 'x'.repeat(201), body: 'x' }],
      }),
    );
    expect(readOutbox(dir)?.error).toContain('over 200');
  });

  it.each([
    ['not JSON at all', 'nope{', 'not valid JSON'],
    ['a bare array', '[]', 'not an object'],
    ['no channel', '{"messages":[{"to":"1","body":"x"}]}', '"channel"'],
    ['empty messages', '{"channel":"telegram","messages":[]}', '"messages"'],
    ['a message with no recipient', '{"channel":"telegram","messages":[{"body":"x"}]}', '"to"'],
    [
      'a message with an empty body',
      '{"channel":"telegram","messages":[{"to":"1","body":"  "}]}',
      '"body"',
    ],
    [
      'a non-string name',
      '{"channel":"telegram","messages":[{"to":"1","body":"x","name":7}]}',
      '"name"',
    ],
  ])('refuses %s with the reason', (_, content, reason) => {
    write(content);
    const read = readOutbox(dir);
    expect(read?.outbox).toBeUndefined();
    expect(read?.error).toContain(reason);
  });

  it('refuses more messages than the cap, saying both numbers', () => {
    const messages = Array.from({ length: MAX_OUTBOX_MESSAGES + 1 }, (_, i) => ({
      to: String(i),
      body: 'x',
    }));
    write(JSON.stringify({ channel: 'telegram', messages }));
    expect(readOutbox(dir)?.error).toContain(`${MAX_OUTBOX_MESSAGES + 1} messages`);
  });

  it('refuses a duplicate recipient rather than half-sending', () => {
    write(
      JSON.stringify({
        channel: 'telegram',
        messages: [
          { to: '12345', body: 'one' },
          { to: '12345', body: 'two' },
        ],
      }),
    );
    expect(readOutbox(dir)?.error).toContain('appears twice');
  });

  it('refuses a body over the cap', () => {
    write(JSON.stringify({ channel: 'telegram', messages: [{ to: '1', body: 'x'.repeat(2001) }] }));
    expect(readOutbox(dir)?.error).toContain('over 2000');
  });
});
