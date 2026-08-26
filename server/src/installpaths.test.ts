import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_VAR, installPaths, REPO_ROOT } from './installpaths';

/**
 * The defaults are the whole safety story of this module: an install that
 * never heard of `AGENTLINGS_HOME` must keep every path it had before the
 * variable existed. So they are pinned literally here — not composed from the
 * same expressions the module uses, which would agree with any typo.
 */
describe('with AGENTLINGS_HOME unset', () => {
  const paths = installPaths({});

  it('roots the install at the repository, which is where the code is', () => {
    expect(existsSync(path.join(REPO_ROOT, 'package.json'))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).name).toBe(
      'agentlings',
    );
    // No trailing separator, so this can be compared with a resolved path and
    // not only joined onto.
    expect(REPO_ROOT).toBe(path.resolve(REPO_ROOT));
  });

  it('keeps every path exactly where it was', () => {
    expect(paths).toEqual({
      dataDir: path.join(REPO_ROOT, '.agentlings'),
      secretsFile: path.join(REPO_ROOT, '.env'),
      artworkDir: path.join(REPO_ROOT, 'Artwork'),
      rolesDir: path.join(REPO_ROOT, 'roles'),
      skillsDir: path.join(REPO_ROOT, 'skills'),
      sourcesFile: path.join(REPO_ROOT, 'catalog', 'sources.json'),
      connectionsFile: path.join(REPO_ROOT, 'catalog', 'connections.json'),
    });
  });

  it('treats a blank or whitespace value as unset, so a stray "AGENTLINGS_HOME=" is not a move', () => {
    // The same failure direction as PASSWORD_VAR: an empty value resolves to
    // the working directory, which would scatter the store wherever the
    // server happened to be started from.
    expect(installPaths({ [HOME_VAR]: '' })).toEqual(paths);
    expect(installPaths({ [HOME_VAR]: '   ' })).toEqual(paths);
  });
});

describe('with AGENTLINGS_HOME set', () => {
  const home = path.resolve('/srv/agentlings-data');
  const paths = installPaths({ [HOME_VAR]: home });

  it('puts the data directory, the secrets file and the uploads under it', () => {
    expect(paths.dataDir).toBe(path.join(home, '.agentlings'));
    expect(paths.secretsFile).toBe(path.join(home, '.env'));
    expect(paths.artworkDir).toBe(path.join(home, 'Artwork'));
  });

  it('leaves what ships with the code where the code is', () => {
    // Roles, skills and the catalog are read-only product, rebuilt whenever
    // the code is. Moving them onto the operator's volume would freeze a
    // shipped catalog at whatever version first wrote it.
    expect(paths.rolesDir).toBe(path.join(REPO_ROOT, 'roles'));
    expect(paths.skillsDir).toBe(path.join(REPO_ROOT, 'skills'));
    expect(paths.sourcesFile).toBe(path.join(REPO_ROOT, 'catalog', 'sources.json'));
    expect(paths.connectionsFile).toBe(path.join(REPO_ROOT, 'catalog', 'connections.json'));
  });

  it('resolves a relative value rather than carrying it', () => {
    // A relative home would mean a different store per working directory —
    // the server, a script and a test would each answer differently.
    expect(installPaths({ [HOME_VAR]: 'data' }).dataDir).toBe(
      path.join(path.resolve('data'), '.agentlings'),
    );
  });

  it('trims, because a value pasted into a host’s variable form carries spaces', () => {
    expect(installPaths({ [HOME_VAR]: `  ${home}  ` })).toEqual(paths);
  });

  it('takes the repository root as an argument, so nothing has to be mocked', () => {
    expect(installPaths({}, '/opt/app').dataDir).toBe(path.join('/opt/app', '.agentlings'));
    expect(installPaths({}, '/opt/app').rolesDir).toBe(path.join('/opt/app', 'roles'));
  });
});
