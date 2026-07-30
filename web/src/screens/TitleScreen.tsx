import { useEffect, useState } from 'react';

interface MenuItem {
  label: string;
  action: () => void;
}

/** The boot ritual: logotype, marching horde, three-line menu. */
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

  return (
    <div className="title-screen">
      <div className="ts-ceiling" />
      <div className="ts-vine v1" />
      <div className="ts-vine v2" />
      <div className="ts-pillar p1" />
      <div className="ts-pillar p2" />
      <div className="ts-logo">
        <div className="ts-name">AGENTLINGS</div>
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
            <span className="ts-cursor">{i === sel ? '▶' : ' '}</span> {item.label}
          </div>
        ))}
      </div>
      <div className="ts-march">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="ts-spr">
            <div />
            <div />
            <div />
          </div>
        ))}
      </div>
      <div className="ts-ground" />
      <div className="ts-build">© 2026 · BUILD M1</div>
    </div>
  );
}
