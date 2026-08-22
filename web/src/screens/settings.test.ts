import { describe, expect, it } from 'vitest';
import type { ConnectionInfo, DoorUsage } from '@agentlings/shared';
import {
  authWording,
  byKind,
  needsLine,
  tabOf,
  trailBegan,
  trailNote,
  usageDetail,
  usageFact,
} from './settings';

/** Local time, like the clock the rows read. */
const at = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month - 1, day, hour, minute).getTime();
const NOW = at(8, 22, 12, 0);

function door(over: Partial<DoorUsage> = {}): DoorUsage {
  return {
    door: 'mail',
    calls: 38,
    errors: 9,
    firstAt: at(8, 18, 9, 0),
    lastAt: at(8, 22, 8, 13),
    tools: { mail_search: 27, mail_read: 11 },
    ...over,
  };
}

function connection(over: Partial<ConnectionInfo> = {}): ConnectionInfo {
  return {
    name: 'web',
    label: 'Read web pages',
    description: '',
    builtin: true,
    ready: true,
    missingSecrets: [],
    defaultOn: true,
    enabled: true,
    kind: 'read',
    ...over,
  };
}

describe('tabOf', () => {
  it('opens on reads unless the browser remembers another board', () => {
    expect(tabOf(null)).toBe('reads');
    expect(tabOf('sends')).toBe('sends');
    expect(tabOf('app')).toBe('app');
    expect(tabOf('garage')).toBe('reads');
  });
});

describe('byKind', () => {
  it("splits the catalog by each connection's own kind, order kept", () => {
    const list = [
      connection({ name: 'web' }),
      connection({ name: 'telegram', kind: 'send' }),
      connection({ name: 'mail' }),
      connection({ name: 'slack', kind: 'send' }),
    ];
    const { reads, sends } = byKind(list);
    expect(reads.map((c) => c.name)).toEqual(['web', 'mail']);
    expect(sends.map((c) => c.name)).toEqual(['telegram', 'slack']);
  });
});

describe('trailBegan', () => {
  it('is the earliest call on any door, and null before the first', () => {
    expect(trailBegan([door({ firstAt: 500 }), door({ door: 'web', firstAt: 200 })])).toBe(200);
    expect(trailBegan([])).toBeNull();
  });
});

describe('usageFact', () => {
  const began = at(8, 18, 9, 0);

  it('counts the calls and names the last one, today by the word', () => {
    expect(usageFact(door(), began, NOW, true)).toEqual({ used: 38, last: 'today 08:13' });
    expect(usageFact(door({ lastAt: at(8, 18, 17, 3) }), began, NOW, true)).toEqual({
      used: 38,
      last: 'Aug 18 17:03',
    });
  });

  it('says a door nobody knocked on has not been used since the trail began', () => {
    expect(usageFact(undefined, began, NOW, true)).toEqual({ unusedSince: 'Aug 18' });
  });

  it('says nothing before any door was ever called', () => {
    expect(usageFact(undefined, null, NOW, true)).toBeNull();
  });
});

describe('usageFact for a door the trail never sees', () => {
  const began = at(8, 18, 9, 0);
  it('makes no claim about a stdio connection the trail cannot record', () => {
    expect(usageFact(undefined, began, NOW, false)).toBeNull();
    expect(usageDetail(undefined, began, NOW, false)).toBe(
      'not on the door trail — it runs as its own process, so no call is counted here',
    );
  });
  it('still reports a row the trail does hold, whatever the transport says', () => {
    expect(usageFact(door(), began, NOW, false)).toEqual({ used: 38, last: 'today 08:13' });
  });
});

describe('usageDetail', () => {
  const began = at(8, 18, 9, 0);

  it('reads since when, calls per tool most first, refusals and the last call', () => {
    expect(usageDetail(door(), began, NOW, true)).toBe(
      'since the trail began on Aug 18 · mail_search 27 · mail_read 11 · 9 refused · last call today 08:13',
    );
  });

  it('says none refused rather than 0', () => {
    expect(usageDetail(door({ errors: 0 }), began, NOW, true)).toContain('· none refused ·');
  });

  it('says no call for a door the trail never saw', () => {
    expect(usageDetail(undefined, began, NOW, true)).toBe('no call since the trail began on Aug 18');
    expect(usageDetail(undefined, null, NOW, true)).toBeNull();
  });
});

describe('trailNote', () => {
  it('names when the trail began, says there is none yet, and waits while loading', () => {
    expect(trailNote([door()])).toBe('Counts come from the door trail, which began on Aug 18.');
    expect(trailNote([])).toBe(
      'No door has been called yet — counts appear here from the first call.',
    );
    expect(trailNote(null)).toBe('');
  });
});

describe('needsLine', () => {
  it('names a single secret and counts several', () => {
    expect(needsLine({ missingSecrets: ['SLACK_BOT_TOKEN'] })).toEqual({
      text: 'needs SLACK_BOT_TOKEN',
      link: 'add it here',
    });
    expect(needsLine({ missingSecrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })).toEqual({
      text: 'needs 2 secrets',
      link: 'add them here',
    });
  });
});

describe('authWording', () => {
  it('says where the credentials come from', () => {
    expect(authWording('api-key')).toBe('signed in with an API key from .env');
    expect(authWording('none')).toBe('no credentials found');
  });
});
