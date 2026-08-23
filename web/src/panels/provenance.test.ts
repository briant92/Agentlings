import { describe, expect, it } from 'vitest';
import type { ProvenanceNeighbourhood, ProvenanceNode } from '@agentlings/shared';
import { countWords, edgeWords, grouped, KIND_ORDER, originWords } from './provenance';

const node = (id: string, kind: ProvenanceNode['kind'], label = id): ProvenanceNode => ({
  id,
  kind,
  label,
  origin: { file: `${kind}.md`, line: 3 },
});

describe('edge words', () => {
  it('read differently from each end, and say when a title named several jobs', () => {
    const e = { from: 'lesson:pip:1', to: 'job:j1', via: 'lesson.jobStamp' as const };
    expect(edgeWords(e, 'lesson:pip:1')).toBe('learnt on this job, by its stamp');
    expect(edgeWords(e, 'job:j1')).toBe('a lesson stamped with this job');
    expect(edgeWords({ ...e, ambiguous: 3 }, 'job:j1')).toBe(
      'a lesson stamped with this job — the title names 3 jobs; this is the first',
    );
  });

  it('falls back to the identifier itself for a kind of edge the words do not know yet', () => {
    const e = { from: 'a', to: 'b', via: 'something.new' };
    expect(edgeWords(e, 'a')).toBe('→ something.new');
    expect(edgeWords(e, 'b')).toBe('← something.new');
  });
});

describe('a neighbourhood, grouped', () => {
  it('puts each record under its kind in display order with the sentence from this side', () => {
    const around: ProvenanceNeighbourhood = {
      node: node('job:j1', 'job', 'Tidy the exports'),
      nodes: [node('lesson:pip:1', 'lesson'), node('recipe:k#none', 'recipe'), node('note:1', 'note')],
      edges: [
        { from: 'lesson:pip:1', to: 'job:j1', via: 'lesson.jobStamp' },
        { from: 'job:j1', to: 'recipe:k#none', via: 'job.prompt=recipe.key' },
        { from: 'note:1', to: 'job:j1', via: 'note.title', ambiguous: 2 },
        { from: 'ghost', to: 'job:j1', via: 'note.title' }, // a node the cap left out
      ],
      more: 0,
    };
    const groups = grouped(around);
    expect(groups.map((g) => g.kind)).toEqual(['lesson', 'note', 'recipe']);
    expect(KIND_ORDER.indexOf('lesson')).toBeLessThan(KIND_ORDER.indexOf('note'));
    expect(groups[0].rows[0].words).toBe('a lesson stamped with this job');
    expect(groups[1].rows[0].words).toContain('names 2 jobs');
    expect(groups[2].rows[0].words).toBe('its sentence is this method’s key');
  });
});

describe('small words', () => {
  it('names the file and line, and counts in plain English', () => {
    expect(originWords(node('x', 'lesson'))).toBe('lesson.md:3');
    expect(originWords({ ...node('x', 'source'), origin: { file: 'store-index.json' } })).toBe('store-index.json');
    expect(countWords('note', 1)).toBe('1 level note');
    expect(countWords('note', 154)).toBe('154 level notes');
    expect(countWords('source', 2)).toBe('2 files you pointed at');
    expect(countWords('passage', 0)).toBe('0 passages');
  });
});
