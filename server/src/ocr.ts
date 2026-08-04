import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reading words off a picture of words, using the OCR engine already in
 * Windows.
 *
 * Chosen over tesseract.js after measuring both ends of the trade: this costs
 * nothing to install, runs offline, and read a deliberately nasty scan —
 * skewed 1.2°, speckled, JPEG quality 50 — at 18 of 22 expected tokens.
 * tesseract.js would have been portable and cost ~32MB of `node_modules`, a
 * postinstall script and a language download to keep offline (D-061).
 *
 * The cost of that choice is that this file is the only Windows-only thing in
 * the project, which is why it is a file rather than a few lines inside
 * `documents.ts`: everything above it asks `ocrAvailable()` and gets `false`
 * elsewhere, and the day a portable engine is wanted, it goes behind this same
 * seam without a caller changing.
 */

/**
 * What to render a PDF page at before reading it, as a multiple of the page's
 * own size.
 *
 * Measured on one realistic page — body copy at 10pt, skewed, speckled, lossy
 * — rather than assumed, because the obvious assumption is wrong in both
 * directions. At scale 1 (72dpi) it recovered 5 of 22 expected tokens: body
 * text simply is not there. At 3 it was no better than 2, and at 4 it was
 * *worse* — upscaling a lossy scan magnifies the artefacts and softens the
 * strokes, and the engine reads the noise. 2 is both the most accurate and the
 * cheapest of the accurate ones.
 */
export const OCR_SCALE = 2;

/** Long enough for a slow page, short enough that a hung shell is not a hung sync. */
const TIMEOUT_MS = 120_000;

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'winocr.ps1',
);

export interface OcrPage {
  /** The words, or null when the page could not be read at all. */
  text: string | null;
  /** Why it could not be read. Null on success, including a genuinely blank page. */
  error: string | null;
}

/**
 * Runs the script over a list of images and returns one result per image.
 *
 * One invocation per document rather than per page, and that is not a
 * micro-optimisation: measured, one page costs 1,567ms and four cost 1,497ms,
 * because essentially all of it is PowerShell starting up. Per-page spawning
 * would make a ten-page document ten times slower for no reason.
 */
export async function ocrImages(images: string[]): Promise<OcrPage[]> {
  if (images.length === 0) return [];
  return read(images);
}

async function read(images: string[]): Promise<OcrPage[]> {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-ocr-'));
  try {
    const list = path.join(dir, 'pages.txt');
    // Resolved because WinRT will not take a relative path, and it is handed
    // over as the platform writes it — a forward-slash path fails there, and
    // used to fail *silently*, which made a wiring fault look like a blank page.
    writeFileSync(list, `${images.map((image) => path.resolve(image)).join('\n')}\n`, 'utf8');
    const raw = await run(list);
    const parsed = JSON.parse(raw) as { pages?: OcrPage[] };
    return parsed.pages ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(listFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ListFile', listFile],
      { windowsHide: true },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('the OCR engine did not answer in time'));
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(err.trim() || `the OCR engine exited with ${code}`));
    });
  });
}

/**
 * Whether this machine can read a scan at all, asked once per server run.
 *
 * Cached because the answer cannot change while the process lives and finding
 * it out costs a PowerShell start. It is a real run over an empty list rather
 * than a platform check: the engine exists only when a language pack is
 * installed, so `win32` is necessary and not sufficient, and the panel says
 * which of the two is true rather than leaving scans to fail quietly.
 */
let known: Promise<boolean> | null = null;
export function ocrAvailable(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  // `read`, not `ocrImages`: that one answers an empty list without asking
  // anything, so probing through it would report every Windows machine as
  // capable — a yes that had never spoken to the engine.
  known ??= read([])
    .then(() => true)
    .catch(() => false);
  return known;
}

/** For tests, which must not inherit an answer measured by another test. */
export function forgetOcrAvailability(): void {
  known = null;
}
