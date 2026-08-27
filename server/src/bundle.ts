import { type Stats, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The built web bundle, answered from the API port — *one origin* (#29).
 *
 * Until this module an install had three of them: Vite on `:5173`, the API on
 * `:4600`, and the tailnet name in front of both. That is workable on a
 * machine somebody is sitting at and impossible in a container, which has one
 * port and no Vite — so a browser opening a hosted install's address would
 * have reached the API and nothing else.
 *
 * Nothing changes for the maintainer. `npm run dev` still puts Vite in front
 * and proxies `/api` and `/ws` back here, and this module answers `null` for
 * every path when no bundle has been built — which is the state a dev
 * checkout is in, and the reason the dev flow does not depend on a build.
 *
 * **It runs before the gate**, and that is deliberate rather than an
 * oversight. What it serves is product: the same bytes for every install, and
 * already public in the repository. The operator's data is behind `/api`,
 * which this module refuses to claim under any spelling. So an unauthenticated
 * browser gets the shell, the shell asks `/api/session`, and what it renders
 * is the sign-in — not the world.
 */

/**
 * The prefixes the server answers itself.
 *
 * Refused by name and not by "no such file", so a file that found its way
 * into `dist/api/` could never shadow a route — and, more to the point, so
 * that a *future* route under one of these prefixes is server-owned the
 * moment it is registered, with nothing here to update. Same direction as
 * `isExempt`: the mistake falls towards the gate, not past it.
 *
 * **Exported because it is a claim about `index.ts` and has to be checked
 * against it.** This middleware runs before the routes, so a top-level route
 * registered outside these prefixes — `/healthz`, `/metrics` — has no
 * extension, hits the deep-link fall-through, and is silently answered with
 * the shell: a 200 of HTML where a route was meant to be, with nothing
 * failing anywhere. R-05's test in `session.test.ts` reads every registration
 * out of the source and now checks it against *this* list rather than a second
 * copy of it, so the two cannot drift.
 */
export const SERVER_OWNED = ['/api', '/internal', '/ws'];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Forever for a hashed asset, never for the shell.
 *
 * Vite names everything under `assets/` by its content, so those bytes can
 * never change under a name — while `index.html` is what points at them. A
 * browser holding yesterday's shell after a redeploy would ask for asset
 * names that no longer exist and render a blank page, which is the one
 * caching mistake that looks like the app being broken rather than stale.
 * Everything else — packs, art — keeps its name across a rebuild, so it gets
 * the shell's answer, not the asset's.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

export type BundleHit = {
  /** Absolute path of the file to send. */
  file: string;
  type: string;
  cache: string;
  /**
   * A validator, so `no-cache` means what it says.
   *
   * `no-cache` is *revalidate*, not *do not store* — and with nothing to
   * revalidate against, every shell and every pack image would re-transfer in
   * full on every page load. Weak, and built from the size and mtime rather
   * than the bytes: reading a file to decide whether to send it would cost
   * exactly what the 304 is meant to save.
   */
  etag: string;
};

/**
 * A request path in, the file that answers it out — or `null`, meaning *this
 * is not ours*, which the route turns back into the API's own 404.
 *
 * The whole decision is here rather than in the route, for the reason D-271
 * paid for: `index.ts` starts listening at import, so nothing registered in it
 * can be reached by a test. A route that only reads this function's answer is
 * an adapter; a route that decided any of this would be untestable.
 */
export function bundleFile(urlPath: string, distDir: string): BundleHit | null {
  const decoded = decodePath(urlPath);
  if (decoded === null) return null;
  // Lowercased, because the claim above is *by name under any spelling* and a
  // case-sensitive test does not make it: `/API/levels` would otherwise be
  // waved past, land on a case-insensitive filesystem, and be answered with
  // the shell where the API's own 404 belongs.
  const owned = decoded.toLowerCase();
  if (SERVER_OWNED.some((p) => owned === p || owned.startsWith(`${p}/`))) return null;

  // Before anything else, and not merely before reading a file: a path that
  // could not land inside the bundle is not ours at all, so it does not reach
  // the fall-through below either. Answering the shell to `/../.env` would
  // disclose nothing, and would still be this module claiming a request it had
  // just refused — which is how the next such path gets answered by accident.
  const file = insideDist(decoded, distDir);
  if (file === null) return null;
  const found = statFile(file);
  if (found !== null) return hit(file, decoded, found);

  // A client-owned deep link — `/settings`, `/level/abc` — has no file and
  // should get the shell. A *missing asset* must not: answering HTML to a
  // request for a deleted script is what produces "Unexpected token '<'", an
  // error about syntax that is really an error about routing. The last
  // segment having an extension is what tells them apart.
  if (path.posix.extname(decoded) !== '') return null;
  const index = path.join(distDir, 'index.html');
  const shell = statFile(index);
  return shell === null ? null : hit(index, '/index.html', shell);
}

function hit(file: string, urlPath: string, found: Stats): BundleHit {
  const ext = path.extname(file).toLowerCase();
  return {
    file,
    type: TYPES[ext] ?? 'application/octet-stream',
    cache: urlPath.startsWith('/assets/') ? IMMUTABLE : REVALIDATE,
    etag: `W/"${found.size.toString(16)}-${Math.floor(found.mtimeMs).toString(16)}"`,
  };
}

/**
 * Percent-decoding, refused rather than guessed at when it is malformed.
 *
 * Decoding happens *before* every check below, because a check that ran first
 * would be reading a different string than the filesystem eventually does —
 * `/%61pi/levels` is `/api/levels` and `/%2e%2e/.env` is `/../.env`. Decoding
 * last is how a path traversal gets past a prefix test.
 */
function decodePath(urlPath: string): string | null {
  if (!urlPath.startsWith('/')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // A NUL truncates the name a C library eventually opens; a backslash is a
  // separator on the platform this runs on, so `..\..` is a traversal that a
  // posix-only check would wave through.
  //
  // **Neither line can be killed by a test, and both are kept anyway** —
  // measured, not assumed: delete either and every test in `bundle.test.ts`
  // still passes, because the containment check below refuses the same
  // backslash paths and `statSync` throws on a name carrying a NUL. That makes
  // them the outer of two locks, and the reason to keep them is what the inner
  // one rests on: `path.resolve`'s Windows drive-letter rules and an exception
  // from `node:fs`, neither of which this module owns or would be told about
  // if it changed. Refusing on the name, before anything is resolved or
  // opened, is the part that does not depend on anyone else's semantics.
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  return decoded;
}

/**
 * The decoded path joined onto the bundle, or `null` if it does not land
 * inside it.
 *
 * Two locks on one door. The segment check refuses every name beginning with
 * a dot — `..` first, whose only possible meaning here is *leave*, and with it
 * a `.env` that found its way into a build output, which is never a thing a
 * page asks for and exactly the thing worth never serving. The containment
 * check then proves the resolved path is under `distDir` anyway, which also
 * disposes of a `C:/Windows/...` that `path.resolve` would otherwise honour as
 * absolute. Either alone would probably do; the pair is what makes the answer
 * not depend on which platform's separator rules are in play.
 */
function insideDist(decoded: string, distDir: string): string | null {
  const segments = decoded.split('/').filter((s) => s !== '');
  if (segments.some((s) => s.startsWith('.'))) return null;
  if (segments.length === 0) segments.push('index.html');
  const root = path.resolve(distDir);
  const file = path.resolve(root, ...segments);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/** That path's stat if it is a file right now, else null. A directory is not one. */
function statFile(file: string): Stats | null {
  try {
    const found = statSync(file);
    return found.isFile() ? found : null;
  } catch {
    return null;
  }
}
