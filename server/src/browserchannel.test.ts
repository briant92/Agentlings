import { describe, expect, it } from 'vitest';
import { browserChannel, forgetBrowserChannel, pickChannel } from './browserchannel';

/**
 * Every case drives the prober by hand. The point of this module is what it
 * does on a machine that is *not* this one — a container with Chromium and no
 * Edge — so a test that launched a real browser would only ever prove the
 * Windows branch, which is the branch already known to work.
 */
describe('pickChannel', () => {
  it('takes Edge when Edge launches, and never asks about anything else', async () => {
    const asked: string[] = [];
    const channel = await pickChannel(async (c) => {
      asked.push(c);
      return true;
    });
    expect(channel).toBe('msedge');
    expect(asked).toEqual(['msedge']);
  });

  it('falls back to the bundled Chromium when Edge is not there', async () => {
    const asked: string[] = [];
    const channel = await pickChannel(async (c) => {
      asked.push(c);
      return c === 'chromium';
    });
    expect(channel).toBe('chromium');
    expect(asked).toEqual(['msedge', 'chromium']);
  });

  it('answers null when neither launches', async () => {
    expect(await pickChannel(async () => false)).toBeNull();
  });

  it('treats a prober that throws as a browser that is not there', async () => {
    // The real prober is `chromium.launch`, which rejects rather than
    // returning false — an unavailable channel throws, an absent
    // playwright-core throws, and a corrupt install throws. If this branch
    // were missing the throw would escape `renderAvailable`, and a probe that
    // crashes is worse than one that says no.
    const channel = await pickChannel(async (c) => {
      if (c === 'msedge') throw new Error('Chromium distribution "msedge" is not found');
      return true;
    });
    expect(channel).toBe('chromium');
  });

  it('answers null when every channel throws', async () => {
    await expect(
      pickChannel(async () => {
        throw new Error('playwright-core is not installed');
      }),
    ).resolves.toBeNull();
  });
});

describe('browserChannel', () => {
  it('asks once and keeps the answer', async () => {
    forgetBrowserChannel();
    let probes = 0;
    const probe = async () => {
      probes++;
      return true;
    };
    expect(await browserChannel(probe)).toBe('msedge');
    expect(await browserChannel(probe)).toBe('msedge');
    expect(probes).toBe(1);
  });

  it('asks again after it is forgotten — which is what the tests need', async () => {
    forgetBrowserChannel();
    expect(await browserChannel(async () => true)).toBe('msedge');
    forgetBrowserChannel();
    expect(await browserChannel(async (c) => c === 'chromium')).toBe('chromium');
    forgetBrowserChannel();
  });
});
