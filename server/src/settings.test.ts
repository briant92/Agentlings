import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import {
  clearIdentity,
  connectionEnabled,
  enabledNames,
  grantedTools,
  readSettings,
  setConnection,
  setIdentity,
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

  it('hands a job everything that is on, without being asked', () => {
    expect(grantedTools(undefined, all, {}, env)).toEqual(['web']);
  });

  // Naming one narrows; it can never widen. A job that reached a connection
  // Settings reports as off would make the switch a lie.
  it('cannot grant itself something that is off', () => {
    expect(grantedTools(['tracker'], all, {}, env)).toEqual([]);
    expect(grantedTools(['web', 'tracker'], all, {}, env)).toEqual(['web']);
  });

  it('cannot ask its way past a switch the user turned off', () => {
    expect(grantedTools(['web'], all, { connections: { web: false } }, env)).toEqual([]);
  });

  it('narrows to what it named, so unused tools are not carried', () => {
    const both = { connections: { tracker: true } };
    expect(grantedTools(undefined, all, both, env)).toEqual(['web', 'tracker']);
    expect(grantedTools(['tracker'], all, both, env)).toEqual(['tracker']);
  });

  // A list means exactly the doors in it, so an empty one means none. This
  // once read `[]` as omitted — the same as asking for everything — so a
  // caller had no way to say "no doors": the reading D-254 found inverted,
  // and the one #9 builds on (a rule that names no door holds none).
  it('an empty list means none — nothing, not everything', () => {
    const both = { connections: { tracker: true } };
    expect(grantedTools([], all, both, env)).toEqual([]);
    expect(grantedTools([], all, {}, env)).toEqual([]);
  });

  /**
   * A sending channel is not a tool (D-097). Sends happen at approval,
   * replayed by the server (D-075), so a session gets no door here at all —
   * and the catalog said so in prose ("grants the crew no tools") while the
   * code handed it over anyway. The cost was not the tokens: it landed in the
   * recipe's capability surface, where D-044 reads any deliberately-enabled
   * connection as a method that reached outside and refuses the compile. The
   * most repetitive job shape in the product was locked out of the free tool
   * tier by the channel it was about.
   */
  describe('sending channels', () => {
    const TELEGRAM = {
      name: 'telegram',
      label: 'Send Telegram messages',
      transport: 'builtin' as const,
      sendsOnly: true,
      defaultOn: true,
    };
    const withChannel = [WEB, TELEGRAM];

    it('never hands a job the channel, however on it is', () => {
      expect(grantedTools(undefined, withChannel, {}, env)).toEqual(['web']);
      expect(grantedTools(undefined, withChannel, { connections: { telegram: true } }, env)).toEqual(
        ['web'],
      );
    });

    it('will not hand it over even when the job asks by name', () => {
      expect(grantedTools(['telegram'], withChannel, {}, env)).toEqual([]);
      expect(grantedTools(['web', 'telegram'], withChannel, {}, env)).toEqual(['web']);
    });

    // The switch still means something — it is what the *server* consults
    // before replaying an approved outbox. This only says a run cannot reach it.
    it('leaves the connection itself enabled, since sending still uses it', () => {
      expect(enabledNames(withChannel, {}, env)).toContain('telegram');
    });
  });

  it('drops a name nobody has heard of', () => {
    expect(grantedTools(['nope'], all, {}, env)).toEqual([]);
    expect(grantedTools(['web', 'nope'], all, {}, env)).toEqual(['web']);
  });
});

describe('setIdentity', () => {
  it('records who a connection turned out to be, without touching the switches', () => {
    const settings = setIdentity(
      setConnection({}, 'google', true),
      'google',
      'brian@gmail.com',
    );
    expect(settings.identities?.google).toBe('brian@gmail.com');
    expect(settings.connections?.google).toBe(true);
  });

  it('a reconnect as someone else replaces the old identity', () => {
    const twice = setIdentity(setIdentity({}, 'google', 'old@gmail.com'), 'google', 'new@gmail.com');
    expect(twice.identities?.google).toBe('new@gmail.com');
  });
});

describe('the store on disk', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-settings-'));
  });
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

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

describe('clearIdentity (D-218)', () => {
  it('forgets one connection\'s identity and nothing else', () => {
    const settings = setIdentity(setIdentity({}, 'google', 'b@x.com'), 'telegram', '@bot');
    expect(clearIdentity(settings, 'google')).toEqual({ identities: { telegram: '@bot' } });
  });

  it('returns the settings untouched when there was no identity to forget', () => {
    const settings = setIdentity({}, 'telegram', '@bot');
    expect(clearIdentity(settings, 'google')).toBe(settings);
  });
});
