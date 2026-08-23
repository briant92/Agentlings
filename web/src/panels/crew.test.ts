import { describe, expect, it } from 'vitest';
import type { CrewRole } from '@agentlings/shared';
import { cardFacts, carriedBy, doorState, modelWord, spendLine, tradeCopy } from './crew';

const role = (over: Partial<CrewRole> = {}): CrewRole => ({
  name: 'mason',
  description: 'builds',
  tools: ['read', 'bash', 'grep'],
  skills: ['small-diffs'],
  ceilingUsd: 2,
  measured: { samples: 0, meanUsd: 0, maxUsd: 0 },
  ...over,
});

describe('meet the crew', () => {
  it('shows a trade the copy does not know on its own description', () => {
    expect(tradeCopy({ name: 'plumber', description: 'fixes the pipes' }).blurb).toBe('fixes the pipes');
    expect(tradeCopy({ name: 'mason', description: 'x' }).tag).toBe('BUILDER');
  });

  it('reads the card facts off the role, with the defaults a bare role inherits', () => {
    expect(cardFacts(role(), 10)).toEqual({ tools: ['read', 'shell', 'search files'], model: 'default', turns: 10 });
    expect(cardFacts(role({ tools: [], maxTurns: 35, model: 'claude-haiku-4-5-20251001' }), 10)).toEqual({
      tools: ['read', 'write', 'edit', 'shell', 'search files'],
      model: 'Haiku 4.5',
      turns: 35,
    });
  });

  it('contrasts the ceiling with what sessions cost, as a share of the ceiling', () => {
    expect(spendLine(role())).toEqual({ ceiling: '$2.00', measured: 'no full session yet', share: 0 });
    const line = spendLine(role({ measured: { samples: 3, meanUsd: 0.5, maxUsd: 1.2 } }));
    expect(line).toEqual({ ceiling: '$2.00', measured: '50c avg · $1.20 most · 3 sessions', share: 0.25 });
    // A mean past the ceiling is a full bar, not an overflow.
    expect(spendLine(role({ measured: { samples: 1, meanUsd: 4, maxUsd: 4 } })).share).toBe(1);
  });

  it('says a model the way the CV does', () => {
    expect(modelWord(undefined)).toBe('default');
    expect(modelWord('claude-opus-5')).toBe('Opus 5');
    expect(modelWord('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
    expect(modelWord('gpt-x')).toBe('gpt-x');
  });

  it('reads who carries a skill off the roles', () => {
    expect(carriedBy('small-diffs', [role(), role({ name: 'scout', skills: [] })])).toEqual(['mason']);
  });

  it('pins a door state', () => {
    expect(doorState({ kind: 'send', ready: true, enabled: true, missingSecrets: [] })).toBe('send');
    expect(doorState({ kind: 'read', ready: false, enabled: false, missingSecrets: ['KEY'] })).toBe('key');
    expect(doorState({ kind: 'read', ready: true, enabled: true, missingSecrets: [] })).toBe('on');
    expect(doorState({ kind: 'read', ready: true, enabled: false, missingSecrets: [] })).toBe('off');
  });
});
