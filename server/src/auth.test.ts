import { describe, expect, it } from 'vitest';
import { describeAuth, shouldRunRealSessions } from './auth';

const NOW = Date.UTC(2026, 6, 31);
const DAY = 86_400_000;

function stored(oauth: Record<string, unknown> | null): string {
  return JSON.stringify(oauth === null ? {} : { claudeAiOauth: oauth });
}

describe('describeAuth', () => {
  it('takes an API key over anything on disk', () => {
    const status = describeAuth({ ANTHROPIC_API_KEY: 'sk-test' }, stored({}), NOW);
    expect(status).toEqual({ ok: true, source: 'api-key' });
  });

  it('takes a long-lived token when there is no key', () => {
    const status = describeAuth({ CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, null, NOW);
    expect(status).toEqual({ ok: true, source: 'oauth-token' });
  });

  it('reports nothing at all when there is nothing at all', () => {
    expect(describeAuth({}, null, NOW)).toEqual({ ok: false, source: 'none' });
  });

  it('accepts a login that has not expired', () => {
    const status = describeAuth({}, stored({ expiresAt: NOW + DAY, refreshToken: 'r' }), NOW);
    expect(status.ok).toBe(true);
    expect(status.problem).toBeUndefined();
  });

  it('accepts an expired login that can still renew itself', () => {
    const status = describeAuth({}, stored({ expiresAt: NOW - DAY, refreshToken: 'r' }), NOW);
    expect(status.ok).toBe(true);
  });

  // The exact shape that broke this project for four months: expired months
  // ago, and refreshToken an empty string, so it could never self-repair.
  it('names the date when an expired login cannot renew itself', () => {
    const expired = Date.UTC(2026, 2, 22);
    const status = describeAuth({}, stored({ expiresAt: expired, refreshToken: '' }), NOW);
    expect(status.ok).toBe(false);
    expect(status.source).toBe('stored-login');
    expect(status.problem).toContain('2026-03-22');
    expect(status.problem).toContain('ANTHROPIC_API_KEY');
  });

  it('says so when the file holds no Claude login', () => {
    const status = describeAuth({}, stored(null), NOW);
    expect(status.ok).toBe(false);
    expect(status.problem).toContain('No Claude login');
  });

  it('survives a corrupt file instead of throwing at startup', () => {
    const status = describeAuth({}, '{ not json', NOW);
    expect(status.ok).toBe(false);
    expect(status.problem).toContain('could not be read');
  });
});

describe('shouldRunRealSessions', () => {
  it('runs real sessions whenever credentials exist in any form', () => {
    expect(shouldRunRealSessions({ ok: true, source: 'api-key' })).toBe(true);
  });

  // Falling back to the simulator here would answer with invented results
  // that read like real work — worse than failing loudly.
  it('does not quietly simulate when a saved login has gone stale', () => {
    expect(shouldRunRealSessions({ ok: false, source: 'stored-login', problem: 'x' })).toBe(true);
  });

  it('simulates only when the machine has no credentials at all', () => {
    expect(shouldRunRealSessions({ ok: false, source: 'none' })).toBe(false);
  });
});
