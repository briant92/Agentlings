import { describe, expect, it } from 'vitest';
import type { RoleInfo, SkillInfo } from '@agentlings/shared';
import { MatchIndex, MIN_CONFIDENCE, searchEntries, suggestSetup } from './match';

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

describe('what the index says it knows', () => {
  it('knows a word the catalog uses and not one it does not', () => {
    // `knows` is asked with a term already stemmed, the way the matcher asks it.
    expect(index.knows('documentation')).toBe(true);
    expect(index.knows('refactor')).toBe(true);
    expect(index.knows('zorblatt')).toBe(false);
  });

  it('does not index the abilities a role is merely configured with', () => {
    // D-note in match.ts: attaching `check-your-work` must not make a role
    // answer "how it works". Only what the role says about itself is indexed.
    const ghost = new MatchIndex(
      [
        {
          name: 'ghost',
          description: 'Does a thing',
          tools: [],
          skills: ['concise-reports'],
          prompt: 'You are a ghost agentling. You do the thing.',
        },
      ],
      [],
    );
    expect(ghost.knows('concise')).toBe(false);
    expect(ghost.knows('report')).toBe(false);
    expect(ghost.size).toBe(1);
  });

  it('an empty catalog knows nothing and still answers', () => {
    const bare = new MatchIndex([], []);
    expect(bare.size).toBe(0);
    expect(bare.knows('documentation')).toBe(false);
    const found = bare.search('write the documentation');
    expect(found).toMatchObject({ roles: [], skills: [], confidence: 0 });
  });
});

describe('the ranked answer behind the suggestion', () => {
  const found = index.search('write the documentation and research the code for my repo');

  it('offers at most three of each kind, best first', () => {
    expect(found.roles.length).toBeLessThanOrEqual(3);
    expect(found.skills.length).toBeLessThanOrEqual(3);
    const scores = found.roles.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const score of scores) expect(score).toBeGreaterThan(0);
  });

  it('carries each role’s own description, so the panel need not look it up', () => {
    for (const role of found.roles) {
      expect(role.description).toBe(ROLES.find((r) => r.name === role.name)?.description);
    }
  });

  it('keeps the evidence short enough to show — six terms, six gaps', () => {
    const noisy = index.search(
      'zorblatt frobnicator quux glorp wibble splunge fnord bazzle documentation',
    );
    expect(noisy.gaps).toHaveLength(6);

    const wordy = index.search(
      'write the documentation guide readme notes summary changelog for the codebase',
    );
    expect(wordy.matchedTerms.length).toBeLessThanOrEqual(6);
  });

  it('never repeats a word in the evidence', () => {
    const repeated = index.search('documentation documentation documentation zzzz zzzz');
    expect(new Set(repeated.matchedTerms).size).toBe(repeated.matchedTerms.length);
    expect(new Set(repeated.gaps).size).toBe(repeated.gaps.length);
  });
});

describe('an unconfident suggestion', () => {
  const result = suggest('read my PDFs and pull the numbers into a spreadsheet');

  it('names no role but still offers the near misses to switch to', () => {
    expect(result.role).toBeNull();
    expect(result.roleDescription).toBe('');
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it('and suggests no skills of its own, since no role was chosen', () => {
    // The only skills that could survive are ones the sentence itself scored.
    for (const skill of result.skills) expect(SKILLS.map((s) => s.name)).toContain(skill);
  });
});

describe('searchEntries — the same matcher over the remote library', () => {
  const entries = [
    { kind: 'skill' as const, name: 'docs-one', description: 'Write documentation and guides' },
    { kind: 'skill' as const, name: 'docs-two', description: 'Documentation writing helper' },
    { kind: 'skill' as const, name: 'docs-three', description: 'A guide to writing docs' },
    { kind: 'role' as const, name: 'docs-four', description: 'Documentation author' },
    { kind: 'role' as const, name: 'docs-five', description: 'Writes guides and readmes' },
    { kind: 'role' as const, name: 'docs-six', description: 'Documentation reviewer' },
    { kind: 'role' as const, name: 'docs-seven', description: 'Readme documentation tidier' },
    { kind: 'skill' as const, name: 'flights', description: 'Books flights and hotels' },
  ];

  it('honours the limit it was given', () => {
    expect(searchEntries(entries, 'write documentation', 2).hits).toHaveLength(2);
    expect(searchEntries(entries, 'write documentation', 1).hits).toHaveLength(1);
  });

  it('stops at six by default, however many match', () => {
    const { hits } = searchEntries(entries, 'write documentation guides and readmes');
    expect(hits).toHaveLength(6);
    expect(new Set(hits.map((h) => h.name)).size).toBe(hits.length);
  });

  it('ranks roles and skills against each other, not in separate lists', () => {
    const { hits } = searchEntries(entries, 'write documentation', 3);
    expect(hits.map((h) => h.name)).not.toContain('flights');
  });

  it('reports the words no source covers either', () => {
    const { gaps } = searchEntries(entries, 'transcribe my zorblatt recordings');
    expect(gaps).toContain('zorblatt');
    expect(gaps).toContain('recordings');
  });

  it('an empty library is an empty answer, not a crash', () => {
    expect(searchEntries([], 'write documentation')).toEqual({
      hits: [],
      gaps: ['write', 'documentation'],
    });
  });
});

// The maps are object literals, so inherited Object keys were truthy
// lookups: 'constructor' returned the Function where a synonym list
// belongs and the desk 500'd on any sentence naming one (found live by
// D-197's trial — the planner's first hand prompt said "constructor").
it('a sentence naming a constructor routes instead of crashing', () => {
  const index = new MatchIndex(ROLES, SKILLS);
  for (const text of [
    'add a test for the JobQueue constructor',
    'check what toString and valueOf return here',
    'document the __proto__ handling',
  ]) {
    expect(() => index.search(text)).not.toThrow();
  }
});
