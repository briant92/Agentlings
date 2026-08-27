import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_VAR, installPaths, REPO_ROOT } from './installpaths';
import { BIND_VAR, listenPolicy, PASSWORD_VAR } from './session';

/**
 * The container, pinned to the code it ships.
 *
 * A Dockerfile is a second place that names things the modules already decide
 * — where an install keeps its data, which interface it binds, which browser
 * build it can drive — and nothing makes the two agree. That is the D-270
 * failure shape one level out: rename `AGENTLINGS_HOME` and every test still
 * passes while the deployed install quietly writes the operator's keys into a
 * layer that the next redeploy throws away.
 *
 * So the file is read here and its claims are put to the functions that
 * actually answer them. `dev-logged.test.ts` pins the launcher the same way
 * and for the same reason: neither file can import a TypeScript module, so
 * something has to hold them together on purpose.
 */
const DOCKERFILE = path.join(REPO_ROOT, 'Dockerfile');
const dockerfile = readFileSync(DOCKERFILE, 'utf8');

/** `ENV NAME=value`, which is the only form this Dockerfile uses. */
const envLine = (name: string): string | undefined =>
  dockerfile.match(new RegExp(`^ENV ${name}=(.+)$`, 'm'))?.[1]?.trim();

describe('the Dockerfile and the browsers it ships', () => {
  it('pins the base image to the playwright-core the server drives', () => {
    // The image bakes in browser builds; `playwright-core` knows one revision
    // of each. Drift between them is a launch that fails at run time asking
    // for a download the container will never do — and it fails on the
    // reference install, days later, not here.
    const version = createRequire(import.meta.url)('playwright-core/package.json').version;
    const from = dockerfile.match(/^FROM mcr\.microsoft\.com\/playwright:v([\d.]+)-/m)?.[1];
    expect(from).toBe(version);
  });

  it('carries git, which repo work shells out to and the base image lacks', () => {
    expect(dockerfile).toMatch(/apt-get install[^\n]*\bgit\b/);
  });

  it('builds the bundle the server serves from its own port', () => {
    // D-272: with no `web/dist` the server answers nothing on `/`, which on a
    // host is an install with no title screen and a failing health check.
    expect(dockerfile).toMatch(/^RUN npm run build$/m);
    expect(installPaths().webDistDir).toBe(path.join(REPO_ROOT, 'web', 'dist'));
  });

  it('does not build with devDependencies omitted', () => {
    // tsx runs the server and Vite builds the bundle; both are dev
    // dependencies, so `--omit=dev` or `NODE_ENV=production` at install time
    // produces an image that resolves nothing at boot.
    expect(dockerfile).not.toMatch(/npm ci[^\n]*--omit[= ]dev/);
    expect(envLine('NODE_ENV')).toBeUndefined();
  });
});

describe('the environment the container runs with', () => {
  const home = envLine(HOME_VAR);
  const bind = envLine(BIND_VAR);

  it(`points ${HOME_VAR} at an absolute path, and mounts it`, () => {
    expect(home).toBeDefined();
    expect(path.posix.isAbsolute(home as string)).toBe(true);
    // The volume mounts over this, so the image must not have written the
    // operator's half into it — only made the directory.
    expect(dockerfile).toMatch(new RegExp(`^RUN mkdir -p ${home}$`, 'm'));
  });

  it('puts the secrets file and the data directory under that mount', () => {
    // Containment, asked of the same `path` module that built these, because
    // this test runs on Windows and the container does not: `path.resolve`
    // reads "/data" as a drive-relative path here and an absolute one there,
    // and comparing the strings would be comparing the two platforms.
    const under = (root: string, p: string) => {
      const rel = path.relative(path.resolve(root), p);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
    const paths = installPaths({ [HOME_VAR]: home });
    for (const p of [paths.secretsFile, paths.dataDir, paths.artworkDir]) {
      expect(under(home as string, p)).toBe(true);
    }
    // And the product half is emphatically not on it — a volume holding the
    // bundle would pin the install to whichever one landed there first.
    expect(under(home as string, paths.webDistDir)).toBe(false);
  });

  it('refuses to listen on the bind it sets unless a password is given', () => {
    // The guard with an input that reaches it. The container binds every
    // interface, so this is the branch a deployed install takes every time it
    // starts, and the one thing standing between an operator's ledger and
    // anyone with the URL.
    expect(bind).toBeDefined();
    const refused = listenPolicy({ [BIND_VAR]: bind, [PASSWORD_VAR]: undefined });
    expect(refused.listen).toBe(false);
    expect(refused.listen === false && refused.reason).toContain(PASSWORD_VAR);

    const accepted = listenPolicy({ [BIND_VAR]: bind, [PASSWORD_VAR]: 'a password of my own' });
    expect(accepted).toMatchObject({ listen: true, hostname: bind, gate: true });
  });

  it('leaves the port to the host', () => {
    // Railway injects `PORT`; naming a port here would be a second answer to
    // a question `listenPort()` already answers.
    expect(envLine('PORT')).toBeUndefined();
    expect(envLine('AGENTLINGS_PORT')).toBeUndefined();
  });
});

describe('.dockerignore', () => {
  const ignored = readFileSync(path.join(REPO_ROOT, '.dockerignore'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

  it("keeps this machine's secrets file and data directory out of the image", () => {
    // Not a tidiness rule: a published image built on this machine would
    // otherwise carry the maintainer's `.env` and every job in the ledger.
    // The names are read from `installPaths()` so that renaming either one
    // breaks here rather than on a registry.
    const paths = installPaths();
    expect(ignored).toContain(path.basename(paths.secretsFile));
    expect(ignored).toContain(`${path.basename(paths.dataDir)}/`);
  });
});

describe('railway.json', () => {
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, 'railway.json'), 'utf8'));

  it('builds from the Dockerfile that exists', () => {
    expect(config.build.builder).toBe('DOCKERFILE');
    expect(existsSync(path.join(REPO_ROOT, config.build.dockerfilePath))).toBe(true);
  });

  it('starts the launcher that exists, and the one the Dockerfile starts', () => {
    const [, ...argv] = config.deploy.startCommand.split(' ');
    expect(existsSync(path.join(REPO_ROOT, argv[0]))).toBe(true);
    expect(dockerfile).toContain(`"${argv[0]}"`);
  });

  it('health-checks a path the bundle answers before the gate', () => {
    // `/` is served in front of the sign-in (D-272), so a gated install still
    // reads as healthy. Any path under `/api` would read a live install as
    // down the moment its operator set a password.
    expect(config.deploy.healthcheckPath).toBe('/');
  });
});
