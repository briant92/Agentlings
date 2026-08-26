import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import {
  addWirePayee,
  browserActHosts,
  clearIdentity,
  removeWirePayee,
  setWire,
  wireSettings,
  connectionEnabled,
  enabledNames,
  grantedTools,
  readSettings,
  setBrowserAct,
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

/**
 * The supervised browser's two settings (D-255): the hosts a run may reach
 * and the profile folder the person signed into. Hosts are typed as a list —
 * commas, spaces or newlines — and kept as bare lowercase hosts, so a pasted
 * `https://Portal.Example.com/login` and a typed `portal.example.com` are the
 * same entry, and the run's matcher never sees a scheme or a path.
 */
describe('browserActHosts', () => {
  it('reads bare hosts off any separator, lowercased, deduplicated, in order', () => {
    expect(browserActHosts('Example.com, www.iana.org\nexample.com  selenium.dev')).toEqual([
      'example.com',
      'www.iana.org',
      'selenium.dev',
    ]);
  });

  it('strips a scheme, a path, a port and a leading dot — a pasted address is a host', () => {
    expect(browserActHosts('https://Portal.Example.com/login?x=1 http://localhost:5173/ .bank.cl')).toEqual([
      'portal.example.com',
      'localhost',
      'bank.cl',
    ]);
  });

  it('drops what is not a host at all — a single label like localhost is one', () => {
    expect(browserActHosts('host!! ,, ; ; * http:// -bad- bad-.com')).toEqual([]);
    expect(browserActHosts('')).toEqual([]);
    expect(browserActHosts('localhost')).toEqual(['localhost']);
  });
});

describe('setBrowserAct', () => {
  it('records the allowlist and the profile folder, leaving other settings alone', () => {
    const before = setConnection({}, 'web', false);
    const after = setBrowserAct(before, { allow: ['example.com'], profileDir: 'C:\\profiles\\act' });
    expect(after.browserAct).toEqual({ allow: ['example.com'], profileDir: 'C:\\profiles\\act' });
    expect(after.connections).toEqual({ web: false });
  });

  it('an empty profile folder means the default — nothing is stored for it', () => {
    const after = setBrowserAct({}, { allow: [], profileDir: '' });
    expect(after.browserAct).toEqual({ allow: [] });
  });
});

/**
 * A supervised door (D-255) is held only by a job whose list names it. The
 * omitted list — a person at the work bar choosing nothing in particular, or
 * a legacy schedule row from before doors were per-rule — never carries it:
 * the switch makes it holdable, not held, so no ordinary job opens a window
 * and no firing gets a door it may never hold.
 */
describe('grantedTools — a supervised door must be named', () => {
  const ACT: Connection = {
    name: 'browser-act',
    label: 'Act in a browser you can watch',
    transport: 'stdio',
    command: 'npx',
    supervised: true,
  };
  const on = { connections: { 'browser-act': true, tracker: true } };
  const env = { TRACKER_TOKEN: 'abc' };

  it('is left out of the omitted-list answer even when switched on', () => {
    expect(grantedTools(undefined, [WEB, TRACKER, ACT], on, env)).toEqual(['web', 'tracker']);
  });

  it('is granted to a list that names it, and only when switched on', () => {
    expect(grantedTools(['web', 'browser-act'], [WEB, TRACKER, ACT], on, env)).toEqual(['web', 'browser-act']);
    expect(grantedTools(['browser-act'], [WEB, TRACKER, ACT], {}, env)).toEqual([]);
  });

  it('an empty list is still none', () => {
    expect(grantedTools([], [WEB, TRACKER, ACT], on, env)).toEqual([]);
  });
});

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

describe('the wire’s settings (D-268)', () => {
  const PAYEE = { rut: '76123456-0', name: 'Imprenta Norte SpA', bank: '016', account: '123' };

  it('reads as no account and nobody approved when nothing was ever set', () => {
    // The default that refuses every batch, which is the right default for
    // money leaving: a fresh install pays nobody until a person says so.
    expect(wireSettings({})).toEqual({ chargeAccount: '', format: 'bci', payees: [] });
  });

  it('records the charge account and the layout, leaving other settings alone', () => {
    const before = setIdentity({}, 'telegram', '@bot');
    const after = setWire(before, { chargeAccount: ' 000012345678 ', format: 'bci' });
    expect(wireSettings(after).chargeAccount).toBe('000012345678');
    expect(after.identities).toEqual(before.identities);
  });

  it('keeps the payees when the account is changed, and the account when a payee is added', () => {
    const withAccount = setWire({}, { chargeAccount: '111', format: 'bci' });
    const withPayee = addWirePayee(withAccount, PAYEE);
    expect(wireSettings(withPayee)).toEqual({
      chargeAccount: '111',
      format: 'bci',
      payees: [PAYEE],
    });
    const moved = setWire(withPayee, { chargeAccount: '222', format: 'bci' });
    expect(wireSettings(moved).payees).toEqual([PAYEE]);
  });

  it('replaces the payee with that RUT rather than keeping two of them', () => {
    // Two rows for one RUT would make "which account does this payee use" a
    // question with two answers, and the composer takes the first.
    const moved = { ...PAYEE, account: '999', name: 'Imprenta Norte SpA' };
    const list = wireSettings(addWirePayee(addWirePayee({}, PAYEE), moved)).payees;
    expect(list).toHaveLength(1);
    expect(list[0]!.account).toBe('999');
  });

  it('takes one off by RUT and leaves the others', () => {
    const other = { rut: '9876543-3', name: 'Ana Rivas', bank: '037', account: '77712345' };
    const both = addWirePayee(addWirePayee({}, PAYEE), other);
    expect(wireSettings(removeWirePayee(both, PAYEE.rut)).payees).toEqual([other]);
    // Removing one nobody has is not an error — narrowing is always safe.
    expect(wireSettings(removeWirePayee(both, '1-9')).payees).toHaveLength(2);
  });
});
