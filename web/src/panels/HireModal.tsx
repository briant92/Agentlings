import { useEffect, useRef, useState } from 'react';
import type { Agentling, MatchSuggestion, RoleInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { renderPortrait } from '../world/sprites';

/** Below this the matcher says so rather than guessing (mirrors the server). */
const MIN_CONFIDENCE = 0.35;
const DEBOUNCE_MS = 250;

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
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [override, setOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const portraitRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (portraitRef.current) renderPortrait(portraitRef.current, 3);
    void api<RoleInfo[]>('/api/roles').then(setRoles);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced so typing stays smooth; the endpoint itself is local and instant.
  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setSuggestion(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<MatchSuggestion>('/api/match', postJson({ text: query }))
        .then(setSuggestion)
        .catch(() => setSuggestion(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const confident = !!suggestion && suggestion.confidence >= MIN_CONFIDENCE && !!suggestion.role;
  const chosen = override ?? suggestion?.role ?? null;
  const chosenRole = roles.find((r) => r.name === chosen);
  const skills = override
    ? (chosenRole?.skills ?? [])
    : (suggestion?.skills ?? chosenRole?.skills ?? []);

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
                A <span className="hire-name">{chosen}</span> — {chosenRole?.description ?? ''}
              </p>
              <div className="chips">
                {skills.map((s) => (
                  <span key={s} className="chip skill">
                    {s}
                  </span>
                ))}
                {skills.length === 0 && <span className="dim">no extra abilities needed</span>}
              </div>
              {suggestion.matchedTerms.length > 0 && !override && (
                <p className="hire-why">matched on: {suggestion.matchedTerms.join(' · ')}</p>
              )}
            </div>
          )}

          {suggestion && !confident && (
            <div className="hire-card unsure">
              <p className="hire-unsure">
                I&apos;m not sure which job fits that. Pick one below, or say it another way.
              </p>
              {suggestion.gaps.length > 0 && (
                <p className="hire-why">
                  nothing in the library covers: {suggestion.gaps.join(' · ')}
                </p>
              )}
            </div>
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
