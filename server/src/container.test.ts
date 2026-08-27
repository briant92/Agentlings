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

/**
 * What the image sets `name` to, or undefined.
 *
 * **Both** of Docker's forms, and that is the whole point of the function:
 * written to see only `ENV NAME=value` it answered undefined for the legacy
 * `ENV NAME value`, so every *negative* assertion built on it would have
 * passed against a Dockerfile that set the variable in the other spelling. A
 * check that cannot see the thing it forbids is this repository's oldest scar
 * (PROJECT.md, hard-won rules) and it was in here on the first draft.
 */
const envLine = (name: string): string | undefined =>
  dockerfile.match(new RegExp(`^ENV ${name}(?:=|\\s+)(.+)$`, 'm'))?.[1]?.trim();

/**
 * The reader's own reader, because every negative assertion below is only as
 * honest as this one function and it has been wrong twice: once seeing only
 * `NAME=value`, and once with `\s` written into a template literal — where
 * the backslash is dropped and the class quietly becomes "an equals sign or
 * the letter s". Both spellings answered confidently.
 */
describe('envLine', () => {
  const from = (text: string, name: string) =>
    text.match(new RegExp(`^ENV ${name}(?:=|\\s+)(.+)$`, 'm'))?.[1]?.trim();

  it("reads both of Docker's ENV forms", () => {
    expect(from('ENV NODE_ENV=production', 'NODE_ENV')).toBe('production');
    expect(from('ENV NODE_ENV production', 'NODE_ENV')).toBe('production');
  });

  it('stops at the name boundary', () => {
    // origin.test.ts's label-boundary case, one file along: a name that merely
    // starts with the one asked for is a different variable.
    expect(from('ENV NODE_ENVIRONMENT=other', 'NODE_ENV')).toBeUndefined();
  });

  it('answers undefined for a variable the image never sets', () => {
    expect(from('ENV OTHER=1', 'NODE_ENV')).toBeUndefined();
  });
});

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

/**
 * The template, run rather than read.
 *
 * `.railway/railway.ts` is a program, so the honest way to ask what it
 * declares is to execute it and look at the graph — the same graph
 * `railway config apply` sends. Reading it as text would be back to matching
 * strings that already exist; and the file it replaced, `railway.json`, was
 * worse than that — Railway has deprecated Config as Code and new services
 * cannot opt into it, so those assertions pinned a file the platform would
 * never have read.
 */
describe('the Railway template', async () => {
  const authoring = await import('../../.railway/railway.ts');
  const { createRailwayContext, project } = await import('railway/iac');
  const graph = await authoring.default(createRailwayContext(), project);

  /**
   * What `project()` returns at run time, which is not what it is typed as.
   *
   * The declared type describes the *input* a program hands back; the value is
   * the compiled graph the CLI sends — every resource stamped with an address,
   * `volumeMounts` normalised into `volumeAttachments`, every variable wrapped
   * in a `{ type, value }` envelope. Asserting against the input type would be
   * asserting against the shape Railway never sees, so the compiled shape is
   * named here instead, and the assertions below are what keep it honest.
   */
  type Compiled = {
    type: string;
    build: { builder: string; dockerfilePath: string };
    deploy: { healthcheckPath: string };
    variables: Record<string, { value: { value?: string; isOptional?: boolean } }>;
    volumeAttachments?: Record<string, { mountPath: string }>;
  };
  const resources = graph.resources as unknown as Compiled[];
  const svc = resources.find((r) => r.type === 'service') as Compiled;
  const declared = Object.fromEntries(
    Object.entries(svc.variables).map(([name, v]) => [name, v.value.value]),
  );
  const attachment = Object.values(svc.volumeAttachments ?? {})[0];

  it('is one service and one volume — there is no other state', () => {
    expect(resources.map((r) => r.type).sort()).toEqual(['service', 'volume']);
  });

  it('builds from the Dockerfile that exists', () => {
    expect(svc.build.builder).toBe('DOCKERFILE');
    expect(existsSync(path.join(REPO_ROOT, svc.build.dockerfilePath))).toBe(true);
  });

  it('mounts the volume exactly where the home variable points', () => {
    // The one that matters. A mount path and a home that disagree is an
    // install writing the operator's keys and ledger into the container layer
    // instead — working perfectly right up until the first redeploy.
    expect(attachment.mountPath).toBe(envLine(HOME_VAR));
    expect(declared[HOME_VAR]).toBe(attachment.mountPath);
  });

  it('requires the password, and requires nothing else', () => {
    const required = Object.entries(svc.variables)
      .filter(([, v]) => v.value.isOptional === false)
      .map(([name]) => name);
    expect(required).toEqual([PASSWORD_VAR]);
  });

  it('binds a public interface, which only the password makes safe', () => {
    // The template's own declared environment, put through the policy the
    // server actually runs: as written it listens with the gate on, and with
    // the password taken away it refuses. Both branches, on the real values.
    expect(declared[BIND_VAR]).toBeDefined();
    expect(listenPolicy({ ...declared, [PASSWORD_VAR]: 'a password of my own' })).toMatchObject({
      listen: true,
      gate: true,
    });
    expect(listenPolicy(declared).listen).toBe(false);
  });

  it('leaves the port to Railway', () => {
    expect(Object.keys(svc.variables)).not.toContain('PORT');
    expect(Object.keys(svc.variables)).not.toContain('AGENTLINGS_PORT');
  });

  it('health-checks a path the bundle answers before the gate', () => {
    // `/` is served in front of the sign-in (D-272), so a gated install still
    // reads as healthy. Any path under `/api` would read a live install as
    // down the moment its operator set a password.
    expect(svc.deploy.healthcheckPath).toBe('/');
  });
});
