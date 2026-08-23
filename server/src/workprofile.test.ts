import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { onetVersion, parseCsv, readEsco, readOnet, readProfiles } from './workprofile';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/workprofiles');

describe('O*NET adapter', () => {
  const profiles = readOnet(path.join(FIXTURES, 'onet'));

  it('normalises every occupation in the slice with its provenance intact', () => {
    expect(profiles.map((p) => p.occupationId)).toEqual(['15-1252.00', '43-3031.00']);
    const dev = profiles[0];
    expect(dev.id).toBe('onet:15-1252.00');
    expect(dev.source).toBe('onet');
    expect(dev.sourceVersion).toBe('30.0');
    expect(dev.sourceUrl).toBe('https://www.onetonline.org/link/summary/15-1252.00');
    expect(dev.title).toBe('Software Developers');
    expect(dev.domain).toBe('15');
  });

  it('keeps the task statement id and the core/supplemental rating', () => {
    const dev = profiles[0];
    expect(dev.tasks.length).toBe(6);
    for (const t of dev.tasks) {
      expect(t.sourceId).toMatch(/^\d+$/);
      expect(t.id).toBe(`onet:15-1252.00:${t.sourceId}`);
      expect(t.text.length).toBeGreaterThan(10);
    }
    expect(dev.tasks.some((t) => t.required)).toBe(true);
  });

  it('reads aliases, important skills, technology and tools', () => {
    const dev = profiles[0];
    expect(dev.aliases.length).toBe(4);
    // Skills.txt carries IM and LV rows per element; only IM ≥ 3 survives, once.
    expect(dev.skills.length).toBeGreaterThan(0);
    expect(new Set(dev.skills).size).toBe(dev.skills.length);
    expect(dev.tools.length).toBe(4 + 3);
  });

  it('narrows to the codes asked for', () => {
    expect(readOnet(path.join(FIXTURES, 'onet'), ['43-3031.00']).map((p) => p.title)).toEqual([
      'Bookkeeping, Accounting, and Auditing Clerks',
    ]);
  });

  it('reads the release off Read Me.txt and falls back to the folder name', () => {
    expect(onetVersion(path.join(FIXTURES, 'onet'))).toBe('30.0');
    expect(onetVersion(path.join(FIXTURES, 'db_99_9_text'))).toBe('db_99_9_text');
  });
});

describe('ESCO adapter', () => {
  it('parses quoted CSV with embedded newlines and commas', () => {
    expect(parseCsv('a,b\n"x\ny","1,2"\n"q""q",z\n')).toEqual([
      ['a', 'b'],
      ['x\ny', '1,2'],
      ['q"q', 'z'],
    ]);
  });

  it('turns essential and optional skills into tasks and knowledge into skills, URIs kept', () => {
    const [p] = readEsco(path.join(FIXTURES, 'esco'), 'v1.2.0-fixture');
    expect(p.id).toBe('esco:0001-test');
    expect(p.source).toBe('esco');
    expect(p.sourceVersion).toBe('v1.2.0-fixture');
    expect(p.occupationId).toBe('http://data.europa.eu/esco/occupation/0001-test');
    expect(p.sourceUrl).toBe(p.occupationId);
    expect(p.title).toBe('bookkeeper');
    expect(p.aliases).toEqual(['accounts clerk', 'ledger clerk']);
    expect(p.domain).toBe('2411');
    expect(p.tasks).toEqual([
      {
        id: 'esco:0001-test:s-001',
        text: 'maintain financial records',
        required: true,
        sourceId: 'http://data.europa.eu/esco/skill/s-001',
      },
      {
        id: 'esco:0001-test:s-002',
        text: 'prepare financial statements, reports',
        required: false,
        sourceId: 'http://data.europa.eu/esco/skill/s-002',
      },
    ]);
    expect(p.skills).toEqual(['accounting']);
  });
});

describe('profile JSON', () => {
  it('reads the fixture set and refuses a record with no identity', () => {
    const all = readProfiles(path.join(FIXTURES, 'profiles.json'));
    expect(all.map((p) => p.id)).toEqual([
      'fixture:technical-writer',
      'fixture:research-analyst',
      'fixture:accounts-payable',
      'fixture:forklift-operator',
      'fixture:sommelier',
    ]);
    for (const p of all) {
      expect(p.source).toBe('fixture');
      for (const t of p.tasks) expect(t.sourceId).toBeTruthy();
    }
  });
});
