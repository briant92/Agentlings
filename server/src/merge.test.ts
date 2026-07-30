import { describe, expect, it } from 'vitest';
import type { CrewMember } from '@agentlings/shared';
import { absorptionNote, mergeLessons, overlap, preferKeeper, proposeMerges } from './merge';

function member(over: Partial<CrewMember> & { id: string; name: string }): CrewMember {
  return {
    color: 0,
    role: 'scribe',
    jobsDone: 0,
    jobsFailed: 0,
    hiredAt: 1000,
    resting: false,
    busy: false,
    lessons: 0,
    ...over,
  };
}

describe('overlap', () => {
  it('will not pair different roles — that is different capability, not overlap', () => {
    const a = member({ id: '1', name: 'Dot', role: 'scribe', jobDescription: 'write the docs' });
    const b = member({ id: '2', name: 'Pip', role: 'mason', jobDescription: 'write the docs' });
    expect(overlap(a, b).score).toBe(0);
  });

  it('will not pair someone with themselves', () => {
    const a = member({ id: '1', name: 'Dot' });
    expect(overlap(a, a).score).toBe(0);
  });

  it('scores two same-role hires described the same way highly', () => {
    const a = member({ id: '1', name: 'Dot', jobDescription: 'write the weekly documentation' });
    const b = member({ id: '2', name: 'Bea', jobDescription: 'write the weekly documentation' });
    const { score, reasons } = overlap(a, b);
    expect(score).toBe(1);
    expect(reasons).toContain('both are scribes');
    expect(reasons.join(' ')).toMatch(/both hired to:.*document/);
  });

  it('scores same-role hires doing unrelated things low', () => {
    const a = member({ id: '1', name: 'Dot', jobDescription: 'write release notes' });
    const b = member({ id: '2', name: 'Bea', jobDescription: 'summarise customer interviews' });
    const { score, reasons } = overlap(a, b);
    expect(score).toBeLessThan(0.6);
    expect(reasons).toContain('their job descriptions have nothing in common');
  });

  it('treats two undescribed hires of the same role as redundant', () => {
    const a = member({ id: '1', name: 'Dot' });
    const b = member({ id: '2', name: 'Bea' });
    const { score, reasons } = overlap(a, b);
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(reasons).toContain('neither has been given a job description');
  });

  it('is cautious when only one of them was described', () => {
    const a = member({ id: '1', name: 'Dot', jobDescription: 'write the docs' });
    const b = member({ id: '2', name: 'Bea' });
    expect(overlap(a, b).score).toBeLessThan(0.6);
  });
});

describe('preferKeeper', () => {
  it('keeps the stronger record', () => {
    const a = member({ id: '1', name: 'Dot', jobsDone: 8 });
    const b = member({ id: '2', name: 'Bea', jobsDone: 5 });
    expect(preferKeeper(b, a)[0].name).toBe('Dot');
  });

  it('falls back to the longer memory, then to seniority', () => {
    const a = member({ id: '1', name: 'Dot', lessons: 9, hiredAt: 500 });
    const b = member({ id: '2', name: 'Bea', lessons: 2, hiredAt: 100 });
    expect(preferKeeper(b, a)[0].name).toBe('Dot');

    const c = member({ id: '3', name: 'Old', hiredAt: 100 });
    const d = member({ id: '4', name: 'New', hiredAt: 900 });
    expect(preferKeeper(d, c)[0].name).toBe('Old');
  });
});

describe('proposeMerges', () => {
  const crew = [
    member({ id: '1', name: 'Dot', jobDescription: 'write the weekly docs', jobsDone: 8 }),
    member({ id: '2', name: 'Bea', jobDescription: 'write the weekly docs', jobsDone: 5 }),
    member({ id: '3', name: 'Ivy', jobDescription: 'write the weekly docs', jobsDone: 1 }),
    member({ id: '4', name: 'Pip', role: 'mason', jobDescription: 'fix bugs' }),
  ];

  it('proposes the strongest pair and keeps the better record', () => {
    const [first] = proposeMerges(crew);
    expect(first.keep).toBe('1');
    expect(first.absorb).toBe('2');
  });

  it('never puts the same agentling in two proposals at once', () => {
    const proposals = proposeMerges(crew);
    const ids = proposals.flatMap((p) => [p.keep, p.absorb]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves a lone role alone', () => {
    expect(proposeMerges(crew).some((p) => [p.keep, p.absorb].includes('4'))).toBe(false);
  });

  it('skips anyone mid-job', () => {
    const busy = crew.map((m) => (m.id === '2' ? { ...m, busy: true } : m));
    const proposals = proposeMerges(busy);
    expect(proposals.every((p) => p.absorb !== '2' && p.keep !== '2')).toBe(true);
  });

  it('proposes nothing for a crew of one', () => {
    expect(proposeMerges([crew[0]])).toEqual([]);
  });
});

describe('mergeLessons', () => {
  it('interleaves both memories oldest first', () => {
    const keep = ['2026-01-02 · did a thing', '2026-03-01 · did another'];
    const absorb = ['2026-02-01 · learned something'];
    expect(mergeLessons(keep, absorb)).toEqual([
      '2026-01-02 · did a thing',
      '2026-02-01 · learned something',
      '2026-03-01 · did another',
    ]);
  });

  it('drops duplicates rather than saying it twice', () => {
    const line = '2026-01-02 · the same lesson';
    expect(mergeLessons([line], [line])).toEqual([line]);
  });

  it('keeps undated lines in order, ahead of dated ones', () => {
    const merged = mergeLessons(['no date here', '2026-01-01 · dated'], ['also undated']);
    expect(merged).toEqual(['no date here', 'also undated', '2026-01-01 · dated']);
  });

  it('handles an empty memory on either side', () => {
    expect(mergeLessons([], ['2026-01-01 · one'])).toEqual(['2026-01-01 · one']);
    expect(mergeLessons(['2026-01-01 · one'], [])).toEqual(['2026-01-01 · one']);
  });
});

describe('absorptionNote', () => {
  it('records who was folded in and what they were for', () => {
    const absorbed = member({
      id: '2',
      name: 'Bea',
      jobsDone: 5,
      jobDescription: 'write the weekly docs',
    });
    const lines = absorptionNote(absorbed, new Date('2026-07-30'));
    expect(lines[0]).toBe('2026-07-30 · merged with Bea, who delivered 5');
    expect(lines[1]).toBe('2026-07-30 · Bea was hired to: write the weekly docs');
  });

  it('says nothing about a job description that was never given', () => {
    expect(absorptionNote(member({ id: '2', name: 'Bea' }), new Date('2026-07-30'))).toHaveLength(1);
  });
});
