import { describe, expect, it } from 'vitest';
import type { ConnectionInfo } from '@agentlings/shared';
import { doorChoices, holdsLine } from './doors';

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
