import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS, because the runner is spawned with plain `node`.
import { hostAllowed, hostOf, originsArg, refusal } from './browser-act.mjs';

/**
 * The supervised browser's allowlist, as the runner applies it (D-255). Plain
 * JS beside the runner for runner-secrets.mjs's reason: the runner is spawned
 * with plain `node` and cannot import TypeScript, and it runs a session at
 * import, so the rule lives where a test can reach it.
 */
describe('hostOf', () => {
  it('reads the host off an address, lowercased, without a port', () => {
    expect(hostOf('https://Portal.Example.com:8443/login?x=1')).toBe('portal.example.com');
    expect(hostOf('http://localhost:5173/')).toBe('localhost');
  });

  it('is null for something that is not an address', () => {
    expect(hostOf('not an address')).toBeNull();
    expect(hostOf('')).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

describe('hostAllowed — the host itself or one beneath it, never a lookalike', () => {
  const allow = ['example.com', 'www.selenium.dev'];

  it('allows the listed host and its subdomains', () => {
    expect(hostAllowed('https://example.com/', allow)).toBe(true);
    expect(hostAllowed('https://shop.example.com/cart', allow)).toBe(true);
    expect(hostAllowed('https://www.selenium.dev/selenium/web/web-form.html', allow)).toBe(true);
  });

  it('refuses another host, a lookalike suffix, and the parent of a listed subdomain', () => {
    expect(hostAllowed('https://www.iana.org/', allow)).toBe(false);
    expect(hostAllowed('https://notexample.com/', allow)).toBe(false);
    expect(hostAllowed('https://selenium.dev/', allow)).toBe(false);
  });

  it('refuses everything when the list is empty, and anything that is not an address', () => {
    expect(hostAllowed('https://example.com/', [])).toBe(false);
    expect(hostAllowed('about:blank', allow)).toBe(false);
    expect(hostAllowed('javascript:alert(1)', allow)).toBe(false);
  });
});

describe('originsArg — the same list as Playwright MCP wants it', () => {
  it('names each host and its subdomains, semicolon-separated', () => {
    expect(originsArg(['example.com', 'www.selenium.dev'])).toBe(
      'example.com;*.example.com;www.selenium.dev;*.www.selenium.dev',
    );
  });

  it('is a single entry nothing matches when the list is empty — an empty flag would allow all', () => {
    expect(originsArg([])).toBe('nothing.invalid');
  });
});

describe('refusal — the line the trajectory keeps', () => {
  it('names the host, and the list it is not on', () => {
    expect(refusal('https://www.iana.org/domains', ['example.com'])).toBe(
      'refused: www.iana.org is not on the browser-act allowlist (example.com)',
    );
  });

  it('says when the list is empty, and when the address has no host', () => {
    expect(refusal('https://www.iana.org/', [])).toBe(
      'refused: www.iana.org is not on the browser-act allowlist (the list is empty — add hosts in Settings)',
    );
    expect(refusal('about:blank', ['example.com'])).toBe(
      'refused: "about:blank" is not a web address on the browser-act allowlist (example.com)',
    );
  });
});
