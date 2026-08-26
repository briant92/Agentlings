import type { ConnectionInfo } from '@agentlings/shared';

/**
 * The door chips a schedule or mail rule shows while it is being created
 * (D-254). A rule's firing holds exactly the doors the row names — none by
 * default — so the chips start unticked, and the reading beside them says
 * what the firing will hold, in the same words the row's own label uses.
 *
 * Pure, and kept apart from the panel for the trigger line's reason: the
 * reading is the whole point of the control. A firing that holds nothing must
 * say so where the rule is armed, not at 08:10 in a job that could not reach
 * the mailbox it was told to read.
 */

/**
 * Which connections may be ticked: enabled, ready and non-sending — the same
 * population `grantedTools` narrows a request to, so a chip is never a door
 * the firing could not actually hold. A sending channel is not a door: it
 * rides on the row as its channel (D-097), and the server refuses it by name.
 * A supervised door (D-255) is never a chip either: a firing has nobody at
 * the window, and the server refuses a rule naming it by name.
 */
export function doorChoices(connections: readonly ConnectionInfo[]): ConnectionInfo[] {
  return connections.filter((c) => c.kind === 'read' && c.enabled && c.ready && !c.supervised);
}

/**
 * The supervised doors a hand-queued job may ask to hold (D-255): on and
 * ready, and never in the default grant — a job holds one only by naming it,
 * which is what the work bar's "watch" choice does. Empty when none is on,
 * so the choice is not offered at all.
 */
export function watchChoices(connections: readonly ConnectionInfo[]): ConnectionInfo[] {
  return connections.filter((c) => c.kind === 'read' && c.enabled && c.ready && c.supervised === true);
}

/**
 * The list Start posts when the person ticked "watch": every door the job
 * would have held anyway, plus the supervised ones — a list is exactly
 * those, so naming the one door must not silently drop the others.
 */
export function watchedTools(connections: readonly ConnectionInfo[]): string[] {
  return [...doorChoices(connections), ...watchChoices(connections)].map((c) => c.name);
}

/** What the firing will hold, in words: the ticked doors as named, or none. */
export function holdsLine(picked: readonly string[]): string {
  return picked.length === 0 ? 'the firing holds no doors' : `the firing holds ${picked.join(', ')}`;
}
