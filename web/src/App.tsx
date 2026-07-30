import { useState } from 'react';
import { RolesModal } from './panels/RolesModal';
import { LevelView } from './screens/LevelView';
import { SelectScreen, type LevelEntry } from './screens/SelectScreen';
import { SettingsModal } from './screens/SettingsModal';
import { TitleScreen } from './screens/TitleScreen';

type Screen = { name: 'title' } | { name: 'select' } | { name: 'level'; level: LevelEntry };

const LAST_KEY = 'agentlings:last-level';

function loadLast(): LevelEntry | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as LevelEntry;
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const last = loadLast();

  const enter = (level: LevelEntry) => {
    localStorage.setItem(LAST_KEY, JSON.stringify(level));
    setScreen({ name: 'level', level });
  };

  return (
    <>
      {screen.name === 'title' && (
        <TitleScreen
          hasContinue={last !== null}
          onContinue={() => last && enter(last)}
          onStart={() => setScreen({ name: 'select' })}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {screen.name === 'select' && (
        <SelectScreen onEnter={enter} onBack={() => setScreen({ name: 'title' })} />
      )}
      {screen.name === 'level' && (
        <LevelView
          key={screen.level.id}
          level={screen.level}
          onExit={() => setScreen({ name: 'select' })}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onOpenRoles={() => {
            setSettingsOpen(false);
            setRolesOpen(true);
          }}
        />
      )}
      {rolesOpen && <RolesModal onClose={() => setRolesOpen(false)} />}
    </>
  );
}
