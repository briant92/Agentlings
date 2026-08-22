import { describe, expect, it } from 'vitest';
import type { CarryManifest } from '@agentlings/shared';
import { carryNote } from './carry';

describe('carryNote (UI.md, step 17)', () => {
  it('says what a cut drafting run hands its next leg, and what stays behind', () => {
    // 106140b4 on Home Chores, as the quote route returned it on 2026-08-22.
    const carries: CarryManifest = {
      files: [],
      input: ['oferta-oficinas-816-818-819.pdf'],
      report: 'RESULT.md',
      patch: false,
      left: { paperwork: ['APPROACH.md', 'LESSON.md', 'PENDING.md', 'RESULT.md'], dirs: ['work'] },
    };
    const dirs = [
      { name: 'input', files: 1 },
      { name: 'work', files: 68 },
    ];
    expect(carryNote(carries, dirs)).toBe(
      'A fresh leg in this sandbox starts with input/ (oferta-oficinas-816-818-819.pdf) and this report as PREVIOUS-RESULT.md. work/ (68 files), APPROACH.md, LESSON.md and PENDING.md are not carried — it rebuilds from the report.',
    );
  });

  it('names a few deliverables, counts many, and carries a repo patch', () => {
    const carries: CarryManifest = {
      files: ['plan.pdf', 'map.png'],
      input: [],
      report: null,
      patch: true,
      left: { paperwork: ['LESSON.md'], dirs: [] },
    };
    expect(carryNote(carries, [])).toBe(
      'A fresh leg in this sandbox starts with 2 files (plan.pdf, map.png) and the repo patch. LESSON.md is not carried.',
    );
    expect(carryNote({ ...carries, files: ['a', 'b', 'c', 'd'] }, [])).toContain('starts with 4 files and');
  });

  it('says so when nothing at all would be carried', () => {
    const carries: CarryManifest = {
      files: [],
      input: [],
      report: null,
      patch: false,
      left: { paperwork: [], dirs: [] },
    };
    expect(carryNote(carries, [])).toBe('A fresh leg in this sandbox starts empty.');
  });
});
