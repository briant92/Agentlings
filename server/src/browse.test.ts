import type { CatalogEntry, SourceStatus } from '@agentlings/shared';
import { describe, expect, it } from 'vitest';
import { categorise, categoryOf, entriesIn, indexedBySource } from './browse';

function entry(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'i',
    kind: 'role',
    name: 'a',
    description: 'd',
    repo: 'r/r',
    path: 'p.md',
    sha: 's',
    source: 'voltagent-subagents',
    trust: 'community',
    ...over,
  };
}

function source(over: Partial<SourceStatus> = {}): SourceStatus {
  return {
    name: 'voltagent-subagents',
    label: 'VoltAgent subagents',
    repo: 'VoltAgent/awesome-claude-code-subagents',
    kind: 'role',
    trust: 'community',
    count: 1,
    ok: true,
    ...over,
  };
}

describe('categoryOf', () => {
  it('reads the VoltAgent category folder and drops its ordinal', () => {
    expect(
      categoryOf(entry({ path: 'categories/01-core-development/api-designer.md' })),
    ).toBe('core development');
  });

  it('reads the wshobson plugin name from both of its repos', () => {
    // The plugin sits at the same depth for agents and skills, which is what
    // makes a job and its abilities land in one category.
    expect(
      categoryOf(
        entry({ source: 'wshobson-agents', path: 'plugins/backend-development/agents/x.md' }),
      ),
    ).toBe('backend development');
    expect(
      categoryOf(
        entry({
          source: 'wshobson-skills',
          kind: 'skill',
          path: 'plugins/backend-development/skills/cqrs/SKILL.md',
        }),
      ),
    ).toBe('backend development');
  });

  it('has no category for a source that arranges nothing', () => {
    // anthropics/skills is one directory per skill and no grouping above it.
    // Returning "skills" here would invent a category holding every one of
    // them, which is a label that tells nobody anything.
    expect(
      categoryOf(
        entry({ source: 'anthropic-skills', kind: 'skill', path: 'skills/pdf/SKILL.md' }),
      ),
    ).toBeNull();
  });

  it('has no category for a source nobody has written a rule for', () => {
    expect(categoryOf(entry({ source: 'someone-elses-repo', path: 'a/b/c.md' }))).toBeNull();
    // Nor one that merely resembles a source we do know. The rule is keyed on
    // the whole source name: a loose prefix would file a stranger's repo under
    // wshobson's plugin taxonomy the moment its name happened to start the
    // same way, and it would look entirely plausible on screen.
    expect(
      categoryOf(entry({ source: 'wonderful-agents', path: 'plugins/backend/agents/x.md' })),
    ).toBeNull();
  });

  it('does not read a known source that moved its files', () => {
    // The rule is anchored on the folder name, not on depth: a VoltAgent file
    // outside `categories/` is not a category we can name, and guessing from
    // position is how a rename becomes 154 entries in a nonsense group.
    // Both cases are deep enough to have a second segment, so only the
    // folder-name check can reject them. A length test alone would pass these
    // and quietly name a category after whatever happened to sit there.
    expect(categoryOf(entry({ path: 'archive/01-core-development/x.md' }))).toBeNull();
    expect(
      categoryOf(entry({ source: 'wshobson-agents', path: 'archive/backend/agents/x.md' })),
    ).toBeNull();
    // And still null when it is simply too shallow to have one.
    expect(categoryOf(entry({ source: 'wshobson-agents', path: 'agents/x.md' }))).toBeNull();
  });

  it('keeps a name that has no ordinal and no dashes', () => {
    expect(categoryOf(entry({ path: 'categories/research/x.md' }))).toBe('research');
  });
});

describe('categorise', () => {
  const sources = [
    source(),
    source({ name: 'anthropic-skills', label: 'Anthropic skills', trust: 'official' }),
  ];

  it('groups by category and counts jobs and abilities apart', () => {
    const list = [
      entry({ name: 'a', path: 'categories/01-core/a.md' }),
      entry({ name: 'b', path: 'categories/01-core/b.md' }),
      entry({ name: 'c', kind: 'skill', path: 'categories/01-core/c.md' }),
    ];
    expect(categorise(list, sources)).toEqual([
      { name: 'core', jobs: 2, abilities: 1, sources: ['voltagent-subagents'], trust: 'community' },
    ]);
  });

  it('files an unarranged source under its own label', () => {
    const list = [
      entry({ source: 'anthropic-skills', kind: 'skill', path: 'skills/pdf/SKILL.md', trust: 'official' }),
    ];
    expect(categorise(list, sources)[0].name).toBe('Anthropic skills');
  });

  it('falls back to the source name when even its label is unknown', () => {
    // A source in the index but not in the status list still has to appear.
    const list = [entry({ source: 'brand-new', path: 'x.md' })];
    expect(categorise(list, sources)[0].name).toBe('brand-new');
  });

  it('orders by size, largest first', () => {
    // The names run the other way from the sizes on purpose: with `alpha`
    // small and `zebra` large, A–Z and largest-first disagree, so this can
    // only pass under the rule it is meant to be testing. The real index is
    // long-tailed enough that alphabetical would bury everything worth
    // seeing under a run of one-entry categories.
    const list = [
      entry({ name: 'a', path: 'categories/01-alpha/a.md' }),
      entry({ name: 'b', path: 'categories/02-zebra/b.md' }),
      entry({ name: 'c', path: 'categories/02-zebra/c.md' }),
    ];
    expect(categorise(list, sources).map((c) => c.name)).toEqual(['zebra', 'alpha']);
  });

  it('breaks ties by name so the order survives a resync', () => {
    const list = [
      entry({ name: 'a', path: 'categories/01-zebra/a.md' }),
      entry({ name: 'b', path: 'categories/02-alpha/b.md' }),
    ];
    expect(categorise(list, sources).map((c) => c.name)).toEqual(['alpha', 'zebra']);
  });

  it('names every source that contributes to a mixed category', () => {
    const list = [
      entry({ source: 'wshobson-agents', path: 'plugins/backend/agents/a.md' }),
      entry({ source: 'wshobson-skills', kind: 'skill', path: 'plugins/backend/skills/b/SKILL.md' }),
    ];
    expect(categorise(list, sources)[0].sources).toEqual(['wshobson-agents', 'wshobson-skills']);
  });

  it('calls a mixed category community, not official', () => {
    // Lowest trust wins. One community file among official ones is precisely
    // the case a highest-wins badge would hide.
    const list = [
      entry({ source: 'anthropic-skills', kind: 'skill', path: 'skills/x/SKILL.md', trust: 'official' }),
      entry({ source: 'anthropic-skills', kind: 'skill', path: 'skills/y/SKILL.md', trust: 'community' }),
    ];
    expect(categorise(list, sources)[0].trust).toBe('community');
  });

  it('calls an all-official category official', () => {
    const list = [
      entry({ source: 'anthropic-skills', kind: 'skill', path: 'skills/x/SKILL.md', trust: 'official' }),
    ];
    expect(categorise(list, sources)[0].trust).toBe('official');
  });

  it('has nothing to show for an empty index', () => {
    expect(categorise([], sources)).toEqual([]);
  });
});

describe('entriesIn', () => {
  const sources = [source(), source({ name: 'anthropic-skills', label: 'Anthropic skills' })];
  const list = [
    entry({ name: 'zeta', path: 'categories/01-core/zeta.md' }),
    entry({ name: 'alpha', path: 'categories/01-core/alpha.md' }),
    entry({ name: 'skill-one', kind: 'skill', path: 'categories/01-core/s.md' }),
    entry({ name: 'other', path: 'categories/02-data/o.md' }),
    entry({ name: 'pdf', kind: 'skill', source: 'anthropic-skills', path: 'skills/pdf/SKILL.md' }),
  ];

  it('selects one category', () => {
    expect(entriesIn(list, sources, { category: 'core' }).map((e) => e.name)).toEqual([
      'alpha',
      'skill-one',
      'zeta',
    ]);
  });

  it('sorts by name, so a category read twice looks the same twice', () => {
    expect(entriesIn(list, sources, { category: 'core' })[0].name).toBe('alpha');
  });

  it('filters by kind', () => {
    expect(entriesIn(list, sources, { category: 'core', kind: 'skill' }).map((e) => e.name)).toEqual(
      ['skill-one'],
    );
  });

  it('filters by source', () => {
    expect(entriesIn(list, sources, { source: 'anthropic-skills' }).map((e) => e.name)).toEqual([
      'pdf',
    ]);
  });

  it('returns everything when nothing is asked for', () => {
    expect(entriesIn(list, sources, {}).length).toBe(5);
  });

  it('selects the fallback category by its label', () => {
    // The unarranged source is reachable by the same name categorise gave it,
    // or it appears in the chip list and opens empty.
    expect(entriesIn(list, sources, { category: 'Anthropic skills' }).map((e) => e.name)).toEqual([
      'pdf',
    ]);
  });

  it('combines kind and category rather than choosing one', () => {
    expect(entriesIn(list, sources, { category: 'core', kind: 'role' }).map((e) => e.name)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});

describe('indexedBySource', () => {
  const sources = [
    source({ name: 'first', label: 'First', count: 99 }),
    source({ name: 'second', label: 'Second', count: 99 }),
  ];

  it('counts what is in the index, not what the source claimed', () => {
    // `count` is recorded before dedupe drops names an earlier source already
    // claimed, so it overstates — 204 against 180 on the real catalogue. The
    // filter has to promise what it can actually show.
    const list = [entry({ source: 'first' }), entry({ source: 'first' }), entry({ source: 'second' })];
    expect(indexedBySource(list, sources)).toEqual([
      { name: 'first', label: 'First', entries: 2 },
      { name: 'second', label: 'Second', entries: 1 },
    ]);
  });

  it('keeps a source that contributed nothing, at zero', () => {
    // Dropping it would remove an option from a filter meant to list what
    // there is, and make a source that failed to sync simply disappear.
    expect(indexedBySource([entry({ source: 'first' })], sources)).toEqual([
      { name: 'first', label: 'First', entries: 1 },
      { name: 'second', label: 'Second', entries: 0 },
    ]);
  });
});
