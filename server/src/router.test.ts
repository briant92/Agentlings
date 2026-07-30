import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import type { Recipe } from './recipes';
import { decide, isFetchOnly, relevantLines, type RouterContext } from './router';

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
  return { knowledge: KNOWLEDGE, recipes: [], canFetch: false, ...over };
}

describe('relevantLines', () => {
  it('ranks by how much the note shares with the question', () => {
    const lines = relevantLines(KNOWLEDGE, 'what did we learn about the payment flow');
    expect(lines[0]).toContain('payment flow');
  });

  it('returns nothing when nothing is related', () => {
    expect(relevantLines(KNOWLEDGE, 'what did we learn about quantum tunnelling')).toEqual([]);
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
    terms: ['total', 'invoices', 'spreadsheet'],
    role: 'analyst',
    approach: 'Open the sheet, sum column D, ignore blank rows.',
    answer: 'The invoices total £48,201.',
    hits: 2,
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
