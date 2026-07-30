import { QueuePanel } from './panels/QueuePanel';
import { useWorld } from './useWorld';
import { WorldCanvas } from './world/WorldCanvas';

export default function App() {
  const { world, connected } = useWorld();

  return (
    <div className="app">
      <header>
        <h1>Agentlings</h1>
        <span className={connected ? 'status on' : 'status off'}>
          {connected ? 'live' : 'connecting…'}
        </span>
      </header>
      <WorldCanvas world={world} />
      <QueuePanel world={world} />
    </div>
  );
}
