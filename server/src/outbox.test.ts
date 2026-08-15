import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_OUTBOX_FILE_BYTES,
  MAX_OUTBOX_FILES,
  MAX_OUTBOX_FILES_TOTAL_BYTES,
  MAX_OUTBOX_MESSAGES,
} from '@agentlings/shared';
import { OUTBOX_FILE, checkOutbox, composeOutbox, readOutbox, splitRecipient } from './outbox';

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
    expect(read?.outboxes?.[0]).toEqual({
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
    expect(read?.outboxes?.[0].messages[0].subject).toBe('Padel Thursday');
    expect(read?.outboxes?.[0].messages[1].subject).toBeUndefined();
  });

  it('keeps a template outbox whole: name, language, per-message params', () => {
    write(
      JSON.stringify({
        channel: 'whatsapp-business',
        template: { name: 'padel_reminder', language: 'es' },
        messages: [
          { to: '+34600111222', name: 'Ana', params: [' Ana ', 'jueves 9:00'], body: 'Hola Ana…' },
        ],
      }),
    );
    const read = readOutbox(dir);
    expect(read?.error).toBeUndefined();
    expect(read?.outboxes?.[0].template).toEqual({ name: 'padel_reminder', language: 'es' });
    expect(read?.outboxes?.[0].messages[0].params).toEqual(['Ana', 'jueves 9:00']);
  });

  it.each([
    ['a template name Meta would refuse', { name: 'Padel Reminder!', language: 'es' }, 'template.name'],
    ['a language that is not a code', { name: 'padel_reminder', language: 'spanish' }, 'template.language'],
  ])('refuses %s', (_, template, reason) => {
    write(JSON.stringify({ channel: 'whatsapp-business', template, messages: [{ to: '1', body: 'x' }] }));
    expect(readOutbox(dir)?.error).toContain(reason);
  });

  it('refuses params with line breaks — Meta would refuse the whole batch later', () => {
    write(
      JSON.stringify({
        channel: 'whatsapp-business',
        messages: [{ to: '1', params: ['ok', 'bad\nparam'], body: 'x' }],
      }),
    );
    expect(readOutbox(dir)?.error).toContain('line breaks');
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
    // An array is the several-channels shape now (D-179), so the refusal is
    // about it being empty rather than about it being a list.
    ['an empty list', '[]', 'sends nothing'],
    ['a list of non-objects', '["telegram"]', 'not an object'],
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
    expect(read?.outboxes).toBeUndefined();
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

/** The desk's own recipient field, split back into what the channel needs (D-097). */
describe('splitRecipient', () => {
  it('takes the address the picker wrote after the em-dash', () => {
    expect(splitRecipient('Jose Dussaillant — 6783316106')).toEqual({
      to: '6783316106',
      name: 'Jose Dussaillant',
    });
  });

  it('takes a pasted address whole, since nobody named it', () => {
    expect(splitRecipient('6783316106')).toEqual({ to: '6783316106' });
    expect(splitRecipient(' brian@example.com ')).toEqual({ to: 'brian@example.com' });
  });

  // The field is free text, so the shape gets typed by hand as well as picked.
  it('reads the separators a person types for the same shape', () => {
    expect(splitRecipient('Brian Thornton – 8633678680').to).toBe('8633678680');
    expect(splitRecipient('Brian Thornton - 8633678680').to).toBe('8633678680');
  });

  /** Names carry hyphens; addresses rarely do. */
  it('splits at the last separator, not the first', () => {
    expect(splitRecipient('Jean-Luc Picard — 1701')).toEqual({
      to: '1701',
      name: 'Jean-Luc Picard',
    });
  });

  // Otherwise the contract refuses with "to must be a non-empty string" for
  // what is really a missing address.
  it('treats a trailing separator as part of the name, not a split', () => {
    expect(splitRecipient('Pepo — ')).toEqual({ to: 'Pepo —' });
  });
});

describe('composeOutbox', () => {
  it('builds the same object a session would have written', () => {
    const { outboxes } = composeOutbox('telegram', 'Jose Dussaillant — 6783316106', 'A DARLE');
    expect(outboxes?.[0]).toEqual({
      channel: 'telegram',
      messages: [{ to: '6783316106', body: 'A DARLE', name: 'Jose Dussaillant' }],
    });
  });

  /**
   * Held to the contract rather than trusted for being ours: the composer's
   * inputs are user text, and an outbox built in code that skipped the checks
   * would be a second, weaker contract for the same file.
   */
  it('is refused by the contract exactly as a session file would be', () => {
    expect(composeOutbox('telegram', '   ', 'A DARLE').error).toMatch(/"to"/);
    expect(composeOutbox('telegram', '6783316106', '   ').error).toMatch(/"body"/);
    // The one refusal a real desk can produce: the words are free text, and
    // nothing upstream caps their length.
    expect(composeOutbox('telegram', '6783316106', 'x'.repeat(5000)).error).toMatch(/over/);
  });
});

/**
 * The calendar channel's event contract (D-104): one event per outbox, the
 * block that describes it validated at the seam, and the block refused on
 * every channel that has no client to read it.
 */
describe('the event block', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    channel: 'calendar',
    messages: [
      {
        to: 'primary',
        subject: 'Dentist',
        body: 'Cleaning, Dr. Soto',
        event: { start: '2026-08-13T16:00:00', end: '2026-08-13T17:00:00' },
        ...over,
      },
    ],
  });

  it('parses a whole calendar outbox, attendees trimmed', () => {
    const got = checkOutbox(
      event({
        event: {
          start: '2026-08-13T16:00:00',
          end: '2026-08-13T17:00:00',
          attendees: [' ana@example.com '],
        },
      }),
    );
    expect(got.error).toBeUndefined();
    expect(got.outboxes?.[0].messages[0].event?.attendees).toEqual(['ana@example.com']);
  });

  it('takes exactly one event per outbox', () => {
    const two = event();
    two.messages = [two.messages[0], { ...two.messages[0], to: 'work' }];
    expect(checkOutbox(two).error).toContain('exactly one event');
  });

  it('a calendar outbox without its event block is refused', () => {
    const bare = event();
    delete (bare.messages[0] as Record<string, unknown>).event;
    expect(checkOutbox(bare).error).toContain('"event" block');
  });

  it('a calendar event needs its title', () => {
    const untitled = event();
    delete (untitled.messages[0] as Record<string, unknown>).subject;
    expect(checkOutbox(untitled).error).toContain('"subject"');
  });

  it('an event that ends before it starts is refused', () => {
    const backwards = event({
      event: { start: '2026-08-13T17:00:00', end: '2026-08-13T16:00:00' },
    });
    expect(checkOutbox(backwards).error).toContain('ends before it starts');
  });

  it('a date that does not parse is refused with the example shape', () => {
    const vague = event({ event: { start: 'someday soon', end: '2026-08-13T17:00:00' } });
    expect(checkOutbox(vague).error).toContain('2026-08-13T18:00:00');
  });

  it('an attendee that is not an email address is refused', () => {
    const named = event({
      event: {
        start: '2026-08-13T16:00:00',
        end: '2026-08-13T17:00:00',
        attendees: ['Pepo Dussaillant'],
      },
    });
    expect(checkOutbox(named).error).toContain('not an email address');
  });

  it('the event block is refused on any other channel', () => {
    const got = checkOutbox({
      channel: 'telegram',
      messages: [
        {
          to: '123',
          body: 'x',
          event: { start: '2026-08-13T16:00:00', end: '2026-08-13T17:00:00' },
        },
      ],
    });
    expect(got.error).toContain('only the calendar channel');
  });
});

/**
 * The files block (D-159): real attachments on the channels whose clients
 * can carry one, held to the same review-is-the-truth rule as everything
 * else in the outbox — a claimed file must exist in the sandbox at parse,
 * or the card would promise what the send cannot do (the D-134 lie, told
 * from the other end).
 */
describe('the files block', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-outbox-files-'));
    mkdirSync(path.join(dir, 'input'), { recursive: true });
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    writeFileSync(path.join(dir, 'input', 'contract.pdf'), 'contract bytes');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const withFiles = (files: unknown, channel = 'telegram') => ({
    channel,
    messages: [{ to: '123', body: 'here you go', files }],
  });

  it('parses files that exist, root and input/ both', () => {
    const got = checkOutbox(withFiles([' report.pdf ', 'input/contract.pdf']), dir);
    expect(got.error).toBeUndefined();
    expect(got.outboxes?.[0].messages[0].files).toEqual(['report.pdf', 'input/contract.pdf']);
  });

  it('gmail takes files too; every other channel refuses them', () => {
    expect(checkOutbox(withFiles(['report.pdf'], 'gmail'), dir).error).toBeUndefined();
    for (const channel of ['slack', 'whatsapp-business', 'github']) {
      const got = checkOutbox(withFiles(['report.pdf'], channel), dir);
      expect(got.error).toContain('only telegram and gmail send "files"');
    }
  });

  it('a file the run never wrote is refused by name', () => {
    const got = checkOutbox(withFiles(['ghost.pdf']), dir);
    expect(got.error).toContain('"ghost.pdf"');
    expect(got.error).toContain('no such file');
  });

  it('without a sandbox dir only the shapes are checked', () => {
    expect(checkOutbox(withFiles(['ghost.pdf'])).error).toBeUndefined();
  });

  it.each([
    ['a traversal', '../secrets.env'],
    ['a backslash path', 'input\\contract.pdf'],
    ['a deep path', 'a/b/c.pdf'],
    ['a non-input prefix', 'output/report.pdf'],
    ['a dotfile', '.env'],
    ['an empty name', '  '],
  ])('%s is refused', (_, name) => {
    expect(checkOutbox(withFiles([name]), dir).error).toBeTruthy();
  });

  it('the same file twice in one message is refused', () => {
    expect(checkOutbox(withFiles(['report.pdf', 'report.pdf']), dir).error).toContain(
      'appears twice',
    );
  });

  it(`more than ${MAX_OUTBOX_FILES} files is refused`, () => {
    const many = Array.from({ length: MAX_OUTBOX_FILES + 1 }, (_, i) => `f${i}.txt`);
    expect(checkOutbox(withFiles(many), dir).error).toContain(`cap is ${MAX_OUTBOX_FILES}`);
  });

  it('a file over the per-file cap is refused by name', () => {
    writeFileSync(path.join(dir, 'huge.bin'), Buffer.alloc(MAX_OUTBOX_FILE_BYTES + 1));
    const got = checkOutbox(withFiles(['huge.bin']), dir);
    expect(got.error).toContain('"huge.bin"');
    expect(got.error).toContain('cap per file');
  });

  it('files that fit alone but not together are refused as a total', () => {
    const half = Math.ceil(MAX_OUTBOX_FILES_TOTAL_BYTES / 2) + 1024;
    writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(half));
    writeFileSync(path.join(dir, 'b.bin'), Buffer.alloc(half));
    expect(checkOutbox(withFiles(['a.bin', 'b.bin']), dir).error).toContain('cap per message');
  });

  it('readOutbox holds a session file to the same existence rule', () => {
    writeFileSync(
      path.join(dir, OUTBOX_FILE),
      JSON.stringify(withFiles(['report.pdf', 'ghost.pdf'])),
    );
    expect(readOutbox(dir)?.error).toContain('"ghost.pdf"');
  });

  it('composeOutbox rides the attachments it is given, verified in the dir', () => {
    const got = composeOutbox('telegram', 'Brian — 123', 'here it is', ['input/contract.pdf'], dir);
    expect(got.error).toBeUndefined();
    expect(got.outboxes?.[0].messages[0].files).toEqual(['input/contract.pdf']);
    expect(
      composeOutbox('telegram', 'Brian — 123', 'x', ['input/ghost.pdf'], dir).error,
    ).toContain('"input/ghost.pdf"');
  });
});
