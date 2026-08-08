import { useState } from 'react';
import type { AudiencePerson } from '@agentlings/shared';

/** DOM rows are bounded; typing narrows. Named in the list, never silent. */
const SHOWN_CAP = 80;

/**
 * The To field with the channel's audience behind it (D-092): focus opens
 * the people this channel can actually reach; picking one writes
 * "Name — id", which is the shape review wants and the arrest accepts
 * (D-091). Typing filters; a pasted id for someone new still works and
 * still meets the shape check. With nobody on the roster it is exactly the
 * plain input it replaced. A contact book can run to hundreds (D-122), so
 * rows are ranked most-used first and capped with an honest remainder; a
 * `problem` — the People API console toggle, a revoked consent — rides the
 * list instead of masquerading as an empty book.
 */
export function RecipientPicker({
  value,
  onChange,
  people,
  problem,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  people: AudiencePerson[];
  problem?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const matches = [...people]
    .sort((a, b) => b.sends - a.sends || a.name.localeCompare(b.name))
    .filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.id.includes(needle) ||
        (p.username ?? '').toLowerCase().includes(needle) ||
        (p.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle)),
    );
  const shown = matches.slice(0, SHOWN_CAP);
  const hidden = matches.length - shown.length;
  if (people.length === 0 && !problem) {
    return (
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <span className="rp">
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (shown.length > 0 || problem) && (
        <span className="rp-list">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rp-row"
              // mousedown beats the input's blur, so the pick always lands
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(`${p.name} — ${p.id}`);
                setOpen(false);
              }}
            >
              <span className="rp-av" aria-hidden="true">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="rp-nm">{p.name}</span>
              <span className="rp-id">{p.id}</span>
              <span className="rp-src">
                {p.viaStart
                  ? 'tapped start'
                  : p.sends > 0
                    ? `sent ${p.sends}`
                    : p.viaContacts
                      ? 'contact'
                      : 'sent 0'}
              </span>
            </button>
          ))}
          {hidden > 0 && (
            <span className="rp-hint">
              {hidden} more — keep typing to narrow
            </span>
          )}
          {problem && <span className="rp-hint rp-problem">{problem}</span>}
          <span className="rp-hint">someone new? paste their id — the shape check still runs</span>
        </span>
      )}
    </span>
  );
}
