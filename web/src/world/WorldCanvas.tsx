import { Application, Container, Graphics, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { WorldState } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, STATION_BASE_X, STATION_SPACING, WORLD_WIDTH } from '@agentlings/shared';

const VIEW_H = 320;
const GROUND_Y = 258;

// Palette in homage to the classic cave/pillar tilesets: navy void, ochre
// rock, gold columns, grass greens, torch oranges, blue-robed critters.
const ROCK = 0x9a5a22;
const ROCK_LIGHT = 0xc8842e;
const ROCK_DARK = 0x6e3a12;
const ROCK_EDGE = 0x46220a;
const GOLD = 0xc8a000;
const GOLD_LIGHT = 0xe8cc50;
const GRASS = 0x00a800;
const GRASS_DARK = 0x006e00;
const WOOD = 0x8a5a28;
const WOOD_DARK = 0x5a3a18;
const STONE_DARK = 0x4a2f14;
const VOID = 0x0e1038;
const FLAME = 0xffa030;
const FLAME_CORE = 0xffd050;
const HAIR = 0x35c435;
const SKIN = 0xf0e0d0;
const ROBE = 0x4650ff;
const PARCEL = 0xd8b830;

/** Deterministic PRNG so the rock texture doesn't reshuffle between mounts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(
  g: Graphics,
  rng: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
): void {
  for (let n = 0; n < count; n++) {
    const sx = x + rng() * w;
    const sy = y + rng() * h;
    const size = 2 + rng() * 4;
    const color = rng() < 0.5 ? ROCK_LIGHT : ROCK_DARK;
    g.rect(sx, sy, size, Math.max(2, size * 0.6)).fill({ color, alpha: 0.55 });
  }
}

function drawScenery(g: Graphics): void {
  const rng = mulberry32(0xa9e27);

  // Distant gold pillars, muted so the foreground reads.
  for (const px of [310, 490, 670]) {
    g.rect(px - 23, 106, 46, 14).fill({ color: GOLD, alpha: 0.4 });
    g.rect(px - 17, 120, 34, GROUND_Y - 120).fill({ color: GOLD, alpha: 0.36 });
    g.rect(px - 10, 120, 8, GROUND_Y - 120).fill({ color: GOLD_LIGHT, alpha: 0.34 });
  }

  // Ceiling: rock mass with a jagged underside (flattened above the hatch).
  const edge: [number, number][] = [];
  for (let x = 0; x <= WORLD_WIDTH; x += 60) {
    const flat = Math.abs(x - SPAWN_X) < 50;
    edge.push([x, flat ? 62 : 50 + rng() * 34]);
  }
  const ceiling: number[] = [0, 0, WORLD_WIDTH, 0];
  for (let i = edge.length - 1; i >= 0; i--) ceiling.push(edge[i][0], edge[i][1]);
  g.poly(ceiling).fill(ROCK);
  speckle(g, rng, 0, 0, WORLD_WIDTH, 42, 120);
  g.moveTo(edge[0][0], edge[0][1]);
  for (const [ex, ey] of edge) g.lineTo(ex, ey);
  g.stroke({ width: 3, color: ROCK_EDGE });

  // Hanging moss strands.
  for (const [ex, ey] of edge) {
    if (rng() < 0.4 || Math.abs(ex - SPAWN_X) < 60 || Math.abs(ex - EXIT_X) < 40) continue;
    const len = 12 + rng() * 22;
    g.rect(ex - 1, ey, 2, len).fill({ color: GRASS_DARK, alpha: 0.9 });
    g.rect(ex - 1, ey, 2, len * 0.45).fill({ color: GRASS, alpha: 0.9 });
  }

  // Side walls.
  g.rect(0, 0, 22, VIEW_H).fill(ROCK);
  g.rect(WORLD_WIDTH - 26, 0, 26, VIEW_H).fill(ROCK);
  speckle(g, rng, 0, 60, 20, VIEW_H - 60, 26);
  speckle(g, rng, WORLD_WIDTH - 24, 60, 22, VIEW_H - 60, 26);

  // Floor slab with a grass fringe on the walkable surface.
  g.rect(0, GROUND_Y + 2, WORLD_WIDTH, VIEW_H - GROUND_Y - 2).fill(ROCK);
  speckle(g, rng, 0, GROUND_Y + 8, WORLD_WIDTH, VIEW_H - GROUND_Y - 10, 110);
  g.rect(0, GROUND_Y - 3, WORLD_WIDTH, 6).fill(GRASS);
  g.rect(0, GROUND_Y + 3, WORLD_WIDTH, 3).fill(GRASS_DARK);
  for (let n = 0; n < 60; n++) {
    const bx = 24 + rng() * (WORLD_WIDTH - 52);
    g.rect(bx, GROUND_Y - 6, 1.5, 4).fill({ color: GRASS, alpha: 0.9 });
  }

  // Entrance hatch hanging under the ceiling above the spawn burrow.
  g.poly([SPAWN_X - 18, 64, SPAWN_X - 36, 46, SPAWN_X - 30, 41, SPAWN_X - 12, 59]).fill(WOOD);
  g.rect(SPAWN_X - 18, 62, 36, 14).fill(WOOD);
  g.rect(SPAWN_X - 18, 62, 36, 3).fill(WOOD_DARK);
  g.rect(SPAWN_X - 13, 67, 26, 7).fill(VOID);

  // Exit: stone arch with a dark doorway (torch flames are animated).
  g.rect(EXIT_X - 18, GROUND_Y - 40, 36, 40).fill(STONE_DARK);
  g.circle(EXIT_X, GROUND_Y - 38, 18).fill(STONE_DARK);
  g.rect(EXIT_X - 10, GROUND_Y - 32, 20, 32).fill(VOID);
  g.circle(EXIT_X, GROUND_Y - 32, 10).fill(VOID);
  for (const tx of [EXIT_X - 27, EXIT_X + 27]) {
    g.rect(tx - 2, GROUND_Y - 26, 4, 26).fill(WOOD_DARK);
    g.rect(tx - 4, GROUND_Y - 29, 8, 4).fill(STONE_DARK);
  }
}

interface Motion {
  x: number;
  face: number;
}

/**
 * Renders the side-view world. Pure presentation: positions and states come
 * from the server sim at 10 Hz; the client lerps toward the latest snapshot
 * so movement stays smooth at render rate.
 */
export function WorldCanvas({ world }: { world: WorldState | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  worldRef.current = world;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    const app = new Application();
    const labels = new Map<string, Text>();
    const motion = new Map<string, Motion>();

    app
      .init({ width: WORLD_WIDTH, height: VIEW_H, background: VOID, antialias: true })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);

        const scenery = new Graphics();
        drawScenery(scenery);
        app.stage.addChild(scenery);

        const dynamic = new Graphics();
        app.stage.addChild(dynamic);
        const labelLayer = new Container();
        app.stage.addChild(labelLayer);

        app.ticker.add((ticker) => {
          const w = worldRef.current;
          dynamic.clear();
          if (!w) return;
          const t = performance.now() / 1000;

          // Torch flames flanking the exit.
          for (const [k, tx] of [EXIT_X - 27, EXIT_X + 27].entries()) {
            const lick = Math.sin(t * 9 + k * 2.1) * 2.5;
            const top = GROUND_Y - 40 - Math.abs(Math.sin(t * 7 + k)) * 3;
            dynamic
              .poly([tx - 4, GROUND_Y - 29, tx + 4, GROUND_Y - 29, tx + lick, top])
              .fill(FLAME);
            dynamic
              .poly([tx - 2, GROUND_Y - 29, tx + 2, GROUND_Y - 29, tx + lick * 0.6, top + 5])
              .fill(FLAME_CORE);
          }

          // Work stations: wooden signposts with a status pennant.
          for (const job of w.jobs) {
            if (job.slot < 0 || (job.status !== 'queued' && job.status !== 'running')) continue;
            const x = STATION_BASE_X + job.slot * STATION_SPACING;
            dynamic.rect(x - 1.5, GROUND_Y - 30, 3, 30).fill(WOOD_DARK);
            dynamic.rect(x - 11, GROUND_Y - 40, 22, 11).fill(WOOD);
            dynamic.rect(x - 11, GROUND_Y - 40, 22, 2).fill(WOOD_DARK);
            const wave = Math.sin(t * 6 + job.slot) * 1.5;
            dynamic
              .poly([x - 1, GROUND_Y - 52, x - 1, GROUND_Y - 41, x + 13 + wave, GROUND_Y - 46.5])
              .fill(job.status === 'running' ? FLAME : GRASS);
          }

          // Agentlings, Lemmings-style: green mop, pale face, blue robe.
          const alpha = 1 - Math.exp(-ticker.deltaMS / 90);
          for (const [i, a] of w.agentlings.entries()) {
            let m = motion.get(a.id);
            if (!m) {
              m = { x: a.x, face: 1 };
              motion.set(a.id, m);
            }
            const dx = a.x - m.x;
            if (Math.abs(dx) > 150) m.x = a.x; // teleport guard
            else m.x += dx * alpha;
            if (Math.abs(dx) > 0.6) m.face = Math.sign(dx);

            const rx = m.x;
            const f = m.face;
            const moving = a.state === 'walking' || a.state === 'delivering';
            const bob =
              a.state === 'working'
                ? Math.abs(Math.sin(t * 10 + i)) * 2
                : moving
                  ? Math.abs(Math.sin(t * 14 + i)) * 1.5
                  : 0;
            const by = GROUND_Y - bob;

            // Feet shuffle when moving.
            const step = moving ? Math.sin(t * 12 + i * 2) * 3 : 2;
            dynamic.rect(rx + f * step - 1.5, GROUND_Y - 4, 3, 4).fill(0x202030);
            dynamic.rect(rx - f * step - 1.5, GROUND_Y - 4, 3, 4).fill(0x202030);

            // Robe, face, hair mop, eye.
            dynamic.roundRect(rx - 5, by - 16, 10, 13, 2).fill(ROBE);
            dynamic.circle(rx + f * 1.5, by - 18, 4.2).fill(SKIN);
            dynamic.circle(rx - f * 0.5, by - 22, 4.6).fill(HAIR);
            dynamic.circle(rx + f * 2.5, by - 21, 3).fill(HAIR);
            dynamic.circle(rx - f * 3.5, by - 20.5, 3).fill(HAIR);
            dynamic.circle(rx + f * 3.2, by - 18.6, 1).fill(0x202030);

            if (a.state === 'working') {
              // One busy arm, swinging at the station.
              const swing = Math.sin(t * 12 + i) * 4;
              dynamic
                .moveTo(rx + f * 4, by - 12)
                .lineTo(rx + f * 9, by - 8 + swing)
                .stroke({ width: 2, color: SKIN });
            }
            if (a.state === 'delivering') {
              // Both arms up, carrying the result overhead.
              dynamic.rect(rx - 5, by - 32, 10, 6).fill(PARCEL);
              dynamic.rect(rx - 5, by - 32, 10, 1.5).fill({ color: WOOD_DARK, alpha: 0.6 });
              dynamic
                .moveTo(rx - 4, by - 14)
                .lineTo(rx - 4, by - 26)
                .moveTo(rx + 4, by - 14)
                .lineTo(rx + 4, by - 26)
                .stroke({ width: 2, color: SKIN });
            }

            let label = labels.get(a.id);
            if (!label) {
              label = new Text({
                text: a.name,
                style: { fill: a.color, fontSize: 9, fontFamily: 'monospace' },
              });
              label.anchor.set(0.5);
              label.alpha = 0.85;
              labelLayer.addChild(label);
              labels.set(a.id, label);
            }
            label.position.set(rx, by - (a.state === 'delivering' ? 40 : 32));
          }
        });
      });

    return () => {
      destroyed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);

  return <div className="world" ref={hostRef} />;
}
