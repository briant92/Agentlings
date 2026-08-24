/**
 * Told when the server says this browser is not signed in (Wave 0).
 *
 * It lives here rather than in `session.ts` because `api()` is one of the two
 * things that can discover it — the other is the WebSocket close code — and a
 * listener defined in the module that also calls `api()` would be an import
 * cycle. There is one app, so there is one listener.
 */
let onEnded: (() => void) | null = null;

export function onSessionEnded(fn: (() => void) | null): void {
  onEnded = fn;
}

export function sessionEnded(): void {
  onEnded?.();
}

/** Level-scoped API path. */
export function lvl(levelId: string, suffix: string): string {
  return `/api/levels/${encodeURIComponent(levelId)}${suffix}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    // A 401 is the gate, not this call's own failure (Wave 0). Told once, here,
    // so no caller has to know the gate exists — the alternative is 60-odd call
    // sites each having to recognise it, and the first one that forgot would
    // show "Sign in to reach this" as if it were an error about levels.
    // `/api/session` is exempt from this: its 401 IS the answer to "was that
    // password right", and routing it through the ended path would sign the
    // user out at the moment they mistyped.
    if (res.status === 401 && path !== '/api/session') sessionEnded();

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
