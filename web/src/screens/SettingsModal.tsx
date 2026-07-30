import { useEffect, useState } from 'react';
import type { SettingsInfo } from '@agentlings/shared';
import { api } from '../api';
import { resetTour, tourSeen } from '../panels/Tour';
import { crtEnabled, setCrt } from '../ui/crt';

export function SettingsModal({
  onClose,
  onOpenRoles,
}: {
  onClose: () => void;
  onOpenRoles: () => void;
}) {
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [crt, setCrtState] = useState(crtEnabled());
  const [tourDone, setTourDone] = useState(tourSeen());

  useEffect(() => {
    void api<SettingsInfo>('/api/settings').then(setSettings);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Settings</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <div className="sect">display</div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={crt}
              onChange={(e) => {
                setCrt(e.target.checked);
                setCrtState(e.target.checked);
              }}
            />
            <span>CRT filter — scanlines and vignette over the whole screen.</span>
          </label>
          <p className="lib-status">
            {tourDone ? 'You have seen the tour.' : 'The tour runs the next time you open a level.'}
            {tourDone && (
              <>
                {' · '}
                <button
                  className="work-link"
                  onClick={() => {
                    resetTour();
                    setTourDone(false);
                  }}
                >
                  show it again
                </button>
              </>
            )}
          </p>
          <div className="sect">executor</div>
          {settings === null && <p className="dim">Loading…</p>}
          {settings?.executor === 'claude-agent-sdk' && (
            <p className="stat-done">claude-agent-sdk — jobs run real Claude sessions.</p>
          )}
          {settings?.executor === 'simulated' && (
            <>
              <p className="dim">simulated — jobs are pretend work.</p>
              <p className="dim">
                To go live: copy .env.example → .env, set ANTHROPIC_API_KEY or a
                CLAUDE_CODE_OAUTH_TOKEN, and restart the dev server.
              </p>
            </>
          )}
          <div className="sect">catalog</div>
          <p className="dim">Roles and skills are a global library shared by every level.</p>
          <button onClick={onOpenRoles}>Open roles &amp; skills</button>
        </div>
        <div className="m-foot">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
