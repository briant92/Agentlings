import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AuthStatus } from '@agentlings/shared';

/**
 * Whether anything on this machine can authenticate a session, and when it
 * cannot, why — in one sentence the user can act on.
 *
 * The credentials file merely existing was treated as proof of a login for
 * months while the token inside had expired and its refreshToken was an
 * empty string. Every job failed with a raw 401 and nothing ever said why,
 * because nothing ever opened the file. Existence is not validity.
 */

export function credentialsPath(): string {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

/** Returns the file's text, or null when there is no stored login at all. */
export function readStoredLogin(file = credentialsPath()): string | null {
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function describeStoredLogin(raw: string, now: number): AuthStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      source: 'stored-login',
      problem: 'The saved Claude login could not be read. Set ANTHROPIC_API_KEY in .env.',
    };
  }

  const oauth = (parsed as { claudeAiOauth?: Record<string, unknown> })?.claudeAiOauth;
  if (!oauth || typeof oauth !== 'object') {
    return {
      ok: false,
      source: 'stored-login',
      problem: 'No Claude login is saved on this machine. Set ANTHROPIC_API_KEY in .env.',
    };
  }

  const expiresAt = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined;
  const canRefresh = typeof oauth.refreshToken === 'string' && oauth.refreshToken.length > 0;
  if (expiresAt !== undefined && expiresAt <= now) {
    // An expired token that can refresh itself is fine; one that cannot is
    // the trap, because it will never repair itself no matter how long you
    // wait or how many times you sign in to something else.
    if (!canRefresh) {
      const on = new Date(expiresAt).toISOString().slice(0, 10);
      return {
        ok: false,
        source: 'stored-login',
        problem: `The saved Claude login expired on ${on} and cannot renew itself. Set ANTHROPIC_API_KEY in .env.`,
      };
    }
  }

  return { ok: true, source: 'stored-login' };
}

export function describeAuth(
  env: Record<string, string | undefined>,
  storedLogin: string | null,
  now: number,
): AuthStatus {
  if (env.ANTHROPIC_API_KEY) return { ok: true, source: 'api-key' };
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { ok: true, source: 'oauth-token' };
  if (storedLogin === null) return { ok: false, source: 'none' };
  return describeStoredLogin(storedLogin, now);
}

/**
 * A saved login that has gone stale still means the user wants real work.
 * Falling back to the simulator there would answer with invented results
 * that read like the real thing, which is worse than failing loudly.
 */
export function shouldRunRealSessions(status: AuthStatus): boolean {
  return status.source !== 'none';
}
