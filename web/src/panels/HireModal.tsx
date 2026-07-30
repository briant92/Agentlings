import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Agentling,
  LibrarySearchResult,
  MatchSuggestion,
  Refinement,
  RoleInfo,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { renderPortrait } from '../world/sprites';
import { LibraryResults } from './LibraryResults';

/** Below this the matcher says so rather than guessing (mirrors the server). */
const MIN_CONFIDENCE = 0.35;
const DEBOUNCE_MS = 250;

/** Installed jobs come from anywhere, so the article has to be worked out. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'An' : 'A';
}

const EXAMPLES = [
  'write documentation',
  'review my code',
  'research things',
  'fix bugs',
  'keep notes tidy',
];

/**
 * The first thing a new agentling ever asks. One question in plain language;
 * the concept matcher turns the answer into a role and skills, and shows the
 * words it matched on so the suggestion can be trusted or corrected.
 */
export function HireModal({
  levelId,
  agentling,
  onClose,
}: {
  levelId: string;
  agentling: Agentling;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState<MatchSuggestion | null>(null);
  const [refined, setRefined] = useState<Refinement | null>(null);
  const [library, setLibrary] = useState<LibrarySearchResult | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [override, setOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const portraitRef = useRef<HTMLCanvasElement>(null);
  /** The sentence a refinement must still match to be worth showing. */
  const latest = useRef('');

  const loadRoles = useCallback(() => api<RoleInfo[]>('/api/roles').then(setRoles), []);

  useEffect(() => {
    if (portraitRef.current) renderPortrait(portraitRef.current, 3);
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Match against what's installed; when that comes up short — no confident
   * job, or words nothing covers — search the library with the same sentence
   * so the answer is "here's what would do it" rather than "no".
   */
  const runMatch = useCallback(async (query: string) => {
    latest.current = query;
    const match = await api<MatchSuggestion>('/api/match', postJson({ text: query }));
    setSuggestion(match);
    setRefined(null);

    // Tier 2 runs alongside, never in front: the card is already drawn, and a
    // slow or unavailable refinement changes nothing.
    void api<{ available: boolean; refined: Refinement | null }>(
      '/api/match/refine',
      postJson({ text: query }),
    )
      .then((result) => {
        // Ignore a reply for a sentence the user has already moved on from.
        if (latest.current !== query) return;
        if (result.refined?.role) setRefined(result.refined);
      })
      .catch(() => setRefined(null));

    const thin = !match.role || match.confidence < MIN_CONFIDENCE || match.gaps.length > 0;
    if (!thin) {
      setLibrary(null);
      return;
    }
    setLibrary(await api<LibrarySearchResult>('/api/library/search', postJson({ text: query })));
  }, []);

  // Debounced so typing stays smooth; the match itself is local and instant.
  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setSuggestion(null);
      setLibrary(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void runMatch(query).catch(() => setSuggestion(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, runMatch]);

  // A refinement that named a job counts as confident on its own — it is the
  // stronger reader, and it can only have named a job that is installed.
  const confident =
    !!refined?.role || (!!suggestion && suggestion.confidence >= MIN_CONFIDENCE && !!suggestion.role);
  const chosen = override ?? refined?.role ?? suggestion?.role ?? null;
  const chosenRole = roles.find((r) => r.name === chosen);
  const suggested = refined
    ? [...new Set([...(chosenRole?.skills ?? []), ...refined.skills])]
    : (suggestion?.skills ?? chosenRole?.skills ?? []);
  const skills = override ? (chosenRole?.skills ?? []) : suggested;

  const accept = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      await api(
        lvl(levelId, `/agentlings/${agentling.id}/role`),
        postJson({ role: chosen, jobDescription: text.trim() || undefined }),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal hire" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">
            <span className="hire-arrive">{agentling.name}</span> just arrived
          </span>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="m-body">
          <div className="hire-ask">
            <canvas ref={portraitRef} className="portrait" />
            <div className="hire-field">
              <label htmlFor="hire-job">What will {agentling.name}&apos;s job be?</label>
              <textarea
                id="hire-job"
                autoFocus
                rows={2}
                placeholder="keep an eye on my repo and write up what changed"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setOverride(null);
                }}
              />
              <div className="chips">
                {EXAMPLES.map((example) => (
                  <button key={example} className="chip ex" onClick={() => setText(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {confident && (
            <div className="hire-card">
              <div className="sect">{agentling.name} will be</div>
              <p className="hire-role">
                {article(chosen ?? '')} <span className="hire-name">{chosen}</span> —{' '}
                {chosenRole?.description ?? ''}
              </p>
              <div className="chips">
                {skills.map((s) => (
                  <span key={s} className="chip skill">
                    {s}
                  </span>
                ))}
                {skills.length === 0 && <span className="dim">no extra abilities needed</span>}
              </div>
              {refined && !override ? (
                <p className="hire-why">
                  {refined.summary ?? `chosen for: ${text.trim()}`}
                  <span className="hire-checked"> · checked with Claude</span>
                </p>
              ) : (
                !!suggestion?.matchedTerms.length &&
                !override && (
                  <p className="hire-why">matched on: {suggestion.matchedTerms.join(' · ')}</p>
                )
              )}
            </div>
          )}

          {suggestion && !confident && (
            <div className="hire-card unsure">
              <p className="hire-unsure">
                Nobody here does that yet. Add one below, pick a job, or say it another way.
              </p>
              {suggestion.gaps.length > 0 && (
                <p className="hire-why">
                  nothing your crew has covers: {suggestion.gaps.join(' · ')}
                </p>
              )}
            </div>
          )}

          {library && library.hits.length > 0 && (
            <>
              <div className="sect">
                {confident ? 'you could also add' : 'from the library'}
              </div>
              <LibraryResults
                hits={library.hits}
                onInstalled={() => {
                  // Re-match: the new job or ability may be the better answer.
                  void loadRoles();
                  void runMatch(text.trim());
                }}
              />
            </>
          )}

          {(!confident || override !== null) && (
            <div className="hire-picker">
              <div className="sect">choose a job</div>
              {roles.map((r) => (
                <button
                  key={r.name}
                  className={`hire-option${chosen === r.name ? ' on' : ''}`}
                  onClick={() => setOverride(r.name)}
                >
                  <span className="badge queued">{r.name}</span>
                  <span className="dim r-desc">{r.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="m-foot p-foot">
          <button disabled={!chosen || saving} onClick={() => void accept()}>
            Looks right
          </button>
          {confident && override === null && (
            <button className="ghost" onClick={() => setOverride(chosen)}>
              Change
            </button>
          )}
          <span className="dim hire-hint">you can change this any time</span>
        </div>
      </div>
    </div>
  );
}
