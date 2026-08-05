import { useState } from 'react';
import type { AudiencePerson } from '@agentlings/shared';

/**
 * The To field with the channel's audience behind it (D-092): focus opens
 * the people this channel can actually reach; picking one writes
 * "Name — id", which is the shape review wants and the arrest accepts
 * (D-091). Typing filters; a pasted id for someone new still works and
 * still meets the shape check. With nobody on the roster it is exactly the
 * plain input it replaced.
 */
export function RecipientPicker({
  value,
  onChange,
  people,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  people: AudiencePerson[];
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const shown = people.filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.id.includes(needle) ||
      (p.username ?? '').toLowerCase().includes(needle),
  );
  if (people.length === 0) {
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
      {open && shown.length > 0 && (
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
              <span className="rp-src">{p.viaStart ? 'tapped start' : `sent ${p.sends}`}</span>
            </button>
          ))}
          <span className="rp-hint">someone new? paste their id — the shape check still runs</span>
        </span>
      )}
    </span>
  );
}
