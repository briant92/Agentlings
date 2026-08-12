import { describe, expect, it, vi } from 'vitest';
import type { LevelPack } from '@agentlings/shared';
import { api } from '../api';
import { allLooks, loadLooks, lookIsMissing } from './looks';

vi.mock('../api', () => ({ api: vi.fn() }));

/** The least pack the registry needs: a name for the label, a theme, no rasters. */
const pack = (name: string) => ({ name, theme: { void: 0 } }) as unknown as LevelPack;

describe('loadLooks — re-callable, so a bad boot is not for life (D-164)', () => {
  it('fails to built-ins, heals on the next call, and never duplicates', async () => {
    const fetchPacks = vi.mocked(api);

    // Boot while the server restarts: the fetch fails and the catch keeps the
    // four built-ins — the state the New Level palette was stuck in until F5.
    fetchPacks.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await loadLooks();
    expect(allLooks()).toHaveLength(4);
    expect(lookIsMissing('pine-reach')).toBe(true);

    // The select screen's next visit calls again, server back up: healed.
    fetchPacks.mockResolvedValue({
      installed: [{ slug: 'pine-reach', pack: pack('The Pine Reach') }],
      rejected: [],
    });
    await loadLooks();
    expect(allLooks()).toHaveLength(5);
    expect(lookIsMissing('pine-reach')).toBe(false);
    expect(allLooks().find((l) => l.id === 'pine-reach')?.installed).toBe(true);

    // Idempotent: the same packs again add nothing twice.
    await loadLooks();
    expect(allLooks()).toHaveLength(5);
  });
});
