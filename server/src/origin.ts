/**
 * Cross-origin defence for the two surfaces a browser can reach from a page
 * the user did not open on purpose.
 *
 * The hole this closes, found by the crew's own security audit on the first
 * job that trade ever ran (D-238): `/ws` validated no `Origin`, and WebSocket
 * handshakes are exempt from the same-origin policy, so any site the user
 * visited could open `ws://127.0.0.1:4600/ws?level=hq` — level ids are
 * guessable — and be sent `sim.state()` (every job in the level, prompts
 * included) and the whole event log. Measured on the running server, and the
 * HTTP half turned out to be worse: a *simple* cross-origin POST (`text/plain`,
 * so no CORS preflight) is parsed and acted on. The page cannot read the reply,
 * but the side effect lands — and one of those side effects is
 * `POST /jobs/:id/resolve`, which is Approve, which is the send (D-075).
 *
 * **This is not authentication and does not pretend to be.** It is the cheap
 * half that needs no credential decided, so it ships ahead of Wave 0 rather
 * than inside it. `Origin` is set by the browser and cannot be forged by page
 * script, which is exactly the attacker this stops; a non-browser client can
 * put anything it likes in the header, and for that one the network boundary
 * (loopback bind, the tailnet, never `funnel`) is still the whole answer.
 */

/**
 * A missing `Origin` is allowed on purpose. Browsers always send one on a
 * WebSocket handshake and on a cross-origin unsafe request, so absence means a
 * non-browser caller: curl, the test suite, and the spawned runner calling
 * back into `/internal/*`. Refusing those would break the app to stop nobody.
 */
export function originAllowed(origin: string | null | undefined): boolean {
  if (!origin) return true;
  let host: string;
  try {
    // A sandboxed iframe and a `file://` page both send the literal "null",
    // which is not a URL and must not be read as one.
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  // The app is served from this machine (D-169, D-174) — any port, because the
  // dev server picks its own and the API answers on another.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  // The tailnet is the same trust boundary D-175 already drew, and the same
  // suffix the Vite config allows: a MagicDNS name, never a `100.x` literal.
  if (host === 'ts.net' || host.endsWith('.ts.net')) return true;
  return false;
}

/**
 * Methods that change something. A cross-origin GET is already contained by
 * the browser — no CORS headers go out, so the page cannot read what came
 * back — and gating reads here would break nothing an attacker can use while
 * risking the runner's own callbacks. What has to be stopped is the request
 * whose *effect* is the point.
 */
export const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const originRefusal =
  'This request came from another site, so it was refused. Open the app from ' +
  'localhost or your tailnet name.';
