import type { Job } from '@agentlings/shared';

/**
 * The facts strip under a review's title (UI.md, step 3): who, spend against
 * the quote, turns, minutes, tool calls, when — every figure already on the
 * job and its meter, said once in one line instead of being found in three
 * places or not at all.
 *
 * The turns segment is the one with a rule in it. A cut says "cut at turn
 * 41 of 40"; a run that ended on its own says "44 turns" and never "44 of
 * 40", because the leash does not always bind (D-212) and a finished run at
 * 51/40 is not a cut (D-022). The cut is read off `outOfTurns` alone.
 */

/** One segment: an optional word before, the figure, an optional word after. */
export interface Fact {
  pre?: string;
  value: string;
  post?: string;
}

const usd = (n: number): string => `$${n.toFixed(2)}`;

function minutes(ms: number): string {
  const mins = Math.round(ms / 60000);
  return mins < 1 ? '<1 min' : `${mins} min`;
}

function when(at: number): string {
  const d = new Date(at);
  return `${d.toDateString().slice(4, 10)} ${d.toTimeString().slice(0, 5)}`;
}

export function factsOf(job: Job, who?: { name: string; role?: string } | null): Fact[] {
  const facts: Fact[] = [];
  const meter = job.meter;
  if (who) facts.push({ value: who.name, post: who.role ? `· ${who.role}` : undefined });
  if (meter?.routed) {
    facts.push({ value: 'answered without a session' });
  } else if (meter?.costUnknown) {
    facts.push({ value: 'cost unknown', post: '— the run was stopped before it could be measured' });
  } else if (typeof meter?.costUsd === 'number' && meter.costUsd > 0) {
    facts.push({
      value: usd(meter.costUsd),
      post: typeof job.quotedUsd === 'number' ? `of ${usd(job.quotedUsd)} quoted` : 'spent',
    });
  }
  if (meter?.outOfTurns) {
    const turns =
      typeof meter.turns === 'number' && typeof meter.turnsAllowed === 'number'
        ? `${meter.turns} of ${meter.turnsAllowed}`
        : null;
    facts.push(turns ? { pre: 'cut at turn', value: turns } : { value: 'cut at the turn ceiling' });
  } else if (meter?.timedOut) {
    facts.push({ value: 'cut by the clock' });
  } else if (typeof meter?.turns === 'number' && !meter.routed) {
    facts.push({ value: String(meter.turns), post: meter.turns === 1 ? 'turn' : 'turns' });
  }
  if (typeof meter?.durationMs === 'number' && meter.durationMs > 0) {
    facts.push({ value: minutes(meter.durationMs) });
  }
  if (typeof meter?.toolCalls === 'number') {
    const tools = meter.toolsUsed?.length ? ` · ${meter.toolsUsed.join(', ')}` : '';
    facts.push({
      value: String(meter.toolCalls),
      post: `${meter.toolCalls === 1 ? 'tool call' : 'tool calls'}${tools}`,
    });
  }
  if (job.finishedAt) facts.push({ value: when(job.finishedAt) });
  return facts;
}

/**
 * The reply box, started from what the run said was left: the pending items
 * as one line the next leg can work down — one line because the box is a
 * single-line input, and a reply is read by a model, not typeset. Nothing is
 * invented: a run with no account of what is left gets nothing.
 */
export function replyFromPending(pending: { state: string; items: string[] } | undefined): string {
  if (!pending || pending.items.length === 0) return '';
  return `Pick up from what is left: ${pending.items.join('; ')}.`;
}
