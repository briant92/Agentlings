import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_SLOTS,
  type Job,
  type JobEvent,
  type LevelPack,
  type PromotedTo,
  type ResolvedBy,
  type Verdict,
  type WireSettings,
} from '@agentlings/shared';
import { readApprovals } from './approvals';
import type { Connection } from './connections';
import { EventLog } from './events';
import { beginPatch, endPatch, patchFile } from './gitwork';
import { append as appendLedger, ledgerRow, readLedger } from './ledger';
import { createLevelFiles, levelDir, readRoster } from './levels';
import { MemoryStore } from './memory';
import { MOVES_FILE, MOVES_JOURNAL } from './moves';
import { NOMINA_FILE, NOMINA_OUTPUT } from './nomina';
import { OUTBOX_FILE } from './outbox';
import { performOutboxSend, type OutboxSendOpts } from './outboxsend';
import { PACK_FILE } from './packcontract';
import { installPack, packsDir } from './packs';
import { PARTY_FILE, PLAN_SENTENCE } from './party';
import { JobQueue, type NewJobSpec } from './queue';
import { RECONCILIATION_FILE, RECONCILIATIONS_DIR } from './reconciliation';
import { WITHHELD_FILE } from './redact';
import { readSettings } from './settings';
import { RUN_SCRIPT, VERIFY_SCRIPT, readTools, toolDir, writeTool } from './tools';
import {
  performVerdict,
  type InstallContext,
  type QueueParty,
  type VerdictContext,
  type VerdictResult,
  type VerdictRuntime,
} from './verdict';

/**
 * The verdict through its interface alone (D-278): a real queue on disk under
 * a temporary level, a recording fake for the send, and assertions on what
 * came back, what the fake saw, what the queue now holds, what the ledger
 * says and what the feed received. Nothing here reaches past `performVerdict`.
 */

/** The one connection the fixture's channel needs, with its secret in the env. */
const TELEGRAM: Connection = {
  name: 'telegram',
  label: 'Telegram',
  transport: 'builtin',
  defaultOn: true,
  secrets: { TELEGRAM_BOT_TOKEN: 'the bot token' },
};

const ENV = { TELEGRAM_BOT_TOKEN: 't' };

/** Edig's worked example (D-222) — balanced as written; drop the IVA line and it is not. */
const EDIG = {
  period: '2026-05',
  currency: 'CLP',
  statement: { label: 'cartola-mayo-2026.csv', closing: 4118500 },
  records: { label: 'libro-mayor-banco-mayo-2026.csv', closing: 4250000 },
  adjustments: [
    { side: 'statement', kind: 'in-transit', amount: 242150, what: 'Depósito 31/05, factura 4516' },
    { side: 'statement', kind: 'outstanding', amount: -120000, what: 'Transferencia Imprenta Norte, factura 5610' },
    { side: 'records', kind: 'interest', amount: 8500, what: 'Intereses ganados 31/05' },
    { side: 'records', kind: 'fee', amount: -15000, what: 'Comisión mantención' },
    { side: 'records', kind: 'fee', amount: -2850, what: 'IVA comisión' },
  ],
  matched: [{ statement: '04/05 4512', records: ['CI-1201'], amount: 1190000, date: '04/05/2026' }],
  unmatched: {
    statement: [{ ref: '15/05 comisión', amount: -15000, what: 'Comisión mantención', category: 'fee' }],
    records: [{ ref: 'CE-3311', amount: -120000, what: 'Imprenta Norte', category: 'outstanding' }],
  },
  entries: [{ debit: 'Gastos bancarios', credit: 'Banco', amount: 17850, memo: 'comisión + IVA' }],
};

const OUTBOX = {
  channel: 'telegram',
  messages: [{ to: '1', name: 'Ana', body: 'padel on Thursday' }],
};

/** The pack contract's own worked draft — whole, plate-less, installable as it is. */
const PACK: { slug: string; pack: LevelPack } = {
  slug: 'moby-dick',
  pack: {
    name: 'The Pequod',
    provenance: 'authored by the crew',
    viewH: 450,
    groundY: 388,
    theme: Object.fromEntries(THEME_SLOTS.map((s) => [s, 0x112233])),
    ops: [{ op: 'rect', x: 0, y: 'groundY', w: 'worldWidth', h: 62, color: 'wood' }],
  } as unknown as LevelPack,
};

/** One folder made, one file moved into it. */
const MOVES = {
  moves: [
    { op: 'mkdir', path: 'invoices' },
    { op: 'move', from: 'a.pdf', to: 'invoices/a.pdf' },
  ],
};

/** The nómina tests' wire: one account paying, two payees a person typed. */
const WIRE: WireSettings = {
  chargeAccount: '000012345678',
  format: 'bci',
  payees: [
    {
      rut: '76123456-0',
      name: 'Imprenta Norte SpA',
      bank: '016',
      account: '00000000012345678',
      accountLabel: 'Imprenta Norte',
    },
    { rut: '9876543-3', name: 'Ana Rivas', bank: '037', account: '77712345' },
  ],
};

/** One row to Ana Rivas, composing to the line the bank's example shows. */
const BATCH = { paymentType: 'REM', rows: [{ rut: '9876543-3', amount: 2 }] };

/** The diff a run leaves against the fixture repository's one file. */
const PATCH = [
  'diff --git a/greet.js b/greet.js',
  '--- a/greet.js',
  '+++ b/greet.js',
  '@@ -1 +1 @@',
  "-console.log('Helo');",
  "+console.log('Hello');",
  '',
].join('\n');

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' });
}

/**
 * A send that honours the door's contract — reads who was already reached
 * under the call, stamps each channel through `record` — and records what it
 * was handed. `failing` names the recipients the channel refuses, by reason.
 */
function fakeSend(failing: Record<string, string> = {}) {
  const calls: OutboxSendOpts[] = [];
  const send: VerdictContext['send'] = async (opts) => {
    calls.push(opts);
    return opts.outboxes.map((outbox) => {
      const already = opts.alreadySent(outbox.channel);
      const run = { sentTo: [] as string[], failed: [] as { to: string; reason: string }[] };
      for (const m of outbox.messages) {
        if (already.includes(m.to)) continue;
        if (failing[m.to]) run.failed.push({ to: m.to, reason: failing[m.to] });
        else run.sentTo.push(m.to);
      }
      opts.record(outbox.channel, run);
      return { channel: outbox.channel, run };
    });
  };
  return { send, calls };
}

/** A push that records what it was asked and answers `outcome` — or throws it. */
function fakePush(outcome: PromotedTo | null | Error = null) {
  const calls: Parameters<VerdictContext['pushRemote']>[] = [];
  const pushRemote: VerdictContext['pushRemote'] = async (...args) => {
    calls.push(args);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { pushRemote, calls };
}

/** The party thunk, recording what it was asked to queue and queueing nothing. */
function fakeParty() {
  const calls: Parameters<QueueParty>[] = [];
  const queueParty: QueueParty = (...args) => {
    calls.push(args);
    return [];
  };
  return { queueParty, calls };
}

describe('performVerdict (D-278)', () => {
  let root: string;
  let rt: VerdictRuntime;
  let events: JobEvent[];
  let install: InstallContext;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-verdict-'));
    const meta = createLevelFiles(root, { name: 'HQ', project: 'HQ', theme: 'default' });
    const dir = levelDir(root, meta.id);
    events = [];
    rt = {
      meta,
      dir,
      queue: new JobQueue(dir),
      eventLog: new EventLog((event) => events.push(event)),
      memory: new MemoryStore(path.join(dir, 'memory')),
      roster: readRoster(dir),
    };
    install = {
      sandboxRoot: root,
      repoRoot: root,
      env: ENV,
      http: async () => {
        throw new Error('nothing here reaches the network');
      },
      connections: () => [TELEGRAM],
      settings: () => readSettings(root),
    };
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  /** A finished job, its sandbox holding `files`, assigned to the first of the crew. */
  function finished(
    files: Record<string, string> = { [OUTBOX_FILE]: JSON.stringify(OUTBOX) },
    spec: Partial<NewJobSpec> & { fail?: string } = {},
  ): Job {
    const { fail, ...rest } = spec;
    const job = rt.queue.add({
      title: 'Padel',
      prompt: 'telegram Ana about padel on Thursday',
      channels: ['telegram'],
      ...rest,
    });
    rt.queue.assign(job.id, rt.roster[0].id);
    const sandbox = rt.queue.start(job.id);
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(sandbox, name), text);
    if (fail) rt.queue.fail(job.id, fail);
    else rt.queue.complete(job.id, 'wrote the outbox');
    return rt.queue.get(job.id)!;
  }

  function give(
    job: Job,
    verdict: Verdict,
    over: Partial<VerdictContext> = {},
    by: ResolvedBy = 'you',
    given: { packSlug?: string } = {},
  ) {
    const ctx: VerdictContext = {
      install,
      send: fakeSend().send,
      pushRemote: fakePush().pushRemote,
      queueParty: fakeParty().queueParty,
      ...over,
    };
    return performVerdict(rt, job, verdict, by, ctx, given);
  }

  const resolved = () => events.filter((e) => e.type === 'resolved');

  /** A repository on this disk with one committed file, for the level to name. */
  function gitRepo(): string {
    const origin = path.join(root, 'origin');
    mkdirSync(origin);
    execFileSync('git', ['init', '-q', origin], { stdio: 'pipe' });
    git(origin, 'config', 'user.name', 'Test');
    git(origin, 'config', 'user.email', 'test@example.com');
    writeFileSync(path.join(origin, 'greet.js'), "console.log('Helo');\n");
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'init');
    return origin;
  }

  /** A real folder holding `files`, for a job to reorganize. */
  function folderWith(files: string[]): string {
    const folder = path.join(root, 'folder');
    mkdirSync(folder, { recursive: true });
    for (const name of files) writeFileSync(path.join(folder, name), 'x');
    return folder;
  }

  describe('the gates, each refusing by name and leaving the job reviewable', () => {
    it("a patch in flight is busy (D-163) — the first Approve's apply must land first", async () => {
      const job = finished();
      const { send, calls } = fakeSend();
      beginPatch(job.id);
      try {
        const got = await give(job, 'promote', { send });
        expect(got.refused).toEqual({
          kind: 'busy',
          reason:
            "this job's patch is still applying — the first Approve is doing it; try again when it lands",
        });
      } finally {
        endPatch(job.id);
      }
      expect(calls).toHaveLength(0);
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(resolved()).toHaveLength(0);
    });

    it('a job that cannot take a verdict is refused in the words the queue has always used', async () => {
      const job = rt.queue.add({ title: 'Later', prompt: 'not yet' });
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({ kind: 'refused', reason: `job ${job.id} is queued, not resolvable` });
      expect(rt.queue.get(job.id)!.status).toBe('queued');
    });

    it('the reconciliation gate (D-222) refuses a promote whose sides do not meet, and lets a discard through', async () => {
      const short = { ...EDIG, adjustments: EDIG.adjustments.slice(0, 4) };
      const job = finished({ [RECONCILIATION_FILE]: JSON.stringify(short) }, { channels: [] });
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'not reconciled — the two sides differ by 2,850 CLP (statement 4,240,650 against records 4,243,500). Approving is refused until they meet; reply to the job with what is missing.',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
      const discarded = await give(job, 'discard');
      expect(discarded.job?.status).toBe('discarded');
    });

    it('the payee gate (D-268) refuses a batch whose declaration did not parse, in the same words', async () => {
      const job = finished({ [NOMINA_FILE]: 'not json' }, { channels: [] });
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'nómina not composed — NOMINA.json: not valid JSON. Reply to the job to have it written properly. Nothing was composed.',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
    });

    it('the outbox door refuses a channel with no connection, before any send', async () => {
      const job = finished();
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { install: { ...install, connections: () => [] }, send });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: 'outbox not sent — channel "telegram" has no "telegram" connection in the catalog',
      });
      expect(calls).toHaveLength(0);
      expect(rt.queue.get(job.id)!.status).toBe('done');
    });

    it('the withholding gate (D-181) refuses a send still carrying a value the run said it removed', async () => {
      const job = finished({
        [OUTBOX_FILE]: JSON.stringify({
          channel: 'telegram',
          messages: [{ to: '1', name: 'Ana', body: 'Acme Corp owes us' }],
        }),
        [WITHHELD_FILE]: JSON.stringify({
          items: [{ what: 'the customer names', values: ['Acme Corp'] }],
        }),
      });
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { send });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'outbox not sent — the run said it removed these and they are still there — "Acme Corp" (the customer names) in telegram → Ana. Nothing was sent.',
      });
      expect(calls).toHaveLength(0);
    });

    it('a withholding declaration that did not parse blocks too — never read as "nothing withheld"', async () => {
      const job = finished({ [OUTBOX_FILE]: JSON.stringify(OUTBOX), [WITHHELD_FILE]: 'not json' });
      expect(job.withheldError).toBe('WITHHELD.json: not valid JSON');
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { send });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: 'outbox not sent — WITHHELD.json: not valid JSON. Nothing was sent.',
      });
      expect(calls).toHaveLength(0);
    });

    it('a send already in progress is busy (D-160) — the door said no and nothing moved', async () => {
      const job = finished();
      const got = await give(job, 'promote', { send: async () => null });
      expect(got.refused).toEqual({
        kind: 'busy',
        reason:
          'this outbox is already sending — the first Approve is doing it; the card updates when it lands',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(resolved()).toHaveLength(0);
    });

    it('through the real door, two concurrent Approves send once and the second is busy', async () => {
      const job = finished();
      let fetches = 0;
      const fetchFn = (async () => {
        fetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }) as unknown as typeof fetch;
      const send: VerdictContext['send'] = (opts) => performOutboxSend({ ...opts, fetchFn });
      const [a, b] = await Promise.all([give(job, 'promote', { send }), give(job, 'promote', { send })]);
      const outcomes = [a, b].map((r) => (r.refused ? r.refused.kind : r.job.status)).sort();
      expect(outcomes).toEqual(['busy', 'promoted']);
      expect(fetches).toBe(1);
      expect(rt.queue.get(job.id)!.outboxSent?.[0]?.sentTo).toEqual(['1']);
      expect(resolved()).toHaveLength(1);
    });
  });

  describe('a promote of a pure send', () => {
    it('sends through the adapter, stamps per channel through the queue, records the approval and says so in the feed', async () => {
      const job = finished();
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { send });
      expect(got.refused).toBeUndefined();
      expect(got.job?.status).toBe('promoted');
      expect(got.job?.resolvedBy).toBe('you');
      // The adapter was handed the job's own door options.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        outboxes: [OUTBOX],
        jobId: job.id,
        levelId: rt.meta.id,
        dir: rt.queue.sandboxDir(job.id),
        sandboxRoot: root,
        env: ENV,
      });
      expect(calls[0].mailThread).toBeUndefined();
      // The stamp is the queue's, and it survives the disk.
      const stored = new JobQueue(rt.dir).get(job.id)!;
      expect(stored.status).toBe('promoted');
      expect(stored.outboxSent).toMatchObject([{ channel: 'telegram', sentTo: ['1'], failed: [] }]);
      // The approval is one earned review, and rides the result for the card.
      const approvals = readApprovals(rt.dir);
      expect(approvals).toHaveLength(1);
      expect(approvals[0].approvals).toBe(1);
      expect(got.sendApproval).toMatchObject({ key: approvals[0].key, approvals: 1, auto: false });
      expect(resolved()).toHaveLength(1);
      expect(resolved()[0]).toMatchObject({
        jobId: job.id,
        title: 'Padel',
        detail: 'approved — sent 1 via telegram',
        by: 'you',
      });
    });

    it('hands the triggering mail thread to the door (D-248), and only that one', async () => {
      const job = finished(undefined, {
        mailTrigger: { id: 'm1', threadId: 'thread-9', msgId: '<msg-9>' },
      });
      const { send, calls } = fakeSend();
      await give(job, 'promote', { send });
      expect(calls[0].mailThread).toEqual({ threadId: 'thread-9', msgId: '<msg-9>' });
    });

    it('a partial send leaves the job reviewable, names the failures per channel, and a retry sends nobody twice', async () => {
      const job = finished({
        [OUTBOX_FILE]: JSON.stringify({
          channel: 'telegram',
          messages: [
            { to: '1', name: 'Ana', body: 'padel' },
            { to: '2', name: 'Luis', body: 'padel' },
          ],
        }),
      });
      const first = fakeSend({ '2': 'chat not found' });
      const got = await give(job, 'promote', { send: first.send });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'sent 1 of 2 — 2 on telegram: chat not found. Approve again to retry the failures; nobody is messaged twice.',
      });
      const after = rt.queue.get(job.id)!;
      expect(after.status).toBe('done');
      expect(after.outboxSent?.[0]).toMatchObject({
        channel: 'telegram',
        sentTo: ['1'],
        failed: [{ to: '2', reason: 'chat not found' }],
      });
      expect(readApprovals(rt.dir)).toHaveLength(0);
      expect(resolved()).toHaveLength(0);

      const second = fakeSend();
      const again = await give(rt.queue.get(job.id)!, 'promote', { send: second.send });
      expect(again.job?.status).toBe('promoted');
      // The retry reached Luis and only Luis: Ana's stamp was read under the call.
      expect(rt.queue.get(job.id)!.outboxSent?.[0]?.sentTo).toEqual(['1', '2']);
      expect(resolved()[0].detail).toBe('approved — sent 1 via telegram');
    });

    it('a promote with nothing to send just stamps and says approved', async () => {
      const job = finished({ 'report.md': '# done' }, { channels: [] });
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { send });
      expect(got.job?.status).toBe('promoted');
      expect(calls).toHaveLength(0);
      expect(readApprovals(rt.dir)).toHaveLength(0);
      expect(resolved()[0].detail).toBe('approved');
    });
  });

  describe('the racing verdict (D-162)', () => {
    it('a discard landing while the outbox was sending stops everything after the send', async () => {
      const job = finished();
      const racing = fakeSend();
      const send: VerdictContext['send'] = async (opts) => {
        // The other request's verdict lands inside the send's await.
        rt.queue.resolve(job.id, 'discard', 'you');
        return racing.send(opts);
      };
      const got = await give(job, 'promote', { send });
      expect(got.refused).toEqual({
        kind: 'busy',
        reason:
          'while the outbox was sending, this job was discarded by another request — nothing further was applied',
      });
      // The finished sends are stamped and safe; nothing after them happened.
      expect(rt.queue.get(job.id)!.outboxSent?.[0]?.sentTo).toEqual(['1']);
      expect(rt.queue.get(job.id)!.status).toBe('discarded');
      expect(readApprovals(rt.dir)).toHaveLength(0);
      expect(resolved()).toHaveLength(0);
    });
  });

  describe('discard and clear', () => {
    it('a discard of a delivery banks the lesson to its maker (D-201), not to whoever else holds the role', async () => {
      const [maker, other] = rt.roster;
      other.role = maker.role;
      const job = finished(undefined, { clarifications: [] });
      const got = await give(job, 'discard');
      expect(got.job?.status).toBe('discarded');
      const lessons = rt.memory.lessons(maker.name);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]).toContain('my delivery was discarded, not what was wanted (job: Padel)');
      expect(rt.memory.lessons(other.name)).toEqual([]);
      const knowledge = readFileSync(path.join(rt.dir, 'KNOWLEDGE.md'), 'utf8');
      expect(knowledge).toContain(`${maker.name} (${maker.role}) had "Padel" discarded`);
      expect(resolved()[0]).toMatchObject({
        detail: `discarded — nothing applied, the work stays in the sandbox · ${maker.name} banked what was turned down`,
        by: 'you',
      });
    });

    it('banks the lesson before the stamp — a stamp that refuses still leaves it taught', async () => {
      const job = finished();
      const maker = rt.roster.find((s) => s.id === job.assignedTo)!;
      vi.spyOn(rt.queue, 'resolve').mockImplementationOnce(() => {
        throw new Error('the disk is full');
      });
      const got = await give(job, 'discard');
      expect(got.refused).toEqual({ kind: 'refused', reason: 'the disk is full' });
      expect(rt.memory.lessons(maker.name)).toHaveLength(1);
      expect(resolved()).toHaveLength(0);
    });

    it('a discard of a failed run banks nothing — nothing was delivered to refuse', async () => {
      const job = finished({}, { fail: 'ran out of turns' });
      expect(job.status).toBe('failed');
      const got = await give(job, 'discard');
      expect(got.job?.status).toBe('discarded');
      expect(existsSync(path.join(rt.dir, 'memory'))).toBe(false);
      expect(existsSync(path.join(rt.dir, 'KNOWLEDGE.md'))).toBe(false);
      expect(resolved()[0].detail).toBe('discarded — nothing applied, the work stays in the sandbox');
    });

    it('a discard whose maker is gone from the roster banks nothing rather than crediting a stranger', async () => {
      const job = finished();
      rt.roster = rt.roster.filter((s) => s.id !== job.assignedTo);
      await give(job, 'discard');
      expect(existsSync(path.join(rt.dir, 'memory'))).toBe(false);
      expect(resolved()[0].detail).toBe('discarded — nothing applied, the work stays in the sandbox');
    });

    it('a clear writes nothing and banks nothing (D-216)', async () => {
      const job = finished({
        [OUTBOX_FILE]: JSON.stringify(OUTBOX),
        [RECONCILIATION_FILE]: JSON.stringify(EDIG),
      });
      const { send, calls } = fakeSend();
      const got = await give(job, 'clear', { send });
      expect(got.job?.status).toBe('cleared');
      expect(got.sendApproval).toBeUndefined();
      expect(calls).toHaveLength(0);
      expect(readApprovals(rt.dir)).toHaveLength(0);
      expect(existsSync(path.join(rt.dir, 'memory'))).toBe(false);
      expect(existsSync(path.join(rt.dir, 'KNOWLEDGE.md'))).toBe(false);
      expect(existsSync(path.join(rt.dir, RECONCILIATIONS_DIR))).toBe(false);
      expect(resolved()[0]).toMatchObject({
        detail:
          'cleared — seen and let go: nothing applied, nothing banked, the work stays in the sandbox',
        by: 'you',
      });
    });

    it.each(['discard', 'clear'] as const)(
      'a %s un-reserves the name a compile held (D-045, D-216)',
      async (verdict) => {
        const job = finished({ 'notes.md': 'tried' }, { channels: [] });
        writeTool(rt.dir, {
          name: 'uf-today',
          recipeKey: 'uf today',
          terms: ['uf'],
          hasRepo: false,
          description: 'the UF today',
          learnedAt: Date.now(),
          runs: 0,
          failures: 0,
          pendingJobId: job.id,
        });
        expect(existsSync(toolDir(rt.dir, 'uf-today'))).toBe(true);
        await give(job, verdict);
        expect(existsSync(toolDir(rt.dir, 'uf-today'))).toBe(false);
        expect(readTools(rt.dir)).toEqual([]);
      },
    );
  });

  describe('settlement, in order', () => {
    it("reprices the chain's cut legs strictly before settling the outcome (D-150, D-205)", async () => {
      // A leg cut at the turn wall, absorbed as a failure, then continued by
      // the job under review.
      const leg = rt.queue.add({ title: 'Padel', prompt: 'telegram Ana about padel' });
      rt.queue.assign(leg.id, rt.roster[0].id);
      rt.queue.start(leg.id);
      rt.queue.fail(leg.id, 'out of turns', { turns: 6, costUsd: 0.6, outOfTurns: true });
      appendLedger(
        root,
        ledgerRow({ ...rt.queue.get(leg.id)!, quotedUsd: 0.4 }, rt.meta.id, 'analyst', 'failed', 1),
      );
      const job = finished(undefined, { continues: leg.id });
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      const row = readLedger(root).find((r) => r.jobId === leg.id)!;
      // Priced at min(cost, quote) AND read as done — a pair only the right
      // order produces: settled first, the row would no longer read `failed`
      // and repriceChain would skip it, leaving the price at 0.
      expect(row).toMatchObject({ priceUsd: 0.4, chainPriced: true, outcome: 'done' });
      expect(resolved()[0].detail).toBe(
        "approved — sent 1 via telegram · the chain's 1 cut leg now charged $0.40",
      );
    });

    it('banks the roll-forward (D-223) only after the stamp landed, and only on a promote', async () => {
      const job = finished({ [RECONCILIATION_FILE]: JSON.stringify(EDIG) }, { channels: [] });
      expect(job.reconciliation?.balances).toBe(true);
      const state = path.join(rt.dir, RECONCILIATIONS_DIR, `${job.id}.json`);
      // The stamp refuses: nothing may be banked for a verdict that did not land.
      const stamp = vi.spyOn(rt.queue, 'resolve').mockImplementationOnce(() => {
        throw new Error('the disk is full');
      });
      const refused = await give(job, 'promote');
      expect(refused.refused).toEqual({ kind: 'refused', reason: 'the disk is full' });
      expect(existsSync(state)).toBe(false);
      expect(resolved()).toHaveLength(0);
      stamp.mockRestore();
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(JSON.parse(readFileSync(state, 'utf8'))).toMatchObject({
        jobId: job.id,
        reconciliation: { balances: true },
      });
    });

    it('a discard of a balanced statement banks no roll-forward — it is a verdict on the run', async () => {
      const job = finished({ [RECONCILIATION_FILE]: JSON.stringify(EDIG) }, { channels: [] });
      await give(job, 'discard');
      expect(existsSync(path.join(rt.dir, RECONCILIATIONS_DIR))).toBe(false);
    });
  });

  describe('the two callers', () => {
    it('the app under a standing approval performs the same verdict, stamped and worded as its own', async () => {
      const job = finished();
      const { send } = fakeSend();
      const got = await give(job, 'promote', { send }, 'app');
      expect(got.job?.status).toBe('promoted');
      expect(got.job?.resolvedBy).toBe('app');
      expect(readApprovals(rt.dir)).toHaveLength(1);
      expect(resolved()[0]).toMatchObject({
        detail: 'sent automatically — 1 via telegram, standing approval',
        by: 'app',
      });
    });

    it('the app meets the same gates a person does — the door refuses it in the same words', async () => {
      const job = finished();
      const got = await give(job, 'promote', { install: { ...install, connections: () => [] } }, 'app');
      expect(got.refused?.reason).toBe(
        'outbox not sent — channel "telegram" has no "telegram" connection in the catalog',
      );
      expect(rt.queue.get(job.id)!.status).toBe('done');
    });
  });

  describe('the compiled tool (D-045)', () => {
    /** A compile that left `files` in its sandbox, its name reserved in the manifest. */
    function compiled(files: Record<string, string>, spec: Partial<NewJobSpec> = {}): Job {
      const job = rt.queue.add({
        title: 'Compile uf-today',
        prompt: 'compile the uf today recipe',
        compile: true,
        ...spec,
      });
      rt.queue.assign(job.id, rt.roster[0].id);
      const sandbox = rt.queue.start(job.id);
      for (const [name, text] of Object.entries(files)) writeFileSync(path.join(sandbox, name), text);
      writeTool(rt.dir, {
        name: 'uf-today',
        recipeKey: 'uf today',
        terms: ['uf'],
        hasRepo: false,
        description: 'the UF today',
        learnedAt: Date.now(),
        runs: 0,
        failures: 0,
        pendingJobId: job.id,
      });
      rt.queue.complete(job.id, 'compiled');
      return rt.queue.get(job.id)!;
    }
    const SCRIPT = 'export default 1;\n';

    it('a promote installs the tool — both scripts copied in, the name no longer pending', async () => {
      const job = compiled({ [RUN_SCRIPT]: SCRIPT, [VERIFY_SCRIPT]: SCRIPT });
      expect(job.status).toBe('done');
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      const dir = toolDir(rt.dir, 'uf-today');
      expect(existsSync(path.join(dir, RUN_SCRIPT))).toBe(true);
      expect(existsSync(path.join(dir, VERIFY_SCRIPT))).toBe(true);
      expect(readTools(rt.dir)).toHaveLength(1);
      expect(readTools(rt.dir)[0].pendingJobId).toBeUndefined();
      expect(resolved()[0].detail).toBe('approved');
    });

    it('refuses by name when the run left only one of the two scripts, and keeps the name reserved', async () => {
      const job = compiled({ [RUN_SCRIPT]: SCRIPT });
      expect(job.status).toBe('failed');
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: `the compiling run did not leave both ${RUN_SCRIPT} and ${VERIFY_SCRIPT}`,
      });
      expect(rt.queue.get(job.id)!.status).toBe('failed');
      expect(readTools(rt.dir)[0].pendingJobId).toBe(job.id);
      expect(existsSync(path.join(toolDir(rt.dir, 'uf-today'), RUN_SCRIPT))).toBe(false);
      expect(resolved()).toHaveLength(0);
    });

    it('while a tool is waiting nothing else acts — not even a send the record carries', async () => {
      // The queue never stamps an outbox on a compile, so this state is the
      // module's contract alone: whatever the record says, a waiting tool
      // stands every other act down.
      const job = finished({ [OUTBOX_FILE]: JSON.stringify(OUTBOX), [RUN_SCRIPT]: SCRIPT, [VERIFY_SCRIPT]: SCRIPT });
      writeTool(rt.dir, {
        name: 'uf-today',
        recipeKey: 'uf today',
        terms: ['uf'],
        hasRepo: false,
        description: 'the UF today',
        learnedAt: Date.now(),
        runs: 0,
        failures: 0,
        pendingJobId: job.id,
      });
      const { send, calls } = fakeSend();
      const got = await give(job, 'promote', { send });
      expect(got.job?.status).toBe('promoted');
      expect(calls).toHaveLength(0);
      expect(readTools(rt.dir)[0].pendingJobId).toBeUndefined();
      expect(resolved()[0].detail).toBe('approved');
    });

    it('a compile promotes only its tool — the clone it tried the tool in never reaches the repository', async () => {
      const origin = gitRepo();
      const job = compiled(
        { [RUN_SCRIPT]: SCRIPT, [VERIFY_SCRIPT]: SCRIPT, 'DIFF.patch': PATCH },
        { repoPath: origin },
      );
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(existsSync(path.join(toolDir(rt.dir, 'uf-today'), VERIFY_SCRIPT))).toBe(true);
      expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Helo');
    });
  });

  describe('the pack (M4, D-141, D-156)', () => {
    const packJson = (slug: string) => path.join(packsDir(root), slug, 'pack.json');

    it('a promote installs the pack from the sandbox and the feed names the world', async () => {
      const job = finished({ [PACK_FILE]: JSON.stringify(PACK) }, { channels: [] });
      expect(job.packDraft?.slug).toBe('moby-dick');
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(JSON.parse(readFileSync(packJson('moby-dick'), 'utf8')).name).toBe('The Pequod');
      expect(resolved()[0].detail).toBe('approved — installed the moby-dick world');
    });

    it('a rename at the review installs under the new name and is recorded through the queue, even when a later act refuses', async () => {
      const folder = folderWith(['a.pdf']);
      const job = finished(
        { [PACK_FILE]: JSON.stringify(PACK), [MOVES_FILE]: JSON.stringify(MOVES) },
        { channels: [], organizeRoot: folder },
      );
      rmSync(folder, { recursive: true });
      const got = await give(job, 'promote', {}, 'you', { packSlug: ' pequod ' });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: `the folder is not there any more: ${folder}`,
      });
      expect(existsSync(packJson('pequod'))).toBe(true);
      expect(existsSync(packJson('moby-dick'))).toBe(false);
      // The record matches the world that now exists — persisted by the
      // queue, not written on the record it handed back for a later stamp.
      expect(new JobQueue(rt.dir).get(job.id)!.packDraft?.slug).toBe('pequod');
    });

    it('an unchanged slug is not a rename — the pack already installed is the designed retry path (D-141)', async () => {
      const job = finished({ [PACK_FILE]: JSON.stringify(PACK) }, { channels: [] });
      expect(installPack(root, PACK)).toEqual({ installed: true, already: false });
      const got = await give(job, 'promote', {}, 'you', { packSlug: 'moby-dick' });
      expect(got.job?.status).toBe('promoted');
      expect(resolved()[0].detail).toBe('approved');
    });

    it('a rename onto a name already taken is refused before anything is written', async () => {
      const job = finished({ [PACK_FILE]: JSON.stringify(PACK) }, { channels: [] });
      installPack(root, { ...PACK, slug: 'pequod' });
      const got = await give(job, 'promote', {}, 'you', { packSlug: 'pequod' });
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'pack not installed — a pack is already installed as "pequod"; choose a slug nothing is using yet',
      });
      expect(existsSync(packJson('moby-dick'))).toBe(false);
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(new JobQueue(rt.dir).get(job.id)!.packDraft?.slug).toBe('moby-dick');
    });

    it("a slug another world holds is refused in the palette's words, the job still reviewable", async () => {
      const job = finished({ [PACK_FILE]: JSON.stringify(PACK) }, { channels: [] });
      installPack(root, {
        ...PACK,
        pack: { ...PACK.pack, name: 'Something Else' },
      });
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'pack not installed — the name "moby-dick" already belongs to the world “Something Else” on your palette. Give this one a different name and approve again.',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
    });

    it('an authoring job with no draft is refused with the real reason (D-156), never stamped', async () => {
      const job = finished(
        { 'notes.md': 'tried' },
        { channels: [], prompt: 'Author a level pack: The Pequod' },
      );
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason:
          'no PACK.json at the sandbox root — if the run wrote it inside a folder, ask a follow-up run to move it up, then Approve again',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
      const broken = finished(
        { [PACK_FILE]: 'not json' },
        { channels: [], prompt: 'Author a level pack: The Pequod' },
      );
      expect((await give(broken, 'promote')).refused?.reason).toBe('PACK.json: not valid JSON');
    });

    it('the cut-leg charge is appended to whichever act the line names', async () => {
      const leg = rt.queue.add({ title: 'Author', prompt: 'Author a level pack: The Pequod' });
      rt.queue.assign(leg.id, rt.roster[0].id);
      rt.queue.start(leg.id);
      rt.queue.fail(leg.id, 'out of turns', { turns: 6, costUsd: 0.6, outOfTurns: true });
      appendLedger(
        root,
        ledgerRow({ ...rt.queue.get(leg.id)!, quotedUsd: 0.4 }, rt.meta.id, 'analyst', 'failed', 1),
      );
      const job = finished({ [PACK_FILE]: JSON.stringify(PACK) }, { channels: [], continues: leg.id });
      await give(job, 'promote');
      expect(resolved()[0].detail).toBe(
        "approved — installed the moby-dick world · the chain's 1 cut leg now charged $0.40",
      );
    });
  });

  describe('the party plan (TEAMWORK T3, D-196)', () => {
    const SPEC: Job['party'] = {
      id: 'party-1',
      hand: 0,
      of: 0,
      plan: true,
      asked: 'write three haiku and telegram them to Ana',
      channels: ['telegram'],
      answers: { tone: 'dry' },
    };
    const DRAFT = {
      hands: [{ prompt: 'write a haiku about rain', loadBearing: true }, { prompt: 'write a haiku about snow' }],
      notes: 'two hands',
    };

    it('a promote queues the hands through the thunk, carrying channels, answers, load-bearing marks and the input files', async () => {
      const job = finished(
        { [PARTY_FILE]: JSON.stringify(DRAFT) },
        {
          channels: [],
          prompt: PLAN_SENTENCE,
          party: SPEC,
          tools: ['telegram'],
          attachments: [{ name: 'brief.txt', data: Buffer.from('the brief') }],
        },
      );
      expect(job.partyDraft?.hands).toHaveLength(2);
      const party = fakeParty();
      const got = await give(job, 'promote', { queueParty: party.queueParty });
      expect(got.job?.status).toBe('promoted');
      expect(party.calls).toHaveLength(1);
      const [text, plan, opts] = party.calls[0];
      expect(text).toBe('write three haiku and telegram them to Ana');
      expect(plan).toEqual({
        hands: ['write a haiku about rain', 'write a haiku about snow'],
        asked: { n: 2, words: 'a planned party' },
      });
      expect(opts).toEqual({
        tools: ['telegram'],
        channels: ['telegram'],
        answers: { tone: 'dry' },
        loadBearing: [1],
        attachments: [{ name: 'brief.txt', data: Buffer.from('the brief') }],
        partyId: 'party-1',
      });
      expect(resolved()[0].detail).toBe('approved');
    });

    it('on a repo level a fully scoped plan queues a repo party, each hand with its scope (TEAMWORK T4)', async () => {
      rt.meta = { id: rt.meta.id, repoPath: gitRepo() };
      const scoped = {
        hands: [
          { prompt: 'fix the server half', scope: ['server/src'] },
          { prompt: 'fix the web half', scope: ['web/src'] },
        ],
      };
      const job = finished(
        { [PARTY_FILE]: JSON.stringify(scoped) },
        { channels: [], prompt: PLAN_SENTENCE, party: SPEC },
      );
      const party = fakeParty();
      await give(job, 'promote', { queueParty: party.queueParty });
      expect(party.calls[0][2]).toMatchObject({ repo: true, scopes: [['server/src'], ['web/src']] });
    });

    it('a discard queues no hands', async () => {
      const job = finished(
        { [PARTY_FILE]: JSON.stringify(DRAFT) },
        { channels: [], prompt: PLAN_SENTENCE, party: SPEC },
      );
      const party = fakeParty();
      const got = await give(job, 'discard', { queueParty: party.queueParty });
      expect(got.job?.status).toBe('discarded');
      expect(party.calls).toHaveLength(0);
    });
  });

  describe('the folder moves (D-132, D-162)', () => {
    it("a promote replays the manifest under the job's own root, journals it, and stamps each op", async () => {
      const folder = folderWith(['a.pdf']);
      const job = finished({ [MOVES_FILE]: JSON.stringify(MOVES) }, { channels: [], organizeRoot: folder });
      expect(job.moves?.moves).toHaveLength(2);
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(existsSync(path.join(folder, 'invoices', 'a.pdf'))).toBe(true);
      expect(existsSync(path.join(folder, 'a.pdf'))).toBe(false);
      expect(rt.queue.get(job.id)!.movesRun?.done).toEqual(MOVES.moves);
      const journal = readFileSync(path.join(rt.queue.sandboxDir(job.id), MOVES_JOURNAL), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(journal).toMatchObject([{ root: folder, done: MOVES.moves, failed: [] }]);
      expect(resolved()[0].detail).toBe('approved');
    });

    it('refuses when the folder is gone, before anything is touched or recorded', async () => {
      const folder = folderWith(['a.pdf']);
      const job = finished({ [MOVES_FILE]: JSON.stringify(MOVES) }, { channels: [], organizeRoot: folder });
      rmSync(folder, { recursive: true });
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: `the folder is not there any more: ${folder}`,
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(rt.queue.get(job.id)!.movesRun).toBeUndefined();
      expect(existsSync(path.join(rt.queue.sandboxDir(job.id), MOVES_JOURNAL))).toBe(false);
    });

    it('a partial failure leaves the job reviewable with the op named, and Approve again moves nothing twice', async () => {
      const folder = folderWith(['a.pdf']);
      mkdirSync(path.join(folder, 'invoices'));
      writeFileSync(path.join(folder, 'invoices', 'a.pdf'), 'already there');
      const job = finished({ [MOVES_FILE]: JSON.stringify(MOVES) }, { channels: [], organizeRoot: folder });
      const got = await give(job, 'promote');
      expect(got.refused?.kind).toBe('refused');
      expect(got.refused?.reason).toMatch(
        /^moved 1, but some failed — a\.pdf → invoices\/a\.pdf: .+\. Approve again to retry; nothing moves twice\.$/,
      );
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(rt.queue.get(job.id)!.movesRun?.done).toEqual([MOVES.moves[0]]);
      expect(resolved()).toHaveLength(0);
      // The obstacle cleared, the retry does the one op left and only that.
      rmSync(path.join(folder, 'invoices', 'a.pdf'));
      const again = await give(rt.queue.get(job.id)!, 'promote');
      expect(again.job?.status).toBe('promoted');
      expect(readFileSync(path.join(folder, 'invoices', 'a.pdf'), 'utf8')).toBe('x');
      expect(rt.queue.get(job.id)!.movesRun?.done).toEqual(MOVES.moves);
    });

    it('nothing yields between the racing recheck and the stamp — a verdict queued for the very next turn finds the job already promoted (D-162)', async () => {
      const folder = folderWith(['a.pdf']);
      const job = finished(
        { [OUTBOX_FILE]: JSON.stringify(OUTBOX), [MOVES_FILE]: JSON.stringify(MOVES) },
        { organizeRoot: folder },
      );
      const inner = fakeSend();
      let late: string | undefined;
      const send: VerdictContext['send'] = async (opts) => {
        const runs = await inner.send(opts);
        // Queued from inside the send, this lands one microtask after the
        // verdict's own continuation resumes — the first moment anything else
        // could touch the job once the send is back. An await introduced
        // anywhere between the recheck and the stamp would let it in.
        queueMicrotask(() =>
          queueMicrotask(() => {
            try {
              rt.queue.resolve(job.id, 'discard', 'you');
              late = 'landed';
            } catch (err) {
              late = err instanceof Error ? err.message : String(err);
            }
          }),
        );
        return runs;
      };
      const got = await give(job, 'promote', { send });
      expect(got.job?.status).toBe('promoted');
      expect(late).toBe(`job ${job.id} is promoted, not resolvable`);
      expect(existsSync(path.join(folder, 'invoices', 'a.pdf'))).toBe(true);
      expect(resolved()[0].detail).toBe('approved — sent 1 via telegram');
    });
  });

  describe('the nómina (D-268)', () => {
    const wired = (payees = WIRE.payees): InstallContext => ({
      ...install,
      settings: () => ({ wire: { ...WIRE, payees } }),
    });

    it('a promote composes the file here and only here, re-stamps the delivery, and the feed says what landed', async () => {
      const job = finished({ [NOMINA_FILE]: JSON.stringify(BATCH) }, { channels: [] });
      expect(job.nomina?.rows).toHaveLength(1);
      const out = path.join(rt.queue.sandboxDir(job.id), NOMINA_OUTPUT);
      expect(existsSync(out)).toBe(false);
      const before = job.delivered!.files;
      const got = await give(job, 'promote', { install: wired() });
      expect(got.job?.status).toBe('promoted');
      expect(readFileSync(out, 'utf8')).toBe('000012345678;77712345;037;9876543;3;Ana Rivas;2;;;REM;;;\r\n');
      expect(rt.queue.get(job.id)!.delivered?.files).toBe(before + 1);
      expect(resolved()[0].detail).toBe(
        'approved — composed nomina.txt, 1 payee; upload and authorise it at the bank',
      );
    });

    it('a discard composes nothing', async () => {
      const job = finished({ [NOMINA_FILE]: JSON.stringify(BATCH) }, { channels: [] });
      const got = await give(job, 'discard', { install: wired() });
      expect(got.job?.status).toBe('discarded');
      expect(existsSync(path.join(rt.queue.sandboxDir(job.id), NOMINA_OUTPUT))).toBe(false);
    });

    it("a composer refusal after the gate passed is reported as a bug, not the reviewer's problem", async () => {
      const job = finished({ [NOMINA_FILE]: JSON.stringify(BATCH) }, { channels: [] });
      // The allowlist the gate reads, then the one the composer reads: the
      // payee gone between the two asks.
      const answers = [WIRE.payees, []];
      const flapping: InstallContext = {
        ...install,
        settings: () => ({ wire: { ...WIRE, payees: answers.shift() ?? [] } }),
      };
      const got = await give(job, 'promote', { install: flapping });
      expect(got.refused?.kind).toBe('bug');
      expect(got.refused?.reason).toMatch(
        /^nómina not composed — .+ \(this should have been refused before anything was sent; please report it\)$/,
      );
      expect(existsSync(path.join(rt.queue.sandboxDir(job.id), NOMINA_OUTPUT))).toBe(false);
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(resolved()).toHaveLength(0);
    });
  });

  describe('the patch (D-163) and the push (D-275)', () => {
    it('a promote applies the reviewed patch to the folder the level names', async () => {
      const origin = gitRepo();
      const job = finished({ 'DIFF.patch': PATCH }, { channels: [], repoPath: origin });
      expect(job.changes?.names).toEqual(['greet.js']);
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Hello');
      expect(resolved()[0].detail).toBe('approved');
    });

    it('a repo job that left no patch applies nothing and still promotes', async () => {
      const origin = gitRepo();
      const job = finished({ 'notes.md': 'looked, changed nothing' }, { channels: [], repoPath: origin });
      const got = await give(job, 'promote');
      expect(got.job?.status).toBe('promoted');
      expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Helo');
    });

    it('a refused patch after a successful send leaves the sends stamped and the job reviewable; the retry sends nobody twice', async () => {
      const origin = gitRepo();
      const job = finished(
        { [OUTBOX_FILE]: JSON.stringify(OUTBOX), 'DIFF.patch': 'not a patch\n' },
        { repoPath: origin },
      );
      const first = fakeSend();
      const got = await give(job, 'promote', { send: first.send });
      expect(got.refused?.kind).toBe('refused');
      expect(got.refused?.reason).toMatch(/^patch did not apply: /);
      expect(first.calls).toHaveLength(1);
      const after = rt.queue.get(job.id)!;
      expect(after.status).toBe('done');
      expect(after.outboxSent?.[0]?.sentTo).toEqual(['1']);
      expect(readApprovals(rt.dir)).toHaveLength(0);
      expect(resolved()).toHaveLength(0);
      // The patch fixed, Approve again applies it and enters no send at all.
      writeFileSync(patchFile(rt.queue.sandboxDir(job.id)), PATCH);
      const second = fakeSend();
      const again = await give(rt.queue.get(job.id)!, 'promote', { send: second.send });
      expect(again.job?.status).toBe('promoted');
      expect(second.calls).toHaveLength(0);
      expect(readFileSync(path.join(origin, 'greet.js'), 'utf8')).toContain('Hello');
      expect(rt.queue.get(job.id)!.outboxSent?.[0]?.sentTo).toEqual(['1']);
      expect(resolved()[0].detail).toBe('approved');
    });

    it('a repository named in a form promote cannot take is refused by name', async () => {
      const job = finished(
        { 'notes.md': 'x' },
        { channels: [], repoPath: 'git@github.com:acme/widgets' },
      );
      const got = await give(job, 'promote');
      expect(got.refused).toEqual({
        kind: 'refused',
        reason: 'only an https github.com URL works — not ssh, git or http',
      });
      expect(rt.queue.get(job.id)!.status).toBe('done');
    });

    it('a URL-backed level pushes through the adapter every time, records where, and the feed names the pull request', async () => {
      const job = finished(
        { 'notes.md': 'no patch — the clone holds a commit' },
        { channels: [], repoPath: 'https://github.com/acme/widgets' },
      );
      const to: PromotedTo = {
        branch: 'agentlings/padel-1a2b',
        prNumber: 7,
        prUrl: 'https://github.com/acme/widgets/pull/7',
      };
      const push = fakePush(to);
      const got = await give(job, 'promote', {
        install: { ...install, env: { ...ENV, GITHUB_TOKEN: 'ghp-test' } },
        pushRemote: push.pushRemote,
      });
      expect(got.job?.status).toBe('promoted');
      expect(push.calls).toHaveLength(1);
      const [sandbox, target, pushed, deps] = push.calls[0];
      expect(sandbox).toBe(rt.queue.sandboxDir(job.id));
      expect(target).toEqual({
        kind: 'url',
        url: 'https://github.com/acme/widgets.git',
        owner: 'acme',
        name: 'widgets',
      });
      expect(pushed.id).toBe(job.id);
      expect(deps).toEqual({ http: install.http, token: 'ghp-test' });
      expect(got.job?.promotedTo).toEqual(to);
      expect(new JobQueue(rt.dir).get(job.id)!.promotedTo).toEqual(to);
      expect(resolved()[0].detail).toBe('approved — pull request #7 opened from agentlings/padel-1a2b');
    });

    it('a push that opened no pull request still says which half happened', async () => {
      const job = finished(
        { 'notes.md': 'x' },
        { channels: [], repoPath: 'https://github.com/acme/widgets' },
      );
      const push = fakePush({ branch: 'agentlings/padel-1a2b', prError: 'no GITHUB_TOKEN' });
      await give(job, 'promote', { pushRemote: push.pushRemote });
      expect(resolved()[0].detail).toBe(
        'approved — pushed agentlings/padel-1a2b; no pull request (no GITHUB_TOKEN)',
      );
    });

    it('a push that failed is refused with the job reviewable and nowhere recorded', async () => {
      const job = finished(
        { 'notes.md': 'x' },
        { channels: [], repoPath: 'https://github.com/acme/widgets' },
      );
      const push = fakePush(new Error('remote said no'));
      const got = await give(job, 'promote', { pushRemote: push.pushRemote });
      expect(got.refused).toEqual({ kind: 'refused', reason: 'nothing was pushed: remote said no' });
      expect(rt.queue.get(job.id)!.status).toBe('done');
      expect(rt.queue.get(job.id)!.promotedTo).toBeUndefined();
      expect(resolved()).toHaveLength(0);
    });

    it('a verdict landing while the push is in flight is busy (D-163), and the claim is released after', async () => {
      const job = finished(
        { 'notes.md': 'x' },
        { channels: [], repoPath: 'https://github.com/acme/widgets' },
      );
      let during: VerdictResult | undefined;
      const pushRemote: VerdictContext['pushRemote'] = async () => {
        during = await give(job, 'discard');
        return null;
      };
      const got = await give(job, 'promote', { pushRemote });
      expect(during?.refused).toEqual({
        kind: 'busy',
        reason:
          "this job's patch is still applying — the first Approve is doing it; try again when it lands",
      });
      expect(got.job?.status).toBe('promoted');
      expect(got.job?.promotedTo).toBeUndefined();
      expect(resolved()).toHaveLength(1);
      expect(resolved()[0].detail).toBe('approved');
      // The claim released: a later verdict meets the queue's rule, not the door's.
      expect((await give(job, 'discard')).refused?.reason).toBe(
        `job ${job.id} is promoted, not resolvable`,
      );
    });
  });
});
