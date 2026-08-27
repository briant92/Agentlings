import { describe, expect, it } from 'vitest';
import {
  GOOGLE_CALLBACK_PATH,
  UNSAFE_METHODS,
  googleRedirectUri,
  isLoopbackHost,
  originAllowed,
} from './origin';

/**
 * D-239. The attack these pin is the one the crew's own audit found and the
 * probe confirmed on the running server: a page the user did not open reaching
 * `/ws` for every job in a level, or POSTing to a route whose effect is the
 * point. `Origin` is browser-set and unforgeable by page script, so refusing
 * the ones we do not know is the whole mechanism.
 *
 * The second argument is the request's own `Host`, added when an install
 * stopped being only this machine (#28). Every call passes one — it is
 * required rather than optional so a caller that forgets is a type error and
 * not a silently narrower check.
 */
describe('originAllowed', () => {
  // What a request to the maintainer's install carries.
  const LOCAL = '127.0.0.1:4600';

  it('allows the app served from this machine, on whatever port', () => {
    expect(originAllowed('http://localhost:5173', LOCAL)).toBe(true);
    expect(originAllowed('http://127.0.0.1:5173', LOCAL)).toBe(true);
    expect(originAllowed('http://localhost:4600', LOCAL)).toBe(true);
    expect(originAllowed('https://localhost', LOCAL)).toBe(true);
    // The whole 127.0.0.0/8 block is this machine, not just the .1 of it.
    expect(originAllowed('http://127.0.0.2:5173', LOCAL)).toBe(true);
  });

  it('allows the tailnet by MagicDNS name, the boundary D-175 already drew', () => {
    expect(originAllowed('https://desktop-abc.tail1234.ts.net', LOCAL)).toBe(true);
    expect(originAllowed('http://desktop-abc.tail1234.ts.net:5173', LOCAL)).toBe(true);
  });

  it('refuses another site, which is the whole point', () => {
    expect(originAllowed('https://evil.example', LOCAL)).toBe(false);
    expect(originAllowed('http://evil.example:5173', LOCAL)).toBe(false);
    // The suffix must be a real label boundary: a host that merely *ends* in
    // the letters is somebody else's domain.
    expect(originAllowed('https://evilts.net', LOCAL)).toBe(false);
    expect(originAllowed('https://ts.net.evil.example', LOCAL)).toBe(false);
    // A lookalike host is not this machine.
    expect(originAllowed('https://localhost.evil.example', LOCAL)).toBe(false);
    expect(originAllowed('https://127.0.0.1.evil.example', LOCAL)).toBe(false);
  });

  it('refuses an opaque origin, which is what a sandboxed iframe or a file:// page sends', () => {
    expect(originAllowed('null', LOCAL)).toBe(false);
    expect(originAllowed('not a url', LOCAL)).toBe(false);
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
    expect(originAllowed(undefined, LOCAL)).toBe(true);
    expect(originAllowed(null, LOCAL)).toBe(true);
    expect(originAllowed('', LOCAL)).toBe(true);
  });

  it('gates the methods whose effect is the point, and leaves reads alone', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(UNSAFE_METHODS.has(m)).toBe(true);
    // A cross-origin GET is already contained: nothing here answers with CORS
    // headers, so the page cannot read what came back.
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(UNSAFE_METHODS.has(m)).toBe(false);
  });
});

/**
 * #28. An install on its own domain has no name this repository could have
 * known, so the address it answers at cannot come from a list — it comes from
 * the request. A browser sets `Host` to the authority it connected to and page
 * script cannot change it, which is the same property that makes `Origin`
 * worth reading in the first place.
 */
describe('originAllowed on an install with its own domain', () => {
  const OWN = 'horde.example.com';

  it('accepts the install its own address, over http or https, with or without a port', () => {
    expect(originAllowed('https://horde.example.com', OWN)).toBe(true);
    expect(originAllowed('http://horde.example.com', OWN)).toBe(true);
    // The port is not compared, for the same reason it never was on loopback:
    // the app is reached on more than one of them.
    expect(originAllowed('https://horde.example.com:8443', `${OWN}:8080`)).toBe(true);
    // Host names are case-insensitive; origins are sent lowercase but a proxy
    // may not have been so careful with Host.
    expect(originAllowed('https://horde.example.com', 'Horde.Example.Com')).toBe(true);
  });

  it('refuses a host that merely ends in the same letters', () => {
    // The trap `originAllowed` already had for `.ts.net`, pointed at the new
    // branch: equality, never a suffix.
    expect(originAllowed('https://evilhorde.example.com', OWN)).toBe(false);
    expect(originAllowed('https://horde.example.com.evil.test', OWN)).toBe(false);
    expect(originAllowed('https://orde.example.com', OWN)).toBe(false);
  });

  it('still refuses a foreign origin, and still allows loopback and the tailnet', () => {
    expect(originAllowed('https://evil.example', OWN)).toBe(false);
    expect(originAllowed('http://127.0.0.1:4600', OWN)).toBe(true);
    expect(originAllowed('https://desktop-abc.tail1234.ts.net', OWN)).toBe(true);
  });

  /**
   * A request with no `Host` at all, or one this cannot read, must not widen
   * anything: the new branch simply does not fire and the old three decide.
   */
  it('falls back to the addresses it already knew when Host is absent or unreadable', () => {
    expect(originAllowed('http://127.0.0.1:4600', undefined)).toBe(true);
    expect(originAllowed('https://horde.example.com', undefined)).toBe(false);
    expect(originAllowed('https://horde.example.com', '')).toBe(false);
    expect(originAllowed('https://horde.example.com', ' ')).toBe(false);
  });
});

describe('isLoopbackHost', () => {
  it('knows the addresses that mean this machine and nothing else', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.2')).toBe(true);
    expect(isLoopbackHost('127.255.255.254')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('knows that every-interface is not loopback, which is the whole of #28', () => {
    // These two are what a hosted install binds, and the reason the listen
    // policy exists at all.
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('::')).toBe(false);
    expect(isLoopbackHost('[::]')).toBe(false);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
    expect(isLoopbackHost('horde.example.com')).toBe(false);
    // A lookalike is not the thing.
    expect(isLoopbackHost('127.0.0.1.evil.example')).toBe(false);
    expect(isLoopbackHost('localhost.evil.example')).toBe(false);
    expect(isLoopbackHost('127.999.0.1')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });

  /**
   * Deliberate, and pinned so it is a choice rather than an accident: the
   * shorthand forms that the operating system treats as loopback are refused.
   * The cost is an operator who writes `AGENTLINGS_BIND=127.1` being told to
   * set a password they did not need; the alternative is a shorthand nobody
   * recognised being read as public and let through ungated, which is the
   * failure this whole ticket exists to prevent. The origin check never sees
   * either form — `new URL` expands them first.
   */
  it('takes loopback written out in full, and refuses the shorthands', () => {
    expect(isLoopbackHost('127.1')).toBe(false);
    expect(isLoopbackHost('127.0.1')).toBe(false);
    expect(isLoopbackHost('0:0:0:0:0:0:0:1')).toBe(false);
    // …and what the parser does hand back is the expanded form, so the origin
    // check is unaffected by any of that.
    expect(new URL('http://127.1').hostname).toBe('127.0.0.1');
    expect(originAllowed('http://127.1', 'horde.example.com')).toBe(true);
  });
});

/**
 * #28, user story 13: Google redirects the browser back to a URI it was given
 * at the start of the walk, and an install on its own domain has to name that
 * domain. The old constant named `127.0.0.1` and nothing else, which is right
 * for exactly one install.
 */
describe('googleRedirectUri', () => {
  it('reproduces the constant it replaces, for a request that arrived on loopback', () => {
    // The literal that was in `index.ts` before this ticket. Written out
    // rather than composed, so a typo in the module cannot agree with it.
    const before = 'http://127.0.0.1:4600/api/oauth/google/callback';
    expect(googleRedirectUri('127.0.0.1:4600', undefined, 4600)).toBe(before);
    expect(googleRedirectUri('localhost:4600', undefined, 4600)).toBe(before);
    // Through the Vite proxy the Host is the dev server's, still loopback —
    // and the URI must still be the one Google's console holds, or Connect
    // stops working on this machine the day this ships.
    expect(googleRedirectUri('127.0.0.1:5173', undefined, 4600)).toBe(before);
    // No Host at all: the same answer, because loopback is the safe guess and
    // the only one that can be right without a request to read.
    expect(googleRedirectUri(undefined, undefined, 4600)).toBe(before);
  });

  it('names the install own domain when the request came from one', () => {
    expect(googleRedirectUri('horde.example.com', 'https', 4600)).toBe(
      `https://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
    // A non-default port on the public address is kept: it is part of the URI
    // the operator registered.
    expect(googleRedirectUri('horde.example.com:8443', 'https', 4600)).toBe(
      `https://horde.example.com:8443${GOOGLE_CALLBACK_PATH}`,
    );
    // Proxies chain, and the first hop is the browser's.
    expect(googleRedirectUri('horde.example.com', 'https, http', 4600)).toBe(
      `https://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
    expect(googleRedirectUri('horde.example.com', 'http', 4600)).toBe(
      `http://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
  });

  /**
   * The redirect emits the *parsed* authority, never the raw header. Google
   * matches a registered redirect URI byte for byte, so a proxy forwarding
   * `Host: Horde.Example.Com` — which `originAllowed` accepts, since host names
   * are case-insensitive — would otherwise produce a URI no console holds.
   */
  it('normalises the address rather than echoing the header back', () => {
    expect(googleRedirectUri('Horde.Example.Com', 'https', 4600)).toBe(
      `https://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
    expect(googleRedirectUri('  horde.example.com:8443  ', 'https', 4600)).toBe(
      `https://horde.example.com:8443${GOOGLE_CALLBACK_PATH}`,
    );
    // The proxy's own protocol is read the same way.
    expect(googleRedirectUri('horde.example.com', ' HTTPS ', 4600)).toBe(
      `https://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
  });

  it('falls back to loopback for a Host it cannot read, rather than building nonsense', () => {
    for (const junk of ['', '   ', ':::', 'not a host']) {
      expect(googleRedirectUri(junk, 'https', 4600)).toBe(
        `http://127.0.0.1:4600${GOOGLE_CALLBACK_PATH}`,
      );
    }
  });

  it('assumes https for a public address that arrived without a forwarded protocol', () => {
    // The failure direction that costs nothing: Google refuses a non-loopback
    // redirect URI that is not https, so guessing http could only ever produce
    // a URI no console would accept.
    expect(googleRedirectUri('horde.example.com', undefined, 4600)).toBe(
      `https://horde.example.com${GOOGLE_CALLBACK_PATH}`,
    );
  });

  it('is the path the gate already exempts, so the callback can arrive without a cookie', () => {
    // R-06: Google's redirect is a cross-site navigation, so a SameSite cookie
    // is withheld. `isExempt` names this path literally; if one of the two
    // moves, this is what says so.
    expect(GOOGLE_CALLBACK_PATH).toBe('/api/oauth/google/callback');
  });
});
