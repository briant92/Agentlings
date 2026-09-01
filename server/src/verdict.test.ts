import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobEvent, ResolvedBy, Verdict } from '@agentlings/shared';
import { readApprovals } from './approvals';
import type { Connection } from './connections';
import { EventLog } from './events';
import { beginPatch, endPatch } from './gitwork';
import { append as appendLedger, ledgerRow, readLedger } from './ledger';
import { createLevelFiles, levelDir, readRoster } from './levels';
import { MemoryStore } from './memory';
import { NOMINA_FILE } from './nomina';
import { OUTBOX_FILE } from './outbox';
import { performOutboxSend, type OutboxSendOpts } from './outboxsend';
import { JobQueue, type NewJobSpec } from './queue';
import { RECONCILIATION_FILE, RECONCILIATIONS_DIR } from './reconciliation';
import { WITHHELD_FILE } from './redact';
import { readSettings } from './settings';
import { readTools, toolDir, writeTool } from './tools';
import {
  performVerdict,
  type InstallContext,
  type VerdictContext,
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
  ) {
    const ctx: VerdictContext = { install, send: fakeSend().send, ...over };
    return performVerdict(rt, job, verdict, by, ctx);
  }

  const resolved = () => events.filter((e) => e.type === 'resolved');

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
});
