import { useEffect, useState } from 'react';
import type {
  AudiencePerson,
  ChannelShelf,
  SettingsInfo,
  SweepResult,
  WorkingCopiesInfo,
} from '@agentlings/shared';
import { api } from '../api';
import { ChannelLogo } from '../panels/ChannelLogo';
import { resetTour, tourSeen } from '../panels/Tour';
import { crtEnabled, setCrt } from '../ui/crt';

/** Disk sizes in the unit the numbers were measured in. */
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

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
  /** The connected card's re-approve (D-123): sent, or why it could not be. */
  const [reconnectSent, setReconnectSent] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  /** The tiers beyond the wired connections — planned, and never-with-why. */
  const [shelf, setShelf] = useState<ChannelShelf | null>(null);
  /** Who the bot knows (D-092) — reading is also the quiet refresh. */
  const [audience, setAudience] = useState<AudiencePerson[] | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  /** The repo clones under finished jobs — the measured disk weight. */
  const [copies, setCopies] = useState<WorkingCopiesInfo | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [swept, setSwept] = useState<SweepResult | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const loadCopies = () =>
    void api<WorkingCopiesInfo>('/api/working-copies')
      .then(setCopies)
      .catch(() => setCopies(null));

  const sweep = async () => {
    setSweeping(true);
    setSweepError(null);
    try {
      setSwept(await api<SweepResult>('/api/working-copies/sweep', { method: 'POST' }));
      loadCopies();
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : String(err));
    } finally {
      setSweeping(false);
    }
  };

  const loadAudience = () =>
    void api<{ people: AudiencePerson[] }>('/api/channels/telegram/audience')
      .then((reply) => setAudience(reply.people))
      .catch(() => setAudience([]));

  const unknow = async (id: string) => {
    const reply = await api<{ people: AudiencePerson[] }>(
      `/api/channels/telegram/audience/${id}`,
      { method: 'DELETE' },
    );
    setAudience(reply.people);
  };

  useEffect(() => {
    void api<SettingsInfo>('/api/settings').then((next) => {
      setSettings(next);
      if (next.connections.find((c) => c.name === 'telegram')?.ready) loadAudience();
    });
    void api<ChannelShelf>('/api/channels')
      .then(setShelf)
      .catch(() => setShelf(null));
    loadCopies();
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

  /**
   * Re-walk the consent with the client already stored (D-123). Scopes never
   * grow on an existing token, so when a new ability lands — reading the
   * people you have emailed — the connected card must offer the fresh
   * approval itself; a connected state with no way to re-consent was a dead
   * end of exactly D-111's kind. The empty body tells the server "same
   * client"; the approval happens on Google's page, and the callback storing
   * a new refresh token is the whole grant — nothing here to poll.
   */
  const reconnectGoogle = async () => {
    setReconnectError(null);
    try {
      const { url } = await api<{ url: string }>('/api/settings/connections/google/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      window.open(url, '_blank', 'noopener');
      setReconnectSent(true);
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
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
          {/* The garage, dressed as mock screen 3 (D-088): a card per
              connection — mark, name, identity, an honest pill — with the
              same switch and the same drawer the checkboxes had. */}
          <div className="conn-grid">
          {settings?.connections.map((connection) => (
            <div
              key={connection.name}
              className={drawer === connection.name ? 'conn-cell open' : 'conn-cell'}
            >
              <div className="conn" title={connection.description}>
                <ChannelLogo channel={connection.name} />
                <div className="conn-meta">
                  <div className="conn-nm">{connection.label}</div>
                  <div className="conn-id">{connection.identity ?? connection.description}</div>
                </div>
                <span
                  className={
                    !connection.ready ? 'pill need' : connection.enabled ? 'pill on' : 'pill off'
                  }
                >
                  {!connection.ready ? 'needs set-up' : connection.enabled ? 'on' : 'off'}
                </span>
                <label
                  className={`tgl${connection.enabled ? ' on' : ''}${connection.ready ? '' : ' blocked'}`}
                >
                  <input
                    type="checkbox"
                    checked={connection.enabled}
                    disabled={!connection.ready}
                    onChange={(e) => void toggle(connection.name, e.target.checked)}
                  />
                  <i />
                </label>
              </div>
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
              {connection.name === 'google' && connection.ready && (
                <p className="dim conn-note">
                  {reconnectSent ? (
                    <>approve in the Google tab that opened — it says Connected when the new permission lands.</>
                  ) : (
                    <>
                      <button className="work-link" onClick={() => void reconnectGoogle()}>
                        re-approve access
                      </button>{' '}
                      — Google asks again in a new tab. Needed once when a new ability arrives,
                      like reading the people you have emailed.
                    </>
                  )}
                  {reconnectError && <span className="error"> {reconnectError}</span>}
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
              {connection.ready && connection.defaultOn && !connection.enabled && (
                <p className="dim conn-note">
                  Off — the crew works from what you give them. Jobs that would have
                  fetched a page now cost a session instead.
                </p>
              )}
              {/* Who the bot knows (D-092): the opt-in audience, persisted —
                  the To picker's list, visible where connections live. */}
              {connection.name === 'telegram' && connection.ready && audience !== null && (
                <div className="conn-note">
                  <span className="dim">
                    knows {audience.length} {audience.length === 1 ? 'person' : 'people'}
                  </span>
                  {' · '}
                  <button className="work-link" onClick={() => setAudienceOpen((v) => !v)}>
                    {audienceOpen ? 'hide' : 'show'}
                  </button>
                  {' · '}
                  <button className="work-link" onClick={() => loadAudience()}>
                    check for new people
                  </button>
                  {audienceOpen && (
                    <div className="aud">
                      {audience.length === 0 && (
                        <p className="dim aud-empty">
                          Nobody yet — anyone the crew should message taps Start on the bot once.
                        </p>
                      )}
                      {audience.map((person) => (
                        <div key={person.id} className="aud-row">
                          <span className="aud-av" aria-hidden="true">
                            {person.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="aud-nm">{person.name}</span>
                          <span className="aud-id">{person.id}</span>
                          <span className="aud-src dim">
                            {person.viaStart ? 'tapped start' : ''}
                            {person.viaStart && person.sends > 0 ? ' · ' : ''}
                            {person.sends > 0 ? `sent ${person.sends}` : ''}
                          </span>
                          <button
                            type="button"
                            className="aud-x"
                            aria-label={`Forget ${person.name}`}
                            title="Forget them — they reappear if they say hello again"
                            onClick={() => void unknow(person.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>
          {/* The tiers beyond the cards (D-077, served by the shelf route):
              planned as quiet chips, and the refusals with the reason on the
              row — so nobody waits for a channel this menu will not grow. */}
          {shelf && shelf.planned.length > 0 && (
            <div className="minis">
              <span className="minis-label">planned</span>
              {shelf.planned.map((row) => (
                <span key={row.channel} className="mini" title={row.detail}>
                  <ChannelLogo channel={row.channel} />
                  {row.label}
                </span>
              ))}
            </div>
          )}
          {shelf && shelf.never.length > 0 && (
            <div className="shelf">
              <span className="minis-label">never on this menu — so nobody waits for them</span>
              {shelf.never.map((row) => (
                <p key={row.channel} className="shelf-row">
                  <b>{row.label}</b> — {row.detail}
                </p>
              ))}
            </div>
          )}
          <div className="sect">catalog</div>
          <p className="dim">Roles and skills are a global library shared by every level.</p>
          <button onClick={onOpenRoles}>Open roles &amp; skills</button>
          <div className="sect">maintenance</div>
          <div className="maint-card">
            <div className="maint-title">Working copies</div>
            {copies === null && <p className="dim">Measuring…</p>}
            {copies && copies.sweepable.clones > 0 && (
              <p className="dim">
                Finished jobs keep the repo they cloned to work in. Right now{' '}
                <b>
                  {mb(copies.sweepable.bytes)} across {copies.sweepable.clones} finished jobs
                </b>{' '}
                can go — transcripts, outputs and lessons stay, and a redo clones fresh anyway.
              </p>
            )}
            {copies && copies.sweepable.clones === 0 && (
              <p className="dim">
                Finished jobs keep the repo they cloned to work in. Nothing is sweepable right now —
                clones under work still in review are kept.
              </p>
            )}
            <div className="maint-foot">
              <button
                disabled={sweeping || !copies || copies.sweepable.clones === 0}
                onClick={() => void sweep()}
              >
                {sweeping ? 'sweeping…' : 'Sweep working copies'}
              </button>
              {copies && (
                <span className="dim">
                  only promoted or discarded jobs · {mb(copies.kept.bytes)} in{' '}
                  {copies.kept.clones} kept clones
                </span>
              )}
            </div>
            {swept && (
              <p className="stat-done">
                Freed {mb(swept.bytes)} across {swept.clones} clone{swept.clones === 1 ? '' : 's'}.
                {swept.skipped > 0
                  ? ` ${swept.skipped} skipped — something is holding them; try again later.`
                  : ''}
              </p>
            )}
            {sweepError && <p className="error">{sweepError}</p>}
          </div>
        </div>
        <div className="m-foot">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
