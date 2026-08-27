import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where this install keeps things.
 *
 * One operator's copy of Agentlings is one secrets file and one data
 * directory (CONTEXT.md, *Install*). Until this module those were derived in
 * eight separate constants at the top of `index.ts`, each joining a name onto
 * the repository root — which is fine on a laptop, where the code and the
 * operator's data are the same folder, and wrong everywhere else.
 *
 * The split this makes explicit is the one a container needs: some of those
 * paths are **product**, rebuilt from the image every time the code is
 * deployed, and some are the **operator's**, which must outlive that.
 * `AGENTLINGS_HOME` moves the second set and never the first. The trap it
 * closes is quiet: on a host whose filesystem is rebuilt each time, a key
 * pasted into Settings would go with it — silently, after working for days.
 *
 * Unset, every path is exactly what it was before the variable existed, and
 * `installpaths.test.ts` pins each one literally.
 */

/**
 * The variable that names the operator's directory.
 *
 * **It is read from the real environment, never from the secrets file.** The
 * secrets file is the thing it locates, so an `AGENTLINGS_HOME=` line inside
 * one could only be read after the question it answers had already been
 * settled. On a host it is a platform variable; on a laptop it is unset.
 */
export const HOME_VAR = 'AGENTLINGS_HOME';

/**
 * Where the code and everything shipped beside it lives.
 *
 * Resolved rather than taken raw: `fileURLToPath` of a directory URL ends in a
 * separator, and this is the fallback for a home the other branch produces
 * with `path.resolve`. Every path below is `path.join`ed and so cannot tell
 * the difference, but anything ever comparing two of these could.
 */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export type InstallPaths = {
  /**
   * Everything the running install writes: the ledger, the levels, settings,
   * the audience, the voice notes, the library. It is also the sandbox root —
   * job working copies live under it — which is the name it travels under
   * once it is passed on.
   */
  dataDir: string;
  /** The one secrets store (D-078). Settings writes here; boot loads it. */
  secretsFile: string;
  /** Source images dropped in by hand, and references uploaded through the app. Untracked. */
  artworkDir: string;
  /** Product, not the operator's: shipped with the code and replaced with it. */
  rolesDir: string;
  skillsDir: string;
  sourcesFile: string;
  connectionsFile: string;
  /**
   * The built web bundle (#29), which `npm run build` writes and the server
   * serves from its own port. Product too, and emphatically so: it is the
   * output of the code, rebuilt from the image every deploy, and an install
   * whose `AGENTLINGS_HOME` moved it would be serving whatever bundle first
   * landed on the volume for as long as the volume lasted.
   *
   * It is derived here and not in `bundle.ts` for the D-270 rule: one module
   * says where an install keeps things, and a second answer is how the two
   * come to disagree.
   */
  webDistDir: string;
};

/**
 * The environment in, the paths out — nothing read, nothing created.
 *
 * A blank or whitespace-only value counts as unset. That is the same failure
 * direction `sessionPassword` chose and for the same reason: an empty value
 * would resolve to the process's working directory, so a stray
 * `AGENTLINGS_HOME=` would scatter the store wherever the server happened to
 * be started from rather than leaving it alone.
 */
export function installPaths(
  env: Record<string, string | undefined> = process.env,
  repoRoot: string = REPO_ROOT,
): InstallPaths {
  const raw = env[HOME_VAR];
  const named = typeof raw === 'string' ? raw.trim() : '';
  const home = named === '' ? repoRoot : path.resolve(named);
  return {
    dataDir: path.join(home, '.agentlings'),
    secretsFile: path.join(home, '.env'),
    artworkDir: path.join(home, 'Artwork'),
    rolesDir: path.join(repoRoot, 'roles'),
    skillsDir: path.join(repoRoot, 'skills'),
    sourcesFile: path.join(repoRoot, 'catalog', 'sources.json'),
    connectionsFile: path.join(repoRoot, 'catalog', 'connections.json'),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
  };
}
