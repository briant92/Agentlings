import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import {
  parcelAge,
  parcelChips,
  parcelKindOf,
  parcelOrder,
  parcelSections,
  waitingParcels,
} from './parcels';

let seq = 0;
function job(over: Partial<Job> = {}): Job {
  seq += 1;
  return {
    id: `j${seq}`,
    title: `Job ${seq}`,
    prompt: 'do the thing',
    status: 'done',
    slot: -1,
    createdAt: 1000 + seq,
    finishedAt: 2000 + seq,
    ...over,
  } as Job;
}

describe('parcelKindOf', () => {
  it('files by default, patch when a diff landed', () => {
    expect(parcelKindOf(job())).toBe('files');
    expect(parcelKindOf(job({ changes: { files: 2, added: 9, removed: 1, names: [] } }))).toBe(
      'patch',
    );
  });

  it('side-effects outrank the patch: an outbox with a diff is still acts', () => {
    const both = job({
      changes: { files: 1, added: 3, removed: 0, names: [] },
      outbox: { channel: 'telegram', messages: [{ to: '1', body: 'hi' }] },
    });
    expect(parcelKindOf(both)).toBe('acts');
  });

  it('pack drafts and moves are acts too', () => {
    expect(parcelKindOf(job({ packDraft: { slug: 's', pack: { name: 'W' } as never } }))).toBe(
      'acts',
    );
    expect(parcelKindOf(job({ moves: { moves: [{ op: 'mkdir', path: 'a' }] } }))).toBe('acts');
  });
});

describe('waitingParcels', () => {
  it('keeps only the deliveries still waiting on a verdict, oldest first', () => {
    const old = job({ status: 'partial', finishedAt: 100 });
    const fresh = job({ status: 'done', finishedAt: 900 });
    const kept = job({ status: 'promoted' });
    const running = job({ status: 'running', finishedAt: undefined });
    expect(waitingParcels([fresh, kept, old, running]).map((j) => j.id)).toEqual([
      old.id,
      fresh.id,
    ]);
  });

  it('excludes a continued job — More turns was its decision (D-139)', () => {
    const continued = job({ status: 'partial', continuedBy: 'x' });
    expect(waitingParcels([continued])).toEqual([]);
  });
});

describe('parcelSections and parcelOrder', () => {
  it('groups acts, then patches, then files, oldest first within each', () => {
    const patch = job({ changes: { files: 1, added: 1, removed: 0, names: [] }, finishedAt: 50 });
    const send = job({
      outbox: { channel: 'telegram', messages: [{ to: '1', body: 'hi' }] },
      finishedAt: 900,
    });
    const plain = job({ finishedAt: 10 });
    const sections = parcelSections([plain, patch, send]);
    expect(sections.map((s) => s.kind)).toEqual(['acts', 'patch', 'files']);
    expect(parcelOrder([plain, patch, send])).toEqual([send.id, patch.id, plain.id]);
  });

  it('drops empty sections rather than showing hollow headers', () => {
    const plain = job();
    expect(parcelSections([plain]).map((s) => s.kind)).toEqual(['files']);
  });
});

describe('parcelChips', () => {
  it('says what approving would touch, unsent counted honestly', () => {
    const sent = job({
      outbox: {
        channel: 'telegram',
        messages: [
          { to: 'a', body: 'x' },
          { to: 'b', body: 'y' },
        ],
      },
      outboxSent: { at: 1, sentTo: ['a'], failed: [] },
      changes: { files: 2, added: 9, removed: 1, names: [] },
    });
    expect(parcelChips(sent)).toEqual(['1 send', '+9 −1']);
  });
});

describe('parcelAge', () => {
  it('reads as minutes, hours, then days', () => {
    const j = job({ finishedAt: 0 });
    expect(parcelAge(j, 5 * 60_000)).toBe('5m');
    expect(parcelAge(j, 7 * 3_600_000)).toBe('7h');
    expect(parcelAge(j, 41 * 86_400_000)).toBe('41d');
  });
});
