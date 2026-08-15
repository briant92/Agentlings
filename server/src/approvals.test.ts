import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Outbox } from '@agentlings/shared';
import {
  APPROVALS_FOR_AUTO,
  approvalsFile,
  autoBlocker,
  autoSendable,
  readApprovals,
  recordApproval,
  setAuto,
} from './approvals';

const PROMPT = 'Every Thursday 9:00, remind Ana, Luis and Marta about padel — on telegram';

/** One outbox, in the list every send path now takes (D-179). */
function outbox(tos: string[], extra: Partial<Outbox> = {}): Outbox[] {
  return [
    {
      channel: 'telegram',
      messages: tos.map((to) => ({ to, body: `padel — ${to}` })),
      ...extra,
    },
  ];
}

describe('standing approvals', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-approvals-'));
  });

  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const approveTimes = (n: number, tos = ['1', '2', '3']) => {
    let last;
    for (let i = 0; i < n; i++) last = recordApproval(dir, PROMPT, outbox(tos), 1000 + i);
    return last!;
  };

  describe('recordApproval', () => {
    it('counts unchanged approvals, recipient order be damned', () => {
      recordApproval(dir, PROMPT, outbox(['1', '2', '3']), 1);
      const second = recordApproval(dir, PROMPT, outbox(['3', '1', '2']), 2);
      expect(second.approvals).toBe(2);
    });

    it('a new recipient starts the count over and revokes any grant', () => {
      approveTimes(APPROVALS_FOR_AUTO);
      const granted = setAuto(dir, readApprovals(dir)[0].key, true, 5);
      expect(granted.approval?.auto).toBe(true);
      const moved = recordApproval(dir, PROMPT, outbox(['1', '2', '4']), 6);
      expect(moved.approvals).toBe(1);
      expect(moved.auto).toBe(false);
      expect(moved.channels[0].recipients).toEqual(['1', '2', '4']);
    });

    it('a changed channel or template also starts over', () => {
      approveTimes(2);
      const otherChannel = recordApproval(dir, PROMPT, outbox(['1', '2', '3'], { channel: 'gmail' }), 5);
      expect(otherChannel.approvals).toBe(1);
      const withTemplate = recordApproval(
        dir,
        PROMPT,
        outbox(['1', '2', '3'], { channel: 'whatsapp-business', template: { name: 'padel_reminder', language: 'es' } }),
        6,
      );
      expect(withTemplate.approvals).toBe(1);
      expect(withTemplate.channels[0].template).toBe('padel_reminder');
    });

    it('different jobs count separately — the key is the prompt', () => {
      recordApproval(dir, PROMPT, outbox(['1']), 1);
      const other = recordApproval(dir, 'email the weekly summary', outbox(['1']), 2);
      expect(other.approvals).toBe(1);
      expect(readApprovals(dir)).toHaveLength(2);
    });
  });

  describe('setAuto', () => {
    it('refuses a grant that has not been earned, saying how far along it is', () => {
      approveTimes(APPROVALS_FOR_AUTO - 1);
      const { approval, error } = setAuto(dir, readApprovals(dir)[0].key, true, 9);
      expect(approval).toBeUndefined();
      expect(error).toContain(`${APPROVALS_FOR_AUTO - 1} of ${APPROVALS_FOR_AUTO}`);
    });

    it('grants once earned, and revokes without ceremony', () => {
      approveTimes(APPROVALS_FOR_AUTO);
      const key = readApprovals(dir)[0].key;
      expect(setAuto(dir, key, true, 9).approval?.auto).toBe(true);
      expect(setAuto(dir, key, false, 10).approval?.auto).toBe(false);
    });

    it('knows nothing about a key it never saw', () => {
      expect(setAuto(dir, 'never-approved', true, 9).error).toContain('no standing approval');
    });
  });

  describe('autoSendable — the allowlist question', () => {
    const approved = () => {
      approveTimes(APPROVALS_FOR_AUTO);
      const key = readApprovals(dir)[0].key;
      setAuto(dir, key, true, 9);
      return readApprovals(dir)[0];
    };

    it('sends to the approved set, and to any subset of it', () => {
      const a = approved();
      expect(autoSendable(a, outbox(['1', '2', '3']))).toBe(true);
      expect(autoSendable(a, outbox(['2']))).toBe(true);
    });

    it('one recipient a human never approved blocks the whole send', () => {
      const a = approved();
      expect(autoSendable(a, outbox(['1', '2', '3', '4']))).toBe(false);
    });

    it('a different channel or template blocks it', () => {
      const a = approved();
      expect(autoSendable(a, outbox(['1'], { channel: 'gmail' }))).toBe(false);
      expect(
        autoSendable(a, outbox(['1'], { template: { name: 'other_template', language: 'es' } })),
      ).toBe(false);
    });

    it('never fires without an explicit grant, however many approvals', () => {
      approveTimes(APPROVALS_FOR_AUTO + 5);
      expect(autoSendable(readApprovals(dir)[0], outbox(['1']))).toBe(false);
      expect(autoSendable(undefined, outbox(['1']))).toBe(false);
    });
  });

  describe('autoBlocker — only a pure send job may skip review', () => {
    const clean = {
      status: 'done' as const,
      outbox: outbox(['1']),
    };
    const PAPER = ['RESULT.md', 'LESSON.md', 'OUTBOX.json'];

    it('lets a clean finish through', () => {
      expect(autoBlocker(clean, PAPER)).toBeNull();
    });

    it.each([
      ['a partial run', { ...clean, status: 'partial' as const }, PAPER],
      ['a compile', { ...clean, compile: true }, PAPER],
      ['a run with no outbox', { status: 'done' as const }, PAPER],
      ['an outbox that did not parse', { ...clean, outboxError: 'bad' }, PAPER],
      [
        'a run that also changed code',
        { ...clean, changes: { files: 1, added: 1, removed: 0, names: ['a.ts'] } },
        PAPER,
      ],
      ['a run that also produced a file', clean, [...PAPER, 'report.pdf']],
      // The named rule, not just the extras net (D-159): an input/ forward
      // leaves no root file for the extras check to catch.
      [
        'an outbox that sends files',
        {
          ...clean,
          outbox: [
            {
              channel: 'telegram',
              messages: [{ to: '1', body: 'x', files: ['input/contract.pdf'] }],
            },
          ],
        },
        PAPER,
      ],
    ])('%s stays in review', (_, job, files) => {
      expect(autoBlocker(job, files)).not.toBeNull();
    });
  });

  it('a torn file loses nothing but itself', () => {
    writeFileSync(approvalsFile(dir), '{"not json');
    expect(readApprovals(dir)).toEqual([]);
  });
});
