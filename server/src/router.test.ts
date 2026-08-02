import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import { terms, type Recipe } from './recipes';
import { decide, isFetchOnly, recallSignal, relevantLines, type RouterContext } from './router';

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'A job',
    prompt: 'do something',
    status: 'queued',
    slot: 0,
    createdAt: 0,
    ...over,
  };
}

const KNOWLEDGE = [
  '2026-07-01 · Ivy (scribe) delivered "Document the payment flow" — the retry logic lives in queue.ts',
  '2026-07-02 · Pip (mason) delivered "Fix login" — sessions expire after 30 days',
  '2026-07-03 · Sol (scout) delivered "Survey the caverns" — nothing of note',
];

function context(over: Partial<RouterContext> = {}): RouterContext {
  return { knowledge: KNOWLEDGE, recipes: [], canFetch: false, capabilities: [], ...over };
}

describe('relevantLines', () => {
  it('ranks by how much the note shares with the question', () => {
    const lines = relevantLines(KNOWLEDGE, 'what did we learn about the payment flow');
    expect(lines[0]).toContain('payment flow');
  });

  it('returns nothing when nothing is related', () => {
    expect(relevantLines(KNOWLEDGE, 'what did we learn about quantum tunnelling')).toEqual([]);
  });

  /**
   * The free tier was guessing on the one word guaranteed to be in every
   * question that reaches it. Measured on the real `hq` level: "what do we
   * know about quantum tunnelling" scored 1 of 86 notes, sharing exactly
   * `['know']`, and was answered free from a note about `EXPORTS.md`.
   */
  it('does not match on the asking words themselves', () => {
    const notes = ['2026-07-31 · Ivy (scribe) failed "Write EXPORTS.md" — verify what you know'];
    expect(relevantLines(notes, 'what do we know about quantum tunnelling')).toEqual([]);
    // The subject still matches when the level really does have it on file.
    expect(relevantLines(notes, 'what do we know about EXPORTS.md')).toHaveLength(1);
  });

  it('answers nothing to a question with no subject in it', () => {
    expect(relevantLines(KNOWLEDGE, 'what do we know')).toEqual([]);
  });
});

/**
 * Measurement, not routing: nothing here decides anything, so what the tests
 * watch is that the two facts stay raw and stay honest. The bar that turns
 * them into "recall-only" is deliberately absent (D-046).
 */
describe('recallSignal', () => {
  it('records a question the crew has notes for', () => {
    expect(recallSignal('what did we learn about the payment flow', KNOWLEDGE)).toEqual({
      asked: true,
      recallable: 1,
    });
  });

  // The case the whole field exists for: a question, and nothing on file.
  // Zero is the answer here, not the absence of one.
  it('records a question the crew has nothing for', () => {
    expect(recallSignal('what is our deployment process?', KNOWLEDGE)).toEqual({
      asked: true,
      recallable: 0,
    });
  });

  it('does not count an imperative as a question', () => {
    expect(recallSignal('do the payment flow refactor', KNOWLEDGE).asked).toBe(false);
    expect(recallSignal('fix login', KNOWLEDGE).asked).toBe(false);
  });

  it('counts a question mark anywhere, not just a leading wh-word', () => {
    expect(recallSignal('the payment flow — how does it retry?', KNOWLEDGE).asked).toBe(true);
  });

  // Uncapped, unlike the eight notes a session is actually handed: this is
  // measuring how much the level knows, not choosing what to send.
  it('counts every note that bears on it, past the session limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => `note ${i} about the payment flow`);
    expect(recallSignal('what do we know about the payment flow?', many).recallable).toBe(12);
  });

  it('is not a question when it is work', () => {
    expect(recallSignal('add a test for the estimate module', KNOWLEDGE)).toEqual({
      asked: false,
      recallable: 0,
    });
  });
});

/**
 * The store joins the recall corpus, and deliberately does not join the
 * counter. Both halves are load-bearing (D-047, D-046).
 */
describe('the knowledge store in the recall tier', () => {
  const STORE = ['Deploys run on Fridays. [ops/deploy.md, synced 2026-08-02]'];

  it('answers from your own material, not just what the crew earned', () => {
    const decision = decide(
      job({ prompt: 'what do we know about deploys' }),
      context({ knowledge: [], store: STORE }),
    );
    expect(decision.kind).toBe('answer');
    // The provenance rides in the line, so the answer names its source with no
    // code in the router that knows a store exists.
    if (decision.kind === 'answer') expect(decision.body).toContain('ops/deploy.md');
  });

  // A stale index arrives here already empty — the guard lives in `storeLines`,
  // in one place — so this is what the router sees and it falls through.
  it('falls through to a session when the store contributed nothing', () => {
    const decision = decide(
      job({ prompt: 'what do we know about deploys' }),
      context({ knowledge: [], store: [] }),
    );
    expect(decision.kind).toBe('agent');
  });

  // The corpus the recall tier scores over is knowledge *plus* store; what the
  // counter scores over is knowledge alone. That the two differ is the whole
  // point, and it is enforced by the executor — see routed.test.ts.
  it('scores the store alongside the notes, not instead of them', () => {
    const decision = decide(
      job({ prompt: 'what do we know about the payment flow and deploys' }),
      context({ store: STORE }),
    );
    expect(decision.kind).toBe('answer');
    if (decision.kind === 'answer') {
      expect(decision.body).toContain('ops/deploy.md'); // from the store
      expect(decision.body).toContain('payment flow'); // from the crew's notes
    }
  });
});

describe('isFetchOnly', () => {
  it('recognises a bare request to read pages', () => {
    expect(isFetchOnly('read https://a.com and https://b.com', ['https://a.com', 'https://b.com'])).toBe(true);
    expect(isFetchOnly('save this page https://a.com', ['https://a.com'])).toBe(true);
  });

  // The important half: anything asking for thought is not a fetch.
  it('does not claim work that asks for analysis', () => {
    expect(isFetchOnly('summarise https://a.com', ['https://a.com'])).toBe(false);
    expect(isFetchOnly('read https://a.com and tell me what it says', ['https://a.com'])).toBe(false);
    expect(isFetchOnly('compare https://a.com with our docs', ['https://a.com'])).toBe(false);
  });

  it('is not a fetch without an address', () => {
    expect(isFetchOnly('read the docs', [])).toBe(false);
  });
});

describe('decide', () => {
  it('answers a question about what the crew knows, with no session', () => {
    const decision = decide(job({ prompt: 'what did we learn about the payment flow?' }), context());
    expect(decision.kind).toBe('answer');
    if (decision.kind === 'answer') {
      expect(decision.body).toContain('retry logic lives in queue.ts');
      expect(decision.reason).toMatch(/already know/);
    }
  });

  it('falls through when it is asked about something nobody noted', () => {
    expect(decide(job({ prompt: 'what did we learn about tax law?' }), context()).kind).toBe('agent');
  });

  it('falls through for anything that is not a recall question', () => {
    expect(decide(job({ prompt: 'document the payment flow' }), context()).kind).toBe('agent');
    expect(decide(job({ prompt: 'fix the payment flow' }), context()).kind).toBe('agent');
  });

  it('fetches pages itself when that is all that was asked', () => {
    const decision = decide(
      job({ prompt: 'read https://example.com', tools: ['web'] }),
      context({ canFetch: true }),
    );
    expect(decision.kind).toBe('fetch');
  });

  it('will not fetch for a job that never opted into the web', () => {
    expect(decide(job({ prompt: 'read https://example.com' }), context()).kind).toBe('agent');
  });

  const recipe: Recipe = {
    key: 'total the invoices in the spreadsheet',
    terms: terms('total the invoices in the spreadsheet'),
    role: 'analyst',
    approach: 'Open the sheet, sum column D, ignore blank rows.',
    answer: 'The invoices total £48,201.',
    hits: 2,
    capabilities: [],
    learnedAt: 1,
  };

  it('reuses an answer only for the exact job with no outside inputs', () => {
    const decision = decide(
      job({ prompt: 'Total the invoices in the spreadsheet' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('answer');
    if (decision.kind === 'answer') expect(decision.body).toContain('£48,201');
  });

  // The whole safety argument for memoisation lives in these two.
  it('will not reuse an answer once a repository is involved', () => {
    const decision = decide(
      job({ prompt: 'Total the invoices in the spreadsheet', repoPath: '/repo' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('oneshot');
  });

  it('will not reuse an answer for a job that merely looks similar', () => {
    const decision = decide(
      job({ prompt: 'total the invoices in the other spreadsheet' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('oneshot');
    if (decision.kind === 'oneshot') expect(decision.approach).toContain('sum column D');
  });

  it('falls through when a recipe is not close enough to be the same job', () => {
    const decision = decide(
      job({ prompt: 'write the quarterly board report' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('agent');
  });

  it('never routes a job the user asked to be done properly', () => {
    // noRouter is honoured by RoutedExecutor before decide() is reached, so
    // this asserts the decision that would otherwise have been taken.
    const decision = decide(job({ prompt: 'what did we learn about login?' }), context());
    expect(decision.kind).toBe('answer');
  });
});

describe('a recipe that only half fits', () => {
  const recipe: Recipe = {
    key: 'add a test for the estimate module',
    terms: terms('add a test for the estimate module'),
    role: 'worker',
    approach: 'read the module, then write the test beside it',
    hits: 0,
    capabilities: [],
    learnedAt: 1,
  };

  // Two bars, because the two mistakes cost different amounts. A wrong method
  // handed to a full-length session wastes a turn it can ignore; the same
  // wrong method with the leash cut to three turns wastes the whole run.
  it('hands over the method without shortening the run', () => {
    const decision = decide(
      job({ prompt: 'write tests for the estimate module' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('agent');
    if (decision.kind === 'agent') {
      expect(decision.approach).toContain('read the module');
      expect(decision.recipeKey).toBe(recipe.key);
    }
  });

  it('shortens the run only when the job really is the same one', () => {
    const decision = decide(
      job({ prompt: 'Add a test for the estimate module' }),
      context({ recipes: [recipe] }),
    );
    expect(decision.kind).toBe('oneshot');
  });

  it('says nothing at all about unrelated work', () => {
    const decision = decide(job({ prompt: 'book a table for dinner' }), context({ recipes: [recipe] }));
    expect(decision).toEqual({ kind: 'agent' });
  });
});
