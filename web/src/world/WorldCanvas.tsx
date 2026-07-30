import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { ThemeKey, WorldState } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, STATION_BASE_X, STATION_SPACING, WORLD_WIDTH } from '@agentlings/shared';
import { DB } from './palette';
import { buildAgentTextures, SPRITE_SCALE, type AgentAnim } from './sprites';
import { THEMES, type Theme } from './themes';

const VIEW_H = 320;
const GROUND_Y = 258;
const MAX_PARTICLES = 400;

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
  T: Theme,
  rng: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
): void {
  for (let n = 0; n < count; n++) {
    const sx = Math.floor(x + rng() * w);
    const sy = Math.floor(y + rng() * h);
    const size = 2 + Math.floor(rng() * 3) * 2;
    const color = rng() < 0.5 ? T.rockLight : T.rockDark;
    g.rect(sx, sy, size, Math.max(2, size - 2)).fill({ color, alpha: 0.6 });
  }
}

/** Short stepped cracks of dark mineral running through the rock. */
function veins(
  g: Graphics,
  T: Theme,
  rng: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
): void {
  for (let n = 0; n < count; n++) {
    let vx = Math.floor(x + rng() * w);
    let vy = Math.floor(y + rng() * h);
    const steps = 4 + Math.floor(rng() * 5);
    const down = rng() < 0.5 ? 1 : -1;
    for (let s = 0; s < steps; s++) {
      g.rect(vx, vy, 2, 2).fill({ color: T.rockEdge, alpha: 0.8 });
      vx += 2;
      if (rng() < 0.6) vy += 2 * down;
    }
  }
}

function mound(g: Graphics, T: Theme, x: number, w: number, h: number): void {
  g.rect(x - w / 2, GROUND_Y - h, w, h).fill(T.rock);
  g.rect(x - w / 2 + 5, GROUND_Y - h - 4, w - 10, 4).fill(T.rock);
  g.rect(x - w / 2 + 5, GROUND_Y - h - 6, w - 10, 2).fill(T.grass);
  g.rect(x - w / 2, GROUND_Y - h - 2, w, 2).fill(T.grass);
  g.rect(x - w / 2, GROUND_Y - h, w, 2).fill(T.grassDark);
}

function drawScenery(g: Graphics, T: Theme): void {
  const rng = mulberry32(0xa9e27);

  // Distant accent pillars: capital, banded shaft, base.
  for (const px of [310, 490, 670]) {
    g.rect(px - 26, 100, 52, 8).fill({ color: T.accent, alpha: 0.5 });
    g.rect(px - 22, 108, 44, 8).fill({ color: T.accent, alpha: 0.5 });
    g.rect(px - 17, 116, 34, GROUND_Y - 116).fill({ color: T.accent, alpha: 0.45 });
    g.rect(px - 10, 116, 8, GROUND_Y - 116).fill({ color: T.accentLight, alpha: 0.4 });
    for (let by = 140; by < GROUND_Y - 20; by += 26) {
      g.rect(px - 17, by, 34, 3).fill({ color: T.accentDark, alpha: 0.4 });
    }
    g.rect(px - 22, GROUND_Y - 12, 44, 12).fill({ color: T.accent, alpha: 0.5 });
  }

  // Ceiling: rock mass with a jagged underside (flattened above the hatch),
  // stalactites at the deep points, and hanging vines.
  const edge: [number, number][] = [];
  for (let x = 0; x <= WORLD_WIDTH; x += 60) {
    const flat = Math.abs(x - SPAWN_X) < 50;
    edge.push([x, flat ? 62 : 50 + rng() * 34]);
  }
  const ceiling: number[] = [0, 0, WORLD_WIDTH, 0];
  for (let i = edge.length - 1; i >= 0; i--) ceiling.push(edge[i][0], edge[i][1]);
  g.poly(ceiling).fill(T.rock);
  speckle(g, T, rng, 0, 0, WORLD_WIDTH, 42, 150);
  veins(g, T, rng, 20, 6, WORLD_WIDTH - 40, 30, 14);
  g.moveTo(edge[0][0], edge[0][1]);
  for (const [ex, ey] of edge) g.lineTo(ex, ey);
  g.stroke({ width: 3, color: T.rockEdge });

  for (const [ex, ey] of edge) {
    if (Math.abs(ex - SPAWN_X) < 60 || Math.abs(ex - EXIT_X) < 40) continue;
    const roll = rng();
    if (roll < 0.3 && ey > 66) {
      g.rect(ex - 6, ey - 2, 12, 6).fill(T.rock);
      g.rect(ex - 4, ey + 4, 8, 5).fill(T.rock);
      g.rect(ex - 2, ey + 9, 4, 5).fill(T.rockDark);
    } else if (roll < 0.7) {
      const len = 16 + rng() * 26;
      g.rect(ex - 1, ey, 2, len).fill({ color: T.grassDark, alpha: 0.95 });
      g.rect(ex - 1, ey, 2, len * 0.4).fill({ color: T.grass, alpha: 0.95 });
      for (let vy = ey + 6; vy < ey + len - 2; vy += 7) {
        const side = Math.floor(vy / 7) % 2 === 0 ? 1 : -3;
        g.rect(ex + side, vy, 2, 2).fill({ color: T.grass, alpha: 0.9 });
      }
    }
  }

  // Side walls.
  g.rect(0, 0, 22, VIEW_H).fill(T.rock);
  g.rect(WORLD_WIDTH - 26, 0, 26, VIEW_H).fill(T.rock);
  speckle(g, T, rng, 0, 60, 20, VIEW_H - 60, 30);
  speckle(g, T, rng, WORLD_WIDTH - 24, 60, 22, VIEW_H - 60, 30);

  // Low grassy mounds along the back of the walkway.
  mound(g, T, 185, 64, 10);
  mound(g, T, 555, 44, 8);
  mound(g, T, 865, 52, 12);

  // Floor slab: fringe, dithered shade band, mineral veins.
  g.rect(0, GROUND_Y + 2, WORLD_WIDTH, VIEW_H - GROUND_Y - 2).fill(T.rock);
  speckle(g, T, rng, 0, GROUND_Y + 8, WORLD_WIDTH, VIEW_H - GROUND_Y - 10, 130);
  veins(g, T, rng, 20, GROUND_Y + 10, WORLD_WIDTH - 40, VIEW_H - GROUND_Y - 20, 10);
  for (let row = 0; row < 3; row++) {
    for (let x = 24; x < WORLD_WIDTH - 26; x += 6) {
      g.rect(x + (row % 2) * 3, GROUND_Y + 7 + row * 3, 3, 3).fill({
        color: T.rockDark,
        alpha: 0.4,
      });
    }
  }
  g.rect(0, GROUND_Y - 3, WORLD_WIDTH, 6).fill(T.grass);
  g.rect(0, GROUND_Y + 3, WORLD_WIDTH, 3).fill(T.grassDark);
  for (let n = 0; n < 90; n++) {
    const bx = Math.floor(24 + rng() * (WORLD_WIDTH - 52));
    g.rect(bx, GROUND_Y - 6, 2, 4).fill({ color: T.grass, alpha: 0.95 });
    if (rng() < 0.3) g.rect(bx + 3, GROUND_Y - 5, 2, 3).fill({ color: T.grassDark, alpha: 0.9 });
  }

  // Entrance hatch: slatted wooden box with a propped-open slatted lid.
  g.poly([SPAWN_X - 18, 64, SPAWN_X - 36, 46, SPAWN_X - 30, 41, SPAWN_X - 12, 59]).fill(T.wood);
  g.poly([SPAWN_X - 33, 46, SPAWN_X - 27, 40, SPAWN_X - 25, 42, SPAWN_X - 31, 48]).fill(
    T.woodDark,
  );
  g.rect(SPAWN_X - 18, 62, 36, 14).fill(T.wood);
  g.rect(SPAWN_X - 18, 62, 36, 3).fill(T.woodDark);
  for (const sx of [-8, 2, 12]) {
    g.rect(SPAWN_X + sx, 65, 2, 11).fill({ color: T.woodDark, alpha: 0.8 });
  }
  g.rect(SPAWN_X - 13, 67, 26, 7).fill(T.void);

  // Exit: stone arch with grout lines and torch stands (flames animate).
  g.rect(EXIT_X - 18, GROUND_Y - 40, 36, 40).fill(T.stoneDark);
  g.circle(EXIT_X, GROUND_Y - 38, 18).fill(T.stoneDark);
  g.rect(EXIT_X - 18, GROUND_Y - 28, 36, 2).fill({ color: T.rockEdge, alpha: 0.8 });
  g.rect(EXIT_X - 18, GROUND_Y - 14, 36, 2).fill({ color: T.rockEdge, alpha: 0.8 });
  g.rect(EXIT_X - 2, GROUND_Y - 52, 4, 8).fill({ color: T.rockEdge, alpha: 0.8 });
  g.rect(EXIT_X - 10, GROUND_Y - 32, 20, 32).fill(T.void);
  g.circle(EXIT_X, GROUND_Y - 32, 10).fill(T.void);
  for (const tx of [EXIT_X - 27, EXIT_X + 27]) {
    g.rect(tx - 2, GROUND_Y - 26, 4, 26).fill(T.woodDark);
    g.rect(tx - 4, GROUND_Y - 30, 8, 5).fill(T.stoneDark);
  }
}

interface Motion {
  x: number;
  face: number;
}

/** One square of dust, ember or confetti, simulated in world pixels. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  ttl: number;
  color: number;
  size: number;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function emit(fx: Particle[], p: Particle): void {
  if (fx.length < MAX_PARTICLES) fx.push(p);
}

/** Chips of rock kicked out from under a digging agentling. */
function digDust(fx: Particle[], T: Theme, x: number, face: number): void {
  emit(fx, {
    x: x + face * rand(4, 9),
    y: GROUND_Y - rand(0, 3),
    vx: face * rand(8, 34),
    vy: rand(-52, -22),
    gravity: 150,
    life: 0,
    ttl: rand(0.35, 0.6),
    color: Math.random() < 0.5 ? T.rockLight : T.rockDark,
    size: 2,
  });
}

/** Sparks drifting up off a torch, buoyant rather than falling. */
function ember(fx: Particle[], T: Theme, x: number): void {
  emit(fx, {
    x: x + rand(-2, 2),
    y: GROUND_Y - 34,
    vx: rand(-9, 9),
    vy: rand(-28, -14),
    gravity: -12,
    life: 0,
    ttl: rand(0.7, 1.3),
    color: Math.random() < 0.5 ? T.flame : T.flameCore,
    size: 2,
  });
}

/** Celebration burst over the exit when a job's diff gets promoted. */
function confetti(fx: Particle[], T: Theme): void {
  const colors = [T.flame, T.flameCore, T.grass, T.accentLight, DB.sky, DB.rose];
  for (let n = 0; n < 28; n++) {
    emit(fx, {
      x: EXIT_X + rand(-10, 10),
      y: GROUND_Y - 58,
      vx: rand(-95, 95),
      vy: rand(-165, -55),
      gravity: 270,
      life: 0,
      ttl: rand(0.9, 1.5),
      color: colors[n % colors.length],
      size: Math.random() < 0.4 ? 3 : 2,
    });
  }
}

function animFor(state: string): AgentAnim {
  switch (state) {
    case 'working':
      return 'work';
    case 'delivering':
      return 'deliver';
    default:
      return 'walk'; // idle IS walking: the patrol is the resting state
  }
}

const ANIM_FPS: Record<AgentAnim, number> = { walk: 12, work: 8, deliver: 10 };

/**
 * Renders the side-view world in the level's theme. Pure presentation:
 * positions and states come from the server sim at 10 Hz; the client lerps
 * toward the latest snapshot and animates pixel-art sprite frames locally.
 */
export function WorldCanvas({
  world,
  theme,
  onSelect,
}: {
  world: WorldState | null;
  theme: ThemeKey;
  onSelect: (agentlingId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  worldRef.current = world;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const T = THEMES[theme];

    let destroyed = false;
    const app = new Application();
    const labels = new Map<string, Text>();
    const sprites = new Map<string, Sprite>();
    const motion = new Map<string, Motion>();
    const fx: Particle[] = [];
    const seenStatus = new Map<string, string>();
    let dustClock = 0;
    let emberClock = 0;

    /**
     * Pixel-exact presentation: the canvas keeps its 1000x320 logical size and
     * is shown at a whole-number multiple, centred, with the frame's letterbox
     * bars filling the slack. Only a host narrower than one full world falls
     * back to fitting the width.
     */
    const fitCanvas = () => {
      const scale = Math.max(1, Math.floor(host.clientWidth / WORLD_WIDTH));
      const w = Math.min(host.clientWidth, WORLD_WIDTH * scale);
      app.canvas.style.width = `${w}px`;
      app.canvas.style.height = `${Math.round((w / WORLD_WIDTH) * VIEW_H)}px`;
    };
    const observer = new ResizeObserver(fitCanvas);

    app
      .init({
        width: WORLD_WIDTH,
        height: VIEW_H,
        background: T.void,
        antialias: false,
        roundPixels: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        fitCanvas();
        observer.observe(host);

        const agentTextures = buildAgentTextures();

        const scenery = new Graphics();
        drawScenery(scenery, T);
        app.stage.addChild(scenery);

        const dynamic = new Graphics();
        app.stage.addChild(dynamic);
        const spriteLayer = new Container();
        app.stage.addChild(spriteLayer);
        const fxLayer = new Graphics();
        app.stage.addChild(fxLayer);
        const labelLayer = new Container();
        app.stage.addChild(labelLayer);

        app.ticker.add((ticker) => {
          const w = worldRef.current;
          dynamic.clear();
          fxLayer.clear();
          if (!w) return;
          const t = performance.now() / 1000;
          const dt = Math.min(ticker.deltaMS, 100) / 1000;

          emberClock -= dt;
          if (emberClock <= 0) {
            emberClock = rand(0.12, 0.3);
            ember(fx, T, EXIT_X - 27);
            ember(fx, T, EXIT_X + 27);
          }
          dustClock -= dt;
          const puff = dustClock <= 0;
          if (puff) dustClock = 0.09;

          // A promoted diff is the one moment worth celebrating on screen.
          for (const job of w.jobs) {
            const prev = seenStatus.get(job.id);
            seenStatus.set(job.id, job.status);
            if (prev && prev !== 'promoted' && job.status === 'promoted') confetti(fx, T);
          }

          // Pixel flames flanking the exit, three flicker frames.
          for (const [k, tx] of [EXIT_X - 27, EXIT_X + 27].entries()) {
            const v = Math.floor(t * 8 + k * 1.7) % 3;
            const sway = v === 0 ? 0 : v === 1 ? -2 : 2;
            const base = GROUND_Y - 30;
            dynamic.rect(tx - 3, base - 4, 6, 4).fill(T.flame);
            dynamic.rect(tx - 2 + sway, base - 8, 4, 4).fill(T.flame);
            dynamic.rect(tx - 1 + sway, base - 7, 2, 3).fill(T.flameCore);
            dynamic.rect(tx - 1 - sway, base - 11, 2, 3).fill(T.flame);
          }

          // Work stations: wooden signposts with a status pennant.
          for (const job of w.jobs) {
            if (job.slot < 0 || (job.status !== 'queued' && job.status !== 'running')) continue;
            const x = STATION_BASE_X + job.slot * STATION_SPACING;
            dynamic.rect(x - 1.5, GROUND_Y - 30, 3, 30).fill(T.woodDark);
            dynamic.rect(x - 11, GROUND_Y - 40, 22, 11).fill(T.wood);
            dynamic.rect(x - 11, GROUND_Y - 40, 22, 2).fill(T.woodDark);
            const wave = Math.floor(t * 6 + job.slot) % 2 === 0 ? 0 : 2;
            dynamic
              .poly([x - 1, GROUND_Y - 52, x - 1, GROUND_Y - 41, x + 13 + wave, GROUND_Y - 46.5])
              .fill(job.status === 'running' ? T.flame : T.grass);
          }

          // Agentlings: smoothed positions driving pixel-art sprite frames.
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

            const rx = Math.round(m.x);
            if (puff && a.state === 'working') digDust(fx, T, rx, m.face);
            const anim = animFor(a.state);
            const seq = agentTextures[anim];
            const frame = Math.floor(t * ANIM_FPS[anim] + i * 1.7) % seq.length;

            let sprite = sprites.get(a.id);
            if (!sprite) {
              sprite = new Sprite(seq[frame]);
              sprite.anchor.set(0.5, 1);
              sprite.eventMode = 'static';
              sprite.cursor = 'pointer';
              const id = a.id;
              sprite.on('pointerdown', () => onSelectRef.current(id));
              sprite.on('pointerover', () => {
                const label = labels.get(id);
                if (label) label.visible = true;
              });
              sprite.on('pointerout', () => {
                const label = labels.get(id);
                if (label) label.visible = false;
              });
              spriteLayer.addChild(sprite);
              sprites.set(a.id, sprite);
            }
            sprite.texture = seq[frame];
            sprite.scale.set(SPRITE_SCALE * m.face, SPRITE_SCALE);
            sprite.position.set(rx, GROUND_Y + 2);

            let label = labels.get(a.id);
            if (!label) {
              label = new Text({
                text: a.name,
                style: { fill: a.color, fontSize: 9, fontFamily: 'monospace' },
              });
              label.anchor.set(0.5);
              label.alpha = 0.9;
              label.visible = false; // hover-only, like a proper diorama
              labelLayer.addChild(label);
              labels.set(a.id, label);
            }
            label.position.set(rx, GROUND_Y - 48);
          }

          // Particles: integrate, retire, and draw as hard pixel squares.
          for (let i = fx.length - 1; i >= 0; i--) {
            const p = fx[i];
            p.life += dt;
            if (p.life >= p.ttl) {
              fx.splice(i, 1);
              continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            fxLayer.rect(Math.round(p.x), Math.round(p.y), p.size, p.size).fill({
              color: p.color,
              alpha: Math.min(1, (1 - p.life / p.ttl) * 1.8),
            });
          }
        });
      });

    return () => {
      destroyed = true;
      observer.disconnect();
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [theme]);

  return <div className="world" ref={hostRef} />;
}
