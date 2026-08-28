import { useEffect, useRef, useState } from 'react';
import { DB } from '../world/palette';
import { renderWalkFrame } from '../world/sprites';

interface MenuItem {
  label: string;
  action: () => void;
}

/** The reference Starbase artwork, used as-is rather than sliced into layers —
 * splitting one continuously-painted image into independently drifting plates
 * would show a seam at the cut. Depth instead comes from the cloud layer
 * drifting over it and the entrance cluster in front. */
const BG_URL = '/starbase-scene.jpg';

/** A soft cloud accent drifting over the painted sky, each at its own pace — the
 * second parallax layer, independent motion rather than the backdrop's own. */
const CLOUDS = [
  { top: '6%', left: '8%', width: '18%', dur: '70s', delay: '0s' },
  { top: '14%', left: '48%', width: '14%', dur: '85s', delay: '10s' },
  { top: '4%', left: '68%', width: '20%', dur: '95s', delay: '20s' },
];

/** The entrance cluster: fixed offsets within the entrance box, each walker
 * milling in a short loop rather than marching — "busy", not "parading". */
const ENTRANCE_WALKERS = [
  { left: '2%', top: '8%', dur: '2.6s', delay: '0s', flip: false },
  { left: '20%', top: '32%', dur: '3.1s', delay: '0.4s', flip: true },
  { left: '38%', top: '2%', dur: '2.8s', delay: '0.9s', flip: false },
  { left: '55%', top: '38%', dur: '3.4s', delay: '0.2s', flip: true },
  { left: '70%', top: '12%', dur: '2.4s', delay: '1.2s', flip: false },
  { left: '85%', top: '42%', dur: '3.0s', delay: '0.6s', flip: true },
  { left: '12%', top: '58%', dur: '2.9s', delay: '1.5s', flip: false },
  { left: '60%', top: '62%', dur: '2.5s', delay: '0.3s', flip: true },
];

/** A spread of gown colours for the horde crossing the floor, distinct from any real crew's own tints. */
const HORDE_TINTS = [DB.orange, DB.rose, DB.sky, DB.limeLight, DB.pink, DB.teal, DB.tan, DB.cyan];

/** One walking agentling, animated on its own canvas — the same walk cycle a level uses. */
function Walker({ tint, phase, flip }: { tint: number; phase: number; flip?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = phase;
    renderWalkFrame(canvas, frame, 4, tint);
    const id = window.setInterval(() => {
      frame += 1;
      renderWalkFrame(canvas, frame, 4, tint);
    }, 170);
    return () => window.clearInterval(id);
  }, [tint, phase]);

  return <canvas ref={ref} className="ts-walker" style={flip ? { transform: 'scaleX(-1)' } : undefined} />;
}

/** The boot ritual: the Starbase artwork behind a signboard, with a horde milling busily
 * at the building's entrance rather than marching in a parade line. */
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

  /** One walker milling near the entrance, tagged with its fixed offset/pace; one carries the tick. */
  const entrance = ENTRANCE_WALKERS.map((w, i) => (
    <div
      key={i}
      className="ts-unit ts-entrance-unit"
      style={{ left: w.left, top: w.top, animationDuration: w.dur, animationDelay: w.delay }}
    >
      {i === 2 && <div className="ts-ticket">✓</div>}
      <Walker tint={HORDE_TINTS[i % HORDE_TINTS.length]} phase={i} flip={w.flip} />
    </div>
  ));

  return (
    <div className="title-screen">
      <div className="ts-bg" style={{ backgroundImage: `url(${BG_URL})` }} />
      <div className="ts-clouds">
        {CLOUDS.map((c, i) => (
          <div
            key={i}
            className="ts-cloud"
            style={{ top: c.top, left: c.left, width: c.width, animationDuration: c.dur, animationDelay: c.delay }}
          />
        ))}
      </div>

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

      <div className="ts-entrance">{entrance}</div>

      <div className="ts-build">© 2026 · BUILD M1</div>
    </div>
  );
}
