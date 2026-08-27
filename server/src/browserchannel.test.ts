import { describe, expect, it } from 'vitest';
import {
  browserChannel,
  forgetBrowserChannel,
  headedAvailable,
  pickChannel,
} from './browserchannel';

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

/**
 * The other half of "what browsers can this install open": not which build,
 * but whether a window can be shown at all. It exists because #24's
 * acceptance says supervised live acting is *refused at its probe* on a host
 * and, until this, there was no such probe — only `ocr.ts` and
 * `pickFolder.ts` gate on the platform, so a hosted install would have
 * launched a headed browser at nothing and killed a paid job halfway.
 */
describe('headedAvailable', () => {
  it('is true where a desktop is the norm', () => {
    // This machine's branch, and the one that must not change: on Windows a
    // supervised job is granted exactly as it was before the probe existed.
    expect(headedAvailable('win32', {})).toBe(true);
    expect(headedAvailable('darwin', {})).toBe(true);
  });

  it('is false on a Linux container, which is the case it was written for', () => {
    expect(headedAvailable('linux', {})).toBe(false);
  });

  it('is a list of desktops, not "anything that is not Linux"', () => {
    // A mutation run turned the test into `platform !== 'linux'` and nothing
    // caught it, because nothing here had ever named a third platform. The
    // two spellings differ on every other Unix, where a display is just as
    // necessary — and the whitelist is the safe direction: an unlisted
    // platform is asked for a display rather than assumed to have a screen.
    expect(headedAvailable('freebsd', {})).toBe(false);
    expect(headedAvailable('freebsd', { DISPLAY: ':0' })).toBe(true);
  });

  it('is true on Linux with a display, because that is a real desktop', () => {
    // A Linux workstation is not a container. The condition is the one
    // Chromium itself imposes, so the probe is the truth rather than a guess
    // about where the code is running.
    expect(headedAvailable('linux', { DISPLAY: ':0' })).toBe(true);
    expect(headedAvailable('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(true);
  });

  it('does not count an empty display as a display', () => {
    // `sessionPassword`'s failure direction: a variable that exists and says
    // nothing is not a desktop, and a stray `DISPLAY=` in a Dockerfile would
    // otherwise switch supervised acting back on for a container.
    expect(headedAvailable('linux', { DISPLAY: '' })).toBe(false);
    expect(headedAvailable('linux', { DISPLAY: '   ' })).toBe(false);
    expect(headedAvailable('linux', { WAYLAND_DISPLAY: '' })).toBe(false);
  });
});
