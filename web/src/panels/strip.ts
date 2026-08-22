import type { TrajectoryLine } from '@agentlings/shared';

/**
 * Where the turns went (UI.md, step 17): the session pass of a run's trail
 * (D-211) as one block per tool call, in the order the session made them.
 *
 * Counts are calls, not turns — a turn is one assistant message and may
 * carry several calls, and the facts strip already says the turns. The
 * close-out pass is left out: that is the write-up's errand, not the run's.
 * Pure, so the legend can be pinned against the blocks it describes.
 */

export interface Call {
  /** 1-based, in the order the session made them. */
  n: number;
  tool: string;
  /** False when the tool answered with an error; true otherwise, including when no result line followed. */
  ok: boolean;
  turn?: number;
}

/** "mcp__mail__mail_search" reads as "mail_search" on a block — a door's tool is its own name. */
export function shortTool(name: string): string {
  return name.replace(/^mcp__.*?__/, '');
}

export function callsOf(lines: readonly TrajectoryLine[]): Call[] {
  const results = new Map<string, boolean>();
  for (const line of lines) {
    if (line.pass === 'session' && line.kind === 'result' && line.id) {
      results.set(line.id, line.ok !== false);
    }
  }
  const calls: Call[] = [];
  for (const line of lines) {
    if (line.pass !== 'session' || line.kind !== 'call') continue;
    calls.push({
      n: calls.length + 1,
      tool: shortTool(line.name ?? '?'),
      ok: line.id ? (results.get(line.id) ?? true) : true,
      ...(line.turn !== undefined ? { turn: line.turn } : {}),
    });
  }
  return calls;
}

/** The legend: every tool with its count and colour, most used first. */
export function legendOf(calls: readonly Call[]): { tool: string; n: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1);
  return [...counts]
    .map(([tool, n]) => ({ tool, n, color: colorOf(tool) }))
    .sort((a, b) => b.n - a.n || a.tool.localeCompare(b.tool));
}

/** The longest run of one tool called back to back, when it is longer than one call. */
export function longestRun(calls: readonly Call[]): { tool: string; n: number } | null {
  let best: { tool: string; n: number } | null = null;
  let current: { tool: string; n: number } | null = null;
  for (const call of calls) {
    if (current && current.tool === call.tool) current.n += 1;
    else current = { tool: call.tool, n: 1 };
    if (!best || current.n > best.n) best = { ...current };
  }
  return best && best.n > 1 ? best : null;
}

/** The failed calls, each with whether the very next call tried the same tool again. */
export function failures(calls: readonly Call[]): { call: Call; retried: boolean }[] {
  return calls
    .filter((call) => !call.ok)
    .map((call) => ({ call, retried: calls[call.n]?.tool === call.tool }));
}

/** The captions beside the legend, as the board words them. */
export function captions(calls: readonly Call[]): string[] {
  const out: string[] = [];
  const run = longestRun(calls);
  if (run) out.push(`longest run of one tool: ${run.n} ${run.tool} calls in a row`);
  const failed = failures(calls);
  if (failed.length === 1) {
    const [f] = failed;
    out.push(`1 failed call (call ${f.call.n}, ${f.call.tool})${f.retried ? ', retried on the next' : ''}`);
  } else if (failed.length > 1) {
    out.push(`${failed.length} failed calls (${failed.map((f) => `call ${f.call.n}`).join(', ')})`);
  }
  return out;
}

/** The colours the board gave the tools it drew; anything else draws from a fixed palette by its name. */
const KNOWN: Record<string, string> = {
  Bash: '#9badb7',
  Read: '#639bff',
  Edit: '#fbf236',
  Write: '#6abe30',
  ToolSearch: '#3f3f74',
  mail_search: '#df7126',
};
const PALETTE = ['#d95763', '#37946e', '#5fcde4', '#8f974a', '#ac3232', '#76428a', '#d77bba', '#eec39a'];

export function colorOf(tool: string): string {
  const known = KNOWN[tool];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < tool.length; i++) hash = (hash * 31 + tool.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
