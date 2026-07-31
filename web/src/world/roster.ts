/**
 * Who the world is still drawing that the server has stopped sending.
 *
 * The canvas keeps a sprite, a label and a motion state per agentling id,
 * created lazily the first time that id appears. Nothing removed them, so an
 * agentling that left the crew — merged, retired or let go — kept its sprite
 * parented to the layer at whatever position it last held, until a reload
 * rebuilt the maps from scratch. Reported after a merge: five in the crew
 * list, six standing in the world.
 *
 * Worse than the extra body, the abandoned sprite keeps its `pointerdown`
 * handler bound to a dead id, so clicking it opens a profile for an agentling
 * the server answers `404 unknown agentling` for.
 *
 * Kept out of the canvas module so it can be tested without pulling in Pixi.
 */
export function departedIds(drawn: Iterable<string>, live: readonly { id: string }[]): string[] {
  const present = new Set(live.map((a) => a.id));
  const gone: string[] = [];
  for (const id of drawn) {
    if (!present.has(id)) gone.push(id);
  }
  return gone;
}
