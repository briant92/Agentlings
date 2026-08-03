import type { LevelProductivity, MemberSpend } from '@agentlings/shared';

/**
 * What the crew has produced and what it cost, under the roll call.
 *
 * The rail above answers "who is busy"; this answers "is any of it working
 * out". Everything here is the server's arithmetic over the ledger — the panel
 * only formats it, so the figures cannot drift from the ones the backoffice
 * shows.
 */

export function money(usd: number): string {
  if (usd === 0) return '$0';
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

function Tile({
  n,
  label,
  sub,
  tone,
}: {
  n: string;
  label: string;
  sub: string;
  tone?: 'money' | 'good';
}) {
  return (
    <div className="p-tile">
      <div className={`p-n${tone ? ` ${tone}` : ''}`}>{n}</div>
      <div className="p-l">{label}</div>
      <div className="p-s">{sub}</div>
    </div>
  );
}

/**
 * One member's lamp.
 *
 * The ratio decides the colour; the ceiling count sits beside it in words
 * rather than in a second colour, because a member can be cheap in dollars and
 * still be capped half the time — that says the quote is too tight for their
 * work, which is a different problem from overspending and should not be
 * wearing the same light.
 */
function Light({ member, onSelect }: { member: MemberSpend; onSelect: (id: string) => void }) {
  const pct = member.ratio === null ? null : Math.round(member.ratio * 100);
  const capped =
    member.priced === 0
      ? 'nothing quoted yet'
      : member.atCeiling === 0
        ? 'never hit the ceiling'
        : `${member.atCeiling} of ${member.priced} hit the ceiling`;
  return (
    <button className="p-row" onClick={() => onSelect(member.id)}>
      <span className="p-lamp" aria-label={`${member.name}: ${member.signal}`}>
        {(['green', 'amber', 'red'] as const).map((tone) => (
          <span
            key={tone}
            className={`p-bulb ${tone[0]}${member.signal === tone ? ' on' : ''}`}
          />
        ))}
      </span>
      <span className="p-who">
        <span className="p-name">{member.name}</span>
        <span className="dim p-sub">
          {money(member.costUsd)} over {member.jobs === 1 ? '1 run' : `${member.jobs} runs`} ·{' '}
          {capped}
        </span>
        <span className="p-bar">
          <i className={member.signal} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
        </span>
      </span>
      <span className="dim p-pct">{pct === null ? '—' : `${pct}%`}</span>
    </button>
  );
}

export function Productivity({
  data,
  onSelect,
}: {
  data: LevelProductivity | null;
  /** Opens that agentling's profile, the same as clicking them in the rail. */
  onSelect: (agentlingId: string) => void;
}) {
  if (!data) {
    return (
      <div className="prod">
        <div className="p-head">
          <span className="t-title">productivity</span>
        </div>
        <p className="dim p-empty">Working out what the crew has cost…</p>
      </div>
    );
  }

  if (data.jobs === 0) {
    return (
      <div className="prod">
        <div className="p-head">
          <span className="t-title">productivity</span>
        </div>
        <p className="dim p-empty">Nothing finished yet. Queue a job and this fills in.</p>
      </div>
    );
  }

  const learnt = data.lessons - data.journal;
  return (
    <div className="prod">
      <div className="p-head">
        <span className="t-title">productivity</span>
        <span className="dim p-when">all time</span>
      </div>

      <div className="p-tiles">
        <Tile
          n={money(data.costUsd)}
          label="spent"
          tone="money"
          sub={
            `${money(data.priceUsd)} billable` +
            // Never folded in as zero: a killed session's spend is real and
            // unknowable, so the total reads "at least this much".
            (data.unmeasured > 0 ? ` · ${data.unmeasured} unmeasured` : '')
          }
        />
        <Tile
          n={String(data.jobs)}
          label="tasks run"
          sub={`${data.delivered} delivered${data.free > 0 ? ` · ${data.free} free` : ''}`}
        />
        <Tile
          n={String(learnt)}
          label={learnt === 1 ? 'lesson' : 'lessons'}
          sub={`from ${data.lessons} memory lines`}
        />
        <Tile
          n={String(data.cheaper)}
          label="got cheaper"
          tone={data.cheaper > 0 ? 'good' : undefined}
          sub={
            data.repeated === 0
              ? 'nothing repeated yet'
              : `of ${data.repeated} repeated${data.nowFree > 0 ? ` · ${data.nowFree} now free` : ''}`
          }
        />
      </div>

      {data.crew.length > 0 && (
        <div className="p-lights">
          <div className="p-lights-h">
            <span>against quote</span>
            <span>spend ÷ quoted</span>
          </div>
          {data.crew.map((member) => (
            <Light key={member.id} member={member} onSelect={onSelect} />
          ))}
        </div>
      )}

      {/* A stated hole rather than a silent one: without this the crew's
          spending simply adds up to less than the level's, which reads as an
          arithmetic fault rather than as work whose author is off the books. */}
      {data.unattributed > 0 && (
        <p className="p-foot">
          {money(data.unattributedUsd)} of it belongs to {data.unattributed} runs whose worker is no
          longer on record.
        </p>
      )}
    </div>
  );
}
