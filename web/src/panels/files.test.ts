import { describe, expect, it } from 'vitest';
import { fidelity, glyph, orderFiles, size, splitMermaid } from './files';

describe('orderFiles', () => {
  it('puts what was asked for above what the crew wrote about it', () => {
    const names = orderFiles(
      ['RESULT.md', 'lines.xlsx', 'DIFF.patch', 'summary.docx', 'LESSON.md'].map((name) => ({
        name,
      })),
    ).map((f) => f.name);
    expect(names).toEqual(['lines.xlsx', 'summary.docx', 'RESULT.md', 'DIFF.patch', 'LESSON.md']);
  });

  it('leads with the report when the job only wrote paperwork', () => {
    const names = orderFiles([{ name: 'LESSON.md' }, { name: 'RESULT.md' }]).map((f) => f.name);
    expect(names).toEqual(['RESULT.md', 'LESSON.md']);
  });

  it('leaves the array it was handed alone', () => {
    const files = [{ name: 'b.md' }, { name: 'a.xlsx' }];
    orderFiles(files);
    expect(files.map((f) => f.name)).toEqual(['b.md', 'a.xlsx']);
  });
});

describe('fidelity', () => {
  it('calls a conversion a conversion and the file itself exact', () => {
    expect(fidelity({ kind: 'native', contentType: 'application/pdf' })?.exact).toBe(true);
    expect(fidelity({ kind: 'text', content: 'x', truncated: false })?.exact).toBe(true);
    expect(fidelity({ kind: 'html', html: '<p>x</p>', truncated: false })?.exact).toBe(false);
    expect(fidelity({ kind: 'grid', sheets: [] })?.exact).toBe(false);
    expect(fidelity({ kind: 'slides', slides: [], total: 0 })?.exact).toBe(false);
  });

  it('says what each conversion lost, not merely that it converted', () => {
    expect(fidelity({ kind: 'slides', slides: [], total: 0 })?.label).toContain('no visuals');
    expect(fidelity({ kind: 'html', html: '', truncated: false })?.label).toContain('not layout');
  });

  it('marks nothing when there is no preview to mark', () => {
    expect(fidelity({ kind: 'none', reason: 'the file is empty' })).toBeNull();
  });
});

describe('glyph', () => {
  it('tells the spreadsheet from the document at a glance', () => {
    expect(glyph('lines.xlsx')).toBe(glyph('prices.csv'));
    expect(glyph('summary.docx')).not.toBe(glyph('lines.xlsx'));
    expect(glyph('LESSON.md')).toBe('·');
  });

  it('marks a chart so it is findable in the rail', () => {
    expect(glyph('totals.svg')).not.toBe('·');
    expect(glyph('totals.svg')).not.toBe(glyph('lines.xlsx'));
  });
});

describe('size', () => {
  it('rounds to the unit someone would say out loud', () => {
    expect(size(840)).toBe('840 B');
    expect(size(7183)).toBe('7 KB');
    expect(size(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('splitMermaid', () => {
  it('leaves a file with no fences as one run of text', () => {
    expect(splitMermaid('# Title\n\nplain words')).toEqual([
      { kind: 'text', text: '# Title\n\nplain words' },
    ]);
  });

  it('cuts a closed fence out as a diagram and keeps the words around it', () => {
    const md = '# Map\n```mermaid\nflowchart LR\n  a --> b\n```\nafter';
    expect(splitMermaid(md)).toEqual([
      { kind: 'text', text: '# Map' },
      { kind: 'mermaid', code: 'flowchart LR\n  a --> b' },
      { kind: 'text', text: 'after' },
    ]);
  });

  it('keeps an unclosed fence as text — half a diagram is not the file', () => {
    const md = 'before\n```mermaid\nflowchart LR\n  a --> b';
    expect(splitMermaid(md)).toEqual([{ kind: 'text', text: md }]);
  });

  it('draws every fence, not only the first', () => {
    const md = '```mermaid\na\n```\nmiddle\n```mermaid\nb\n```';
    expect(splitMermaid(md).filter((s) => s.kind === 'mermaid')).toHaveLength(2);
  });

  it('does not mistake other fences, or mermaid-prefixed words, for diagrams', () => {
    const md = '```js\nconst x = 1;\n```\n```mermaidish\nnope\n```';
    expect(splitMermaid(md)).toEqual([{ kind: 'text', text: md }]);
  });
});
