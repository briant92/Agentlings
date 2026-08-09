import { describe, expect, it } from 'vitest';
import type { RoleInfo, SkillInfo } from '@agentlings/shared';
import { MatchIndex, MIN_CONFIDENCE, suggestSetup } from './match';

/** The shipped catalog, so the tests track what a real user actually gets. */
const ROLES: (RoleInfo & { prompt: string })[] = [
  {
    name: 'mason',
    description: 'Builder — implements and refactors code inside the sandbox',
    tools: ['read', 'write', 'edit', 'bash', 'grep'],
    skills: [],
    prompt:
      'You are a mason agentling. You build: implement features, refactor, fix. Make the smallest change that completes the job, keep the codebase style, and prove your work runs (tests or command output in RESULT.md).',
  },
  {
    name: 'scout',
    description: 'Research and reconnaissance — reads much, writes little',
    tools: ['read', 'grep', 'web_fetch'],
    skills: ['concise-reports'],
    prompt:
      'You are a scout agentling. You survey codebases and sources, map what exists, and report findings. Prefer breadth first, then depth on what matters. Cite file paths for every claim.',
  },
  {
    name: 'scribe',
    description: 'Documentation and writing — turns work into words',
    tools: ['read', 'write', 'grep'],
    skills: ['concise-reports'],
    prompt:
      'You are a scribe agentling. You write and maintain documentation: READMEs, guides, summaries, changelogs. Match the voice of what exists, prefer examples over prose.',
  },
  {
    name: 'worker',
    description: 'General-purpose agentling — takes any job, masters none',
    tools: ['read', 'write', 'edit', 'bash'],
    skills: [],
    prompt:
      'You are a worker agentling, a generalist. Do the job in front of you plainly and completely. Write your result to RESULT.md and keep your report short.',
  },
];

const SKILLS: SkillInfo[] = [
  {
    name: 'concise-reports',
    description: 'Write tight RESULT.md reports — outcome first, evidence second, no filler',
  },
];

const index = new MatchIndex(ROLES, SKILLS);
const suggest = (text: string) => suggestSetup(index, ROLES, text);

describe('concept matcher', () => {
  it('indexes every role and skill', () => {
    expect(index.size).toBe(ROLES.length + SKILLS.length);
  });

  // How a non-expert would actually phrase it, not catalog vocabulary.
  const cases: [string, string][] = [
    ['write the documentation for my project', 'scribe'],
    ['keep my README up to date', 'scribe'],
    ['write up a summary of what changed each week', 'scribe'],
    ['turn my notes into a proper guide', 'scribe'],
    ['I need a changelog written', 'scribe'],
    ['research the best way to do this', 'scout'],
    ['look into how the payment code works', 'scout'],
    ['find out what this codebase does', 'scout'],
    ['investigate and report back on the options', 'scout'],
    ['survey the sources and cite what you find', 'scout'],
    ['fix the bugs in my code', 'mason'],
    ['implement a new feature for me', 'mason'],
    ['refactor this mess', 'mason'],
    ['build the thing and prove the tests pass', 'mason'],
    ['someone who can do a bit of anything', 'worker'],
    ['a generalist for whatever comes up', 'worker'],
  ];

  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      const result = suggest(text);
      expect(result.role).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    });
  }

  it('carries the role’s own skills into the suggestion', () => {
    expect(suggest('write the documentation for my project').skills).toContain('concise-reports');
  });

  it('adds a skill the sentence itself asks for', () => {
    expect(suggest('fix the bugs and write a concise report').skills).toContain('concise-reports');
  });

  it('explains itself with the user’s own words', () => {
    // 'investigate' reaches scout only through the concept bridge
    // (reconnaissance, findings), so the echoed term proves the bridge
    // credits the user's word, not the catalog's. It was 'research' until
    // D-129, when that word stopped bridging to scout and became the
    // researcher trade's own.
    const result = suggest('investigate the options and report back');
    expect(result.matchedTerms).toContain('investigate');
    expect(result.matchedTerms.length).toBeGreaterThan(0);
  });

  it('refuses to guess when nothing fits', () => {
    const result = suggest('read my PDFs and pull the numbers into a spreadsheet');
    expect(result.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(result.role).toBeNull();
  });

  it('will not let one strong word carry a sentence it did not understand', () => {
    // "research" alone matches the scout hard; the rest is meaningless here.
    const result = suggest('research the zorblatt frobnicator quux glorp');
    expect(result.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(result.role).toBeNull();
  });

  it('reports what the library cannot cover', () => {
    const result = suggest('read my PDFs and pull the numbers into a spreadsheet');
    expect(result.gaps).toContain('pdfs');
    expect(result.gaps).toContain('spreadsheet');
  });

  it('offers alternatives to switch to', () => {
    const result = suggest('write the documentation for my project');
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.map((a) => a.name)).not.toContain(result.role);
  });

  it('is empty-safe', () => {
    expect(suggest('').role).toBeNull();
    expect(suggest('   ').confidence).toBe(0);
  });

  it('survives an empty catalog', () => {
    const bare = new MatchIndex([], []);
    const result = suggestSetup(bare, [], 'write documentation');
    expect(result.role).toBeNull();
    expect(result.gaps).toContain('write');
  });
});
