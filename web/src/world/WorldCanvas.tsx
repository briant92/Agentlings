import { Application, Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { Job, ThemeKey, WorldState } from '@agentlings/shared';
import {
  EXIT_X,
  MAX_STATIONS,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  WORLD_WIDTH,
} from '@agentlings/shared';
import { createAmbience } from './ambience';
import { type Frames, loadAtlasArt } from './atlas';
import { createEmotes } from './emotes';
import { type Box, doorBox, type HoverTarget, OUTLINE_OFFSETS, stationBox } from './hover';
import { DB } from './palette';
import { departedIds } from './roster';
import { type Anchors, drawScene, pixiSurface } from './scene';
import { SCENES } from './scenes';
import {
  buildAgentTextures,
  buildSilhouetteTextures,
  SPRITE_HEIGHT,
  SPRITE_SCALE,
  type AgentAnim,
} from './sprites';
import { THEMES, type Theme } from './themes';

const VIEW_H = 320;
const GROUND_Y = 258;
const MAX_PARTICLES = 400;
/**
 * Where a sprite's head tops out. Packs may draw at any resolution but the
 * on-screen height is held constant, so this is a constant too.
 */
const HEAD_Y = GROUND_Y + 2 - SPRITE_HEIGHT * SPRITE_SCALE;

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

/** The job a signpost is standing for, or none when the slot is empty. */
function jobAtSlot(world: WorldState | null, slot: number): Job | undefined {
  return world?.jobs.find(
    (j) => j.slot === slot && (j.status === 'queued' || j.status === 'running'),
  );
}

/**
 * Where the art comes from. The frames built into the app answer immediately;
 * the spritesheet replaces them once it has loaded. Both can hand back the
 * same frames in an agentling's colour, or as flat shapes for the outline.
 */
interface ArtSource {
  base: Frames;
  scale: number;
  tinted(color: number): Promise<Frames | null>;
  silhouette(color: number): Promise<Frames | null>;
}

/** A ring drawn around a prop that has no sprite to take a silhouette from. */
function outlineBox(g: Graphics, box: Box, color: number, t = 2): void {
  g.rect(box.x - t, box.y - t, box.w + 2 * t, t).fill(color);
  g.rect(box.x - t, box.y + box.h, box.w + 2 * t, t).fill(color);
  g.rect(box.x - t, box.y, t, box.h).fill(color);
  g.rect(box.x + box.w, box.y, t, box.h).fill(color);
}

/**
 * The signpost. Being drawn from primitives rather than from a texture, it can
 * take a real silhouette like the sprites do — the same shapes, offset, in one
 * flat colour — instead of settling for a box around it.
 */
function drawSign(
  g: Graphics,
  T: Theme,
  x: number,
  y: number,
  running: boolean,
  wave: number,
  flat?: number,
): void {
  g.rect(x - 1.5, y - 30, 3, 30).fill(flat ?? T.woodDark);
  g.rect(x - 11, y - 40, 22, 11).fill(flat ?? T.wood);
  g.rect(x - 11, y - 40, 22, 2).fill(flat ?? T.woodDark);
  g.poly([x - 1, y - 52, x - 1, y - 41, x + 13 + wave, y - 46.5]).fill(
    flat ?? (running ? T.flame : T.grass),
  );
}

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
  onOpenReview,
  onHover,
  hoveredId,
}: {
  world: WorldState | null;
  theme: ThemeKey;
  onSelect: (agentlingId: string) => void;
  onOpenCrew: () => void;
  /** A signpost was clicked — show that job's work. */
  onOpenReview: (jobId: string) => void;
  /** Who the pointer is over, so the crew rail can light up the same one. */
  onHover: (agentlingId: string | null) => void;
  /** Who the crew rail is pointing at, highlighted here in return. */
  hoveredId: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  worldRef.current = world;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOpenCrewRef = useRef(onOpenCrew);
  onOpenCrewRef.current = onOpenCrew;
  const onOpenReviewRef = useRef(onOpenReview);
  onOpenReviewRef.current = onOpenReview;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const hoveredIdRef = useRef(hoveredId);
  hoveredIdRef.current = hoveredId;

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
      // Measured on the parent, not the frame. The frame shrink-wraps the
      // canvas so the level looks deliberate at widths between the scale
      // steps, which makes its own width the answer rather than the question.
      const available = host.parentElement?.clientWidth ?? host.clientWidth;
      const scale = Math.max(1, Math.floor(available / WORLD_WIDTH));
      const w = Math.min(available, WORLD_WIDTH * scale);
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
        // Watch what decides the size, not what the size decides.
        observer.observe(host.parentElement ?? host);

        // Art is data: prefer the spritesheet, fall back to what is built in.
        let art: ArtSource = {
          base: buildAgentTextures(),
          scale: SPRITE_SCALE,
          tinted: (color) => Promise.resolve(buildAgentTextures(color)),
          silhouette: (color) => Promise.resolve(buildSilhouetteTextures(color)),
        };
        // One set of frames per crew colour, built the first time it is seen.
        // Until it is ready the untinted frames stand in, so a new hire never
        // pops into an empty space waiting for a repaint.
        const tinted = new Map<number, Frames>();
        const asked = new Set<number>();
        let outline: Frames | null = null;

        const useArt = (next: ArtSource) => {
          art = next;
          tinted.clear();
          asked.clear();
          outline = null;
          void art.silhouette(T.hover).then((frames) => {
            if (!destroyed) outline = frames;
          });
        };
        const framesFor = (color: number): Frames => {
          const ready = tinted.get(color);
          if (ready) return ready;
          if (!asked.has(color)) {
            asked.add(color);
            void art.tinted(color).then((frames) => {
              if (frames && !destroyed) tinted.set(color, frames);
            });
          }
          return art.base;
        };
        useArt(art);

        void loadAtlasArt().then((sheet) => {
          if (!sheet || destroyed) return;
          // A pack may be drawn at any resolution; hold the on-screen height
          // steady so a finer pack reads as more detail, not as a giant.
          const height = sheet.frameHeight || SPRITE_HEIGHT;
          useArt({
            base: sheet.base,
            scale: (SPRITE_SCALE * SPRITE_HEIGHT) / height,
            tinted: (color) => sheet.tinted(color),
            silhouette: (color) => sheet.silhouette(color),
          });
        });

        const scenery = new Graphics();
        const marks = drawScene(pixiSurface(scenery), SCENES[theme], T, ANCHORS);
        app.stage.addChild(scenery);

        // The scene's idle life: above the painting, below everything that
        // works for a living.
        const ambientLayer = new Graphics();
        app.stage.addChild(ambientLayer);
        const ambience = createAmbience(SCENES[theme].ambient ?? [], {
          anchors: ANCHORS,
          theme: T,
          marks,
        });

        // What the pointer is over. Held here rather than in React state so
        // the ticker can read it without the effect being torn down and the
        // whole world rebuilt on every hover.
        let hover: HoverTarget = null;
        const setHover = (next: HoverTarget) => {
          hover = next;
          onHoverRef.current(next?.kind === 'agentling' ? next.id : null);
        };
        const clearHover = (match: (target: NonNullable<HoverTarget>) => boolean) => {
          if (hover && match(hover)) setHover(null);
        };

        // The doorway is where crew leave and come back, so it opens the crew
        // panel. Added below the sprites so clicking an agentling still wins.
        const door = doorBox(GROUND_Y);
        const portal = new Container();
        portal.eventMode = 'static';
        portal.cursor = 'pointer';
        portal.hitArea = new Rectangle(door.x, door.y, door.w, door.h);
        portal.on('pointerdown', () => onOpenCrewRef.current());
        portal.on('pointerover', () => setHover({ kind: 'door' }));
        portal.on('pointerout', () => clearHover((t) => t.kind === 'door'));
        app.stage.addChild(portal);

        // Signposts stand at fixed slots, so their hit areas are built once
        // and only switched on while a slot actually holds a job.
        const zones: Container[] = [];
        for (let slot = 0; slot < MAX_STATIONS; slot++) {
          const box = stationBox(slot, GROUND_Y);
          const zone = new Container();
          zone.eventMode = 'none';
          zone.cursor = 'pointer';
          zone.hitArea = new Rectangle(box.x, box.y, box.w, box.h);
          zone.on('pointerover', () => setHover({ kind: 'station', slot }));
          zone.on('pointerout', () => clearHover((t) => t.kind === 'station' && t.slot === slot));
          zone.on('pointerdown', () => {
            const job = jobAtSlot(worldRef.current, slot);
            if (job) onOpenReviewRef.current(job.id);
          });
          zones.push(zone);
          app.stage.addChild(zone);
        }

        const dynamic = new Graphics();
        app.stage.addChild(dynamic);
        // Below the sprites, so an agentling stands in front of its own ring.
        const ghostLayer = new Container();
        app.stage.addChild(ghostLayer);
        const ghosts = OUTLINE_OFFSETS.map(() => {
          const ghost = new Sprite();
          ghost.anchor.set(0.5, 1);
          ghost.visible = false;
          ghost.eventMode = 'none';
          ghostLayer.addChild(ghost);
          return ghost;
        });
        const spriteLayer = new Container();
        app.stage.addChild(spriteLayer);
        const fxLayer = new Graphics();
        app.stage.addChild(fxLayer);
        // Above the crew so a bubble reads over the sprite, below the labels
        // so a hovered name still wins.
        const emoteLayer = new Graphics();
        app.stage.addChild(emoteLayer);
        const emotes = createEmotes({ headY: HEAD_Y });
        const labelLayer = new Container();
        app.stage.addChild(labelLayer);

        app.ticker.add((ticker) => {
          const w = worldRef.current;
          dynamic.clear();
          fxLayer.clear();
          ambientLayer.clear();
          emoteLayer.clear();
          for (const ghost of ghosts) ghost.visible = false;
          if (!w) return;
          const t = performance.now() / 1000;
          const dt = Math.min(ticker.deltaMS, 100) / 1000;
          ambience.tick(ambientLayer, dt, t);

          // The rail and the world point at the same crew, so hovering either
          // one lights up both.
          const lit = hover?.kind === 'agentling' ? hover.id : hoveredIdRef.current;

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

          // The doorway is scenery drawn from the level's own data, so there
          // is no shape here to take a silhouette from — it gets a ring.
          if (hover?.kind === 'door') outlineBox(dynamic, door, T.hover);

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
          for (let slot = 0; slot < MAX_STATIONS; slot++) {
            const job = jobAtSlot(w, slot);
            const mode = job ? 'static' : 'none';
            if (zones[slot].eventMode !== mode) zones[slot].eventMode = mode;
            if (!job) {
              clearHover((target) => target.kind === 'station' && target.slot === slot);
              continue;
            }
            const x = STATION_BASE_X + slot * STATION_SPACING;
            const running = job.status === 'running';
            const wave = Math.floor(t * 6 + slot) % 2 === 0 ? 0 : 2;
            if (hover?.kind === 'station' && hover.slot === slot) {
              for (const [dx, dy] of OUTLINE_OFFSETS) {
                drawSign(dynamic, T, x + dx * 2, GROUND_Y + dy * 2, running, wave, T.hover);
              }
            }
            drawSign(dynamic, T, x, GROUND_Y, running, wave);
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
            const seq = framesFor(a.color)[anim];
            const frame = Math.floor(t * ANIM_FPS[anim] + i * 1.7) % seq.length;

            let sprite = sprites.get(a.id);
            if (!sprite) {
              sprite = new Sprite(seq[frame]);
              sprite.anchor.set(0.5, 1);
              sprite.eventMode = 'static';
              sprite.cursor = 'pointer';
              const id = a.id;
              sprite.on('pointerdown', () => onSelectRef.current(id));
              sprite.on('pointerover', () => setHover({ kind: 'agentling', id }));
              sprite.on('pointerout', () =>
                clearHover((target) => target.kind === 'agentling' && target.id === id),
              );
              spriteLayer.addChild(sprite);
              sprites.set(a.id, sprite);
            }
            sprite.texture = seq[frame];
            sprite.scale.set(art.scale * m.face, art.scale);
            sprite.position.set(rx, GROUND_Y + 2);

            // The ring: the same frame as a flat shape, drawn once per
            // neighbouring pixel behind the sprite itself.
            if (a.id === lit && outline) {
              const flat: Texture | undefined = outline[anim][frame % outline[anim].length];
              if (flat) {
                ghosts.forEach((ghost, g) => {
                  const [ox, oy] = OUTLINE_OFFSETS[g];
                  ghost.texture = flat;
                  ghost.visible = true;
                  ghost.scale.set(art.scale * m.face, art.scale);
                  ghost.position.set(rx + ox * art.scale, GROUND_Y + 2 + oy * art.scale);
                });
              }
            }

            let label = labels.get(a.id);
            if (!label) {
              label = new Text({
                text: a.name,
                style: { fill: a.color, fontSize: 9, fontFamily: 'monospace' },
              });
              label.anchor.set(0.5);
              label.alpha = 0.9;
              labelLayer.addChild(label);
              labels.set(a.id, label);
            }
            // Named only while pointed at, like a proper diorama — and driven
            // by the same hover the ring is, so the two cannot disagree.
            label.visible = a.id === lit;
            label.position.set(rx, GROUND_Y - 48);
          }

          // An agentling that left takes its sprite with it. The maps are
          // filled lazily above and used to be filled only — so a merged one
          // stood in the world until a reload, still clickable, still bound to
          // an id the server now 404s. Guarded on the count so an ordinary
          // frame does no work at all.
          if (sprites.size !== w.agentlings.length) {
            for (const id of departedIds(sprites.keys(), w.agentlings)) {
              const sprite = sprites.get(id);
              if (sprite) {
                spriteLayer.removeChild(sprite);
                sprite.destroy();
              }
              const label = labels.get(id);
              if (label) {
                labelLayer.removeChild(label);
                label.destroy();
              }
              sprites.delete(id);
              labels.delete(id);
              motion.delete(id);
              clearHover((target) => target.kind === 'agentling' && target.id === id);
            }
          }

          // Emotes read the same smoothed positions the sprites stand at.
          emotes.tick(emoteLayer, w, (id) => motion.get(id)?.x, dt, t);

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
