import type { JobStatus, WorldState } from '@agentlings/shared';
import { outcomeOf } from '@agentlings/shared';
import type { AmbientSurface } from './ambience';
import { DB } from './palette';

/**
 * Crew emotes: state made legible from the world itself, never decoration.
 *
 * Four signals, each tied to a real fact — zZz only when an agentling is idle
 * and the board holds nothing queued or running; sweat while working; a `!`
 * bubble the moment a job they ran lands for review; a puff with a cross when
 * it fails. Transitions are read from job status flips, attributed through
 * `assignedTo`, and classified with the shared outcome map rather than a
 * local re-listing of statuses.
 */

export interface Emotes {
  /** Reads the frame's world and draws every active emote. */
  tick(
    g: AmbientSurface,
    world: WorldState,
    /** Smoothed on-screen x per agentling — undefined once they departed. */
    xOf: (id: string) => number | undefined,
    dt: number,
    t: number,
  ): void;
}

interface Pop {
  agentlingId: string;
  kind: 'landed' | 'failed';
  born: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
}

const POP_SECONDS: Record<Pop['kind'], number> = { landed: 1.7, failed: 2.1 };

/** A stable 0..cycle offset per crew id, so the snores never synchronise. */
function phaseOf(id: string, cycle: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 1000) / 1000 * cycle;
}

/** A pixel z, drawn in units of 2 to match the sprites' chunkiness. */
function zee(g: AmbientSurface, x: number, y: number, units: number, alpha: number): void {
  g.rect(x, y, units * 2, 2).fill({ color: DB.white, alpha });
  for (let i = 1; i < units - 1; i++) {
    g.rect(x + (units - 1 - i) * 2, y + i * 2, 2, 2).fill({ color: DB.white, alpha });
  }
  g.rect(x, y + (units - 1) * 2, units * 2, 2).fill({ color: DB.white, alpha });
}

/** The `!` speech bubble, tail pointing down-left at its speaker. */
function bubble(g: AmbientSurface, x: number, y: number, alpha: number): void {
  g.rect(x, y, 16, 12).fill({ color: DB.white, alpha });
  g.rect(x + 2, y - 2, 12, 2).fill({ color: DB.white, alpha });
  g.rect(x + 2, y + 12, 4, 2).fill({ color: DB.white, alpha });
  g.rect(x + 2, y + 14, 2, 2).fill({ color: DB.white, alpha });
  g.rect(x + 7, y + 2, 2, 6).fill({ color: DB.ink, alpha });
  g.rect(x + 7, y + 9, 2, 2).fill({ color: DB.ink, alpha });
}

/** The failure puff: a small grey cloud with a rose cross. */
function puff(g: AmbientSurface, x: number, y: number, alpha: number): void {
  g.rect(x, y, 20, 8).fill({ color: DB.greyDeep, alpha: alpha * 0.9 });
  g.rect(x + 3, y - 2, 14, 2).fill({ color: DB.greyDeep, alpha: alpha * 0.9 });
  g.rect(x - 2, y + 2, 2, 4).fill({ color: DB.greyDeep, alpha: alpha * 0.7 });
  g.rect(x + 20, y + 2, 2, 4).fill({ color: DB.greyDeep, alpha: alpha * 0.7 });
  g.rect(x + 6, y + 1, 2, 2).fill({ color: DB.rose, alpha });
  g.rect(x + 10, y + 1, 2, 2).fill({ color: DB.rose, alpha });
  g.rect(x + 8, y + 3, 2, 2).fill({ color: DB.rose, alpha });
  g.rect(x + 6, y + 5, 2, 2).fill({ color: DB.rose, alpha });
  g.rect(x + 10, y + 5, 2, 2).fill({ color: DB.rose, alpha });
}

export function createEmotes(opts: { headY: number; rng?: () => number }): Emotes {
  const { headY } = opts;
  const rng = opts.rng ?? Math.random;
  const prevStatus = new Map<string, JobStatus>();
  const pops: Pop[] = [];
  const nextSweat = new Map<string, number>();
  const drops: Drop[] = [];

  return {
    tick(g, world, xOf, dt, t) {
      // Job flips first: the pop is the moment, not the standing state.
      for (const job of world.jobs) {
        const prev = prevStatus.get(job.id);
        prevStatus.set(job.id, job.status);
        if (prev !== 'running' || !job.assignedTo) continue;
        const kind: Pop['kind'] | null =
          outcomeOf(job.status) === 'to review'
            ? 'landed'
            : job.status === 'failed'
              ? 'failed'
              : null;
        if (!kind) continue;
        const already = pops.some((p) => p.agentlingId === job.assignedTo && p.kind === kind);
        if (!already && pops.length < 8) {
          pops.push({ agentlingId: job.assignedTo, kind, born: t });
        }
      }
      if (prevStatus.size > world.jobs.length) {
        const alive = new Set(world.jobs.map((j) => j.id));
        for (const id of prevStatus.keys()) if (!alive.has(id)) prevStatus.delete(id);
      }

      const busy = world.jobs.some((j) => j.status === 'queued' || j.status === 'running');

      for (const a of world.agentlings) {
        const x = xOf(a.id);
        if (x === undefined) continue;

        // Sweat: a bead arcs off every couple of seconds while working.
        if (a.state === 'working') {
          const due = nextSweat.get(a.id);
          if (due === undefined) {
            nextSweat.set(a.id, t + rng() * 2);
          } else if (t >= due) {
            const side = rng() < 0.5 ? -1 : 1;
            drops.push({
              x: x + side * 5,
              y: headY + 8,
              vx: side * (22 + rng() * 10),
              vy: -48,
              life: 0,
              ttl: 0.55,
            });
            nextSweat.set(a.id, t + 1.8 + rng() * 1.4);
          }
        } else {
          nextSweat.delete(a.id);
        }

        // zZz only when there is genuinely nothing to pick up.
        if (a.state === 'idle' && !busy) {
          const cycle = 3.4;
          const c = (t + phaseOf(a.id, cycle)) % cycle;
          if (c < 1.7) {
            const e = c / 1.7;
            const alpha = 1 - e;
            zee(g, Math.round(x + 8 + e * 8), Math.round(headY - 8 - e * 14), 3, alpha);
            if (e > 0.35) {
              zee(g, Math.round(x + 14 + e * 8), Math.round(headY - 18 - e * 14), 4, alpha * 0.8);
            }
          }
        }
      }

      // Sweat beads: integrate, retire, draw.
      for (let i = drops.length - 1; i >= 0; i--) {
        const p = drops[i];
        p.life += dt;
        if (p.life >= p.ttl) {
          drops.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
        g.rect(Math.round(p.x), Math.round(p.y), 2, 4).fill({
          color: DB.paleBlue,
          alpha: 1 - p.life / p.ttl,
        });
      }

      // Pops ride along with their agentling and fade out at the end.
      for (let i = pops.length - 1; i >= 0; i--) {
        const pop = pops[i];
        const age = t - pop.born;
        const x = xOf(pop.agentlingId);
        const duration = POP_SECONDS[pop.kind];
        if (age >= duration || x === undefined) {
          pops.splice(i, 1);
          continue;
        }
        const alpha = age > duration - 0.4 ? (duration - age) / 0.4 : 1;
        if (pop.kind === 'landed') bubble(g, Math.round(x) + 7, headY - 22, alpha);
        else puff(g, Math.round(x) - 4, headY - 16, alpha);
      }
    },
  };
}
