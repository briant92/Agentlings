import type { CarryManifest } from '@agentlings/shared';

/**
 * What the next leg receives, said from the manifest the copy is made from
 * (UI.md, steps 10 and 17) — so the More-turns note can never describe a
 * copy the code does not make. It is SPATIAL §6.3's gap made visible on the
 * button: `work/` stays behind, and a follow-up leg rebuilds from the report.
 */
export function carryNote(
  carries: CarryManifest,
  dirs: readonly { name: string; files: number }[],
): string {
  const starts: string[] = [];
  if (carries.files.length > 0) starts.push(listed(carries.files));
  if (carries.input.length > 0) starts.push(`input/ (${listed(carries.input)})`);
  if (carries.report) starts.push('this report as PREVIOUS-RESULT.md');
  if (carries.patch) starts.push('the repo patch');
  const weight = new Map(dirs.map((d) => [d.name, d.files]));
  const left = [
    ...carries.left.dirs.map((d) => `${d}/${weight.has(d) ? ` (${weight.get(d)} files)` : ''}`),
    ...carries.left.paperwork.filter((p) => p !== carries.report),
  ];
  const head =
    starts.length > 0
      ? `A fresh leg in this sandbox starts with ${and(starts)}.`
      : 'A fresh leg in this sandbox starts empty.';
  if (left.length === 0) return head;
  const verb = left.length === 1 ? 'is' : 'are';
  const rebuilds = carries.report ? ' — it rebuilds from the report' : '';
  return `${head} ${and(left)} ${verb} not carried${rebuilds}.`;
}

/** One name as itself, a few named in full, many counted. */
function listed(names: readonly string[]): string {
  if (names.length === 1) return names[0];
  if (names.length <= 3) return `${names.length} files (${names.join(', ')})`;
  return `${names.length} files`;
}

function and(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
