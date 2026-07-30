import { Application, Container, Graphics, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { WorldState } from '@agentlings/shared';
import { EXIT_X, SPAWN_X, STATION_BASE_X, STATION_SPACING, WORLD_WIDTH } from '@agentlings/shared';

const VIEW_H = 260;
const GROUND_Y = 210;

/**
 * Renders the side-view world. Pure presentation: positions and states come
 * from the server sim; only the bob animation is computed client-side.
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

    app
      .init({ width: WORLD_WIDTH, height: VIEW_H, background: '#171a21', antialias: true })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);

        const staticLayer = new Graphics();
        staticLayer.rect(0, GROUND_Y, WORLD_WIDTH, 4).fill(0x3a3f4d); // ground
        staticLayer.circle(SPAWN_X, GROUND_Y + 2, 16).fill(0x262b36); // home burrow
        staticLayer.rect(EXIT_X - 14, GROUND_Y - 44, 28, 44).fill(0x2e4d3a); // exit door
        staticLayer.rect(EXIT_X - 10, GROUND_Y - 38, 20, 38).fill(0x171a21);
        app.stage.addChild(staticLayer);

        const exitLabel = new Text({
          text: 'OUT',
          style: { fill: 0x7bd88f, fontSize: 10, fontFamily: 'monospace' },
        });
        exitLabel.anchor.set(0.5);
        exitLabel.position.set(EXIT_X, GROUND_Y - 52);
        app.stage.addChild(exitLabel);

        const dynamic = new Graphics();
        app.stage.addChild(dynamic);
        const labelLayer = new Container();
        app.stage.addChild(labelLayer);

        app.ticker.add(() => {
          const w = worldRef.current;
          dynamic.clear();
          if (!w) return;

          // Stations: a flag per job currently holding a slot.
          for (const job of w.jobs) {
            if (job.slot < 0 || (job.status !== 'queued' && job.status !== 'running')) continue;
            const x = STATION_BASE_X + job.slot * STATION_SPACING;
            dynamic.rect(x - 1, GROUND_Y - 34, 2, 34).fill(0x555c6e);
            dynamic
              .moveTo(x, GROUND_Y - 34)
              .lineTo(x + 18, GROUND_Y - 28)
              .lineTo(x, GROUND_Y - 22)
              .closePath()
              .fill(job.status === 'running' ? 0xffb86c : 0x6fb7ff);
          }

          // Agentlings: little capsule bodies with a state-driven bob.
          const t = performance.now() / 1000;
          for (const [i, a] of w.agentlings.entries()) {
            const bob =
              a.state === 'working'
                ? Math.abs(Math.sin(t * 10 + i)) * 4
                : a.state === 'walking' || a.state === 'delivering'
                  ? Math.abs(Math.sin(t * 14 + i)) * 2
                  : 0;
            const y = GROUND_Y - bob;
            dynamic.roundRect(a.x - 6, y - 18, 12, 18, 3).fill(a.color);
            dynamic.circle(a.x, y - 22, 6).fill(a.color);
            dynamic.circle(a.x + 2, y - 23, 1.6).fill(0x171a21); // eye
            if (a.state === 'delivering') {
              dynamic.roundRect(a.x + 5, y - 16, 9, 7, 1).fill(0xf5e6a8); // the result!
            }

            let label = labels.get(a.id);
            if (!label) {
              label = new Text({
                text: a.name,
                style: { fill: 0x8a91a3, fontSize: 9, fontFamily: 'monospace' },
              });
              label.anchor.set(0.5);
              labelLayer.addChild(label);
              labels.set(a.id, label);
            }
            label.position.set(a.x, y - 36);
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
