import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { append, type LedgerEntry } from './ledger';
import { quoteFor_, type QuoteContext } from './quote';
import { normalise, terms, writeRecipes } from './recipes';
import type { RoleRegistry } from './roles';

/**
 * A question the recall tier recognises, about something this level has on
 * file — so the router answers it for nothing.
 */
const RECALL = 'what did we learn about the sprite baker';
/** An exact repeat of a banked method, with no stored answer: a one-shot. */
const REPEAT = 'total the invoices in the spreadsheet';
/** Nothing on file bears on this, so it is a session however it is quoted. */
const UNKNOWN = 'reshingle the north roof of the barn';

/**
 * Only `get` is ever reached from a quote — for the turn leash a session on
 * this role would be granted — so the fake is that one method. Built rather
 * than loaded because a real registry would put the shape of the roles
 * directory between this test and the thing it is measuring.
 */
const registry = { get: () => ({ maxTurns: 4 }) } as unknown as RoleRegistry;

function row(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: 1,
    jobId: 'j',
    levelId: 'hq',
    jobClass: 'worker',
    tier: 'session',
    outcome: 'done',
    costUsd: 0.2,
    priceUsd: 0.2,
    turnsAllowed: 4,
    hasRepo: false,
    ...over,
  };
}

describe('quoteFor_', () => {
  let root: string;
  let sandboxRoot: string;
  let levelDir: string;
  let ctx: QuoteContext;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'quote-'));
    sandboxRoot = path.join(root, 'sandbox');
    levelDir = path.join(root, 'level');
    mkdirSync(levelDir, { recursive: true });

    // What the recall tier answers from.
    writeFileSync(
      path.join(levelDir, 'KNOWLEDGE.md'),
      '- The sprite baker snaps every tint onto DB32.\n',
      'utf8',
    );
    // An exact repeat with no `answer`, so the router offers the method and a
    // short leash rather than a stored reply. `capabilities: []` matches the
    // empty surface below, which is what keeps the match strong.
    writeRecipes(levelDir, [
      {
        key: normalise(REPEAT),
        terms: terms(REPEAT),
        role: 'worker',
        approach: 'Open the sheet with exceljs and sum the amount column.',
        capabilities: [],
        hits: 2,
        // Proven, or it would be quoted as a session — the leash is gated on a
        // run using the method having landed.
        successes: 1,
        completions: 1,
        learnedAt: 1,
      },
    ]);
    // Two priced sessions for this role and shape, so the session tier quotes
    // from history rather than from the cautious default — the point being
    // that the noRouter quote is a real session price, not a placeholder.
    append(sandboxRoot, row());
    append(sandboxRoot, row({ jobId: 'k', costUsd: 0.4, priceUsd: 0.4 }));

    ctx = { sandboxRoot, registry, surfaceFor: () => [] };
  });

  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const quote = (text: string, noRouter = false) =>
    quoteFor_(ctx, levelDir, text, undefined, 'worker', undefined, noRouter);

  describe('following the router', () => {
    it('prices a recall question free, because the router will answer it', () => {
      const q = quote(RECALL);
      expect(q.tier).toBe('routed');
      expect(q.ceilingUsd).toBe(0);
    });

    it('prices an exact repeat on the one-shot tier', () => {
      const q = quote(REPEAT);
      expect(q.tier).toBe('oneshot');
      // The five-turn recipe leash at this role's measured rate: below a full
      // session, above nothing.
      expect(q.ceilingUsd).toBeGreaterThan(0);
      expect(q.ceilingUsd).toBeLessThan(quote(UNKNOWN).ceilingUsd);
    });

    it('prices work it recognises nothing about as a session', () => {
      const q = quote(UNKNOWN);
      expect(q.tier).toBe('session');
      expect(q.samples).toBe(2);
      expect(q.ceilingUsd).toBeCloseTo(0.6, 5);
    });
  });

  /**
   * The case that matters. A run that bypasses the router is a full session
   * whatever the router would have said, so asking the router is asking about
   * a run that is not going to happen — and both of its cheap answers quote
   * for less than the session will spend.
   */
  describe('when noRouter is set', () => {
    it('prices a recall question as a session, not free', () => {
      const followed = quote(RECALL);
      const bypassed = quote(RECALL, true);
      expect(followed.tier).toBe('routed');
      expect(bypassed.tier).toBe('session');
      // A quote of zero is the failure this guards: it kills the session
      // before its first turn.
      expect(bypassed.ceilingUsd).toBeCloseTo(0.6, 5);
    });

    it('prices an exact repeat as a session, on the full leash', () => {
      const followed = quote(REPEAT);
      const bypassed = quote(REPEAT, true);
      expect(followed.tier).toBe('oneshot');
      expect(bypassed.tier).toBe('session');
      expect(bypassed.ceilingUsd).toBeGreaterThan(followed.ceilingUsd);
      // Priced under the role, not under the recipe the run will not be using.
      expect(bypassed.samples).toBe(2);
    });

    it('changes nothing for work the router would have sent to a session anyway', () => {
      expect(quote(UNKNOWN, true)).toEqual(quote(UNKNOWN));
    });
  });

  /**
   * Mid-flight work — a continuation or a reply — is refused every shortcut by
   * the router, so the quote has to price the session it is really about to
   * be: a routed $0 here would be a promise of free arriving as a bill, the
   * shape D-027 and D-049 each closed once before (D-074).
   */
  describe('when the job continues an earlier run', () => {
    const midFlight = (text: string) =>
      quoteFor_(ctx, levelDir, text, undefined, 'worker', undefined, false, 'j0');

    it('prices a recall question as the session it will really be', () => {
      expect(quote(RECALL).tier).toBe('routed');
      expect(midFlight(RECALL).tier).toBe('session');
    });

    it('never grants the leash to a continuation of a proven repeat', () => {
      const q = midFlight(REPEAT);
      expect(q.tier).toBe('session');
      // The recipe key rides along, and with no keyed rows yet the quote falls
      // back to the role's own history rather than to the tier average.
      expect(q.samples).toBe(2);
    });
  });

  /**
   * The send the desk already holds costs nothing (D-097): recipient and words
   * both in hand, the outbox is composed in code and no session runs. The
   * probe has to carry the send on `channels` — the list the router's compose
   * branch reads since D-179 — or the flip never fires and a free send is
   * quoted as a paid session. It was quoted as one: D-179 made channels a list
   * and left this probe on the singular `channel`, and no test caught it.
   */
  describe('a held send is composed, not run (D-097, D-179)', () => {
    const held = (text: string) =>
      quoteFor_(ctx, levelDir, text, ['telegram'], 'worker', undefined, false, undefined, {
        to: 'Sammy',
        words: 'A darle',
      }, 'telegram');

    it('quotes free when the recipient and the words are in hand', () => {
      const q = held('telegram Sammy');
      expect(q.tier).toBe('routed');
      expect(q.ceilingUsd).toBe(0);
    });

    it('quotes a session without them — the flip is the facts, not the sentence', () => {
      const q = quoteFor_(ctx, levelDir, 'telegram Sammy', ['telegram'], 'worker', undefined);
      expect(q.tier).toBe('session');
      expect(q.ceilingUsd).toBeGreaterThan(0);
    });
  });
});
