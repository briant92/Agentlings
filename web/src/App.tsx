import { useState } from 'react';
import { QueueBar } from './panels/QueueBar';
import { ReviewModal } from './panels/ReviewModal';
import { Terminal } from './panels/Terminal';
import { useWorld } from './useWorld';
import { WorldCanvas } from './world/WorldCanvas';

export default function App() {
  const { world, connected, events } = useWorld();
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const reviewJob = world?.jobs.find((j) => j.id === reviewJobId) ?? null;

  return (
    <div className="app">
      <header>
        <h1>Agentlings</h1>
        <span className={connected ? 'status on' : 'status off'}>
          {connected ? 'live' : 'connecting…'}
        </span>
      </header>
      <main>
        <WorldCanvas world={world} />
        <QueueBar />
      </main>
      <Terminal world={world} events={events} onOpenReview={setReviewJobId} />
      {reviewJob && <ReviewModal job={reviewJob} onClose={() => setReviewJobId(null)} />}
    </div>
  );
}
