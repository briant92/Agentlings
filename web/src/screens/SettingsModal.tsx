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
  /** Which connection's token drawer is open, and its in-progress state. */
  const [drawer, setDrawer] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  /** "connected as @bot" lines, kept after the drawer closes. */
  const [connectedAs, setConnectedAs] = useState<Record<string, string>>({});

  useEffect(() => {
    void api<SettingsInfo>('/api/settings').then(setSettings);
  }, []);

  /** The server is what makes it true, so the reply is what we render. */
  const toggle = async (name: string, enabled: boolean) => {
    const connections = await api<SettingsInfo['connections']>(
      `/api/settings/connections/${name}`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) },
    );
    setSettings((prev) => (prev ? { ...prev, connections } : prev));
  };

  const openDrawer = (name: string | null) => {
    setDrawer(name);
    setValues({});
    setDrawerError(null);
  };

  /** Validated by one real call server-side; stored only when it answered. */
  const submitSecret = async (name: string, secret: string) => {
    setChecking(true);
    setDrawerError(null);
    try {
      const reply = await api<{ connections: SettingsInfo['connections']; identity: string | null }>(
        `/api/settings/connections/${name}/secret`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, value: values[secret] ?? '' }),
        },
      );
      setSettings((prev) => (prev ? { ...prev, connections: reply.connections } : prev));
      setConnectedAs((prev) => ({
        ...prev,
        [name]: reply.identity ? `connected as ${reply.identity}` : 'key accepted — connected',
      }));
      openDrawer(null);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

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
          {settings?.executor === 'claude-agent-sdk' && !settings.auth.problem && (
            <p className="stat-done">claude-agent-sdk — jobs run real Claude sessions.</p>
          )}
          {/* Said here rather than discovered one failed agentling at a time. */}
          {settings?.executor === 'claude-agent-sdk' && settings.auth.problem && (
            <p className="stat-failed">{settings.auth.problem}</p>
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
          {/* The crew reaches outside by default — this is where you take that
              back, once, rather than deciding it again for every job. */}
          <div className="sect">outside world</div>
          {settings?.connections.map((connection) => (
            <div key={connection.name}>
              <label className={`toggle${connection.ready ? '' : ' toggle-blocked'}`}>
                <input
                  type="checkbox"
                  checked={connection.enabled}
                  disabled={!connection.ready}
                  onChange={(e) => void toggle(connection.name, e.target.checked)}
                />
                <span>
                  {connection.label} — {connection.description}
                </span>
              </label>
              {!connection.ready && (
                <p className="dim conn-note">
                  Needs {connection.missingSecrets.join(', ')} —{' '}
                  <button
                    className="work-link"
                    onClick={() => openDrawer(drawer === connection.name ? null : connection.name)}
                  >
                    {drawer === connection.name ? 'close' : 'add it here'}
                  </button>{' '}
                  or set it in .env.
                </p>
              )}
              {!connection.ready && drawer === connection.name && (
                <div className="secret-drawer">
                  {connection.setup && (
                    <ol className="secret-steps">
                      {connection.setup.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {connection.missingSecrets.map((secret) => (
                    <div key={secret} className="secret-row">
                      <input
                        type="password"
                        placeholder={secret}
                        value={values[secret] ?? ''}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [secret]: e.target.value }))
                        }
                      />
                      <button
                        disabled={checking || !(values[secret] ?? '').trim()}
                        onClick={() => void submitSecret(connection.name, secret)}
                      >
                        {checking ? 'Checking…' : 'Check'}
                      </button>
                    </div>
                  ))}
                  {drawerError && <p className="error">{drawerError}</p>}
                  <p className="dim secret-note">
                    Checked with one real call before it is saved. Saved to .env; it never
                    appears on screen again. Connecting does not switch anything on.
                  </p>
                </div>
              )}
              {connection.ready && connectedAs[connection.name] && (
                <p className="stat-done conn-note">✓ {connectedAs[connection.name]}</p>
              )}
              {connection.ready && connection.defaultOn && !connection.enabled && (
                <p className="dim conn-note">
                  Off — the crew works from what you give them. Jobs that would have
                  fetched a page now cost a session instead.
                </p>
              )}
            </div>
          ))}
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
