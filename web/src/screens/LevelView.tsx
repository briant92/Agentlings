import { useEffect, useRef, useState } from 'react';
import type { Agentling } from '@agentlings/shared';
import { api, lvl } from '../api';
import { CrewPanel } from '../panels/CrewPanel';
import { HireModal } from '../panels/HireModal';
import { ProfileModal } from '../panels/ProfileModal';
import { ReviewModal } from '../panels/ReviewModal';
import { RolesModal } from '../panels/RolesModal';
import { Terminal } from '../panels/Terminal';
import { Tour, tourSeen } from '../panels/Tour';
import { WorkBar } from '../panels/WorkBar';
import { useWorld } from '../useWorld';
import { WorldCanvas } from '../world/WorldCanvas';
import type { LevelEntry } from './SelectScreen';

/** One level's world: the diorama, queue bar, and terminal, fully scoped. */
export function LevelView({
  level,
  onExit,
  onMissing,
}: {
  level: LevelEntry;
  onExit: () => void;
  /** The level no longer exists — go somewhere that does, and stop offering it. */
  onMissing: () => void;
}) {
  const { world, connected, events, gone } = useWorld(level.id);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [crewOpen, setCrewOpen] = useState(false);
  const [hired, setHired] = useState<Agentling | null>(null);
  const [tour, setTour] = useState(false);
  const arrival = useRef<number | undefined>(undefined);
  const reviewJob = world?.jobs.find((j) => j.id === reviewJobId) ?? null;

  useEffect(() => () => clearTimeout(arrival.current), []);

  // Nothing here can work without the level, and there is no reconnect coming.
  useEffect(() => {
    if (gone) onMissing();
  }, [gone, onMissing]);

  // Let the iris finish and the world draw before pointing at anything.
  useEffect(() => {
    if (tourSeen()) return;
    const timer = window.setTimeout(() => setTour(true), 900);
    return () => clearTimeout(timer);
  }, []);

  // Let them drop through the hatch and land before asking anything — the
  // popup should read as caused by the arrival, not as a form.
  const hire = async () => {
    const agentling = await api<Agentling>(lvl(level.id, '/agentlings'), { method: 'POST' });
    arrival.current = window.setTimeout(() => setHired(agentling), 700);
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
          <button className="ghost" data-tour="hire" onClick={() => void hire()}>
            + hire
          </button>
          <button className="ghost" data-tour="crew" onClick={() => setCrewOpen(true)}>
            crew
          </button>
          <button
            className="ghost"
            onClick={() => {
              setLibraryQuery('');
              setRolesOpen(true);
            }}
          >
            library
          </button>
        </span>
      </header>
      <main>
        <WorldCanvas
          world={world}
          theme={level.theme}
          onSelect={setProfileId}
          onOpenCrew={() => setCrewOpen(true)}
        />
        <WorkBar
          levelId={level.id}
          onFindAbility={(text) => {
            setLibraryQuery(text);
            setRolesOpen(true);
          }}
        />
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
      {crewOpen && <CrewPanel levelId={level.id} onClose={() => setCrewOpen(false)} />}
      {hired && (
        <HireModal levelId={level.id} agentling={hired} onClose={() => setHired(null)} />
      )}
      {rolesOpen && (
        <RolesModal initialQuery={libraryQuery} onClose={() => setRolesOpen(false)} />
      )}
      {tour && !hired && !reviewJob && !profileId && !rolesOpen && (
        <Tour onDone={() => setTour(false)} />
      )}
    </div>
  );
}
