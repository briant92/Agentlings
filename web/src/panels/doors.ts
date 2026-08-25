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
 */
export function doorChoices(connections: readonly ConnectionInfo[]): ConnectionInfo[] {
  return connections.filter((c) => c.kind === 'read' && c.enabled && c.ready);
}

/** What the firing will hold, in words: the ticked doors as named, or none. */
export function holdsLine(picked: readonly string[]): string {
  return picked.length === 0 ? 'the firing holds no doors' : `the firing holds ${picked.join(', ')}`;
}
