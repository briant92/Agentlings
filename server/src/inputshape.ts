/**
 * The shape of what a job was given, as a signature the learning can key on
 * (D-221).
 *
 * One sentence is one recipe key, and the trial that opened the reconciliation
 * line ran one sentence over three different pairs of files: each close-out
 * replaced the banked method with the last pair's habits, until it called bank
 * fees out-of-scope — true against an invoice register, wrong against a ledger
 * — and sat one success from compiling that into a tool. The model survived
 * because it reads the files; a compiled script would not.
 *
 * So the files join the identity. A spreadsheet-shaped text file is named by
 * its header — which columns, in which order — because that is what a method
 * written against it depends on; anything else is named by its extension,
 * which is all a method can assume about a file without opening it. Two jobs
 * share a shape when the sets are equal, and a recipe or a tool learned under
 * one shape is never served under another: the `hasRepo` rule on a tool
 * manifest, applied to the other thing that makes the same words a different
 * job (D-074, D-221).
 */

/** How much of a file is read to find its header — one line is all that is wanted. */
export const SHAPE_SNIFF_BYTES = 4096;

/** Extensions whose files are read for a header; everything else is named by extension. */
const TABULAR = new Set(['csv', 'tsv', 'txt']);

/** `csv:date|description|amount`, `txt:prose`, `ext:xlsx` — one string per file. */
export function attachmentShape(name: string, data: Buffer): string {
  const ext = extensionOf(name);
  if (!TABULAR.has(ext)) return `ext:${ext}`;
  const header = headerColumns(data);
  if (header === null) return `ext:${ext}`; // bytes that are not text
  return header.length >= 2 ? `${ext}:${header.join('|')}` : `${ext}:prose`;
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'none';
}

/**
 * The header's columns, or none when the first line is not a table. A table
 * is a first line split by the delimiter it uses most — comma on a tie — and
 * a second line, where there is one, split into the same number of pieces; a
 * lone line counts only with three or more pieces, so a sentence with a comma
 * in it is prose and not a two-column table. Null when the bytes are binary.
 */
function headerColumns(data: Buffer): string[] | null {
  const head = data.subarray(0, SHAPE_SNIFF_BYTES);
  if (head.includes(0)) return null;
  let text = head.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const [first = '', second = ''] = text.split(/\r?\n/);
  if (!first.trim()) return [];
  const count = (line: string, delim: string) => line.split(delim).length - 1;
  const [delim, pieces] = [',', ';', '\t']
    .map((d): [string, number] => [d, count(first, d)])
    .sort((a, b) => b[1] - a[1])[0];
  if (pieces === 0) return [];
  if (second.trim() ? count(second, delim) !== pieces : pieces < 2) return [];
  return first.split(delim).map(normaliseColumn).filter(Boolean);
}

/** Lowercase, unquoted, unaccented, single-spaced: `"Descripción"` → `descripcion`. */
function normaliseColumn(raw: string): string {
  return raw
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * A job's shape: its attachments' shapes, sorted and deduplicated; undefined
 * when it has none. An attachment stamped before shapes existed is named by
 * its extension, the one thing its record still says.
 */
export function inputShapeOf(
  attachments?: readonly { name: string; shape?: string }[],
): string[] | undefined {
  if (!attachments?.length) return undefined;
  const shapes = attachments.map((a) => a.shape ?? `ext:${extensionOf(a.name)}`);
  return [...new Set(shapes)].sort();
}

/**
 * Whether something learned under one shape may serve a job of another.
 *
 * Both absent is a method learned with no files meeting a job with none —
 * unchanged behaviour. Absent on the learned side alone is unknown
 * provenance, treated as changed the way `capabilities` is (D-036): a recipe
 * banked before shapes were recorded may have been learned over files, and
 * an attached job must not inherit it. Absent on the job alone is a method
 * learned over files being asked about none.
 */
export function sameInputShape(learned?: readonly string[], job?: readonly string[]): boolean {
  if (!learned && !job) return true;
  if (!learned || !job) return false;
  if (learned.length !== job.length) return false;
  const a = [...learned].sort();
  const b = [...job].sort();
  return a.every((shape, i) => shape === b[i]);
}
