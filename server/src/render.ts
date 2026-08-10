import { createRequire } from 'node:module';
import path from 'node:path';
import type { ToolSpec } from './github';
import { COLOR_POOL } from './levels';
import { STAND_POSITIONS } from './plates';
import { applyPalette, BACKDROP_COLOURS, medianCut } from './quantize';
import { countColours, decodePng, encodePng, separationAt } from './raster';

/**
 * A styled PDF, printed from HTML the run wrote.
 *
 * pdf-lib can draw on a page and cannot lay one out; every product that ships
 * designed PDF reports prints HTML+CSS through a Chromium, and the one this
 * machine already has is Edge — `playwright-core` drives it by channel, so
 * nothing downloads and no browser lands in the repo (D-128). The dependency
 * lives in the server workspace on purpose: root dependencies are read as
 * `lib:` capability tokens, and adding one there would demote every recipe on
 * the machine (D-036 via `LIBRARIES`, index.ts).
 *
 * The render is offline, and that is the security half: the page never
 * navigates (`setContent`), and every request it makes — an image, a font, a
 * stylesheet — is aborted, so a run's HTML cannot fetch or leak anything
 * through the door. Anything the document needs must ride inside it: inline
 * CSS, `data:` URIs, `@page` rules for size and margins.
 *
 * Session-side this is the `web` shape, not the github/search one: the
 * generic runner loop hands `reply.text` to the model, and a PDF is bytes to
 * write, so the runner has a dedicated block that writes the file at the
 * sandbox root and tells the model what landed.
 */

/** A whole report is well under this; past it, inline less or split. */
const MAX_HTML_BYTES = 2_000_000;
/** An honest render is seconds; a hang is killed like a compiled tool's. */
const RENDER_TIMEOUT_MS = 30_000;

/** The plate shape (D-108, D-142): 2x of the 1000-wide world at viewH 450. */
export const PLATE_WIDTH = 2000;
export const PLATE_HEIGHT = 900;
/** The geometry the receipt assumes — the default pack shape the tool serves. */
const PLATE_VIEW_H = 450;
const PLATE_GROUND_Y = 388;

/**
 * The two files a plate page may import, served from the server's own
 * pinned copy of three.js (D-143) — the one exception to the offline rule,
 * and it never leaves the machine: the route fulfills these from disk and
 * aborts everything else. Two files because three's module build imports
 * its core as a sibling; the door serves the pair, and nothing more.
 */
const VENDORED_THREE: Record<string, string> = {
  '/three.module.js': 'three.module.min.js',
  '/three.core.min.js': 'three.core.min.js',
};

let threeDir: string | null | undefined;
function vendoredThreeDir(): string | null {
  if (threeDir !== undefined) return threeDir;
  try {
    // Resolve the CJS entry (the exports map hides the build paths) and take
    // its folder — the build directory the module files sit in.
    threeDir = path.dirname(createRequire(import.meta.url).resolve('three'));
  } catch {
    threeDir = null;
  }
  return threeDir;
}

export const RENDER_TOOLS: ToolSpec[] = [
  {
    name: 'render_pdf',
    description:
      'Render a complete, self-contained HTML document to a styled PDF at the sandbox root. Inline all CSS, embed images as data: URIs, control size and margins with @page rules — every external URL is blocked during the render.',
    params: [
      { name: 'html', type: 'string', required: true, describe: 'the whole HTML document' },
      {
        name: 'file',
        type: 'string',
        describe: 'output filename at the sandbox root (default report.pdf)',
      },
    ],
  },
  {
    name: 'render_plate',
    description:
      'Render a self-contained HTML page into a 2000×900 level-backdrop plate (PNG) at the sandbox root, quantized to the 128-colour backdrop budget. three.js may be imported from http://three.local/three.module.js — the only URL that resolves; every other request is blocked. Set document.title = "ready" once your scene has drawn; the screenshot waits for it.',
    params: [
      { name: 'html', type: 'string', required: true, describe: 'the whole HTML page' },
      {
        name: 'file',
        type: 'string',
        describe: 'output filename at the sandbox root (default plate.png)',
      },
    ],
  },
];

export const RENDER_TOOL_NAMES = RENDER_TOOLS.map((t) => t.name);

export interface RenderResult {
  /** The document, base64 — the runner writes it; it never rides a prompt. */
  pdf?: string;
  pages?: number;
  bytes?: number;
  error?: string;
}

/**
 * A plate render's reply: the PNG plus the numbers that prove it — the tool
 * reports its own colour count and crew separation rather than hoping
 * (D-011, D-021: generated instruction is executable; a tool proves its own
 * output).
 */
export interface PlateResult {
  /** The plate, base64 — the runner writes it; it never rides a prompt. */
  png?: string;
  width?: number;
  height?: number;
  colours?: number;
  worstSeparation?: number;
  worstAt?: number;
  bytes?: number;
  error?: string;
}

/** Runs one render. Never throws; a failure is prose the model can act on. */
export async function callRender(
  tool: string,
  args: Record<string, unknown>,
): Promise<RenderResult | PlateResult> {
  if (tool !== 'render_pdf' && tool !== 'render_plate') {
    return { error: `no such tool: ${tool}` };
  }

  const html = typeof args.html === 'string' ? args.html : '';
  if (!html.trim()) return { error: 'html is required — the whole document, not a path' };
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return {
      error: `the document is too large to render (over ${Math.round(MAX_HTML_BYTES / 1_000_000)} MB) — inline less, or split it`,
    };
  }
  if (!(await renderAvailable())) {
    return { error: 'no renderer on this machine — Microsoft Edge was not found' };
  }

  if (tool === 'render_plate') return renderPlate(html);

  let pdf: Buffer;
  try {
    pdf = await print(html);
  } catch (err) {
    return { error: `could not render: ${err instanceof Error ? err.message : String(err)}` };
  }

  // The count is a courtesy for the run's own read-back; failing to count is
  // not failing to render.
  let pages: number | undefined;
  try {
    const { PDFDocument } = await import('pdf-lib');
    pages = (await PDFDocument.load(pdf)).getPageCount();
  } catch {
    pages = undefined;
  }
  return { pdf: pdf.toString('base64'), pages, bytes: pdf.length };
}

/**
 * Screenshots the page at plate size, then makes the result a legal backdrop:
 * quantized into D-108's 128-colour budget and measured for crew separation
 * at the seven standing places, so the receipt carries the same numbers the
 * pack checker will hold it to.
 */
async function renderPlate(html: string): Promise<PlateResult> {
  let shot: Buffer;
  try {
    shot = await screenshotPlate(html);
  } catch (err) {
    return { error: `could not render: ${err instanceof Error ? err.message : String(err)}` };
  }

  let raster = decodePng(shot);
  let colours = countColours(raster);
  if (colours > BACKDROP_COLOURS) {
    raster = applyPalette(raster, medianCut(raster, BACKDROP_COLOURS), true);
    colours = countColours(raster);
  }
  // Separation on the 2x plate: scale 2, ground at the default pack shape the
  // description promises. A pack with another viewH re-measures at check time.
  const separations = separationAt(raster, STAND_POSITIONS, PLATE_GROUND_Y, COLOR_POOL, 2);
  const worst = separations.reduce((a, b) => (b.separation < a.separation ? b : a));
  const png = encodePng(raster);
  return {
    png: png.toString('base64'),
    width: raster.w,
    height: raster.h,
    colours,
    worstSeparation: Number(worst.separation.toFixed(1)),
    worstAt: worst.at,
    bytes: png.length,
  };
}

async function screenshotPlate(html: string): Promise<Buffer> {
  const vendorDir = vendoredThreeDir();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    return await Promise.race([
      (async () => {
        const page = await browser.newPage({
          viewport: { width: PLATE_WIDTH, height: PLATE_HEIGHT },
        });
        // The offline rule, with its one stated exception: the vendored
        // three.js pair is fulfilled from this machine's own disk, and every
        // other request — any host, any path — is refused.
        await page.route('**', (route) => {
          const vendored = VENDORED_THREE[new URL(route.request().url()).pathname];
          if (vendored && vendorDir) {
            return route.fulfill({
              path: path.join(vendorDir, vendored),
              contentType: 'text/javascript',
            });
          }
          return route.abort();
        });
        await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
        try {
          // Options ride third: the second slot is the page-function's arg,
          // and a timeout planted there is silently no timeout at all.
          await page.waitForFunction(() => document.title === 'ready', undefined, {
            timeout: RENDER_TIMEOUT_MS / 2,
          });
        } catch {
          throw new Error(
            'the page never set document.title = "ready" — set it after your scene has ' +
              'drawn, so the screenshot is not taken early',
          );
        }
        return await page.screenshot({ type: 'png' });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`took over ${RENDER_TIMEOUT_MS / 1000}s`)), RENDER_TIMEOUT_MS),
      ),
    ]);
  } finally {
    await browser.close();
  }
}

async function print(html: string): Promise<Buffer> {
  // Lazy on purpose: the server must boot, and every other test must run, on
  // a machine with no Edge and no playwright-core install completed.
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    return await Promise.race([
      (async () => {
        const page = await browser.newPage();
        // The offline rule: setContent means the only requests are the
        // document's own subresources, and all of them are refused.
        await page.route('**', (route) => route.abort());
        await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
        return await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'A4' });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`took over ${RENDER_TIMEOUT_MS / 1000}s`)), RENDER_TIMEOUT_MS),
      ),
    ]);
  } finally {
    await browser.close();
  }
}

/**
 * Whether this machine can render at all — a real probe, memoised, on
 * ocrAvailable()'s pattern: the channel exists only where Edge is installed,
 * so asking the OS is the only honest answer.
 */
let known: Promise<boolean> | null = null;
export function renderAvailable(): Promise<boolean> {
  known ??= (async () => {
    try {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      await browser.close();
      return true;
    } catch {
      return false;
    }
  })();
  return known;
}

/** For tests, which must not inherit an answer measured by another test. */
export function forgetRenderAvailability(): void {
  known = null;
}
