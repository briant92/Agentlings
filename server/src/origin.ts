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
 *
 * Since #28 this module also answers **what address is this install reached
 * at**, because that turned out to be the same question asked twice: the
 * origin check needs it to accept an install's own domain, and Google needs it
 * to redirect a consent walk back. Both take it from the request rather than
 * from a list, because a template others self-host cannot know their names.
 */

/**
 * The hostnames that mean *this machine and nothing else*.
 *
 * One function for the two places that ask — the origin check, which asks of
 * an `Origin`, and the listen policy, which asks of a bind address. They are
 * the same notion and were nearly written twice; the difference that matters
 * is only that `0.0.0.0` and `::` are addresses you can *bind* and not ones a
 * browser can *arrive from*, and both are false here either way, which is the
 * answer the listen policy needs.
 *
 * The whole `127.0.0.0/8` block counts, not just the `.1` of it — every
 * address in it routes nowhere but here.
 *
 * Written out in full or not at all: the dotted shorthand `127.1` and the
 * expanded `0:0:0:0:0:0:0:1` are loopback to the operating system and are
 * **not** loopback here. That costs an operator who writes `AGENTLINGS_BIND`
 * in shorthand a refusal they did not need — and the direction it fails in is
 * the one worth failing in, since the alternative is a shorthand nobody
 * recognised being read as public and let through ungated. The origin check
 * never sees either form: `new URL` normalises them before this is asked.
 */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // A bracketed IPv6 literal is how a `Host` header carries one.
  const name = host.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (name === 'localhost' || name === '::1') return true;
  const parts = name.split('.');
  if (parts.length !== 4 || parts[0] !== '127') return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * The hostname a `Host` header names, lowercased, or null when there is not
 * one to read. Parsed rather than split on `:`, so a bracketed IPv6 literal
 * comes back as the address and not as a fragment of one.
 */
function hostHeaderName(hostHeader: string | null | undefined): string | null {
  return hostHeaderParts(hostHeader)?.name ?? null;
}

/**
 * The hostname and the authority a `Host` header names — the second being the
 * hostname with its port, lowercased and normalised by the URL parser.
 *
 * Both, from one parse, because emitting the *raw* header while deciding on
 * the parsed one is a bug with a name: a proxy that forwards
 * `Host: Horde.Example.Com` would have produced a mixed-case `redirect_uri`
 * that Google — which matches registered URIs byte for byte — rejects, on the
 * very request the origin check had just accepted.
 */
function hostHeaderParts(
  hostHeader: string | null | undefined,
): { name: string; authority: string } | null {
  const raw = hostHeader?.trim();
  if (!raw) return null;
  try {
    // No empty-hostname guard, and its absence is the considered choice: `http`
    // is a special scheme, so the WHATWG parser treats a missing host as a
    // parse *failure* rather than an empty one. A guard for it would be a
    // branch no input can reach — the shape D-246 named — and the `catch` is
    // what actually handles a Host header that is not one.
    const url = new URL(`http://${raw}`);
    return { name: url.hostname.toLowerCase(), authority: url.host.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * A missing `Origin` is allowed on purpose. Browsers always send one on a
 * WebSocket handshake and on a cross-origin unsafe request, so absence means a
 * non-browser caller: curl, the test suite, and the spawned runner calling
 * back into `/internal/*`. Refusing those would break the app to stop nobody.
 *
 * `requestHost` is the request's own `Host` header, and it is required rather
 * than optional so that a call site which forgets it is a type error instead of
 * a quietly narrower check. What it buys is the case a self-hosted install
 * cannot get any other way (#28, user story 16): the operator picked a domain
 * this repository never heard of, and the request itself is the only thing
 * that knows it. A browser sets `Host` to the authority it connected to and
 * page script cannot change it — the same property that makes `Origin` worth
 * reading. What that leaves is DNS rebinding, where a name the attacker
 * controls is pointed at the install's address so the browser sends both
 * headers honestly; the answer to that one is not here but in the listen
 * policy, which is why an install on a public interface must have a password.
 */
export function originAllowed(
  origin: string | null | undefined,
  requestHost: string | null | undefined,
): boolean {
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
  if (isLoopbackHost(host)) return true;
  // The tailnet is the same trust boundary D-175 already drew, and the same
  // suffix the Vite config allows: a MagicDNS name, never a `100.x` literal.
  if (host === 'ts.net' || host.endsWith('.ts.net')) return true;
  // The install's own address. Equality, never a suffix — the same trap the
  // `.ts.net` line above had to dodge, and `evilhorde.example.com` is the
  // shape of it here. The port is not compared, for the reason the loopback
  // line does not compare it either: one install answers on more than one.
  return host === hostHeaderName(requestHost);
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

/**
 * Where Google sends the browser back.
 *
 * Named here because it is half of two different things that must agree: the
 * redirect URI Google is handed below, and `isExempt` in the session module,
 * which lets the callback through without a cookie (R-06). Both read this.
 *
 * `index.ts` registers the route with the literal rather than this constant,
 * and that is deliberate rather than an oversight: `session.test.ts` scrapes
 * the app's registrations out of the source text to prove no route escapes the
 * gate (R-05), and it can only read literals. What keeps that third copy
 * honest is the same test — it asserts the exempt set is exactly these two
 * paths, so a route literal that drifted from this constant would stop being
 * exempt and fail there.
 */
export const GOOGLE_CALLBACK_PATH = '/api/oauth/google/callback';

/**
 * The redirect URI a consent walk must carry, as a function of the request
 * that started it (#28, user story 13).
 *
 * Until this ticket it was a constant naming `127.0.0.1`, which is right for
 * exactly one install and wrong for every install anybody else deploys.
 *
 * **Loopback still means the constant**, and that is not a special case
 * apologised for but the point of the branch. Google's console holds one
 * registered redirect URI per client, this machine reaches its own app through
 * three origins — Vite on `:5173`, the API on `:4600`, the tailnet name — and
 * only the second is what is registered. A request arriving on any loopback
 * address therefore answers with the API's own, which is what keeps Connect
 * working here the day this ships (#28's rule: an unset variable changes
 * nothing).
 *
 * A request that arrived anywhere else names the address it arrived at, and
 * assumes https when no proxy said otherwise — the direction that costs
 * nothing, since Google refuses a non-loopback redirect URI that is not https,
 * so guessing http could only ever produce a URI no console would accept.
 */
export function googleRedirectUri(
  requestHost: string | null | undefined,
  forwardedProto: string | null | undefined,
  apiPort: number,
): string {
  const host = hostHeaderParts(requestHost);
  if (host === null || isLoopbackHost(host.name)) {
    return `http://127.0.0.1:${apiPort}${GOOGLE_CALLBACK_PATH}`;
  }
  const proto = (forwardedProto?.split(',')[0] ?? '').trim().toLowerCase() || 'https';
  return `${proto}://${host.authority}${GOOGLE_CALLBACK_PATH}`;
}
