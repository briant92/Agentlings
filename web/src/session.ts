import { api } from './api';

/**
 * The client half of Wave 0's gate — the three calls, and nothing else.
 *
 * The "you are signed out" signal is not here: it lives in `api.ts`, because
 * that is one of the two places it is discovered (a 401 on any call; the other
 * is the socket closing with `SOCKET_UNAUTHENTICATED`) and a listener defined
 * beside these calls would be an import cycle.
 */

export interface SessionState {
  /** Whether a password is configured at all. False means the gate is off. */
  required: boolean;
  authed: boolean;
}

export function readSession(): Promise<SessionState> {
  return api<SessionState>('/api/session');
}

export function login(password: string): Promise<SessionState> {
  return api<SessionState>('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function logout(): Promise<SessionState> {
  return api<SessionState>('/api/session', { method: 'DELETE' });
}
