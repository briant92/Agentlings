/**
 * Folded sections and paged lists — the unclogging vocabulary (UI.md, step 1).
 *
 * A panel remembers which of its sections the user left open, per panel and
 * per section, in the browser's localStorage — a hint with the same standing
 * as the merge proposals someone dismissed in the crew panel, never saved
 * state. The section a panel is opened for starts open; the rest start
 * folded. Kept pure so the rule can be pinned without a DOM.
 */

/** The two calls this needs of localStorage, so a test can hand in a map. */
export interface FoldStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function foldKey(panel: string, section: string): string {
  return `agentlings:fold:${panel}:${section}`;
}

/** Whether a section is open: what the user last chose, else the default. */
export function foldOpen(
  store: FoldStore | null,
  panel: string,
  section: string,
  defaultOpen: boolean,
): boolean {
  let saved: string | null = null;
  try {
    saved = store?.getItem(foldKey(panel, section)) ?? null;
  } catch {
    // A store that refuses to read (private mode) is the same as no store.
  }
  if (saved === 'open') return true;
  if (saved === 'closed') return false;
  return defaultOpen;
}

export function setFold(store: FoldStore | null, panel: string, section: string, open: boolean): void {
  try {
    store?.setItem(foldKey(panel, section), open ? 'open' : 'closed');
  } catch {
    // A full or read-only store loses the hint, not the panel.
  }
}

/** How many rows a long list shows before its "more" row. */
export const PAGE = 10;

/** The first `shown` rows of a list, and how many a "more" row would reveal. */
export function page<T>(list: readonly T[], shown: number): { rows: T[]; hidden: number } {
  if (list.length <= shown) return { rows: [...list], hidden: 0 };
  return { rows: list.slice(0, shown), hidden: list.length - shown };
}
