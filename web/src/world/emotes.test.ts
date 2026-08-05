import type { Agentling, Job, WorldState } from '@agentlings/shared';
import { describe, expect, it } from 'vitest';
import type { AmbientSurface } from './ambience';
import { createEmotes } from './emotes';
import { DB } from './palette';

const HEAD_Y = 220;

interface Fill {
  x: number;
  y: number;
  color: number;
  alpha?: number;
}

/** Records what the emotes draw, so they can be tested without a canvas. */
function recorder(): { surface: AmbientSurface; drawn: Fill[] } {
  const drawn: Fill[] = [];
  const catcher = (x: number, y: number) => ({
    fill: (style: number | { color: number; alpha?: number }) => {
      const color = typeof style === 'number' ? style : style.color;
      const alpha = typeof style === 'number' ? undefined : style.alpha;
      drawn.push({ x, y, color, alpha });
      return undefined;
    },
  });
  const surface: AmbientSurface = {
    rect: (x, y) => catcher(x, y),
    poly: (points) => catcher(points[0], points[1]),
  };
  return { surface, drawn };
}

function crew(id: string, state: Agentling['state']): Agentling {
  return {
    id,
    name: id,
    color: DB.sky,
    state,
    x: 500,
    targetX: 500,
    role: 'worker',
    jobsDone: 0,
    jobsFailed: 0,
  };
}

function job(id: string, status: Job['status'], assignedTo?: string): Job {
  return {
    id,
    title: id,
    prompt: 'p',
    status,
    slot: 0,
    createdAt: 0,
    assignedTo,
  };
}

function world(agentlings: Agentling[], jobs: Job[]): WorldState {
  return { tick: 0, agentlings, jobs };
}

const xAt = (x: number) => () => x;

describe('the ! bubble', () => {
  it('pops the moment a running job lands for review, on its own crew', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const a = crew('pip', 'delivering');

    emotes.tick(surface, world([a], [job('j1', 'running', 'pip')]), xAt(500), 0.016, 1);
    expect(drawn.filter((d) => d.color === DB.white).length).toBe(0);

    emotes.tick(surface, world([a], [job('j1', 'done', 'pip')]), xAt(500), 0.016, 2);
    expect(drawn.some((d) => d.color === DB.white)).toBe(true);
    expect(drawn.some((d) => d.color === DB.ink)).toBe(true);
  });

  it('follows the walker between frames', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const a = crew('pip', 'walking');
    emotes.tick(surface, world([a], [job('j1', 'running', 'pip')]), xAt(500), 0.016, 1);
    emotes.tick(surface, world([a], [job('j1', 'partial', 'pip')]), xAt(500), 0.016, 2);
    const firstX = Math.min(...drawn.map((d) => d.x));
    drawn.length = 0;
    emotes.tick(surface, world([a], [job('j1', 'partial', 'pip')]), xAt(540), 0.016, 2.5);
    expect(Math.min(...drawn.map((d) => d.x))).toBe(firstX + 40);
  });

  it('never pops for history it did not watch flip', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    // Walking, so an honest zZz cannot muddy the count.
    const a = crew('pip', 'walking');
    // First sight of an already-done job: a record, not a moment.
    emotes.tick(surface, world([a], [job('j1', 'done', 'pip')]), xAt(500), 0.016, 1);
    expect(drawn.filter((d) => d.color === DB.white || d.color === DB.ink).length).toBe(0);
  });
});

describe('the failure puff', () => {
  it('puffs grey and rose when a running job fails', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const a = crew('pip', 'idle');
    emotes.tick(surface, world([a], [job('j1', 'running', 'pip')]), xAt(500), 0.016, 1);
    emotes.tick(surface, world([a], [job('j1', 'failed', 'pip')]), xAt(500), 0.016, 2);
    expect(drawn.some((d) => d.color === DB.greyDeep)).toBe(true);
    expect(drawn.some((d) => d.color === DB.rose)).toBe(true);
  });
});

describe('zZz', () => {
  it('snores only when the board is truly empty', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const a = crew('pip', 'idle');

    // A queued job anywhere keeps everyone awake.
    for (let t = 0; t < 4; t += 0.2) {
      emotes.tick(surface, world([a], [job('j1', 'queued')]), xAt(500), 0.2, t);
    }
    expect(drawn.length).toBe(0);

    // An empty board: some frame within one cycle shows a white z.
    for (let t = 0; t < 4; t += 0.2) {
      emotes.tick(surface, world([a], []), xAt(500), 0.2, t);
    }
    expect(drawn.some((d) => d.color === DB.white)).toBe(true);
  });
});

describe('sweat', () => {
  it('beads off a working agentling, in water blue', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const a = crew('pip', 'working');
    for (let t = 0; t < 3; t += 0.1) {
      emotes.tick(surface, world([a], [job('j1', 'running', 'pip')]), xAt(500), 0.1, t);
    }
    const beads = drawn.filter((d) => d.color === DB.paleBlue);
    expect(beads.length).toBeGreaterThan(0);
    // Beads arc near the sprite, not across the level.
    for (const b of beads) {
      expect(Math.abs(b.x - 500)).toBeLessThan(40);
      expect(b.y).toBeGreaterThan(HEAD_Y - 10);
    }
  });

  it('stops the tap the moment the work does', () => {
    const emotes = createEmotes({ headY: HEAD_Y, rng: () => 0.5 });
    const { surface, drawn } = recorder();
    const working = crew('pip', 'working');
    for (let t = 0; t < 2; t += 0.1) {
      emotes.tick(surface, world([working], [job('j1', 'running', 'pip')]), xAt(500), 0.1, t);
    }
    // Let the last beads die, then watch an idle stretch with a busy board
    // (busy, so no zZz muddies the count).
    const idle = crew('pip', 'idle');
    for (let t = 2; t < 3; t += 0.1) {
      emotes.tick(surface, world([idle], [job('j2', 'queued')]), xAt(500), 0.1, t);
    }
    drawn.length = 0;
    for (let t = 3; t < 5; t += 0.1) {
      emotes.tick(surface, world([idle], [job('j2', 'queued')]), xAt(500), 0.1, t);
    }
    expect(drawn.length).toBe(0);
  });
});
