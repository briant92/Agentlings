import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TilingSprite,
  type Texture,
} from 'pixi.js';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Job, JobEvent, ThemeId, WorldState } from '@agentlings/shared';
import {
  awaitingVerdict,
  EXIT_X,
  MAX_STATIONS,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  WORLD_WIDTH,
} from '@agentlings/shared';
import { createAmbience } from './ambience';
import { anchorPoint, type AnchorFn } from './anchor';
import { type Frames, loadAtlasArt } from './atlas';
import { createEmotes } from './emotes';
import {
  type Box,
  doorBox,
  type HoverTarget,
  OUTLINE_OFFSETS,
  parcelsBox,
  stationBox,
} from './hover';
import { DB } from './palette';
import { departedIds } from './roster';
import { anchorsOf, drawScene, paintOf, pixiSurface, resolveCoord } from './scene';
import { lookFor, occlusionUrl, plateLoopSpecs, plateUrls } from './looks';
import { cameraTarget, layerOffset, occlusionRate, planeFor, plateRate } from './parallax';
import {
  buildAgentTextures,
  buildSilhouetteTextures,
  SPRITE_HEIGHT,
  SPRITE_SCALE,
  type AgentAnim,
} from './sprites';
import type { Theme } from './themes';

const MAX_PARTICLES = 400;

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
function digDust(fx: Particle[], T: Theme, x: number, face: number, groundY: number): void {
  emit(fx, {
    x: x + face * rand(4, 9),
    y: groundY - rand(0, 3),
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
function ember(fx: Particle[], T: Theme, x: number, groundY: number): void {
  emit(fx, {
    x: x + rand(-2, 2),
    y: groundY - 34,
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
function confetti(fx: Particle[], T: Theme, groundY: number): void {
  const colors = [T.flame, T.flameCore, T.grass, T.accentLight, DB.sky, DB.rose];
  for (let n = 0; n < 28; n++) {
    emit(fx, {
      x: EXIT_X + rand(-10, 10),
      y: groundY - 58,
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
 * Deliveries waiting by the exit, oldest first — the parcel pile. Through the
 * one shared predicate, so the crates count exactly what the desk lists and
 * the select badge says — a pile saying ×33 over a desk saying 27 would be
 * the app disagreeing with itself.
 */
function waitingReview(world: WorldState | null): Job[] {
  return (world?.jobs ?? [])
    .filter(awaitingVerdict)
    .sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt));
}

/** One delivery crate, drawn in the theme's own timbers. */
function drawCrate(g: Graphics, T: Theme, x: number, y: number): void {
  g.rect(x, y, 12, 9).fill(T.wood);
  g.rect(x, y, 12, 2).fill({ color: T.rockLight, alpha: 0.7 });
  g.rect(x + 5, y, 2, 9).fill(T.woodDark);
  g.rect(x, y + 7, 12, 2).fill(T.woodDark);
  g.rect(x + 8, y + 1, 3, 3).fill(T.accentLight);
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
 *
 * The pennant is the status: flying in the flame colour while the job runs,
 * hanging in the grass colour while it waits its turn.
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
  if (running) {
    g.poly([x - 1, y - 52, x - 1, y - 41, x + 13 + wave, y - 46.5]).fill(flat ?? T.flame);
  } else {
    g.poly([x - 1, y - 52, x - 1, y - 41, x + 5 + wave, y - 36]).fill(flat ?? T.grass);
  }
}

/**
 * Renders the side-view world in the level's theme. Pure presentation:
 * positions and states come from the server sim at 10 Hz; the client lerps
 * toward the latest snapshot and animates pixel-art sprite frames locally.
 */
export function WorldCanvas({
  world,
  theme,
  events,
  onSelect,
  onOpenCrew,
  onOpenReview,
  onOpenParcels,
  onHover,
  hoveredId,
  anchorFor,
}: {
  world: WorldState | null;
  theme: ThemeId;
  /** The level's event feed — the running signposts blink on tool calls. */
  events: JobEvent[];
  onSelect: (agentlingId: string) => void;
  onOpenCrew: () => void;
  /** A signpost was clicked — show that job's work. */
  onOpenReview: (jobId: string) => void;
  /** The parcel pile was clicked — open the desk with the whole queue. */
  onOpenParcels: () => void;
  /** Who the pointer is over, so the crew rail can light up the same one. */
  onHover: (agentlingId: string | null) => void;
  /** Who the crew rail is pointing at, highlighted here in return. */
  hoveredId: string | null;
  /**
   * Filled with a live query for a sprite's head-top in page coordinates
   * (D-084) — how DOM anchors over the canvas without the world knowing who
   * is asking. Null until the stage exists, and again after it is torn down.
   */
  anchorFor?: MutableRefObject<AnchorFn | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  worldRef.current = world;
  const eventsRef = useRef<JobEvent[]>(events);
  eventsRef.current = events;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOpenCrewRef = useRef(onOpenCrew);
  onOpenCrewRef.current = onOpenCrew;
  const onOpenReviewRef = useRef(onOpenReview);
  onOpenReviewRef.current = onOpenReview;
  const onOpenParcelsRef = useRef(onOpenParcels);
  onOpenParcelsRef.current = onOpenParcels;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const hoveredIdRef = useRef(hoveredId);
  hoveredIdRef.current = hoveredId;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The level's look: its palette and its picture, whether those are one of
    // the four built in or a pack dropped into web/public/packs. Never fails —
    // a level whose pack is gone opens in the fallback rather than not at all.
    const look = lookFor(theme);
    const T = look.theme;
    // The scene owns the shape of the world; these used to be constants here.
    const scene = look.scene;
    const ANCHORS = anchorsOf(scene);
    const VIEW_H = scene.viewH;
    const GROUND_Y = scene.groundY;
    /**
     * Where a sprite's head tops out. Packs may draw at any resolution but the
     * on-screen height is held constant, so this follows the ground line alone.
     */
    const HEAD_Y = GROUND_Y + 2 - SPRITE_HEIGHT * SPRITE_SCALE;

    let destroyed = false;
    const app = new Application();
    const labels = new Map<string, Text>();
    const sprites = new Map<string, Sprite>();
    const motion = new Map<string, Motion>();
    const fx: Particle[] = [];
    const seenStatus = new Map<string, string>();
    let dustClock = 0;
    let emberClock = 0;

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
        // Sizing is presentation, pinned inline at the source: a stylesheet
        // rule alone lost once already, to the stale style="width:1000px" a
        // hot update left behind from the code this replaced — and Pixi's
        // autoDensity writes the same pin when enabled. The attributes stay
        // 1000×320, so the browser holds the aspect.
        app.canvas.style.width = '100%';
        app.canvas.style.height = 'auto';
        host.appendChild(app.canvas);

        // The pointer as a small camera pan (v2 parallax). Normalised across
        // the canvas; null when away, which hands the camera to the idle
        // sway. Listeners die with the canvas at teardown.
        let pointerNx: number | null = null;
        app.canvas.addEventListener('pointermove', (e) => {
          const rect = app.canvas.getBoundingClientRect();
          if (rect.width === 0) return;
          pointerNx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        });
        app.canvas.addEventListener('pointerleave', () => {
          pointerNx = null;
        });

        // The bubble's window into the world (D-084): the smoothed position
        // the sprite actually stands at, through the canvas's own rect, so a
        // resize or layout change can never drift the mapping.
        if (anchorFor) {
          anchorFor.current = (id) => {
            const m = motion.get(id);
            if (!m) return null;
            return anchorPoint(m.x, HEAD_Y, app.canvas.getBoundingClientRect(), WORLD_WIDTH);
          };
        }

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
        // The permanent rim, when the scene asks for one. A second silhouette
        // set rather than a reuse of the hover ring: that one is deliberately
        // drawn in a colour chosen to *stand out* against the theme's rock,
        // where a rim wants to disappear into being an edge.
        let rimFrames: Frames | null = null;
        const rimColor = scene.rim === undefined ? null : paintOf(T, scene.rim);

        const useArt = (next: ArtSource) => {
          art = next;
          tinted.clear();
          asked.clear();
          outline = null;
          rimFrames = null;
          void art.silhouette(T.hover).then((frames) => {
            if (!destroyed) outline = frames;
          });
          if (rimColor !== null) {
            void art.silhouette(rimColor).then((frames) => {
              if (!destroyed) rimFrames = frames;
            });
          }
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

        // The pre-rendered plates (D-142, v2): beneath everything drawScene
        // draws, back to front. Loaded async; until one arrives — or if it
        // never does — the void and the ops stand alone, the way a missing
        // pack leaves a level in the cave. Each plate gets its slot container
        // up front, because Assets.load resolves in any order and z-order
        // must be the pack's order, not the network's.
        const plateLayer = new Container();
        app.stage.addChild(plateLayer);
        // Layers that drift, with the rate each one earned. Applied by the
        // ticker below; rate 0 never registers, so a pinned world costs the
        // frame loop nothing.
        const drifting: { node: Container; baseX: number; rate: number }[] = [];
        let backPlateRate = 0;
        plateUrls(look).forEach((url, i) => {
          const slot = new Container();
          plateLayer.addChild(slot);
          Assets.load<Texture>(url)
            .then((texture) => {
              if (destroyed) return;
              // Smooth minification: a 2x plate downsamples into the buffer
              // (D-108's "author at 2000×900 and downsample"); the pixel look
              // of everything else comes from its own art, not from sampling.
              texture.source.scaleMode = 'linear';
              const plate = new Sprite(texture);
              const plane = planeFor(texture.width, texture.height, VIEW_H);
              plate.width = plane.worldW;
              plate.height = VIEW_H;
              // An overscanned plate hangs half its margin off each side, so
              // its edges can never show inside the clamped drift.
              plate.x = -(plane.worldW - WORLD_WIDTH) / 2;
              plate.eventMode = 'none';
              slot.addChild(plate);
              const rate = plateRate(i, plane.overscan);
              if (i === 0) backPlateRate = rate;
              if (rate !== 0) drifting.push({ node: slot, baseX: 0, rate });
            })
            .catch(() => {
              // A plate the browser cannot fetch costs only itself.
            });
        });

        // Plate life (v2): raster tiles scroll-looping over the plates, under
        // every op and the scrim. The layer rides the back plate's drift so
        // a waterfall stays on the cliff it was painted against.
        const plateLifeLayer = new Container();
        app.stage.addChild(plateLifeLayer);
        const loops: { sprite: TilingSprite; dx: number; dy: number }[] = [];
        for (const spec of plateLoopSpecs(look)) {
          Assets.load<Texture>(spec.url)
            .then((texture) => {
              if (destroyed) return;
              texture.source.scaleMode = 'nearest';
              const sprite = new TilingSprite({
                texture,
                width: resolveCoord(spec.w, ANCHORS),
                height: resolveCoord(spec.h, ANCHORS),
              });
              sprite.x = resolveCoord(spec.x, ANCHORS);
              sprite.y = resolveCoord(spec.y, ANCHORS);
              sprite.eventMode = 'none';
              plateLifeLayer.addChild(sprite);
              loops.push({ sprite, dx: spec.dx, dy: spec.dy });
            })
            .catch(() => {
              // A tile that cannot load costs only its own loop.
            });
        }

        const scenery = new Graphics();
        const marks = drawScene(pixiSurface(scenery), scene, T, ANCHORS);
        app.stage.addChild(scenery);

        // The scene's idle life: above the painting, below everything that
        // works for a living.
        const ambientLayer = new Graphics();
        app.stage.addChild(ambientLayer);
        const ambience = createAmbience(scene.ambient ?? [], {
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

        // The parcel pile beside the exit: clickable while deliveries wait,
        // opening the desk with the whole queue — a pile of forty must show
        // forty, not silently open the oldest one blind.
        const pBox = parcelsBox(GROUND_Y);
        const parcelZone = new Container();
        parcelZone.eventMode = 'none';
        parcelZone.cursor = 'pointer';
        parcelZone.hitArea = new Rectangle(pBox.x, pBox.y, pBox.w, pBox.h);
        parcelZone.on('pointerdown', () => {
          if (waitingReview(worldRef.current).length > 0) onOpenParcelsRef.current();
        });
        parcelZone.on('pointerover', () => setHover({ kind: 'parcels' }));
        parcelZone.on('pointerout', () => clearHover((target) => target.kind === 'parcels'));
        app.stage.addChild(parcelZone);

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
        // The rim sits under the hover ring, which sits under the sprites, so
        // pointing at someone still reads over their own outline.
        //
        // A pool rather than a fixed set: the hover ring needs eight ghosts
        // because only one agentling is ever hovered, but a rim needs eight
        // per agentling and the crew grows and shrinks. Entries are handed out
        // in order each frame and the leftovers hidden, so hiring nobody costs
        // nothing and hiring ten allocates once.
        const rimLayer = new Container();
        app.stage.addChild(rimLayer);
        const rimPool: Sprite[] = [];
        const rimGhost = (i: number): Sprite => {
          let ghost = rimPool[i];
          if (!ghost) {
            ghost = new Sprite();
            ghost.anchor.set(0.5, 1);
            ghost.eventMode = 'none';
            rimLayer.addChild(ghost);
            rimPool[i] = ghost;
          }
          return ghost;
        };
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
        // The occlusion strip (v2): scenery the crew walk BEHIND, above the
        // sprites and their dust, below the emotes and labels — being talked
        // over is fine, being unreadable is not. eventMode none, so nothing
        // clickable ever hides behind a rock it can still be clicked through.
        const occlusionLayer = new Container();
        app.stage.addChild(occlusionLayer);
        {
          const url = occlusionUrl(look);
          if (url) {
            Assets.load<Texture>(url)
              .then((texture) => {
                if (destroyed) return;
                texture.source.scaleMode = 'linear';
                const strip = new Sprite(texture);
                const plane = planeFor(texture.width, texture.height, VIEW_H);
                strip.width = plane.worldW;
                strip.height = VIEW_H;
                strip.x = -(plane.worldW - WORLD_WIDTH) / 2;
                strip.eventMode = 'none';
                occlusionLayer.addChild(strip);
                const rate = occlusionRate(plane.overscan);
                if (rate !== 0) drifting.push({ node: occlusionLayer, baseX: 0, rate });
              })
              .catch(() => {
                // A strip that cannot load costs only its own depth cue.
              });
          }
        }
        // Above the crew so a bubble reads over the sprite, below the labels
        // so a hovered name still wins.
        const emoteLayer = new Graphics();
        app.stage.addChild(emoteLayer);
        const emotes = createEmotes({ headY: HEAD_Y });
        const labelLayer = new Container();
        app.stage.addChild(labelLayer);

        // Past four parcels the pile stops growing and counts instead.
        const parcelCount = new Text({
          text: '',
          style: { fill: DB.white, fontSize: 9, fontFamily: 'monospace' },
        });
        parcelCount.anchor.set(0.5);
        parcelCount.visible = false;
        labelLayer.addChild(parcelCount);

        // The work lamp: lit for half a second after each tool call. The
        // replayed backlog on connect is absorbed silently — a lamp blinking
        // for history would claim work that already happened.
        const lampUntil = new Map<string, number>();
        let lastEventId = -1;
        let eventsPrimed = false;

        // The camera the drifting layers follow: lerped toward the pointer
        // or the idle sway, never applied as anything but whole pixels.
        let camera = 0;

        app.ticker.add((ticker) => {
          const w = worldRef.current;
          dynamic.clear();
          fxLayer.clear();
          ambientLayer.clear();
          emoteLayer.clear();
          for (const ghost of ghosts) ghost.visible = false;
          for (const ghost of rimPool) ghost.visible = false;
          let rimUsed = 0;
          if (!w) return;
          const t = performance.now() / 1000;
          const dt = Math.min(ticker.deltaMS, 100) / 1000;
          ambience.tick(ambientLayer, dt, t);

          // The drift (v2): one camera, every layer at its own rate. A world
          // with nothing overscanned registers nothing here and holds still.
          if (drifting.length > 0 || loops.length > 0) {
            camera += (cameraTarget(pointerNx, t) - camera) * (1 - Math.exp(-dt * 3));
            for (const layer of drifting) {
              layer.node.x = layer.baseX + layerOffset(layer.rate, camera);
            }
            plateLifeLayer.x = layerOffset(backPlateRate, camera);
            for (const loop of loops) {
              loop.sprite.tilePosition.set(Math.round(loop.dx * t), Math.round(loop.dy * t));
            }
          }

          // The rail and the world point at the same crew, so hovering either
          // one lights up both.
          const lit = hover?.kind === 'agentling' ? hover.id : hoveredIdRef.current;

          emberClock -= dt;
          if (emberClock <= 0) {
            emberClock = rand(0.12, 0.3);
            ember(fx, T, EXIT_X - 27, GROUND_Y);
            ember(fx, T, EXIT_X + 27, GROUND_Y);
          }
          dustClock -= dt;
          const puff = dustClock <= 0;
          if (puff) dustClock = 0.09;

          // A promoted diff is the one moment worth celebrating on screen.
          for (const job of w.jobs) {
            const prev = seenStatus.get(job.id);
            seenStatus.set(job.id, job.status);
            if (prev && prev !== 'promoted' && job.status === 'promoted') confetti(fx, T, GROUND_Y);
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

          // New tool calls light the lamp of the signpost they ran at.
          const evs = eventsRef.current;
          for (let i = evs.length - 1; i >= 0; i--) {
            const e = evs[i];
            if (e.id <= lastEventId) break;
            if (eventsPrimed && e.type === 'progress') lampUntil.set(e.jobId, t + 0.5);
          }
          if (evs.length > 0) lastEventId = Math.max(lastEventId, evs[evs.length - 1].id);
          eventsPrimed = true;

          // Work stations: wooden signposts with a status pennant — flying
          // while the job runs, hanging while it queues — and a work lamp.
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
            const wave = running
              ? Math.floor(t * 6 + slot) % 2 === 0
                ? 0
                : 2
              : Math.floor(t * 3 + slot) % 2 === 0
                ? 0
                : 1;
            if (hover?.kind === 'station' && hover.slot === slot) {
              for (const [dx, dy] of OUTLINE_OFFSETS) {
                drawSign(dynamic, T, x + dx * 2, GROUND_Y + dy * 2, running, wave, T.hover);
              }
            }
            drawSign(dynamic, T, x, GROUND_Y, running, wave);
            if (running) {
              const lit = (lampUntil.get(job.id) ?? 0) > t;
              dynamic.rect(x - 4, GROUND_Y - 25, 3, 2).fill(T.woodDark);
              dynamic.rect(x - 8, GROUND_Y - 27, 4, 4).fill(lit ? T.flameCore : T.stoneDark);
              if (lit) {
                dynamic.rect(x - 9, GROUND_Y - 28, 6, 6).fill({ color: T.flameCore, alpha: 0.25 });
              }
            }
          }

          // Deliveries pile up beside the exit until someone reviews them.
          const waiting = waitingReview(w);
          const parcelMode = waiting.length > 0 ? 'static' : 'none';
          if (parcelZone.eventMode !== parcelMode) parcelZone.eventMode = parcelMode;
          if (waiting.length === 0) {
            clearHover((target) => target.kind === 'parcels');
          } else {
            dynamic
              .rect(EXIT_X - 64, GROUND_Y - 26, 30, 26)
              .fill({ color: T.flameCore, alpha: 0.1 + 0.06 * Math.sin(t * 2.5) });
            waiting.slice(0, 4).forEach((_, i) => {
              drawCrate(dynamic, T, EXIT_X - 62 + (i % 2) * 14, GROUND_Y - 10 - Math.floor(i / 2) * 10);
            });
            if (hover?.kind === 'parcels') outlineBox(dynamic, pBox, T.hover);
          }
          parcelCount.visible = waiting.length > 4;
          if (parcelCount.visible) {
            parcelCount.text = `×${waiting.length}`;
            parcelCount.position.set(EXIT_X - 47, GROUND_Y - 38);
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
            if (puff && a.state === 'working') digDust(fx, T, rx, m.face, GROUND_Y);
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

            // The rim: the same flat shape as the ring, but for everyone and
            // always, offset one pixel in each of eight directions.
            if (rimFrames) {
              const edge: Texture | undefined = rimFrames[anim][frame % rimFrames[anim].length];
              if (edge) {
                for (const [ox, oy] of OUTLINE_OFFSETS) {
                  const ghost = rimGhost(rimUsed++);
                  ghost.texture = edge;
                  ghost.visible = true;
                  ghost.scale.set(art.scale * m.face, art.scale);
                  ghost.position.set(rx + ox * art.scale, GROUND_Y + 2 + oy * art.scale);
                }
              }
            }

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
      if (anchorFor) anchorFor.current = null;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // anchorFor is a ref box, stable by construction — the effect keys on the
    // theme alone, exactly as before it existed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return <div className="world" ref={hostRef} />;
}
