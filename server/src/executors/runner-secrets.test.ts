import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS, because the runner is spawned with plain `node`.
import { readSecrets, resolveSecrets } from './runner-secrets.mjs';

/**
 * D-242's runner half. It exists as its own module because a mutation pass
 * asked for it: stubbing the runner's stdin read survived every test, since
 * `agent-runner.mjs` runs a whole session at import and nothing could reach
 * inside it.
 */

const stdin = (text: string): Readable => Readable.from([Buffer.from(text, 'utf8')]);

describe('readSecrets', () => {
  it('reads the object the server sent', async () => {
    expect(await readSecrets(stdin('{"TRACKER_TOKEN":"abc"}\n'))).toEqual({ TRACKER_TOKEN: 'abc' });
  });

  it('answers {} for an empty stream — an ignored stdin is EOF, not a hang', async () => {
    expect(await readSecrets(stdin(''))).toEqual({});
    expect(await readSecrets(stdin('   \n'))).toEqual({});
  });

  it('answers {} for junk rather than throwing the session away', async () => {
    expect(await readSecrets(stdin('not json'))).toEqual({});
    expect(await readSecrets(stdin('[1,2]'))).toEqual({});
    expect(await readSecrets(stdin('null'))).toEqual({});
  });
});

describe('resolveSecrets', () => {
  const servers = {
    tracker: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'some-mcp-server'],
      env: { TRACKER_TOKEN: '${TRACKER_TOKEN}' },
    },
  };

  it('fills the placeholder from the secrets read off stdin', () => {
    expect(resolveSecrets(servers, { TRACKER_TOKEN: 'abc' }).tracker.env).toEqual({
      TRACKER_TOKEN: 'abc',
    });
  });

  it('keeps the rest of the server config exactly as it was', () => {
    const out = resolveSecrets(servers, { TRACKER_TOKEN: 'abc' }).tracker;
    expect(out.command).toBe('npx');
    expect(out.args).toEqual(['-y', 'some-mcp-server']);
  });

  /**
   * The point of the whole split. If this passed the literal `${TOKEN}`
   * through, every job that lost its stdin would hand an MCP server a
   * credential that looks real in a log and authenticates with nothing.
   */
  it('DROPS a placeholder it cannot resolve rather than passing the literal through', () => {
    const env = resolveSecrets(servers, {}).tracker.env;
    expect(env).toEqual({});
    expect(JSON.stringify(env)).not.toContain('${');
  });

  it('leaves a value that is not a placeholder alone', () => {
    const plain = { s: { env: { MODE: 'headless' } } };
    expect(resolveSecrets(plain, {}).s.env).toEqual({ MODE: 'headless' });
  });

  /**
   * The http transport (Wave 2). An `Authorization` header is a bearer token,
   * so it takes exactly the path a stdio server's `env` takes — placeholder in
   * `.session.json`, value over stdin. Same problem, two names.
   */
  const remote = {
    desk: {
      type: 'http',
      url: 'https://mcp.example.com/v1',
      // `Bearer ${NAME}`, not a bare `${NAME}`: the bare shape is what the
      // first version of this fixture used, it passed, and a live run then
      // showed the far end receiving the literal text. A fixture no real API
      // would produce tests nothing (D-237).
      headers: { Authorization: 'Bearer ${DESK_TOKEN}', 'X-Api-Version': '2026-01-01' },
    },
  };

  it('fills an http header from the same secrets', () => {
    expect(resolveSecrets(remote, { DESK_TOKEN: 'bearer-abc' }).desk.headers).toEqual({
      Authorization: 'Bearer bearer-abc',
      'X-Api-Version': '2026-01-01',
    });
  });

  it('keeps the url and type', () => {
    const out = resolveSecrets(remote, { DESK_TOKEN: 'bearer-abc' }).desk;
    expect(out.type).toBe('http');
    expect(out.url).toBe('https://mcp.example.com/v1');
  });

  it('DROPS an unresolvable header rather than sending `Authorization: ${DESK_TOKEN}`', () => {
    const headers = resolveSecrets(remote, {}).desk.headers;
    expect(headers).toEqual({ 'X-Api-Version': '2026-01-01' });
    expect(JSON.stringify(headers)).not.toContain('${');
  });

  it('does not grow an `env` on an http server, or `headers` on a stdio one', () => {
    // Two shapes through one function is how a spec ends up carrying both and
    // the SDK rejecting it.
    expect(resolveSecrets(remote, {}).desk).not.toHaveProperty('env');
    expect(resolveSecrets(servers, {}).tracker).not.toHaveProperty('headers');
  });

  it('handles a server with no env, and no servers at all', () => {
    expect(resolveSecrets({ s: { command: 'npx' } }, {}).s.env).toEqual({});
    expect(resolveSecrets({}, {})).toEqual({});
    expect(resolveSecrets(undefined, {})).toEqual({});
  });
});
