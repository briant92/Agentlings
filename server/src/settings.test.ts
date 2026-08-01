import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import {
  connectionEnabled,
  grantedTools,
  readSettings,
  setConnection,
  writeSettings,
} from './settings';

const WEB: Connection = {
  name: 'web',
  label: 'Read web pages',
  transport: 'builtin',
  defaultOn: true,
  maxChars: 12000,
};

const TRACKER: Connection = {
  name: 'tracker',
  label: 'Issue tracker',
  transport: 'stdio',
  command: 'npx',
  secrets: { TRACKER_TOKEN: 'API token' },
};

describe('connectionEnabled', () => {
  it('is on when the catalog says so and the user has not said otherwise', () => {
    expect(connectionEnabled(WEB, {}, {})).toBe(true);
  });

  it('is off when the catalog does not opt in', () => {
    expect(connectionEnabled(TRACKER, {}, { TRACKER_TOKEN: 'abc' })).toBe(false);
  });

  it('lets the user turn a default off, and back on', () => {
    expect(connectionEnabled(WEB, { connections: { web: false } }, {})).toBe(false);
    expect(connectionEnabled(WEB, { connections: { web: true } }, {})).toBe(true);
  });

  it('lets the user turn on something that ships off', () => {
    const env = { TRACKER_TOKEN: 'abc' };
    expect(connectionEnabled(TRACKER, { connections: { tracker: true } }, env)).toBe(true);
  });

  // A connection that cannot work is not a preference: switching it on in the
  // UI must not make a job believe it can reach something it cannot.
  it('stays off when a secret it needs is missing, whatever the user asked for', () => {
    expect(connectionEnabled(TRACKER, { connections: { tracker: true } }, {})).toBe(false);
  });
});

describe('grantedTools', () => {
  const all = [WEB, TRACKER];
  const env = { TRACKER_TOKEN: 'abc' };

  it('hands a job the defaults without being asked', () => {
    expect(grantedTools(undefined, all, {}, env)).toEqual(['web']);
  });

  it('adds what the caller named on top of the defaults', () => {
    expect(grantedTools(['tracker'], all, {}, env)).toEqual(['web', 'tracker']);
  });

  it('does not let a job ask its way past a switch the user turned off', () => {
    expect(grantedTools(['web'], all, { connections: { web: false } }, env)).toEqual([]);
  });

  it('drops a name nobody has heard of', () => {
    expect(grantedTools(['nope'], all, {}, env)).toEqual(['web']);
  });

  it('does not repeat a default the caller also asked for', () => {
    expect(grantedTools(['web'], all, {}, env)).toEqual(['web']);
  });
});

describe('the store on disk', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-settings-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads as empty before anything is written, so the catalog decides', () => {
    expect(readSettings(root)).toEqual({});
    expect(connectionEnabled(WEB, readSettings(root), {})).toBe(true);
  });

  it('survives a round trip', () => {
    writeSettings(root, setConnection(readSettings(root), 'web', false));
    expect(readSettings(root)).toEqual({ connections: { web: false } });
    expect(connectionEnabled(WEB, readSettings(root), {})).toBe(false);
  });

  it('keeps other answers when one changes', () => {
    let stored = setConnection({}, 'web', false);
    stored = setConnection(stored, 'tracker', true);
    writeSettings(root, stored);
    expect(readSettings(root).connections).toEqual({ web: false, tracker: true });
  });
});
