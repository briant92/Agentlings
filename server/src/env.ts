import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * The one secrets store is `.env` — the file the server loads at boot
 * (`process.loadEnvFile`) and that every consumer reads through `process.env`
 * at call time. The settings drawer writes here and patches the live
 * `process.env` in the same call, so a pasted token works immediately and
 * still survives a restart.
 *
 * A second store was considered and refused (D-078): every reader of a
 * secret asks `process.env`, and a `secrets.json` merged in by *most* of them
 * is exactly the two-answers shape this project keeps paying for (D-032) —
 * the first code path that forgets the merge disagrees with Settings about
 * whether a connection can work.
 */

/**
 * Replace the first live or commented `NAME=` line, or append one. The rest
 * of the file — comments, ordering, the user's own hand-written entries, the
 * newline style — comes through byte-identical, because `.env` is also a
 * hand-edited file and the drawer is a guest in it.
 */
export function upsertEnvLine(content: string, name: string, value: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const line = `${name}=${value}`;
  const target = new RegExp(`^\\s*#?\\s*${name}\\s*=`);
  const lines = content.split(/\r?\n/);
  // A trailing newline parses as one empty final element; remember to put it back.
  const trailing = lines.length > 1 && lines[lines.length - 1] === '';
  if (trailing) lines.pop();
  const at = lines.findIndex((l) => target.test(l));
  if (at >= 0) lines[at] = line;
  else if (lines.length === 1 && lines[0] === '') lines[0] = line;
  else lines.push(line);
  return lines.join(eol) + eol;
}

/**
 * What is wrong with a pasted value, or null. Checked before any call is
 * made: a value with line breaks would corrupt the very file it is bound
 * for, and no token any Tier-1 provider issues contains whitespace, quotes
 * or `#` — refusing those catches a paste that grabbed too much.
 */
export function secretValueProblem(value: string): string | null {
  if (value === '') return 'paste the token first';
  if (value.length > 500) return 'that is longer than any token — check what was copied';
  if (/\s/.test(value)) return 'a token has no spaces or line breaks — check what was copied';
  if (/["'#]/.test(value)) return 'a token has no quotes or # — check what was copied';
  return null;
}

/** Writes the secret to the env file and the live env view, in that order. */
export function storeSecret(
  file: string,
  name: string,
  value: string,
  env: Record<string, string | undefined>,
): void {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, upsertEnvLine(current, name, value));
  env[name] = value;
}
