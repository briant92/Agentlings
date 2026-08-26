// The supervised browser's allowlist, as the runner applies it (D-255).
//
// Plain JS beside the runner for runner-secrets.mjs's reason: the runner is
// spawned with plain `node` and cannot import TypeScript, and it runs a whole
// session at import, so the rule lives here where a test can reach it.
//
// A navigation is allowed when its host IS a listed host or sits beneath one.
// Never a lookalike (`notexample.com` for `example.com`), never the parent of
// a listed subdomain, never anything that is not a web address at all — an
// empty list allows nothing. Two layers apply it: a PreToolUse hook refuses
// `browser_navigate` by name before the call is made, and Playwright MCP's
// own `--allowed-origins` (built by `originsArg` from the same list) aborts
// any request the page itself makes elsewhere — a link, a redirect, a form
// posting off-list.

/** The host off an address, lowercased and without its port; null when it is not one. */
export function hostOf(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Whether the address's host is on the list or beneath a listed host. */
export function hostAllowed(url, allow) {
  const host = hostOf(url);
  if (!host) return false;
  return (allow ?? []).some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The same list in Playwright MCP's `--allowed-origins` shape: each host and
 * its subdomains, semicolon-separated. An empty flag would mean "allow all"
 * over there, so an empty list becomes one entry no request can match.
 */
export function originsArg(allow) {
  const hosts = allow ?? [];
  if (hosts.length === 0) return 'nothing.invalid';
  return hosts.flatMap((h) => [h, `*.${h}`]).join(';');
}

/** The refusal in words — what the hook answers and the trajectory keeps. */
export function refusal(url, allow) {
  const hosts = allow ?? [];
  const list = hosts.length ? hosts.join(', ') : 'the list is empty — add hosts in Settings';
  const host = hostOf(url);
  return host
    ? `refused: ${host} is not on the browser-act allowlist (${list})`
    : `refused: ${JSON.stringify(String(url ?? ''))} is not a web address on the browser-act allowlist (${list})`;
}
