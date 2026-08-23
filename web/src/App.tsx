import { useEffect, useRef, useState } from 'react';
import { CrewModal } from './panels/CrewModal';
import { RolesModal } from './panels/RolesModal';
import { LevelView } from './screens/LevelView';
import { SelectScreen, type LevelEntry } from './screens/SelectScreen';
import { SettingsModal } from './screens/SettingsModal';
import { TitleScreen } from './screens/TitleScreen';

type Screen = { name: 'title' } | { name: 'select' } | { name: 'level'; level: LevelEntry };

const LAST_KEY = 'agentlings:last-level';

// Iris timings: the screen swaps at the pinch, so the cut is never seen.
const CLOSE_MS = 220;
const OPEN_MS = 300;

function loadLast(): LevelEntry | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as LevelEntry;
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [wipe, setWipe] = useState<'close' | 'open' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const timers = useRef<number[]>([]);
  const last = loadLast();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Every screen change goes through the iris so the boot flow feels staged. */
  const go = (next: Screen) => {
    if (wipe) return; // one transition at a time
    setWipe('close');
    timers.current.push(
      window.setTimeout(() => {
        setScreen(next);
        setWipe('open');
      }, CLOSE_MS),
      window.setTimeout(() => setWipe(null), CLOSE_MS + OPEN_MS),
    );
  };

  const enter = (level: LevelEntry) => {
    localStorage.setItem(LAST_KEY, JSON.stringify(level));
    go({ name: 'level', level });
  };

  return (
    <>
      {screen.name === 'title' && (
        <TitleScreen
          hasContinue={last !== null}
          onContinue={() => last && enter(last)}
          onStart={() => go({ name: 'select' })}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {screen.name === 'select' && (
        <SelectScreen onEnter={enter} onBack={() => go({ name: 'title' })} />
      )}
      {screen.name === 'level' && (
        <LevelView
          key={screen.level.id}
          level={screen.level}
          onExit={() => go({ name: 'select' })}
          onOpenSettings={() => setSettingsOpen(true)}
          onMissing={() => {
            // Forget it as well as leaving it, or Continue walks straight back
            // into the level that just turned out not to exist.
            localStorage.removeItem(LAST_KEY);
            go({ name: 'select' });
          }}
        />
      )}
      {wipe && <div className={`iris ${wipe}`} />}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onOpenRoles={() => {
            setSettingsOpen(false);
            setRolesOpen(true);
          }}
          onOpenCrew={() => {
            setSettingsOpen(false);
            setCrewOpen(true);
          }}
        />
      )}
      {rolesOpen && <RolesModal onClose={() => setRolesOpen(false)} />}
      {crewOpen && <CrewModal onClose={() => setCrewOpen(false)} />}
    </>
  );
}
