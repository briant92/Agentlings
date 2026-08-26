import { describe, expect, it } from 'vitest';
import type { ConnectionInfo } from '@agentlings/shared';
import { doorChoices, holdsLine, watchChoices, watchedTools } from './doors';

function connection(over: Partial<ConnectionInfo> = {}): ConnectionInfo {
  return {
    name: 'web',
    label: 'Read web pages',
    description: 'GET public pages',
    builtin: true,
    ready: true,
    missingSecrets: [],
    defaultOn: true,
    enabled: true,
    kind: 'read',
    credentialed: false,
    sharesSecretsWith: [],
    ...over,
  };
}

describe('doorChoices — which connections a rule may name (D-254)', () => {
  it('offers every enabled, ready, non-sending connection, in catalog order', () => {
    const got = doorChoices([
      connection({ name: 'web' }),
      connection({ name: 'mail', label: 'Mail', credentialed: true }),
      connection({ name: 'calendar', label: 'Calendar', credentialed: true }),
    ]);
    expect(got.map((c) => c.name)).toEqual(['web', 'mail', 'calendar']);
  });

  it('never offers a sending channel — it rides on the row as its channel, not as a door', () => {
    const got = doorChoices([
      connection({ name: 'telegram', label: 'Send Telegram messages', kind: 'send' }),
      connection({ name: 'gmail', label: 'Send mail', kind: 'send' }),
      connection({ name: 'web' }),
    ]);
    expect(got.map((c) => c.name)).toEqual(['web']);
  });

  it('never offers a door that is off or not ready — the firing could not hold it', () => {
    const got = doorChoices([
      connection({ name: 'browser', enabled: false }),
      connection({ name: 'github', ready: false, missingSecrets: ['GITHUB_TOKEN'] }),
      connection({ name: 'search' }),
    ]);
    expect(got.map((c) => c.name)).toEqual(['search']);
  });
});

describe('holdsLine — what the firing will hold, in words', () => {
  it('says none when nothing is ticked, which is the default', () => {
    expect(holdsLine([])).toBe('the firing holds no doors');
  });

  it('names exactly the ticked doors, in the order they were ticked', () => {
    expect(holdsLine(['mail', 'calendar'])).toBe('the firing holds mail, calendar');
    expect(holdsLine(['bls'])).toBe('the firing holds bls');
  });
});

describe('doorChoices — a supervised door is never a chip (D-255)', () => {
  it('leaves browser-act off the row even when it is on and ready — a rule cannot hold it', () => {
    const got = doorChoices([
      connection({ name: 'web' }),
      connection({ name: 'browser-act', label: 'Act in a browser you can watch', supervised: true }),
    ]);
    expect(got.map((c) => c.name)).toEqual(['web']);
  });
});

describe('the watch choice — how a hand-queued job names a supervised door (D-255)', () => {
  const act = connection({ name: 'browser-act', label: 'Act in a browser you can watch', supervised: true });

  it('is offered only for a supervised door that is on and ready', () => {
    expect(watchChoices([connection({ name: 'web' }), act]).map((c) => c.name)).toEqual(['browser-act']);
    expect(watchChoices([connection({ name: 'web' }), { ...act, enabled: false }])).toEqual([]);
    expect(watchChoices([connection({ name: 'web' })])).toEqual([]);
  });

  it('posts every door the job would have held anyway, plus the supervised one — naming it must not drop the rest', () => {
    expect(
      watchedTools([
        connection({ name: 'web' }),
        connection({ name: 'mail', credentialed: true }),
        connection({ name: 'telegram', kind: 'send' }),
        connection({ name: 'github', enabled: false }),
        act,
      ]),
    ).toEqual(['web', 'mail', 'browser-act']);
  });
});
