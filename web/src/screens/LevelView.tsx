import { useState } from 'react';
import { api, lvl } from '../api';
import { ProfileModal } from '../panels/ProfileModal';
import { QueueBar } from '../panels/QueueBar';
import { ReviewModal } from '../panels/ReviewModal';
import { RolesModal } from '../panels/RolesModal';
import { Terminal } from '../panels/Terminal';
import { useWorld } from '../useWorld';
import { WorldCanvas } from '../world/WorldCanvas';
import type { LevelEntry } from './SelectScreen';

/** One level's world: the diorama, queue bar, and terminal, fully scoped. */
export function LevelView({ level, onExit }: { level: LevelEntry; onExit: () => void }) {
  const { world, connected, events } = useWorld(level.id);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const reviewJob = world?.jobs.find((j) => j.id === reviewJobId) ?? null;

  const hire = async () => {
    await api(lvl(level.id, '/agentlings'), { method: 'POST' });
  };

  return (
    <div className="app">
      <header>
        <button className="ghost" onClick={onExit}>
          ◂ levels
        </button>
        <h1>Agentlings</h1>
        <span className="lvl-tag">{level.name}</span>
        <span className={connected ? 'status on' : 'status off'}>
          {connected ? 'live' : 'connecting…'}
        </span>
        <span className="h-actions">
          <button className="ghost" onClick={() => void hire()}>
            + hire
          </button>
          <button className="ghost" onClick={() => setRolesOpen(true)}>
            roles
          </button>
        </span>
      </header>
      <main>
        <WorldCanvas world={world} theme={level.theme} onSelect={setProfileId} />
        <QueueBar levelId={level.id} />
      </main>
      <Terminal levelId={level.id} world={world} events={events} onOpenReview={setReviewJobId} />
      {reviewJob && (
        <ReviewModal levelId={level.id} job={reviewJob} onClose={() => setReviewJobId(null)} />
      )}
      {profileId && (
        <ProfileModal
          levelId={level.id}
          agentlingId={profileId}
          onClose={() => setProfileId(null)}
        />
      )}
      {rolesOpen && <RolesModal onClose={() => setRolesOpen(false)} />}
    </div>
  );
}
