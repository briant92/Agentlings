import { describe, expect, it } from 'vitest';
import { UNSAFE_METHODS, originAllowed } from './origin';

/**
 * D-239. The attack these pin is the one the crew's own audit found and the
 * probe confirmed on the running server: a page the user did not open reaching
 * `/ws` for every job in a level, or POSTing to a route whose effect is the
 * point. `Origin` is browser-set and unforgeable by page script, so refusing
 * the ones we do not know is the whole mechanism.
 */
describe('originAllowed', () => {
  it('allows the app served from this machine, on whatever port', () => {
    expect(originAllowed('http://localhost:5173')).toBe(true);
    expect(originAllowed('http://127.0.0.1:5173')).toBe(true);
    expect(originAllowed('http://localhost:4600')).toBe(true);
    expect(originAllowed('https://localhost')).toBe(true);
  });

  it('allows the tailnet by MagicDNS name, the boundary D-175 already drew', () => {
    expect(originAllowed('https://desktop-abc.tail1234.ts.net')).toBe(true);
    expect(originAllowed('http://desktop-abc.tail1234.ts.net:5173')).toBe(true);
  });

  it('refuses another site, which is the whole point', () => {
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('http://evil.example:5173')).toBe(false);
    // The suffix must be a real label boundary: a host that merely *ends* in
    // the letters is somebody else's domain.
    expect(originAllowed('https://evilts.net')).toBe(false);
    expect(originAllowed('https://ts.net.evil.example')).toBe(false);
    // A lookalike host is not this machine.
    expect(originAllowed('https://localhost.evil.example')).toBe(false);
    expect(originAllowed('https://127.0.0.1.evil.example')).toBe(false);
  });

  it('refuses an opaque origin, which is what a sandboxed iframe or a file:// page sends', () => {
    expect(originAllowed('null')).toBe(false);
    expect(originAllowed('not a url')).toBe(false);
  });

  /**
   * Deliberate, and the line most likely to be read as a hole. Browsers always
   * send `Origin` on a WebSocket handshake and on a cross-origin unsafe
   * request, so absence means a non-browser caller — curl, this suite, and the
   * spawned runner calling back into `/internal/*`. Refusing those would break
   * the app to stop nobody: anything that can set headers can set this one,
   * and for that caller the network boundary is the answer, not this check.
   */
  it('allows a caller that sends no Origin at all, on purpose', () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed(null)).toBe(true);
    expect(originAllowed('')).toBe(true);
  });

  it('gates the methods whose effect is the point, and leaves reads alone', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(UNSAFE_METHODS.has(m)).toBe(true);
    // A cross-origin GET is already contained: nothing here answers with CORS
    // headers, so the page cannot read what came back.
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(UNSAFE_METHODS.has(m)).toBe(false);
  });
});
