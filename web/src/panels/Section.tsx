import { useState, type MouseEvent, type ReactNode } from 'react';
import { foldOpen, PAGE, page, setFold } from './fold';

/**
 * The unclogging vocabulary, as components (UI.md, step 1): a section that
 * folds and remembers, a one-line row that expands in place, and a paged
 * list with its "more" row. Every disclosure is a tappable row — nothing
 * here is hover-only, because the horde is also on the phone (D-175).
 */

const store = () => (typeof localStorage === 'undefined' ? null : localStorage);

/**
 * A section header that folds its children. `panel` and `id` name the fold
 * the browser remembers; `defaultOpen` is what a fresh panel shows — true for
 * the section the panel is opened for, false for the rest.
 */
export function Section({
  panel,
  id,
  label,
  count,
  summary,
  defaultOpen = false,
  children,
}: {
  panel: string;
  id: string;
  label: string;
  /** Shown after the label as "· count". */
  count?: ReactNode;
  /** One line at the right edge, read without opening; clipped, never wrapped. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(() => foldOpen(store(), panel, id, defaultOpen));
  const toggle = () => {
    setFold(store(), panel, id, !open);
    setOpen(!open);
  };
  return (
    <>
      <button type="button" className={`fold${open ? ' open' : ''}`} aria-expanded={open} onClick={toggle}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        {label}
        {count !== undefined && <span className="cnt">· {count}</span>}
        {summary !== undefined && <span className="sum">{summary}</span>}
      </button>
      {open && children}
    </>
  );
}

/**
 * A one-line row that expands in place. The row is a div rather than a
 * button because a row carries its own controls — a switch, a link — and a
 * button may not contain another; those controls stop the click from
 * reaching the row. Open state is the row's own and is not remembered.
 */
export function ExpandRow({
  head,
  open: initiallyOpen = false,
  className,
  children,
}: {
  head: ReactNode;
  open?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const toggle = () => setOpen((v) => !v);
  return (
    <>
      <div
        className={`erow${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        onClick={toggle}
      >
        <button
          type="button"
          className="chev"
          aria-expanded={open}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        {head}
      </div>
      {open && <div className="erow-body">{children}</div>}
    </>
  );
}

/** The first page of a list, and a way to show the rest. */
export function usePaged<T>(
  list: readonly T[],
  step = PAGE,
): { rows: T[]; hidden: number; showAll: () => void } {
  const [all, setAll] = useState(false);
  const { rows, hidden } = all ? { rows: [...list], hidden: 0 } : page(list, step);
  return { rows, hidden, showAll: () => setAll(true) };
}

/** The row under a paged list: "8 more legs · show them". Nothing when nothing is hidden. */
export function MoreRow({
  hidden,
  what,
  onShow,
}: {
  hidden: number;
  /** The plural noun for the rows: "legs", "asks", "skills". */
  what: string;
  onShow: () => void;
}) {
  if (hidden === 0) return null;
  return (
    <button type="button" className="more-row" onClick={onShow}>
      {hidden} more {what} · show them
    </button>
  );
}
