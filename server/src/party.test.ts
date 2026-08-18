import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GATHER_SENTENCE,
  MAX_HANDS,
  PARTY_FILE,
  PLAN_SENTENCE,
  gatherBrief,
  handBrief,
  handFileName,
  handReportName,
  outOfScope,
  partyAsk,
  patchPaths,
  planBrief,
  planParty,
  readPartyDraft,
} from './party';

describe('partyAsk — licensed by a number beside worker-words, nothing less', () => {
  it.each([
    ['research A, B and C as a team of three', 3],
    ['do this with a party of two', 2],
    ['split it between two workers', 2],
    ['three researchers on the boutique hotel market: pricing, brands, chains', 3],
    ['a group of 3 should handle these', 3],
  ])('claims: %s → %d hands', (text, n) => {
    expect(partyAsk(text)?.n).toBe(n);
  });

  it.each([
    // Bare "team" lives in send sentences already — channel.ts's own example.
    'post the release notes to the team on Slack',
    'tell the team the deploy is done',
    'summarise the team meeting notes',
    // A number without worker-words is content, not a licence.
    'compare the three options in the doc',
    'list two examples of each',
    // The gather's own sentence must never claim, or gathers recurse.
    GATHER_SENTENCE,
  ])('stays quiet: %s', (text) => {
    expect(partyAsk(text)).toBeNull();
  });
});

describe('planParty — the sentence own enumeration, or the reason it parks', () => {
  it('splits a shared-verb list and distributes the one lead word', () => {
    const plan = planParty(
      'Research the pricing, the competitors and the market size — as a team of three',
    );
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'Research the pricing',
      'Research the competitors',
      'Research the market size',
    ]);
  });

  it('keeps pieces that already carry their own verb', () => {
    const plan = planParty(
      'research the pricing; summarise the reviews — as a team of two',
    );
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'research the pricing',
      'summarise the reviews',
    ]);
  });

  it('cuts a trailing send for the gather', () => {
    const plan = planParty(
      'Research the pricing, the competitors and the market size as a team of three, and telegram me the result',
    );
    expect(plan && 'hands' in plan).toBe(true);
    if (plan && 'hands' in plan) {
      expect(plan.hands).toHaveLength(3);
      expect(plan.hands.every((h) => h.startsWith('Research'))).toBe(true);
      expect(plan.sendTail).toBe('telegram me the result');
    }
  });

  it('does not distribute off an article lead — hands ride verbatim, visible at the desk', () => {
    const plan = planParty('the pricing, the competitors and the market size as a team of three');
    expect(plan && 'hands' in plan ? plan.hands : plan).toEqual([
      'the pricing',
      'the competitors',
      'the market size',
    ]);
  });

  it('returns null when no party was asked', () => {
    expect(planParty('Research the pricing, the competitors and the market size')).toBeNull();
  });

  it.each([
    [
      // Three pieces and an ask of four: only the ask-cap can park this —
      // a survived mutation taught that a four-piece list trips the list
      // cap too, and the two messages shared words (D-158's lesson: a
      // survived mutation is a finding about what the test binds).
      `over the cap parks by name`,
      'research A, B and C as a team of four',
      `at most ${MAX_HANDS} hands today`,
    ],
    ['no list parks with the example', 'fix the login bug as a team of three', 'pieces named'],
    [
      'a send inside a piece parks with the fix',
      'telegram me the UF, the dollar and the euro as a team of three',
      'never sends',
    ],
  ])('%s', (_, text, reason) => {
    const plan = planParty(text);
    expect(plan && 'blocked' in plan ? plan.blocked : plan).toContain(reason);
  });

  it('a list longer than the cap parks even when the ask was in bounds', () => {
    const plan = planParty('research A, B, C and D with a team of three');
    expect(plan && 'blocked' in plan ? plan.blocked : String(plan)).toContain('4 pieces');
  });
});

describe('gatherBrief', () => {
  const base = {
    asked: 'Research the pricing, the competitors and the market size as a team of three',
    hands: [
      {
        hand: 1,
        piece: 'Research the pricing',
        hadReport: true,
        files: [handFileName(1, 'pricing.md')],
        leftBehind: [],
      },
      {
        hand: 2,
        piece: 'Research the competitors',
        hadReport: true,
        files: [],
        leftBehind: ['huge.pdf'],
      },
      {
        hand: 3,
        piece: 'Research the market size',
        hadReport: false,
        files: [],
        leftBehind: [],
        failed: true,
      },
    ],
  };

  it('quotes the request, points at each hand report by name, and names the uncovered piece', () => {
    const brief = gatherBrief(base);
    expect(brief).toContain(`"${base.asked}"`);
    expect(brief).toContain(`input/${handReportName(1)}`);
    expect(brief).toContain('input/hand-1-pricing.md');
    expect(brief).toContain('huge.pdf');
    expect(brief).toContain('Hand 3 failed and its piece is uncovered');
    expect(brief).toContain('material from other runs');
    expect(brief).toContain('which hand each part came from');
  });

  it('carries the send tail and the recipient lines when the request sends', () => {
    const brief = gatherBrief({
      ...base,
      sendTail: 'telegram me the result',
      sendLines: ['Send the result on telegram to 8633678680 — write OUTBOX.json as briefed.'],
    });
    expect(brief).toContain('telegram me the result');
    expect(brief).toContain('8633678680');
  });
});

describe('readPartyDraft — the planner contract, refused loud (T3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'party-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const write = (value: unknown) =>
    writeFileSync(path.join(dir, PARTY_FILE), typeof value === 'string' ? value : JSON.stringify(value));

  it('reads a sound plan whole, with loadBearing and why', () => {
    write({
      hands: [
        { prompt: 'Survey the module layout of the repo', loadBearing: true, why: 'everything hangs off it' },
        { prompt: 'List the untested exported functions' },
      ],
      notes: 'two hands suffice',
    });
    const read = readPartyDraft(dir);
    expect(read && 'draft' in read ? read.draft.hands : read).toEqual([
      {
        prompt: 'Survey the module layout of the repo',
        loadBearing: true,
        why: 'everything hangs off it',
      },
      { prompt: 'List the untested exported functions' },
    ]);
  });

  it('no file is null — the stamp says nothing', () => {
    expect(readPartyDraft(dir)).toBeNull();
  });

  it.each([
    ['torn JSON', '{"hands": [', 'not valid JSON'],
    ['no hands list', { notes: 'x' }, 'names no hands'],
    ['one hand', { hands: [{ prompt: 'do the whole thing' }] }, '2 to'],
    [
      'too many hands',
      { hands: [1, 2, 3, 4].map((n) => ({ prompt: `piece number ${n}` })) },
      '2 to',
    ],
    ['a fragment prompt', { hands: [{ prompt: 'x' }, { prompt: 'survey the repo' }] }, 'no usable prompt'],
    [
      'a hand that sends',
      { hands: [{ prompt: 'survey the repo layout' }, { prompt: 'telegram Brian the findings' }] },
      'sends ride the gather',
    ],
    [
      // The first live plan was refused for exactly this (D-196): the
      // planner defensively FORBADE sending, and the detector cannot tell
      // a negated send from a send — so the refusal now says the fix.
      'a hand that merely forbids sending',
      {
        hands: [
          { prompt: 'research the activity data. Do not send, message, email or post anything' },
          { prompt: 'research the inflation prints' },
        ],
      },
      'cannot send by construction',
    ],
  ])('%s is refused by name', (_, value, reason) => {
    write(value as never);
    const read = readPartyDraft(dir);
    expect(read && 'error' in read ? read.error : read).toContain(reason);
  });
});

describe('planBrief', () => {
  it('quotes the task and carries the contract', () => {
    const brief = planBrief({ asked: 'reorganise the test suite as a team of three', sends: false });
    expect(brief).toContain('"reorganise the test suite as a team of three"');
    expect(brief).toContain(PARTY_FILE);
    expect(brief).toContain('loadBearing');
    expect(brief).toContain('IN PARALLEL');
    // The first live plan echoed a no-send line into every hand and was
    // refused for it — the brief now forbids MENTIONING sends at all.
    expect(brief).toContain('not even to forbid it');
    expect(brief).toContain('negated or not');
    expect(brief).toContain('approving it is what queues the hands');
  });

  it('tells the planner the request sends, when it does', () => {
    expect(planBrief({ asked: 'x y z', sends: true })).toContain('The request itself sends');
    expect(planBrief({ asked: 'x y z', sends: false })).not.toContain('The request itself sends');
  });

  it('the fixed plan sentence never claims a party itself', () => {
    expect(partyAsk(PLAN_SENTENCE)).toBeNull();
  });
});

describe('patchPaths and outOfScope — the trial in-scope artefact (T4)', () => {
  const patch = [
    'diff --git a/server/src/foo.ts b/server/src/foo.ts',
    'index 111..222 100644',
    '--- a/server/src/foo.ts',
    '+++ b/server/src/foo.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/server/src/old-name.ts b/server/src/new-name.ts',
    'diff --git a/web/src/App.tsx b/web/src/App.tsx',
  ].join('\n');

  it('reads every touched path off the diff headers, both sides of a rename', () => {
    expect(patchPaths(patch).sort()).toEqual([
      'server/src/foo.ts',
      'server/src/new-name.ts',
      'server/src/old-name.ts',
      'web/src/App.tsx',
    ]);
  });

  it('scope matches its exact file and its subtree, nothing else', () => {
    const paths = patchPaths(patch);
    expect(outOfScope(paths, ['server/src']).sort()).toEqual(['web/src/App.tsx']);
    expect(outOfScope(paths, ['server/src/foo.ts'])).toContain('web/src/App.tsx');
    expect(outOfScope(paths, ['server/src/foo.ts'])).toContain('server/src/old-name.ts');
    expect(outOfScope(paths, ['server', 'web'])).toEqual([]);
    // A prefix is a path boundary, not a string one: server-src is not server.
    expect(outOfScope(['server-src/x.ts'], ['server'])).toEqual(['server-src/x.ts']);
  });
});

describe('readPartyDraft — scopes (T4)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'party-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const write = (value: unknown) => writeFileSync(path.join(dir, PARTY_FILE), JSON.stringify(value));

  it('reads scoped hands whole, normalising slashes and trailing separators', () => {
    write({
      hands: [
        { prompt: 'refactor the queue module', scope: ['server\\src\\queue.ts', './server/src/queue.test.ts'] },
        { prompt: 'refactor the sim module', scope: ['server/src/sim.ts/'] },
      ],
    });
    const read = readPartyDraft(dir);
    expect(read && 'draft' in read ? read.draft.hands.map((h) => h.scope) : read).toEqual([
      ['server/src/queue.ts', 'server/src/queue.test.ts'],
      ['server/src/sim.ts'],
    ]);
  });

  it.each([
    [
      'an absolute scope',
      [{ prompt: 'refactor the queue', scope: ['C:/Users/x'] }, { prompt: 'refactor the sim', scope: ['server'] }],
      'absolute',
    ],
    [
      'a climbing scope',
      [{ prompt: 'refactor the queue', scope: ['../outside'] }, { prompt: 'refactor the sim', scope: ['server'] }],
      'climbs out',
    ],
    [
      'a half-scoped party',
      [{ prompt: 'refactor the queue', scope: ['server/src/queue.ts'] }, { prompt: 'refactor the sim' }],
      'all-in',
    ],
  ])('%s is refused by name', (_, hands, reason) => {
    write({ hands });
    const read = readPartyDraft(dir);
    expect(read && 'error' in read ? read.error : read).toContain(reason);
  });
});

describe('the repo briefs (T4)', () => {
  it('planBrief tells a repo planner to partition by disjoint paths', () => {
    const brief = planBrief({ asked: 'refactor the modules as a team of three', repo: true });
    expect(brief).toContain('partition BY PATHS');
    expect(brief).toContain('DISJOINT');
    expect(brief).toContain('"scope"');
  });

  it('handBrief fences the edits and names the check', () => {
    const brief = handBrief(['server/src/queue.ts', 'server/src/queue.test.ts']);
    expect(brief).toContain('Edit only inside: server/src/queue.ts, server/src/queue.test.ts');
    expect(brief).toContain('read anywhere');
    expect(brief).toContain('needed-but-outside-scope');
    expect(brief).toContain('checked against this scope in code');
  });

  it('gatherBrief carries the apply order, the never---3way rule, and the strays', () => {
    const brief = gatherBrief({
      asked: 'refactor the modules as a team of two',
      hands: [
        { hand: 1, piece: 'refactor the queue', hadReport: true, files: [], leftBehind: [] },
        { hand: 2, piece: 'refactor the sim', hadReport: true, files: [], leftBehind: [] },
      ],
      repo: {
        patches: [
          { hand: 1, name: 'hand-1.patch', strayed: [] },
          { hand: 2, name: 'hand-2.patch', strayed: ['server/src/queue.ts'] },
        ],
      },
    });
    expect(brief).toContain('input/hand-1.patch, then input/hand-2.patch');
    expect(brief).toContain('NEVER --3way');
    expect(brief).toContain("Hand 2's patch strays outside its declared scope: server/src/queue.ts");
    expect(brief).toContain('run the checks');
    expect(brief).toContain('Approve is what applies it');
  });
});
