import type { ToolSpec } from './github';

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
];

export const RENDER_TOOL_NAMES = RENDER_TOOLS.map((t) => t.name);

export interface RenderResult {
  /** The document, base64 — the runner writes it; it never rides a prompt. */
  pdf?: string;
  pages?: number;
  bytes?: number;
  error?: string;
}

/** Runs one render. Never throws; a failure is prose the model can act on. */
export async function callRender(
  tool: string,
  args: Record<string, unknown>,
): Promise<RenderResult> {
  if (tool !== 'render_pdf') return { error: `no such tool: ${tool}` };

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
