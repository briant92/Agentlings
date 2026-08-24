import { existsSync, readFileSync } from 'node:fs';
import type { Connection } from './connections';

/**
 * Starting points for the add-a-connection form (D-245) — **not** connections.
 *
 * The distinction is the whole design. A suggestion carries the *shape* a
 * vendor documents: the command or the URL, and which keys it wants. It does
 * not carry tools, because tools come from the server (D-244), and it does not
 * become anything until the user's own probe reaches that server and it
 * answers. **We ship the shape; the server supplies the truth.**
 *
 * That is what keeps this on the right side of D-229's line. Shipping these as
 * ready-made *connections* would be vouching for servers this machine has
 * never authenticated to — every one of them needs a credential only the user
 * has. A suggestion claims nothing except "this is what their documentation
 * says", and says where it read it.
 */
export interface Suggestion {
  name: string;
  label: string;
  description?: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  secrets?: Record<string, string>;
  /** The vendor's own page, so the user can check what we say against it. */
  docs?: string;
  /** Where this shape was read, and when. */
  source?: string;
}

export function readSuggestions(file: string): Suggestion[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { suggestions?: Suggestion[] };
    return (parsed.suggestions ?? []).filter(
      (s) =>
        s &&
        s.name &&
        s.label &&
        (s.transport === 'stdio' || s.transport === 'http') &&
        // A shape that cannot be dialled is not a starting point, it is a
        // typo waiting to be pasted into somebody's form.
        (s.transport === 'stdio' ? Boolean(s.command) : Boolean(s.url)),
    );
  } catch {
    return [];
  }
}

/**
 * The ones worth offering: those not already installed.
 *
 * A suggestion whose name is taken would fail validation the moment it was
 * submitted, so offering it is offering a dead end. Matched by name because
 * that is what the collision rule matches on.
 */
export function offerable(suggestions: Suggestion[], installed: Connection[]): Suggestion[] {
  const taken = new Set(installed.map((c) => c.name));
  return suggestions.filter((s) => !taken.has(s.name));
}
