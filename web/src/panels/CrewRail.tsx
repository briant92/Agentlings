import { useEffect, useRef } from 'react';
import type { Agentling, JobEvent, LevelProductivity, WorldState } from '@agentlings/shared';
import { renderPortrait } from '../world/sprites';
import { type Activity, crewActivity } from './activity';
import { Productivity } from './Productivity';

/**
 * Who is on the floor and what they are doing, beside the reporting feed.
 *
 * The terminal answers "what happened"; this answers "who is busy" — a
 * question it could only ever be asked by watching sprites walk about and
 * hovering them one at a time. Only agentlings actually in the world appear:
 * the sim materialises the awake ones, so resting crew are absent here by
 * construction rather than by a filter that could drift.
 *
 * Underneath sits the record: what all that activity has cost and produced.
 * That half deliberately does include resting crew — they still spent what
 * they spent, and dropping them would move their money into the unattributed
 * pile the moment they went to sleep.
 */

function Portrait({ agentling }: { agentling: Agentling }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderPortrait(ref.current, 2, agentling.color);
  }, [agentling.color]);
  return <canvas className="rail-face" ref={ref} aria-hidden="true" />;
}

function Row({
  agentling,
  activity,
  lit,
  onSelect,
  onHover,
}: {
  agentling: Agentling;
  activity: Activity;
  lit: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      className={`rail-row${lit ? ' lit' : ''}`}
      onClick={() => onSelect(agentling.id)}
      onMouseEnter={() => onHover(agentling.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(agentling.id)}
      onBlur={() => onHover(null)}
    >
      <Portrait agentling={agentling} />
      <span className="rail-text">
        <span className="rail-name">
          {agentling.name}
          {/* The trade, so a row answers "who IS Moss" without opening the
              panel — recalling six roles by first name was the ask. */}
          <span className="rail-role">{agentling.role}</span>
          <span className={`rail-state ${activity.state}`}>{activity.state}</span>
        </span>
        <span className="rail-doing">
          {activity.title ? `${activity.title} — ` : ''}
          {activity.detail}
        </span>
      </span>
    </button>
  );
}

export function CrewRail({
  world,
  events,
  hoveredId,
  productivity,
  onSelect,
  onHover,
}: {
  world: WorldState | null;
  events: JobEvent[];
  hoveredId: string | null;
  /** The crew's record. Null until the first fetch lands. */
  productivity: LevelProductivity | null;
  onSelect: (agentlingId: string) => void;
  onHover: (agentlingId: string | null) => void;
}) {
  const rows = crewActivity(world, events);
  const busy = rows.filter((r) => r.activity.state !== 'idle').length;

  return (
    <div className="rail">
      <div className="rail-head">
        <span className="t-title">crew</span>
        {rows.length > 0 && (
          <span className="dim rail-count">
            {busy} of {rows.length} busy
          </span>
        )}
      </div>
      <div className="rail-list">
        {rows.length === 0 && <p className="dim rail-empty">Nobody on the floor.</p>}
        {rows.map(({ agentling, activity }) => (
          <Row
            key={agentling.id}
            agentling={agentling}
            activity={activity}
            lit={hoveredId === agentling.id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
      <Productivity data={productivity} onSelect={onSelect} />
    </div>
  );
}
