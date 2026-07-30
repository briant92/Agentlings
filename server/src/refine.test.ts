import { describe, expect, it } from 'vitest';
import type { RoleInfo, SkillInfo } from '@agentlings/shared';
import { buildPrompt, cacheKey, parseRefinement } from './refine';

const ROLES: RoleInfo[] = [
  { name: 'scribe', description: 'Documentation and writing', tools: [], skills: [] },
  { name: 'mason', description: 'Builds and fixes code', tools: [], skills: [] },
];
const SKILLS: SkillInfo[] = [
  { name: 'concise-reports', description: 'Tight reports' },
  { name: 'cite-sources', description: 'Back claims with sources' },
];

const parse = (raw: string) => parseRefinement(raw, ROLES, SKILLS);

describe('buildPrompt', () => {
  it('sends names and one-liners, never the whole catalogue', () => {
    const prompt = buildPrompt('write my docs', ROLES, SKILLS);
    expect(prompt).toContain('scribe: Documentation and writing');
    expect(prompt).toContain('write my docs');
    expect(prompt).toContain('Choose only from the lists');
  });

  it('says so when nothing is installed', () => {
    expect(buildPrompt('anything', [], [])).toContain('(none installed)');
  });
});

describe('parseRefinement', () => {
  it('reads a clean reply', () => {
    const result = parse('{"role":"scribe","skills":["concise-reports"],"confidence":0.9}');
    expect(result).toMatchObject({ role: 'scribe', skills: ['concise-reports'], confidence: 0.9 });
  });

  it('copes with a fenced reply', () => {
    const result = parse('```json\n{"role":"mason","skills":[],"confidence":0.7}\n```');
    expect(result?.role).toBe('mason');
  });

  it('copes with prose either side of the object', () => {
    const result = parse('Sure! {"role":"mason","skills":[],"confidence":0.6} Hope that helps.');
    expect(result?.role).toBe('mason');
  });

  it('accepts an honest "nothing fits"', () => {
    expect(parse('{"role":null,"skills":[],"confidence":0.2}')).toMatchObject({ role: null });
  });

  // The whole point of the tier being fenced by the catalogue.
  it('refuses a role that is not installed rather than passing it on', () => {
    expect(parse('{"role":"data-scientist","skills":[],"confidence":0.95}')).toBeNull();
  });

  it('drops invented abilities but keeps the real ones', () => {
    const result = parse(
      '{"role":"scribe","skills":["concise-reports","telepathy"],"confidence":0.8}',
    );
    expect(result?.skills).toEqual(['concise-reports']);
  });

  it('is not fooled by casing or padding', () => {
    const result = parse('{"role":"  SCRIBE ","skills":["Cite-Sources"],"confidence":0.5}');
    expect(result).toMatchObject({ role: 'scribe', skills: ['cite-sources'] });
  });

  it('clamps a confidence outside 0..1', () => {
    expect(parse('{"role":"mason","skills":[],"confidence":4}')?.confidence).toBe(1);
    expect(parse('{"role":"mason","skills":[],"confidence":-2}')?.confidence).toBe(0);
  });

  it('defaults a missing confidence rather than failing', () => {
    expect(parse('{"role":"mason","skills":[]}')?.confidence).toBe(0.5);
  });

  it('returns null for replies it cannot use', () => {
    expect(parse('I think a scribe would be best!')).toBeNull();
    expect(parse('{"role":')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('[]')).toBeNull();
  });

  it('deduplicates repeated abilities', () => {
    const result = parse(
      '{"role":"scribe","skills":["cite-sources","cite-sources"],"confidence":0.5}',
    );
    expect(result?.skills).toEqual(['cite-sources']);
  });
});

describe('cacheKey', () => {
  it('ignores casing and spacing in the sentence', () => {
    expect(cacheKey('  Write  My Docs ', ROLES, SKILLS)).toBe(cacheKey('write my docs', ROLES, SKILLS));
  });

  it('changes when the catalogue changes, so installs invalidate it', () => {
    const extra = [...ROLES, { name: 'scout', description: 'Research', tools: [], skills: [] }];
    expect(cacheKey('write my docs', ROLES, SKILLS)).not.toBe(
      cacheKey('write my docs', extra, SKILLS),
    );
  });
});
