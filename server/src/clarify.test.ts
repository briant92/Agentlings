import { describe, expect, it } from 'vitest';
import { clarificationLines, questionsFor } from './clarify';

const REPO = { hasRepo: true, tier: 'session' as const };
const NO_REPO = { hasRepo: false, tier: 'session' as const };

const ids = (text: string, ctx = REPO) => questionsFor(text, ctx).map((q) => q.id);

describe('questionsFor: when it stays quiet', () => {
  it('says nothing about free work, however vague', () => {
    for (const tier of ['routed', 'tool'] as const) {
      expect(questionsFor('fix it properly', { hasRepo: true, tier })).toEqual([]);
    }
  });

  it('says nothing about an empty box', () => {
    expect(questionsFor('   ', REPO)).toEqual([]);
  });

  it('says nothing when the sentence already names its target', () => {
    expect(ids('add tests for formatUsd in server/src/ledger.ts')).toEqual([]);
  });

  it('accepts a bare filename as a target', () => {
    expect(ids('write EXPORTS.md')).toEqual([]);
  });

  it('accepts a camelCase identifier as a target', () => {
    expect(ids('add tests for formatUsd')).toEqual([]);
  });

  it('accepts a backticked target', () => {
    expect(ids('document `quoteFor` and how it picks a tier')).toEqual([]);
  });
});

describe('questionsFor: the dangling subject', () => {
  it('asks what a bare pronoun refers to', () => {
    expect(ids('fix it')).toContain('subject');
    expect(ids('make this faster')).toContain('subject');
    expect(ids('clean that up', NO_REPO)).toContain('subject');
  });

  it('leaves a long sentence alone, where the pronoun has something to bind to', () => {
    const long = 'add tests for formatUsd so that it handles an empty ledger without throwing';
    expect(ids(long)).not.toContain('subject');
  });

  it('is free text — there is nothing sensible to offer', () => {
    const [q] = questionsFor('fix it', REPO);
    expect(q.freeText).toBe(true);
    expect(q.options).toEqual([]);
  });
});

describe('questionsFor: the starting point', () => {
  it('asks for a file when there is a repo and none was named', () => {
    expect(ids('tighten up the error handling')).toContain('target');
  });

  it('does not ask when there is no repo to look in', () => {
    expect(ids('tighten up the error handling', NO_REPO)).not.toContain('target');
  });

  it('offers to let them look, so it is never a blocker', () => {
    const q = questionsFor('tighten up the error handling', REPO).find((x) => x.id === 'target');
    expect(q?.options.map((o) => o.label)).toEqual(['let them find it']);
    expect(q?.freeText).toBe(true);
  });
});

describe('questionsFor: the shape of the answer', () => {
  it('asks when the job is to go and find something and there is no repo', () => {
    expect(ids('find the price of Nike soccer shoes size 9', NO_REPO)).toContain('shape');
    expect(ids('compare the two hosting providers', NO_REPO)).toContain('shape');
  });

  it('does not ask when the job lands in a project instead', () => {
    expect(ids('find the price of Nike soccer shoes size 9', REPO)).not.toContain('shape');
  });
});

// Found by test drive, not by a unit test: the rules only knew about fetching
// verbs, so the vaguest brief the box can take was asked nothing at all.
describe('questionsFor: a brief that says what to make but not what to say', () => {
  it('asks what goes in it, repo or not', () => {
    expect(ids('Produce a PDF')).toContain('about');
    expect(ids('Produce a PDF', NO_REPO)).toContain('about');
    expect(ids('write a report', NO_REPO)).toContain('about');
    expect(ids('make a spreadsheet', NO_REPO)).toContain('about');
  });

  it('stays quiet once the brief says what it is about', () => {
    expect(ids('Produce a PDF of last week jobs', NO_REPO)).not.toContain('about');
    expect(ids('write a summary about the socket work', NO_REPO)).not.toContain('about');
    expect(ids('make a list of every exported function', NO_REPO)).not.toContain('about');
  });

  it('stays quiet when a target names the subject', () => {
    expect(ids('write a note in NOTES.md')).not.toContain('about');
    expect(ids('write EXPORTS.md')).not.toContain('about');
  });

  it('does not ask the format when the brief already named one', () => {
    expect(ids('Produce a PDF', NO_REPO)).not.toContain('shape');
    expect(ids('make a spreadsheet', NO_REPO)).not.toContain('shape');
  });

  it('does ask the format when the brief named none', () => {
    expect(ids('write a report', NO_REPO)).toContain('shape');
  });

  it('leaves repo work alone — its output is a change to the code', () => {
    expect(ids('write a report')).not.toContain('shape');
  });
});

describe('questionsFor: unbounded scope', () => {
  it('asks how far, on the words that name no bound', () => {
    for (const text of [
      'clean up the whole project',
      'improve the tests',
      'refactor everything in the server',
      'optimise the socket properly',
    ]) {
      expect(ids(text)).toContain('scope');
    }
  });

  it('does not ask when the work is already bounded', () => {
    expect(ids('add a test for formatUsd rounding')).not.toContain('scope');
  });
});

describe('questionsFor: never a form', () => {
  it('asks at most three, however bad the sentence', () => {
    const awful = 'improve all the things and clean up everything properly';
    expect(questionsFor(awful, REPO).length).toBeLessThanOrEqual(3);
  });

  it('gives every question a distinct id, so answers cannot collide', () => {
    const qs = questionsFor('just improve it', REPO);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it('is deterministic — the same sentence asks the same things', () => {
    const once = questionsFor('clean up the whole project', REPO);
    const twice = questionsFor('clean up the whole project', REPO);
    expect(once).toEqual(twice);
  });
});

describe('clarificationLines', () => {
  const text = 'tighten up the error handling';

  it('is empty when nothing was answered', () => {
    expect(clarificationLines(text, REPO, undefined)).toEqual([]);
    expect(clarificationLines(text, REPO, {})).toEqual([]);
  });

  it('turns a typed answer into an instruction', () => {
    expect(clarificationLines(text, REPO, { target: 'server/src/ledger.ts' })).toEqual([
      'Which file or folder should they start from? server/src/ledger.ts',
    ]);
  });

  it('expands a chosen option into what the session is actually told', () => {
    const lines = clarificationLines('find the price of running shoes', NO_REPO, {
      shape: 'a table',
    });
    expect(lines).toEqual(['What should come back? Answer as a table with the figures set out.']);
  });

  it('ignores answers to questions this sentence never raised', () => {
    expect(clarificationLines(text, REPO, { nonsense: 'delete everything' })).toEqual([]);
  });

  it('ignores a blank answer rather than sending an empty instruction', () => {
    expect(clarificationLines(text, REPO, { target: '   ' })).toEqual([]);
  });

  it('keeps the order the questions were asked in', () => {
    const lines = clarificationLines('just improve it', REPO, {
      scope: 'the clearest cases only',
      subject: 'the retry loop',
      target: 'let them find it',
    });
    expect(lines[0]).toContain('the retry loop');
    expect(lines[lines.length - 1]).toContain('clearest cases');
  });
});
