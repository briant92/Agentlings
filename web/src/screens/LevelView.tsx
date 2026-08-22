import { useEffect, useRef, useState } from 'react';
import type { Agentling, LevelProductivity } from '@agentlings/shared';
import { api, lvl } from '../api';
import { CrewPanel } from '../panels/CrewPanel';
import { CrewRail } from '../panels/CrewRail';
import { HireModal } from '../panels/HireModal';
import { ParcelDesk } from '../panels/ParcelDesk';
import { parcelOrder } from '../panels/parcels';
import { ProfileModal } from '../panels/ProfileModal';
import { ReviewModal } from '../panels/ReviewModal';
import { KnowledgeModal } from '../panels/KnowledgeModal';
import { RolesModal } from '../panels/RolesModal';
import { Terminal } from '../panels/Terminal';
import { Tour, tourSeen } from '../panels/Tour';
import { WorkBar } from '../panels/WorkBar';
import { useWorld } from '../useWorld';
import type { AnchorFn } from '../world/anchor';
import { WorldCanvas } from '../world/WorldCanvas';
import type { LevelEntry } from './SelectScreen';

/** One level's world: the diorama, queue bar, and terminal, fully scoped. */
export function LevelView({
  level,
  onExit,
  onOpenSettings,
  onMissing,
}: {
  level: LevelEntry;
  onExit: () => void;
  /** The ask-card's connect button lands in Settings, where the drawer is. */
  onOpenSettings: () => void;
  /** The level no longer exists — go somewhere that does, and stop offering it. */
  onMissing: () => void;
}) {
  const { world, connected, events, gone } = useWorld(level.id);
  // The file is optional and only the inbox sets it: everywhere else opens a
  // job, not one of its files, and lands on whatever the viewer ranks first.
  // `fromPile` marks a review opened from the parcel desk: it gets the queue
  // strip, and a verdict advances to the next waiting delivery.
  const [review, setReview] = useState<{
    jobId: string;
    file?: string;
    fromPile?: boolean;
  } | null>(null);
  const [parcelsOpen, setParcelsOpen] = useState(false);
  /**
   * The flow order, snapshotted when a review opens from the desk: verdicts
   * shrink the live queue, and advancing against a list that reshuffles
   * under each verdict would skip parcels. Ids resolved elsewhere are
   * filtered against the live queue at advance time instead.
   */
  const flowOrder = useRef<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [crewOpen, setCrewOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  /** "+" beside reading: open the panel already asking for a folder (D-102). */
  const [knowledgePick, setKnowledgePick] = useState(false);
  const [hired, setHired] = useState<Agentling | null>(null);
  const [tour, setTour] = useState(false);
  // Pointing at someone in the rail lights them up in the world and the other
  // way about, so the two halves of the panel are talking about the same crew.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const arrival = useRef<number | undefined>(undefined);
  /** The world's live sprite-anchor query; the ask-bubble reads it (D-084). */
  const anchorFor = useRef<AnchorFn | null>(null);
  const reviewJob = world?.jobs.find((j) => j.id === review?.jobId) ?? null;

  useEffect(() => () => clearTimeout(arrival.current), []);

  /**
   * The crew's record, fetched once here and handed to both panels that show
   * it. The productivity block and the backoffice were otherwise going to add
   * up the same money from two different sources and disagree about it — the
   * ledger keeps a row for every run ever made, the queue only the jobs still
   * in it, and on this project's own history that is a $1.60 gap.
   *
   * Refetched when the job list changes identity and at no other time: the
   * socket sends a list only when the queue's revision moves, so that is a
   * free and exact trigger for "something finished".
   */
  const [productivity, setProductivity] = useState<LevelProductivity | null>(null);
  const [revision, setRevision] = useState(0);
  const jobs = world?.jobs;
  useEffect(() => {
    if (jobs) setRevision((n) => n + 1);
  }, [jobs]);
  useEffect(() => {
    if (revision === 0) return;
    let alive = true;
    void api<LevelProductivity>(lvl(level.id, '/productivity'))
      .then((data) => alive && setProductivity(data))
      // A panel of figures that fails to load is not worth interrupting the
      // level for; it keeps the last ones it had.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [level.id, revision]);

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

  /** A review opened from the desk: snapshot the flow and join it. */
  const openFromPile = (jobId: string) => {
    flowOrder.current = parcelOrder(world?.jobs ?? []);
    setReview({ jobId, fromPile: true });
  };

  /**
   * The next parcel after a verdict or a skip: the id following this one in
   * the snapshot that is STILL waiting; none left closes back to the desk.
   */
  const advancePile = (from: string) => {
    const liveIds = new Set(parcelOrder(world?.jobs ?? []));
    const order = flowOrder.current;
    const at = order.indexOf(from);
    const next = order.slice(at + 1).find((id) => id !== from && liveIds.has(id));
    setReview(next ? { jobId: next, fromPile: true } : null);
  };

  const pileQueue =
    review?.fromPile && flowOrder.current.length > 0
      ? {
          position: Math.max(1, flowOrder.current.indexOf(review.jobId) + 1),
          total: flowOrder.current.length,
          onSkip: () => advancePile(review.jobId),
        }
      : undefined;

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
          <button className="ghost" onClick={() => setKnowledgeOpen(true)}>
            reading
          </button>
          <button
            className="ghost"
            title="Add a folder for this level to read"
            onClick={() => {
              setKnowledgePick(true);
              setKnowledgeOpen(true);
            }}
          >
            +
          </button>
        </span>
      </header>
      <main>
        <WorldCanvas
          world={world}
          theme={level.theme}
          events={events}
          onSelect={setProfileId}
          onOpenCrew={() => setCrewOpen(true)}
          onOpenReview={(jobId: string, file?: string) => setReview({ jobId, file })}
          onOpenParcels={() => setParcelsOpen(true)}
          onHover={setHoveredId}
          hoveredId={hoveredId}
          anchorFor={anchorFor}
        />
        <WorkBar
          levelId={level.id}
          onFindAbility={(text) => {
            setLibraryQuery(text);
            setRolesOpen(true);
          }}
          onOpenSettings={onOpenSettings}
          anchorFor={anchorFor}
        />
      </main>
      <aside className="side">
        <CrewRail
          world={world}
          events={events}
          hoveredId={hoveredId}
          productivity={productivity}
          onSelect={setProfileId}
          onHover={setHoveredId}
        />
        <Terminal
          levelId={level.id}
          world={world}
          events={events}
          revision={revision}
          onOpenReview={(jobId: string, file?: string) => setReview({ jobId, file })}
        />
      </aside>
      {parcelsOpen && !reviewJob && (
        <ParcelDesk
          levelId={level.id}
          jobs={world?.jobs ?? []}
          onOpenReview={openFromPile}
          onClose={() => setParcelsOpen(false)}
        />
      )}
      {reviewJob && (
        <ReviewModal
          levelId={level.id}
          job={reviewJob}
          file={review?.file}
          queue={pileQueue}
          crew={world?.agentlings ?? []}
          onDecided={review?.fromPile ? () => advancePile(reviewJob.id) : undefined}
          onClose={() => setReview(null)}
        />
      )}
      {profileId && (
        <ProfileModal
          levelId={level.id}
          agentlingId={profileId}
          onClose={() => setProfileId(null)}
        />
      )}
      {crewOpen && (
        <CrewPanel
          levelId={level.id}
          jobs={world?.jobs ?? []}
          productivity={productivity}
          onOpenReview={(jobId: string, file?: string) => setReview({ jobId, file })}
          onClose={() => setCrewOpen(false)}
        />
      )}
      {hired && (
        <HireModal levelId={level.id} agentling={hired} onClose={() => setHired(null)} />
      )}
      {rolesOpen && (
        <RolesModal initialQuery={libraryQuery} onClose={() => setRolesOpen(false)} />
      )}
      {knowledgeOpen && (
        <KnowledgeModal
          levelId={level.id}
          pickOnOpen={knowledgePick}
          onClose={() => {
            setKnowledgeOpen(false);
            setKnowledgePick(false);
          }}
        />
      )}
      {tour && !hired && !reviewJob && !profileId && !rolesOpen && !knowledgeOpen && !parcelsOpen && (
        <Tour onDone={() => setTour(false)} />
      )}
    </div>
  );
}
