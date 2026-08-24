import { useEffect, useRef, useState } from 'react';
import { DB } from '../world/palette';
import { renderWalkFrame } from '../world/sprites';

interface MenuItem {
  label: string;
  action: () => void;
}

/** Rendered offline (art/blender/starbase_render.py) — the "3D plate" half of the HD-2D
 * mix PRERENDER.md scoped: a smooth backdrop under the pixel-art horde on top. */
const BG_URL = '/starbase.png';

/** A spread of gown colours for the horde crossing the floor, distinct from any real crew's own tints. */
const HORDE_TINTS = [DB.orange, DB.rose, DB.sky, DB.limeLight, DB.pink, DB.teal, DB.tan, DB.cyan];

/** One walking agentling, animated on its own canvas — the same walk cycle a level uses. */
function Walker({ tint, phase }: { tint: number; phase: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = phase;
    renderWalkFrame(canvas, frame, 3, tint);
    const id = window.setInterval(() => {
      frame += 1;
      renderWalkFrame(canvas, frame, 3, tint);
    }, 170);
    return () => window.clearInterval(id);
  }, [tint, phase]);

  return <canvas ref={ref} className="ts-walker" />;
}

/** The boot ritual: a mission control room painted from the scene format, a horde of real
 * sprites crossing its floor, and the logo/menu on a signboard in front of it. */
export function TitleScreen({
  hasContinue,
  onContinue,
  onStart,
  onSettings,
}: {
  hasContinue: boolean;
  onContinue: () => void;
  onStart: () => void;
  onSettings: () => void;
}) {
  const items: MenuItem[] = [
    ...(hasContinue ? [{ label: 'CONTINUE', action: onContinue }] : []),
    { label: 'START', action: onStart },
    { label: 'SETTINGS', action: onSettings },
  ];
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') setSel((s) => (s + items.length - 1) % items.length);
      else if (e.key === 'ArrowDown') setSel((s) => (s + 1) % items.length);
      else if (e.key === 'Enter') items[sel].action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** One marching row, tagged with a pace/direction; one walker carries a solved-issue tick. */
  const row = (count: number, variant: string, tickAt: number) => (
    <div className={`ts-march ${variant}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ts-unit">
          {i === tickAt && <div className="ts-ticket">✓</div>}
          <Walker tint={HORDE_TINTS[i % HORDE_TINTS.length]} phase={i} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="title-screen">
      <div className="ts-bg" style={{ backgroundImage: `url(${BG_URL})` }} />

      <div className="ts-row upper">{row(9, 'fast', 3)}</div>

      <div className="ts-plaque">
        <div className="ts-logo">
          <div className="ts-name" data-text="AGENTLINGS">
            AGENTLINGS
          </div>
          <div className="ts-sub">THE HORDE WORKS FOR YOU</div>
        </div>
        <div className="ts-menu">
          {items.map((item, i) => (
            <div
              key={item.label}
              className={`ts-item${i === sel ? ' on' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={item.action}
            >
              <span className="ts-cursor">{i === sel ? '▶' : ' '}</span> {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="ts-row ground">{row(11, 'rev', 6)}</div>

      <div className="ts-build">© 2026 · BUILD M1</div>
    </div>
  );
}
