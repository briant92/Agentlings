import { createRequire } from 'node:module';
import path from 'node:path';
import { PLATE_OVERSCAN } from '@agentlings/shared';
import type { ToolSpec } from './github';
import { COLOR_POOL } from './levels';
import { STAND_POSITIONS } from './plates';
import {
  applyPalette,
  applyPaletteA,
  BACKDROP_COLOURS,
  histogramOfA,
  medianCut,
  paletteFrom,
} from './quantize';
import {
  alphaStats,
  binariseAlpha,
  countColours,
  countColoursA,
  decodePng,
  decodePngA,
  encodePng,
  encodePngA,
  separationAt,
} from './raster';

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
/** Where the receipt assumes the crew stand — the default pack's ground. */
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
      'Render a self-contained HTML page into a level-backdrop plate (PNG) at the sandbox root, quantized to the 128-colour backdrop budget. three.js may be imported from http://three.local/three.module.js — the only URL that resolves; every other request is blocked. Set document.title = "ready" once your scene has drawn; the screenshot waits for it. Modes: "plate" (default, 2000×900 opaque back plate), "plate-overscan" (2120×900 opaque, for a back plate that drifts), "cutout" (2000×900, keep transparency — the page background must be transparent; alpha is snapped to on-or-off), "cutout-overscan" (2120×900 with transparency — upper plates and occlusion strips that drift), "tile" (a small loop tile; give tileWidth and tileHeight, each 8–512).',
    params: [
      { name: 'html', type: 'string', required: true, describe: 'the whole HTML page' },
      {
        name: 'file',
        type: 'string',
        describe: 'output filename at the sandbox root (default plate.png)',
      },
      {
        name: 'mode',
        type: 'string',
        describe:
          'plate | plate-overscan | cutout | cutout-overscan | tile (default plate)',
      },
      { name: 'tileWidth', type: 'number', describe: 'tile mode only: 8–512' },
      { name: 'tileHeight', type: 'number', describe: 'tile mode only: 8–512' },
      {
        name: 'finish',
        type: 'string',
        describe:
          'quantized (default: 128-colour budget, cut-out alpha snapped) | smooth (for packs declaring backdrop.finish "smooth", and for depth maps: colours and soft alpha kept as rendered)',
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
  /** Cut-out modes: how much of the frame is actually there (0–100). */
  opaquePct?: number;
  /** Cut-out modes: soft-alpha pixels the door snapped to on-or-off. */
  partialSnapped?: number;
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

  if (tool === 'render_plate') return renderPlate(html, args);

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

const PLATE_MODES = ['plate', 'plate-overscan', 'cutout', 'cutout-overscan', 'tile'] as const;
type PlateMode = (typeof PLATE_MODES)[number];

/**
 * Screenshots the page at the mode's size, then makes the result a legal
 * backdrop file: quantized into D-108's 128-colour budget — per render here;
 * the layer-wide union is the checker's to hold — and, for opaque plates,
 * measured for crew separation at the seven standing places, so the receipt
 * carries the same numbers the pack checker will. Cut-out modes keep the
 * page's transparency, snap it to on-or-off (the checker's contract), and
 * report coverage instead of separation: what a cut-out does to legibility
 * is a property of the composite, which pack:check measures.
 */
async function renderPlate(html: string, args: Record<string, unknown>): Promise<PlateResult> {
  const rawMode = args.mode ?? 'plate';
  if (typeof rawMode !== 'string' || !(PLATE_MODES as readonly string[]).includes(rawMode)) {
    // Refused by name, never a silent default — the D-147 rule.
    return { error: `no such mode: "${String(rawMode)}" — one of ${PLATE_MODES.join(', ')}` };
  }
  const mode = rawMode as PlateMode;
  // The finish (D-151): quantized is the default and the absence; smooth
  // keeps the render exactly as the page drew it — full colours, soft alpha
  // — for packs on the smooth finish and for depth maps, whose gradients a
  // 128 cut would band into steps the displacement would show.
  const rawFinish = args.finish ?? 'quantized';
  if (rawFinish !== 'quantized' && rawFinish !== 'smooth') {
    return { error: `no such finish: "${String(rawFinish)}" — quantized or smooth` };
  }
  const keepAsRendered = rawFinish === 'smooth';
  const tileW = args.tileWidth;
  const tileH = args.tileHeight;
  if (mode === 'tile') {
    for (const [name, v] of [
      ['tileWidth', tileW],
      ['tileHeight', tileH],
    ] as const) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 8 || v > 512) {
        return { error: `tile mode needs ${name}: an integer 8–512` };
      }
    }
  } else if (tileW !== undefined || tileH !== undefined) {
    return { error: `tileWidth/tileHeight belong to mode "tile", not "${mode}"` };
  }

  const overscan = mode === 'plate-overscan' || mode === 'cutout-overscan';
  const alpha = mode === 'cutout' || mode === 'cutout-overscan' || mode === 'tile';
  // PLATE_OVERSCAN is world units; the plate frame is 2×.
  const width = mode === 'tile' ? (tileW as number) : PLATE_WIDTH + (overscan ? PLATE_OVERSCAN * 2 : 0);
  const height = mode === 'tile' ? (tileH as number) : PLATE_HEIGHT;

  let shot: Buffer;
  try {
    shot = await screenshotPlate(html, width, height, alpha);
  } catch (err) {
    return { error: `could not render: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (alpha) {
    let raster = decodePngA(shot);
    const partialSnapped = keepAsRendered ? 0 : binariseAlpha(raster);
    let colours = countColoursA(raster);
    if (!keepAsRendered && colours > BACKDROP_COLOURS) {
      raster = applyPaletteA(raster, paletteFrom(histogramOfA(raster), BACKDROP_COLOURS), true);
      colours = countColoursA(raster);
    }
    const stats = alphaStats(raster);
    const png = encodePngA(raster);
    return {
      png: png.toString('base64'),
      width: raster.w,
      height: raster.h,
      colours,
      opaquePct: Number((((stats.opaque + stats.partial) / (raster.w * raster.h)) * 100).toFixed(1)),
      ...(keepAsRendered ? {} : { partialSnapped }),
      bytes: png.length,
    };
  }

  let raster = decodePng(shot);
  let colours = countColours(raster);
  if (!keepAsRendered && colours > BACKDROP_COLOURS) {
    raster = applyPalette(raster, medianCut(raster, BACKDROP_COLOURS), true);
    colours = countColours(raster);
  }
  // Separation on the 2x plate: scale 2, ground at the default pack shape the
  // description promises. A pack with another viewH re-measures at check
  // time. On an overscanned plate the view starts half the margin in, so the
  // standing places shift by it — and the receipt reports world x, as ever.
  const shift = overscan ? PLATE_OVERSCAN / 2 : 0;
  const separations = separationAt(
    raster,
    STAND_POSITIONS.map((p) => p + shift),
    PLATE_GROUND_Y,
    COLOR_POOL,
    2,
  );
  let worstIndex = 0;
  separations.forEach((s, i) => {
    if (s.separation < separations[worstIndex].separation) worstIndex = i;
  });
  const worst = separations[worstIndex];
  const png = encodePng(raster);
  return {
    png: png.toString('base64'),
    width: raster.w,
    height: raster.h,
    colours,
    worstSeparation: Number(worst.separation.toFixed(1)),
    worstAt: STAND_POSITIONS[worstIndex],
    bytes: png.length,
  };
}

async function screenshotPlate(
  html: string,
  width: number,
  height: number,
  omitBackground: boolean,
): Promise<Buffer> {
  const vendorDir = vendoredThreeDir();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    return await Promise.race([
      (async () => {
        const page = await browser.newPage({
          viewport: { width, height },
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
        // omitBackground keeps the page's transparency for the cut-out
        // modes; an opaque page over a transparent background still comes
        // out opaque, so it costs the plate modes nothing to leave false.
        return await page.screenshot({ type: 'png', omitBackground });
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
