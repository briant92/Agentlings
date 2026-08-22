import { useState } from 'react';
import type { TrajectoryLine } from '@agentlings/shared';
import { callsOf, captions, colorOf, legendOf, type Call } from './strip';

/**
 * Where the turns went (UI.md, step 17): one block per tool call in the order
 * the session made them, coloured by tool, a failed call ringed; the legend
 * with each tool's count beneath, and the captions that read the shape —
 * the longest run of one tool, the failed call and whether it was retried.
 *
 * A tap names the call, because the title a hover shows is no use on the
 * phone (D-175). Session pass only; the counts are calls, not turns.
 */
export function TurnsStrip({ lines }: { lines: readonly TrajectoryLine[] }) {
  const calls = callsOf(lines);
  const [picked, setPicked] = useState<Call | null>(null);
  if (calls.length === 0) return <p className="dim">The trail holds no tool calls.</p>;
  const legend = legendOf(calls);
  const notes = captions(calls);
  return (
    <>
      <div className="turns" role="list" aria-label="Tool calls, in order">
        {calls.map((call) => (
          <button
            key={call.n}
            type="button"
            role="listitem"
            className={`${call.ok ? '' : 'fail'}${picked?.n === call.n ? ' picked' : ''}`}
            style={{ background: colorOf(call.tool) }}
            title={`call ${call.n} · ${call.tool}${call.ok ? '' : ' · failed'}`}
            aria-label={`call ${call.n}, ${call.tool}${call.ok ? '' : ', failed'}`}
            onClick={() => setPicked(picked?.n === call.n ? null : call)}
          />
        ))}
      </div>
      <div className="turns-legend">
        {legend.map((entry) => (
          <span key={entry.tool}>
            <i style={{ background: entry.color }} />
            {entry.tool} {entry.n}
          </span>
        ))}
        {notes.length > 0 && <span className="turns-cap">{notes.join(' · ')}</span>}
      </div>
      {picked && (
        <p className="turns-pick">
          call {picked.n} · {picked.tool}
          {picked.turn !== undefined ? ` · turn ${picked.turn}` : ''}
          {picked.ok ? '' : ' · failed'}
        </p>
      )}
      <p className="dim turns-note">
        one block per call, in order · session pass only · tap a block for the call
      </p>
    </>
  );
}
