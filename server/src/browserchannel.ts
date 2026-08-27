/**
 * Which Chromium this install launches.
 *
 * Every launch site in the product named Edge's channel outright — true on
 * the maintainer's Windows machine, where Edge is the Chromium that is
 * already installed and `playwright-core` drives it by channel so nothing is
 * downloaded (D-128), and false everywhere a container runs. Playwright's
 * official image carries a Chromium and no Edge at all, so a `msedge` launch
 * there fails and the probe above it reports *Microsoft Edge was not found* —
 * a sentence that is a lie on a host which has a perfectly good browser.
 *
 * So the channel becomes a question this module answers once: **Edge if Edge
 * launches, the bundled Chromium if it does not, and null if neither does.**
 * Edge is tried first and always, which is what keeps the maintainer's own
 * install byte-for-byte what it was — on that machine the first probe
 * succeeds and the second channel is never reached.
 *
 * It is one module for the D-270 reason: a second place deriving this is how
 * the renderer and the browser door come to disagree about what this install
 * can open.
 */

/** In order of preference. Edge first, always. */
export const CHANNELS = ['msedge', 'chromium'] as const;
export type BrowserChannel = (typeof CHANNELS)[number];

/** Can this install launch that channel? The real one launches a browser. */
export type ChannelProbe = (channel: BrowserChannel) => Promise<boolean>;

/**
 * The first channel that launches, or null.
 *
 * The probe is allowed to *throw* as well as answer false, and that is not
 * defensive padding: the real one is `chromium.launch`, which rejects with
 * "Chromium distribution 'msedge' is not found" on a machine without Edge,
 * and rejects again if `playwright-core` never finished installing. A throw
 * escaping here would take out `renderAvailable`, whose whole job is to
 * answer rather than crash.
 */
export async function pickChannel(canLaunch: ChannelProbe): Promise<BrowserChannel | null> {
  for (const channel of CHANNELS) {
    try {
      if (await canLaunch(channel)) return channel;
    } catch {
      // Not there. Try the next one.
    }
  }
  return null;
}

/**
 * Actually launch it, headless, and close it again — `ocrAvailable()`'s
 * pattern. Lazy on purpose: the server must boot, and every other test must
 * run, on a machine with no browser and no `playwright-core` install
 * completed.
 */
const launches: ChannelProbe = async (channel) => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel, headless: true });
  await browser.close();
  return true;
};

let known: Promise<BrowserChannel | null> | null = null;

/**
 * The channel this install launches, measured once.
 *
 * Memoised because the measurement costs a browser start, and every render
 * and every supervised run would otherwise pay it. The probe is injectable
 * only so the tests above can drive the branch that this machine cannot
 * reach.
 */
export function browserChannel(canLaunch: ChannelProbe = launches): Promise<BrowserChannel | null> {
  known ??= pickChannel(canLaunch);
  return known;
}

/** For tests, which must not inherit an answer measured by another test. */
export function forgetBrowserChannel(): void {
  known = null;
}

/**
 * Launch whatever this install has, headless.
 *
 * The one door onto a browser for the product side, so that "which channel"
 * is asked in exactly one place. It throws when there is nothing to launch
 * rather than falling through to Playwright's default, which would fail
 * later with a message about a download that was never going to happen.
 * Every caller gates on the probe first; this is what makes the gate's
 * absence loud rather than mysterious.
 */
export async function launchChromium(): Promise<import('playwright-core').Browser> {
  const { chromium } = await import('playwright-core');
  const channel = await browserChannel();
  if (channel === null) {
    throw new Error('no browser on this install — neither Microsoft Edge nor a Chromium launched');
  }
  return chromium.launch({ channel, headless: true });
}
