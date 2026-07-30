import { useState } from 'react';
import { ProfileModal } from './panels/ProfileModal';
import { QueueBar } from './panels/QueueBar';
import { ReviewModal } from './panels/ReviewModal';
import { RolesModal } from './panels/RolesModal';
import { Terminal } from './panels/Terminal';
import { useWorld } from './useWorld';
import { WorldCanvas } from './world/WorldCanvas';

export default function App() {
  const { world, connected, events } = useWorld();
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const reviewJob = world?.jobs.find((j) => j.id === reviewJobId) ?? null;

  return (
    <div className="app">
      <header>
        <h1>Agentlings</h1>
        <span className={connected ? 'status on' : 'status off'}>
          {connected ? 'live' : 'connecting…'}
        </span>
        <button className="ghost h-roles" onClick={() => setRolesOpen(true)}>
          roles
        </button>
      </header>
      <main>
        <WorldCanvas world={world} onSelect={setProfileId} />
        <QueueBar />
      </main>
      <Terminal world={world} events={events} onOpenReview={setReviewJobId} />
      {reviewJob && <ReviewModal job={reviewJob} onClose={() => setReviewJobId(null)} />}
      {profileId && <ProfileModal agentlingId={profileId} onClose={() => setProfileId(null)} />}
      {rolesOpen && <RolesModal onClose={() => setRolesOpen(false)} />}
    </div>
  );
}
