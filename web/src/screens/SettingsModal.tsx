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
  /** A Google sign-in tab is open; the server flips ready when it comes back. */
  const [googlePending, setGooglePending] = useState(false);

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

  /**
   * All of a connection's missing secrets in one submission, validated
   * together by one real call server-side and stored only when it answered —
   * a two-secret connection (WhatsApp Business) can only be checked whole.
   */
  const submitSecrets = async (name: string, secrets: string[]) => {
    setChecking(true);
    setDrawerError(null);
    try {
      const reply = await api<{ connections: SettingsInfo['connections']; identity: string | null }>(
        `/api/settings/connections/${name}/secret`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            values: Object.fromEntries(secrets.map((s) => [s, values[s] ?? ''])),
          }),
        },
      );
      setSettings((prev) => (prev ? { ...prev, connections: reply.connections } : prev));
      openDrawer(null);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  /**
   * The Google Connect flow (D-080): the consent happens on Google's page in
   * a fresh tab, so this side only opens it and then watches Settings until
   * the loopback callback has stored the tokens and flipped `ready`.
   */
  const connectGoogle = async () => {
    setChecking(true);
    setDrawerError(null);
    try {
      const { url } = await api<{ url: string }>('/api/settings/connections/google/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: values.clientId ?? '',
          clientSecret: values.clientSecret ?? '',
        }),
      });
      window.open(url, '_blank', 'noopener');
      setGooglePending(true);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!googlePending) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      void api<SettingsInfo>('/api/settings')
        .then((next) => {
          if (next.connections.find((c) => c.name === 'google')?.ready) {
            setSettings(next);
            setGooglePending(false);
            setDrawer(null);
            setValues({});
          } else if (Date.now() - startedAt > 5 * 60_000) {
            setGooglePending(false);
            setDrawerError('The sign-in never came back — press Connect to try again.');
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [googlePending]);

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
                  {connection.name === 'google' ? (
                    <>
                      {(['clientId', 'clientSecret'] as const).map((field) => (
                        <div key={field} className="secret-row">
                          <input
                            type="password"
                            placeholder={field === 'clientId' ? 'client id' : 'client secret'}
                            value={values[field] ?? ''}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={googlePending}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                      <div className="secret-row">
                        <button
                          disabled={
                            checking ||
                            googlePending ||
                            !(values.clientId ?? '').trim() ||
                            !(values.clientSecret ?? '').trim()
                          }
                          onClick={() => void connectGoogle()}
                        >
                          {googlePending ? 'Waiting for Google…' : 'Connect Google'}
                        </button>
                        {googlePending && (
                          <button className="ghost" onClick={() => setGooglePending(false)}>
                            Cancel
                          </button>
                        )}
                      </div>
                      {googlePending && (
                        <p className="dim secret-note">
                          Approve in the tab that just opened — your password goes to Google,
                          never here. This card flips the moment the sign-in comes back.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
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
                        </div>
                      ))}
                      <div className="secret-row">
                        <button
                          disabled={
                            checking ||
                            connection.missingSecrets.some((s) => !(values[s] ?? '').trim())
                          }
                          onClick={() =>
                            void submitSecrets(connection.name, connection.missingSecrets)
                          }
                        >
                          {checking ? 'Checking…' : 'Check'}
                        </button>
                      </div>
                    </>
                  )}
                  {drawerError && <p className="error">{drawerError}</p>}
                  <p className="dim secret-note">
                    {connection.name === 'google'
                      ? 'Nothing is saved until Google confirms the sign-in. Connecting does not switch anything on.'
                      : 'Checked with one real call before it is saved. Saved to .env; it never appears on screen again. Connecting does not switch anything on.'}
                  </p>
                </div>
              )}
              {connection.ready && connection.identity && (
                <p className="stat-done conn-note">✓ connected as {connection.identity}</p>
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
