import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Outbox } from '@agentlings/shared';
import { autoBlocker } from './approvals';
import { briefForJob } from './channel';
import { JobQueue } from './queue';
import { decide } from './router';
import { splitSteps } from './steps';
import {
  WITHHELD_FILE,
  checkWithheld,
  readWithheld,
  wantsWithholding,
  withholdingLeaks,
  withholdingRefusal,
} from './redact';

/**
 * The withholding gate (D-181). The promise is deliberately narrow — what the
 * run *declared* it removed is genuinely absent from what goes out — so these
 * pin both halves: it catches what it says it catches, and it does not pretend
 * to catch what it cannot.
 */
describe('wantsWithholding', () => {
  it('claims the three real sentences this was built against', () => {
    expect(wantsWithholding('Email Ana the incident report with the customer names removed')).toBe(
      true,
    );
    expect(wantsWithholding('Telegram me the salary table but mask everything except the totals')).toBe(
      true,
    );
    expect(wantsWithholding('Send the audit findings to the board, leaving out anything confidential')).toBe(
      true,
    );
  });

  it('claims the deliberate verbs on their own — nobody redacts by accident', () => {
    expect(wantsWithholding('redact the client names and send it')).toBe(true);
    expect(wantsWithholding('anonymise the responses before emailing them')).toBe(true);
    expect(wantsWithholding('withhold the salary column')).toBe(true);
  });

  it('claims "without" only where something worth withholding follows', () => {
    expect(wantsWithholding('email the table without the names')).toBe(true);
    expect(wantsWithholding('send the summary without any personal details')).toBe(true);
    // The commonest sentence in this codebase's own history must not fire.
    expect(wantsWithholding('refactor the parser without breaking the tests')).toBe(false);
    expect(wantsWithholding('do it without asking me first')).toBe(false);
  });

  it('leaves the everyday code senses alone', () => {
    expect(wantsWithholding('apply a bitmask to the flags')).toBe(false);
    expect(wantsWithholding('add an input mask to the phone field')).toBe(false);
    expect(wantsWithholding('remove the dead code from queue.ts')).toBe(false);
  });
});

describe('checkWithheld — the declaration contract', () => {
  it('takes a well-formed declaration and trims it', () => {
    const got = checkWithheld({
      items: [{ what: '  the customer names ', values: [' Acme Corp ', 'Jane Doe', 'Acme Corp'] }],
      note: ' judged by the header row ',
    });
    expect(got.error).toBeUndefined();
    // Deduplicated, trimmed, and the note kept for the reviewer.
    expect(got.withheld).toEqual({
      items: [{ what: 'the customer names', values: ['Acme Corp', 'Jane Doe'] }],
      note: 'judged by the header row',
    });
  });

  it.each([
    ['not an object', 'nope', '"items"'],
    ['no items', { items: [] }, '"items"'],
    ['an item with no what', { items: [{ values: ['Acme'] }] }, '"what"'],
    ['an item with no values', { items: [{ what: 'names', values: [] }] }, '"values"'],
    ['a non-string value', { items: [{ what: 'names', values: [1] }] }, 'must be a string'],
  ])('refuses %s, by name', (_, parsed, reason) => {
    const got = checkWithheld(parsed);
    expect(got.withheld).toBeUndefined();
    expect(got.error).toContain(reason);
  });

  /**
   * A one- or two-character value appears in almost every message, so a gate
   * holding one would refuse every send this job ever makes — a block with no
   * discoverable cause. Refused at the door with the reason instead.
   */
  it('refuses a value too short to check against a message', () => {
    const got = checkWithheld({ items: [{ what: 'initials', values: ['JD'] }] });
    expect(got.error).toContain('too short');
  });
});

describe('withholdingLeaks — the check itself', () => {
  const outbox = (body: string, over: Partial<Outbox['messages'][0]> = {}): Outbox[] => [
    { channel: 'gmail', messages: [{ to: 'ana@example.com', body, ...over }] },
  ];
  const withheld = { items: [{ what: 'the customer names', values: ['Acme Corp', 'Jane Doe'] }] };

  it('passes a message the values are genuinely out of', () => {
    const got = withholdingLeaks(outbox('Three incidents last month, all resolved.'), withheld);
    expect(got.leaks).toEqual([]);
    expect(withholdingRefusal(got)).toBeNull();
  });

  it('catches a value that survived, and says where', () => {
    const got = withholdingLeaks(outbox('Acme Corp reported two of them.'), withheld);
    expect(got.leaks).toEqual([
      { value: 'Acme Corp', what: 'the customer names', where: 'gmail → ana@example.com' },
    ]);
    expect(withholdingRefusal(got)).toContain('still there');
    expect(withholdingRefusal(got)).toContain('Nothing was sent');
  });

  /**
   * Case-insensitive substring, the loosest match available, and deliberately:
   * this decides whether a send is *refused*, and a refusal is recoverable
   * while a leak is not. A boundary-aware match would miss "ACME's".
   */
  it('catches a different case and a possessive', () => {
    expect(withholdingLeaks(outbox("ACME CORP's report"), withheld).leaks).toHaveLength(1);
    expect(withholdingLeaks(outbox('acme corp said so'), withheld).leaks).toHaveLength(1);
  });

  it('checks the subject and the file names too, not just the body', () => {
    expect(withholdingLeaks(outbox('clean', { subject: 'Re: Acme Corp' }), withheld).leaks).toHaveLength(
      1,
    );
    expect(
      withholdingLeaks(outbox('clean', { files: ['acme corp summary.md'] }), withheld).leaks,
    ).toHaveLength(1);
  });

  it('checks every channel of a multi-channel send', () => {
    const both: Outbox[] = [
      { channel: 'telegram', messages: [{ to: '1', body: 'clean' }] },
      { channel: 'gmail', messages: [{ to: 'a@b.com', body: 'Jane Doe again' }] },
    ];
    const got = withholdingLeaks(both, withheld);
    expect(got.leaks.map((l) => l.where)).toEqual(['gmail → a@b.com']);
  });
});

describe('withholdingLeaks — attachments', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-redact-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }).catch(() => {}));

  const withheld = { items: [{ what: 'the client names', values: ['Acme Corp'] }] };
  const withFile = (name: string): Outbox[] => [
    { channel: 'gmail', messages: [{ to: 'a@b.com', body: 'clean', files: [name] }] },
  ];

  it('reads a text attachment and catches what survived inside it', () => {
    writeFileSync(path.join(dir, 'report.md'), '# Incidents\n\nAcme Corp reported two.\n');
    const got = withholdingLeaks(withFile('report.md'), withheld, dir);
    expect(got.leaks).toHaveLength(1);
    expect(got.leaks[0].where).toContain('report.md');
  });

  it('passes a text attachment that is genuinely clean', () => {
    writeFileSync(path.join(dir, 'report.md'), '# Incidents\n\nTwo were reported.\n');
    expect(withholdingLeaks(withFile('report.md'), withheld, dir).leaks).toEqual([]);
  });

  /**
   * The honest limit, pinned so it cannot quietly become a claim: a format the
   * gate cannot read is *named* as unscanned rather than passing as clean.
   */
  it('names a binary it cannot read instead of calling it clean', () => {
    writeFileSync(path.join(dir, 'report.pdf'), 'not really a pdf but not readable text either');
    const got = withholdingLeaks(withFile('report.pdf'), withheld, dir);
    expect(got.leaks).toEqual([]);
    expect(got.unscanned).toEqual(['report.pdf']);
  });
});

/**
 * The seam, end to end: a file in a sandbox becomes a stamped declaration,
 * blocks auto-send, and refuses a leaking outbox by name. Route wiring is
 * where this codebase's faults have lived (D-097, D-178), and every piece
 * below was correct on its own before this test existed.
 */
describe('the gate, from the sandbox to the refusal', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-gate-'));
  });
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const runThatWithheld = (body: string) => {
    const queue = new JobQueue(root);
    const job = queue.add({
      title: 'Incident report',
      prompt: 'Email Ana the incident report with the customer names removed',
      channels: ['gmail'],
    });
    queue.assign(job.id, 'a1');
    const dir = queue.start(job.id);
    writeFileSync(
      path.join(dir, 'OUTBOX.json'),
      JSON.stringify({
        channel: 'gmail',
        messages: [{ to: 'ana@example.com', subject: 'Incident report', body }],
      }),
    );
    writeFileSync(
      path.join(dir, WITHHELD_FILE),
      JSON.stringify({ items: [{ what: 'the customer names', values: ['Acme Corp', 'Jane Doe'] }] }),
    );
    queue.complete(job.id, 'wrote the report');
    return { job: queue.get(job.id)!, dir };
  };

  it('stamps the declaration, blocks auto-send, and refuses a leak by name', () => {
    const { job, dir } = runThatWithheld('Three incidents. ACME CORP reported two of them.');
    expect(job.withheld?.items[0].values).toEqual(['Acme Corp', 'Jane Doe']);
    // A judgement about what a person may see is never sent unlooked-at.
    expect(autoBlocker(job, ['RESULT.md', 'OUTBOX.json', WITHHELD_FILE])).toContain('withheld');
    const refusal = withholdingRefusal(withholdingLeaks(job.outbox ?? [], job.withheld!, dir));
    // Caught across a case change, and it says which value and where.
    expect(refusal).toContain('Acme Corp');
    expect(refusal).toContain('ana@example.com');
  });

  it('lets a genuinely clean send through — the gate is not a wall', () => {
    const { job, dir } = runThatWithheld('Three incidents last month, all resolved.');
    expect(withholdingRefusal(withholdingLeaks(job.outbox ?? [], job.withheld!, dir))).toBeNull();
  });

  it('a declaration that did not parse is an error, never "nothing was withheld"', () => {
    const queue = new JobQueue(root);
    const job = queue.add({ title: 'T', prompt: 'email it with the names removed' });
    queue.assign(job.id, 'a1');
    const dir = queue.start(job.id);
    writeFileSync(path.join(dir, WITHHELD_FILE), '{"items":[{"what":"names"}]}');
    queue.complete(job.id, 'done');
    const done = queue.get(job.id)!;
    expect(done.withheld).toBeUndefined();
    expect(done.withheldError).toContain('"values"');
    expect(autoBlocker(done, ['RESULT.md'])).toContain('withheld');
  });
});

/**
 * The gate follows the chain, not the sentence (D-183). Raising MAX_STEPS to
 * four unlocked "…then redact the client names, then email it to the partners"
 * — and split, the *sending* step's own words say nothing about withholding,
 * so a gate reading only that step would arm the redaction and leave the send
 * open. Found by probing the raise before trusting it.
 */
describe('a withholding that lives in an earlier step', () => {
  const full =
    'Research the competitor pricing, then review the draft for errors, then redact the client names, then email it to the partners';

  it('the sending step does not say it itself — which is the whole problem', () => {
    const steps = splitSteps(full)!;
    expect(steps).toHaveLength(4);
    expect(wantsWithholding(steps[2])).toBe(true);
    expect(wantsWithholding(steps[3])).toBe(false);
  });

  it('the chain flag tells the sending step anyway', () => {
    const sending = splitSteps(full)![3];
    const told = (withholding: boolean) =>
      briefForJob(
        { channels: ['gmail'], prompt: sending, withholding },
        () => [],
        () => undefined,
      )?.includes('WITHHELD.json') ?? false;
    expect(told(false)).toBe(false);
    expect(told(true)).toBe(true);
  });

  it('and keeps that step off the shortcut tiers', () => {
    const sending = splitSteps(full)![3];
    const context = {
      knowledge: [],
      store: [],
      recipes: [],
      tools: [],
      canFetch: true,
      capabilities: [],
    };
    const job = (withholding: boolean) => ({
      id: '',
      title: '',
      prompt: sending,
      status: 'queued' as const,
      slot: -1,
      createdAt: 0,
      channels: ['gmail'],
      send: { to: 'ana@example.com', words: 'the draft' },
      ...(withholding ? { withholding: true } : {}),
    });
    // Without the flag the desk would compose this send for nothing, carrying
    // no redaction at all.
    expect(decide(job(false), context).kind).toBe('compose');
    expect(decide(job(true), context).kind).toBe('agent');
  });
});

describe('readWithheld', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-redact-read-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }).catch(() => {}));

  it('is null when the run declared nothing', () => {
    expect(readWithheld(dir)).toBeNull();
  });

  it('surfaces torn JSON as its reason, never as "nothing was withheld"', () => {
    writeFileSync(path.join(dir, WITHHELD_FILE), '{"items": [');
    expect(readWithheld(dir)?.error).toContain('not valid JSON');
  });
});
