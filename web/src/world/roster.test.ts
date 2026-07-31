import { describe, expect, it } from 'vitest';
import { departedIds } from './roster';

describe('departedIds', () => {
  const live = (...ids: string[]) => ids.map((id) => ({ id }));

  // The reported bug: two agentlings merged, the crew list showed five and the
  // world still showed six. The server never disagreed — the canvas was
  // drawing a sprite it had been told nothing about since the merge.
  it('names the agentling that left', () => {
    expect(departedIds(['a1', 'a3', 'a5'], live('a1', 'a3'))).toEqual(['a5']);
  });

  it('says nothing when the world already matches the crew', () => {
    expect(departedIds(['a1', 'a3'], live('a1', 'a3'))).toEqual([]);
  });

  // A merge removes one of a pair, a "let go" can remove several at once.
  it('handles more than one leaving at a time', () => {
    expect(departedIds(['a1', 'a2', 'a3'], live('a2'))).toEqual(['a1', 'a3']);
  });

  // Order is the drawn order, so a caller deleting as it goes is predictable.
  it('reports them in the order the world holds them', () => {
    expect(departedIds(['c', 'b', 'a'], live())).toEqual(['c', 'b', 'a']);
  });

  // A newly hired agentling has no sprite yet — that is the lazy-create path,
  // not a departure, and it must not be reported as one.
  it('is not confused by an arrival it has not drawn yet', () => {
    expect(departedIds(['a1'], live('a1', 'a9'))).toEqual([]);
  });

  it('clears the world when the whole crew is gone', () => {
    expect(departedIds(['a1', 'a2'], live())).toEqual(['a1', 'a2']);
  });
});
