import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bundleFile } from './bundle';

/**
 * A real directory rather than an injected `exists` predicate, because the
 * question this module answers is *what is on disk* — a stub would let a
 * traversal that this code refuses pass a test that never touched a
 * filesystem, and Windows path handling is exactly where such a bug would
 * live.
 */
const DIST = mkdtempSync(path.join(os.tmpdir(), 'agentlings-bundle-'));
mkdirSync(path.join(DIST, 'assets'));
mkdirSync(path.join(DIST, 'packs', 'cave'), { recursive: true });
writeFileSync(path.join(DIST, 'index.html'), '<!doctype html><title>Agentlings</title>');
writeFileSync(path.join(DIST, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(path.join(DIST, 'assets', 'index-abc123.css'), 'body{}');
writeFileSync(path.join(DIST, 'packs', 'cave', 'pack.json'), '{}');
writeFileSync(path.join(DIST, 'starbase.png'), 'not really a png');

/** A directory with nothing in it: the maintainer who has never run a build. */
const EMPTY = mkdtempSync(path.join(os.tmpdir(), 'agentlings-nobundle-'));

afterAll(() => {
  rmSync(DIST, { recursive: true, force: true });
  rmSync(EMPTY, { recursive: true, force: true });
});

describe('what the bundle answers', () => {
  it('serves the title screen at the root', () => {
    const hit = bundleFile('/', DIST);
    expect(hit?.file).toBe(path.join(DIST, 'index.html'));
    expect(hit?.type).toBe('text/html; charset=utf-8');
  });

  it('serves a built asset by its own name and type', () => {
    expect(bundleFile('/assets/index-abc123.js', DIST)).toEqual({
      file: path.join(DIST, 'assets', 'index-abc123.js'),
      type: 'text/javascript; charset=utf-8',
      cache: 'public, max-age=31536000, immutable',
      etag: expect.stringMatching(/^W\/"[0-9a-f]+-[0-9a-f]+"$/),
    });
    expect(bundleFile('/assets/index-abc123.css', DIST)?.type).toBe('text/css; charset=utf-8');
    expect(bundleFile('/packs/cave/pack.json', DIST)?.type).toBe('application/json; charset=utf-8');
    expect(bundleFile('/starbase.png', DIST)?.type).toBe('image/png');
  });

  /**
   * `no-cache` is *revalidate*, and a validator is what there is to revalidate
   * against. Without one, the shell and every pack image come down in full on
   * every page load — on a hosted install, on somebody's metered container.
   */
  it('carries a validator that changes when the file does', () => {
    const file = path.join(DIST, 'assets', 'index-abc123.css');
    const first = bundleFile('/assets/index-abc123.css', DIST)?.etag;
    expect(first).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    writeFileSync(file, 'body{color:red}');
    utimesSync(file, new Date(), new Date(Date.now() + 60_000));
    expect(bundleFile('/assets/index-abc123.css', DIST)?.etag).not.toBe(first);
  });

  /**
   * The shell must not be cached, the hashed assets must be. A container is
   * rebuilt on every deploy and the asset names change with it: a browser
   * holding yesterday's `index.html` would ask for a file that no longer
   * exists and render nothing at all.
   */
  it('caches the hashed assets forever and the shell not at all', () => {
    expect(bundleFile('/', DIST)?.cache).toBe('no-cache');
    expect(bundleFile('/assets/index-abc123.js', DIST)?.cache).toBe(
      'public, max-age=31536000, immutable',
    );
    // Not content-hashed — a pack's files keep their names across a rebuild.
    expect(bundleFile('/packs/cave/pack.json', DIST)?.cache).toBe('no-cache');
  });

  /**
   * A type it has never heard of is bytes, not a document. The real bundle
   * carries `.py` files inside a pack, and the mutation that mattered here was
   * `text/html` as the default: a file the browser was never meant to
   * interpret would be handed to it as a page to run.
   */
  it('hands an unknown type over as bytes', () => {
    writeFileSync(path.join(DIST, 'packs', 'cave', 'make.py'), 'print(1)');
    expect(bundleFile('/packs/cave/make.py', DIST)?.type).toBe('application/octet-stream');
  });

  it('reads the extension whatever case it is written in', () => {
    // Hand-dropped art is where this comes from: a `.PNG` off a camera or a
    // scanner is a real name, and typing it in a table of lowercase keys is
    // how an image arrives as bytes the browser will not draw.
    writeFileSync(path.join(DIST, 'Logo.PNG'), 'not really a png');
    expect(bundleFile('/Logo.PNG', DIST)?.type).toBe('image/png');
  });

  it('decodes a percent-encoded name', () => {
    writeFileSync(path.join(DIST, 'a name.png'), 'x');
    expect(bundleFile('/a%20name.png', DIST)?.file).toBe(path.join(DIST, 'a name.png'));
  });

  it('refuses a percent-encoding that is not one', () => {
    expect(bundleFile('/%zz.png', DIST)).toBeNull();
  });
});

/**
 * The client owns its own deep links: `/level/abc` is a React route and there
 * is no such file. It gets the shell, which then reads the path itself.
 */
describe('deep links the web client owns', () => {
  it('falls through to the title screen', () => {
    expect(bundleFile('/settings', DIST)?.file).toBe(path.join(DIST, 'index.html'));
    expect(bundleFile('/level/abc/desk', DIST)?.file).toBe(path.join(DIST, 'index.html'));
  });

  /**
   * A missing *file* is a 404 and must not be the shell. Answering HTML to a
   * request for a missing script is the bug that turns a deleted asset into
   * "Unexpected token '<'" — an error about syntax that is really an error
   * about routing.
   */
  it('does not answer HTML for a missing asset', () => {
    expect(bundleFile('/assets/index-gone.js', DIST)).toBeNull();
    expect(bundleFile('/nope.png', DIST)).toBeNull();
  });

  it('never sends a directory, which exists but is not a file', () => {
    expect(bundleFile('/assets', DIST)?.file).toBe(path.join(DIST, 'index.html'));
    expect(bundleFile('/packs/cave', DIST)?.file).toBe(path.join(DIST, 'index.html'));
  });
});

/**
 * R-05's shape, one module along: the static handler runs before the gate, so
 * anything it claims is a path served without a session. It must never claim
 * a path the server owns — and it refuses them by name rather than by whether
 * a file happens to be missing, so a file dropped into a `dist/api/` folder
 * could not shadow a route.
 */
describe('paths the server owns', () => {
  it('claims none of them, even as a deep link', () => {
    mkdirSync(path.join(DIST, 'api'), { recursive: true });
    writeFileSync(path.join(DIST, 'api', 'levels'), 'shadow');
    for (const owned of [
      '/api/levels',
      '/api/session',
      '/api/oauth/google/callback',
      '/internal/fetch',
      '/internal',
      '/ws',
    ]) {
      expect(bundleFile(owned, DIST), owned).toBeNull();
    }
  });

  it('is not fooled by an encoded prefix', () => {
    expect(bundleFile('/%61pi/levels', DIST)).toBeNull();
  });

  /**
   * Nor by a capital. Hono's own routes are case-sensitive, so `/API/levels`
   * is the API's 404 — but this module runs in front of them, and a
   * case-sensitive refusal here would wave it through to the deep-link
   * fall-through and answer 200 HTML where a route was meant to be.
   */
  it('is not fooled by a capital letter', () => {
    expect(bundleFile('/API/levels', DIST)).toBeNull();
    expect(bundleFile('/Internal/fetch', DIST)).toBeNull();
    expect(bundleFile('/WS', DIST)).toBeNull();
  });
});

/**
 * Which of these spellings the *route* can actually deliver, measured — the
 * review of this ticket asked and the answer is not all of them.
 *
 * `index.ts` passes `new URL(c.req.url).pathname`, and the WHATWG parser
 * removes dot segments before anyone here sees them: `/%2e%2e/.env` and
 * `/../.env` both arrive as `/.env`, refused by the dotfile rule rather than
 * by anything about traversal. `%2f` and `%5c` survive it intact, so
 * `/..%2f.env` reaches this module as a live `..` and `/%5c..%5c.env` as a
 * live backslash. Those two are what the traversal handling is actually for;
 * the rest are defence in depth, and the distinction is written down because
 * `prove-hosted.mjs` was asserting the first kind and calling it the second.
 */
describe('what the route can actually deliver', () => {
  it('is what this file claims it is', () => {
    const seen = (p: string) => new URL(`http://install${p}`).pathname;
    expect(seen('/%2e%2e/.env')).toBe('/.env');
    expect(seen('/../.env')).toBe('/.env');
    expect(seen('/..%2f.env')).toBe('/..%2f.env');
    expect(seen('/%5c..%5c.env')).toBe('/%5c..%5c.env');
    // And each of those, as delivered, is refused here.
    for (const p of ['/%2e%2e/.env', '/../.env', '/..%2f.env', '/%5c..%5c.env']) {
      expect(bundleFile(seen(p), DIST), p).toBeNull();
    }
  });
});

describe('a path that tries to leave the bundle', () => {
  it('is refused, however it is spelled', () => {
    for (const escape of [
      '/../.env',
      '/assets/../../.env',
      '/%2e%2e/.env',
      '/%2e%2e%2f.env',
      '/..%2f.env',
      '/\\..\\.env',
      '/assets/..\\..\\.env',
      '/%5c..%5c.env',
      '/a/../../.env',
    ]) {
      expect(bundleFile(escape, DIST), escape).toBeNull();
    }
  });

  it('refuses a NUL and an absolute Windows path', () => {
    expect(bundleFile('/a%00.png', DIST)).toBeNull();
    expect(bundleFile('/C:/Windows/win.ini', DIST)).toBeNull();
  });

  /**
   * The input that reaches the containment check and nothing else does.
   *
   * A mutation pass found this: with `..` refused by segment and backslashes
   * refused outright, every other escape in this file resolves back *inside*
   * the bundle — `C:` is drive-*relative* on Windows and lands on the drive
   * the bundle is already on. A different letter does not: `path.resolve`
   * answers `Z:\` and the file is somewhere else on the disk entirely. So the
   * drive here is deliberately not the bundle's, or this test would pass
   * against a module with no containment check at all.
   */
  it('refuses a path onto another drive, which is what containment is for', () => {
    const drive = path.parse(path.resolve(DIST)).root.slice(0, 1).toUpperCase();
    const other = drive === 'Z' ? 'Y' : 'Z';
    expect(bundleFile(`/${other}:/secret.txt`, DIST)).toBeNull();
    expect(bundleFile(`/${other}:/`, DIST)).toBeNull();
  });

  /**
   * A refused path must be refused, not answered with the shell. `/../.env`
   * has no extension, so the deep-link fall-through would have taken it —
   * disclosing nothing, and still claiming a request this module had just
   * decided was none of its business.
   */
  it('is not then handed the shell by the deep-link fall-through', () => {
    expect(bundleFile('/../.env', DIST)).toBeNull();
    expect(bundleFile('/assets/../..', DIST)).toBeNull();
  });

  /**
   * And a dotfile that found its way *into* the build output is refused on
   * its name, not on happening to be absent — `web/dist` is a directory a
   * build tool writes and a container copies, and `.env` is the one name that
   * must never be served from anywhere.
   */
  it('refuses a dotfile inside the bundle', () => {
    writeFileSync(path.join(DIST, '.env'), 'AGENTLINGS_PASSWORD=hunter2');
    expect(bundleFile('/.env', DIST)).toBeNull();
  });
});

/**
 * The maintainer's flow does not depend on a build: `npm run dev` serves the
 * web half from Vite and has never needed `web/dist` to exist.
 */
describe('with no bundle built', () => {
  it('answers nothing, so every request falls through to the API', () => {
    expect(bundleFile('/', EMPTY)).toBeNull();
    expect(bundleFile('/settings', EMPTY)).toBeNull();
    expect(bundleFile('/assets/index-abc123.js', EMPTY)).toBeNull();
  });

  it('and the same when the directory itself was never created', () => {
    // A fresh clone: `web/dist` does not exist at all, which is a different
    // call for `statSync` than an empty one and must be the same answer.
    const never = path.join(EMPTY, 'never-built');
    expect(bundleFile('/', never)).toBeNull();
    expect(bundleFile('/settings', never)).toBeNull();
  });
});
