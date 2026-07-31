import { Application, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { ThemeKey, WorldState } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, STATION_BASE_X, STATION_SPACING, WORLD_WIDTH } from '@agentlings/shared';
import { loadAtlasTextures } from './atlas';
import { DB } from './palette';
import { type Anchors, drawScene, pixiSurface } from './scene';
import { SCENES } from './scenes';
import { buildAgentTextures, SPRITE_HEIGHT, SPRITE_SCALE, type AgentAnim } from './sprites';
import { THEMES, type Theme } from './themes';

const VIEW_H = 320;
const GROUND_Y = 258;
const MAX_PARTICLES = 400;

/** The fixed points a scene hangs its coordinates on. */
const ANCHORS: Anchors = {
  worldWidth: WORLD_WIDTH,
  viewH: VIEW_H,
  groundY: GROUND_Y,
  spawnX: SPAWN_X,
  exitX: EXIT_X,
};

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
  onOpenCrew,
}: {
  world: WorldState | null;
  theme: ThemeKey;
  onSelect: (agentlingId: string) => void;
  onOpenCrew: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  worldRef.current = world;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOpenCrewRef = useRef(onOpenCrew);
  onOpenCrewRef.current = onOpenCrew;

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

        // Art is data: prefer the spritesheet, fall back to what is built in.
        let agentTextures = buildAgentTextures();
        let spriteScale = SPRITE_SCALE;
        void loadAtlasTextures().then((fromSheet) => {
          if (!fromSheet || destroyed) return;
          agentTextures = fromSheet;
          // A pack may be drawn at any resolution; hold the on-screen height
          // steady so a finer pack reads as more detail, not as a giant.
          const frameHeight = fromSheet.walk[0]?.height ?? SPRITE_HEIGHT;
          spriteScale = (SPRITE_SCALE * SPRITE_HEIGHT) / frameHeight;
        });

        const scenery = new Graphics();
        drawScene(pixiSurface(scenery), SCENES[theme], T, ANCHORS);
        app.stage.addChild(scenery);

        // The doorway is where crew leave and come back, so it opens the crew
        // panel. Added below the sprites so clicking an agentling still wins.
        const portal = new Container();
        portal.eventMode = 'static';
        portal.cursor = 'pointer';
        portal.hitArea = new Rectangle(EXIT_X - 34, GROUND_Y - 58, 68, 58);
        portal.on('pointerdown', () => onOpenCrewRef.current());
        app.stage.addChild(portal);

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
            sprite.scale.set(spriteScale * m.face, spriteScale);
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
