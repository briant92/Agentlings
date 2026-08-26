import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import type {
  AudiencePerson,
  ChannelShelf,
  ConnectionInfo,
  DoorUsage,
  SettingsInfo,
  SweepResult,
  WorkingCopiesInfo,
} from '@agentlings/shared';
import { api } from '../api';
import { AddConnection } from './AddConnection';
import { ChannelLogo } from '../panels/ChannelLogo';
import { ExpandRow, Section } from '../panels/Section';
import { resetTour, tourSeen } from '../panels/Tour';
import { crtEnabled, setCrt } from '../ui/crt';
import {
  authWording,
  byKind,
  needsLine,
  splitReads,
  tabOf,
  trailBegan,
  trailNote,
  usageDetail,
  usageFact,
  type Tab,
  disconnectLabel,
  disconnectWording,
} from './settings';

/** Disk sizes in the unit the numbers were measured in. */
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Which board was last open — a hint the browser keeps, like a fold. */
const TAB_KEY = 'agentlings:settings:tab';
function readTab(): Tab {
  try {
    return tabOf(localStorage.getItem(TAB_KEY));
  } catch {
    return 'reads';
  }
}
function saveTab(tab: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // A lost hint, not a lost setting.
  }
}

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * One connection as a row (UI.md, step 15): mark · name · what the trail
 * says · the switch — or, when a secret is missing, what it still needs and
 * the pill. The body holds the description, the trail's detail and whatever
 * the modal hands in: the secret drawer, the people a bot knows, a
 * re-approval, the note for a door switched off.
 *
 * The switch and the links stop their clicks at themselves, so flipping a
 * door never also opens the row. Opening the drawer remounts the row open —
 * how a link in the head opens the body without the row owning a second
 * open state.
 */
function ConnectionRow({
  connection,
  usage,
  began,
  now,
  fact,
  drawerOpen,
  onAddHere,
  onToggle,
  children,
}: {
  connection: ConnectionInfo;
  usage?: DoorUsage;
  began: number | null;
  now: number;
  /** A fact beside the name that is not the trail's — who a bot knows. */
  fact?: ReactNode;
  drawerOpen: boolean;
  onAddHere: () => void;
  onToggle: (enabled: boolean) => void;
  children?: ReactNode;
}) {
  // Only a builtin door passes the trail; the browser runs as its own process.
  const used = connection.kind === 'read' ? usageFact(usage, began, now, connection.builtin) : null;
  const detail =
    connection.kind === 'read' ? usageDetail(usage, began, now, connection.builtin) : null;
  const needs = needsLine(connection);
  return (
    <ExpandRow
      key={drawerOpen ? 'drawer' : 'row'}
      open={drawerOpen}
      className={connection.ready ? 'door' : 'door need'}
      head={
        <>
          <ChannelLogo channel={connection.name} />
          <span className="nm">
            {connection.label}
            {connection.identity && <span className="d"> · {connection.identity}</span>}
          </span>
          {!connection.ready ? (
            <>
              <span className="fact warn">
                {needs.text} ·{' '}
                <button
                  type="button"
                  className="work-link"
                  onClick={(e) => {
                    stop(e);
                    onAddHere();
                  }}
                >
                  {needs.link}
                </button>
              </span>
              <span className="pill need">needs set-up</span>
            </>
          ) : (
            <>
              {used && 'used' in used && (
                <span className="fact">
                  used <b>{used.used}×</b> · last {used.last}
                </span>
              )}
              {used && 'unusedSince' in used && (
                <span className="fact warn">not used since {used.unusedSince}</span>
              )}
              {fact}
              <label className={`tgl${connection.enabled ? ' on' : ''}`} onClick={stop}>
                <input
                  type="checkbox"
                  checked={connection.enabled}
                  aria-label={connection.label}
                  onChange={(e) => onToggle(e.target.checked)}
                />
                <i />
              </label>
            </>
          )}
        </>
      }
    >
      <p>{connection.description}</p>
      {detail && <p className="dim">{detail}</p>}
      {children}
    </ExpandRow>
  );
}

export function SettingsModal({
  onClose,
  onOpenRoles,
  onOpenCrew,
}: {
  onClose: () => void;
  onOpenRoles: () => void;
  onOpenCrew: () => void;
}) {
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [tab, setTab] = useState<Tab>(readTab);
  const pick = (next: Tab) => {
    setTab(next);
    saveTab(next);
  };
  /** Every door's use off the trail (UI.md, step 8): null until it lands, empty before any call. */
  const [doors, setDoors] = useState<DoorUsage[] | null>(null);
  const [crt, setCrtState] = useState(crtEnabled());
  const [tourDone, setTourDone] = useState(tourSeen());
  /** Which connection's token drawer is open, and its in-progress state. */
  const [drawer, setDrawer] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  /**
   * The supervised browser's form (D-255): the hosts as typed and the profile
   * folder, seeded from what the server holds and saved as one — nothing
   * here switches the door on. `actNote` is the last save's answer.
   */
  const [actHosts, setActHosts] = useState('');
  const [actProfile, setActProfile] = useState('');
  const [actNote, setActNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!settings) return;
    setActHosts(settings.browserAct.allow.join(', '));
    setActProfile(settings.browserAct.profileDir);
  }, [settings?.browserAct.allow.join(','), settings?.browserAct.profileDir]);
  const saveBrowserAct = async () => {
    setActNote(null);
    try {
      const saved = await api<SettingsInfo['browserAct']>('/api/settings/browser-act', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allow: actHosts, profileDir: actProfile }),
      });
      setSettings((prev) => (prev ? { ...prev, browserAct: saved } : prev));
      setActNote({
        text: saved.allow.length
          ? `saved — a run may reach ${saved.allow.join(', ')} and nothing else`
          : 'saved — the list is empty, so every navigation will be refused until you add a site',
      });
    } catch (err) {
      setActNote({ text: err instanceof Error ? err.message : 'could not save', error: true });
    }
  };
  /**
   * The payee allowlist's form (D-268). The list itself lives on `settings`
   * and is the server's answer after every write — never a local copy kept in
   * step, because a list of who may be paid that disagreed with the server's
   * would be the worst possible thing to be wrong about.
   */
  const wire = settings?.wire ?? null;
  const [chargeAccount, setChargeAccount] = useState('');
  const [payee, setPayee] = useState({
    rut: '',
    name: '',
    bank: '',
    account: '',
    accountLabel: '',
  });
  const [wireNote, setWireNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (settings) setChargeAccount(settings.wire.chargeAccount);
  }, [settings?.wire.chargeAccount]);
  /** Every wire write answers with the whole settings, which replaces the list. */
  const putWire = async (path: string, init?: RequestInit) => {
    const saved = await api<SettingsInfo['wire']>(path, init);
    setSettings((prev) => (prev ? { ...prev, wire: saved } : prev));
    return saved;
  };
  const saveWire = async () => {
    setWireNote(null);
    try {
      const saved = await putWire('/api/settings/wire', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chargeAccount, format: wire?.format ?? 'bci' }),
      });
      setWireNote({
        text: saved.chargeAccount
          ? `saved — batches debit account ${saved.chargeAccount}`
          : 'saved — no charge account, so every batch is refused until you set one',
      });
    } catch (err) {
      setWireNote({ text: err instanceof Error ? err.message : 'could not save', error: true });
    }
  };
  const addPayee = async () => {
    setWireNote(null);
    try {
      await putWire('/api/settings/wire/payees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payee),
      });
      setWireNote({ text: `added ${payee.name.trim()} — batches may name them` });
      setPayee({ rut: '', name: '', bank: '', account: '', accountLabel: '' });
    } catch (err) {
      setWireNote({ text: err instanceof Error ? err.message : 'could not add', error: true });
    }
  };
  const removePayee = async (rut: string) => {
    setWireNote(null);
    try {
      await putWire(`/api/settings/wire/payees/${encodeURIComponent(rut)}`, { method: 'DELETE' });
      setWireNote({ text: `removed ${rut} — a batch naming them is now refused` });
    } catch (err) {
      setWireNote({ text: err instanceof Error ? err.message : 'could not remove', error: true });
    }
  };
  /** A Google sign-in tab is open; the server flips ready when it comes back. */
  const [googlePending, setGooglePending] = useState(false);
  /** The connected row's re-approve (D-123): sent, or why it could not be. */
  const [reconnectSent, setReconnectSent] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  /** Disconnect (D-218): which row is armed, which is mid-call, and what the last one said. */
  const [disconnectArmed, setDisconnectArmed] = useState<string | null>(null);
  /** Press-twice for removing an added connection, the same shape as Disconnect. */
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [disconnectNote, setDisconnectNote] = useState<{
    name: string;
    text: string;
    error: boolean;
  } | null>(null);

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
    void api<{ doors: DoorUsage[] }>('/api/doors/usage')
      .then((reply) => setDoors(reply.doors))
      .catch(() => setDoors([]));
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
   * Forget a connection's secrets (D-218): the house press-twice — the first
   * press arms and names who else goes with it, the second acts. Google's
   * token is revoked at Google first; a revoke that did not happen is said on
   * the row, and the secrets are forgotten regardless.
   */
  const disconnect = async (connection: ConnectionInfo) => {
    if (disconnecting) return;
    if (disconnectArmed !== connection.name) {
      setDisconnectArmed(connection.name);
      return;
    }
    setDisconnectArmed(null);
    setDisconnecting(connection.name);
    setDisconnectNote(null);
    try {
      const reply = await api<{
        connections: SettingsInfo['connections'];
        revoked: boolean | null;
        note?: string;
      }>(`/api/settings/connections/${connection.name}/secrets`, { method: 'DELETE' });
      setSettings((prev) => (prev ? { ...prev, connections: reply.connections } : prev));
      if (reply.note) {
        setDisconnectNote({ name: connection.name, text: reply.note, error: reply.revoked === false });
      }
    } catch (err) {
      setDisconnectNote({
        name: connection.name,
        text: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setDisconnecting(null);
    }
  };

  /**
   * Re-walk the consent with the client already stored (D-123). Scopes never
   * grow on an existing token, so when a new ability lands — reading the
   * people you have emailed — the connected row must offer the fresh
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

  const { reads, sends } = byKind(settings?.connections ?? []);
  const { alwaysOn, sources } = splitReads(reads);
  const usage = new Map((doors ?? []).map((d) => [d.door, d]));
  const began = trailBegan(doors ?? []);
  const now = Date.now();

  /** The secret drawer for a connection that is not ready — the same drawer the cards had. */
  const secretDrawer = (connection: ConnectionInfo) => (
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
                onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
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
              Approve in the tab that just opened — your password goes to Google, never here.
              This row flips the moment the sign-in comes back.
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
                onChange={(e) => setValues((prev) => ({ ...prev, [secret]: e.target.value }))}
              />
            </div>
          ))}
          <div className="secret-row">
            <button
              disabled={checking || connection.missingSecrets.some((s) => !(values[s] ?? '').trim())}
              onClick={() => void submitSecrets(connection.name, connection.missingSecrets)}
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
          : 'Checked with one real call before it is saved. Saved to .env; it never appears on screen again. Connecting does not switch anything on.'}{' '}
        Or set it in .env ·{' '}
        <button className="work-link" onClick={() => openDrawer(null)}>
          close
        </button>
      </p>
    </div>
  );

  /** What a row's body carries beyond its description: a re-approval, the drawer, the off note, the people a bot knows. */
  const body = (connection: ConnectionInfo) => (
    <>
      {/* Only a connection this machine added can be removed (D-244): one the
          app ships is part of the product, and the way to stop using it is the
          switch above. Its keys stay in `.env` — forgetting a value is
          Disconnect's job (D-218), and doing it quietly here could take a token
          shared with something else. */}
      {connection.added && (
        <p>
          <button
            className="work-link"
            onClick={() => {
              if (removeArmed !== connection.name) {
                setRemoveArmed(connection.name);
                return;
              }
              setRemoveArmed(null);
              void api<{ connections: SettingsInfo['connections'] }>(
                `/api/connections/${connection.name}`,
                { method: 'DELETE' },
              )
                .then((reply) =>
                  setSettings((prev) => (prev ? { ...prev, connections: reply.connections } : prev)),
                )
                .catch(() => setRemoveArmed(null));
            }}
          >
            {removeArmed === connection.name ? 'remove — press again' : 'remove this connection'}
          </button>{' '}
          — you added this one. Its keys stay in <code>.env</code>; use Disconnect to forget those.
        </p>
      )}
      {/* The supervised browser's two settings (D-255), on its own row: the
          sites a run may reach, and the profile folder the person signs into
          through the window. Saving switches nothing on. */}
      {connection.supervised && (
        <div className="secret-drawer">
          <div className="secret-row">
            <input
              type="text"
              placeholder="sites a run may reach — example.com, portal.bank.cl"
              aria-label="browser-act allowlist"
              value={actHosts}
              spellCheck={false}
              onChange={(e) => setActHosts(e.target.value)}
            />
          </div>
          <div className="secret-row">
            <input
              type="text"
              placeholder="profile folder"
              aria-label="browser-act profile folder"
              value={actProfile}
              spellCheck={false}
              onChange={(e) => setActProfile(e.target.value)}
            />
          </div>
          <div className="secret-row">
            <button onClick={() => void saveBrowserAct()}>Save</button>
          </div>
          {actNote && <p className={actNote.error ? 'error' : 'dim'}>{actNote.text}</p>}
          <p className="dim secret-note">
            Hosts and their subdomains, nothing else; a rule or schedule can never hold this door.
            The window opens on this screen, signed in however you left that profile — sign in
            there yourself once, the app never types a password. Close the window to end a run.
          </p>
        </div>
      )}
      {connection.name === 'google' && connection.ready && (
        <p>
          {reconnectSent ? (
            <>approve in the Google tab that opened — it says Connected when the new permission lands.</>
          ) : (
            <>
              <button className="work-link" onClick={() => void reconnectGoogle()}>
                re-approve access
              </button>{' '}
              — Google asks again in a new tab. Needed once when a new ability arrives, like reading
              the people you have emailed.
            </>
          )}
          {reconnectError && <span className="error"> {reconnectError}</span>}
        </p>
      )}
      {connection.ready && connection.credentialed && (
        <p>
          <button
            className="work-link"
            disabled={disconnecting === connection.name}
            onClick={() => void disconnect(connection)}
          >
            {disconnectLabel(
              connection,
              disconnectArmed === connection.name,
              disconnecting === connection.name,
            )}
          </button>{' '}
          — {disconnectWording(connection)}
        </p>
      )}
      {disconnectNote?.name === connection.name && (
        <p className={disconnectNote.error ? 'error' : 'dim'}>{disconnectNote.text}</p>
      )}
      {!connection.ready && drawer === connection.name && secretDrawer(connection)}
      {connection.ready && connection.defaultOn && !connection.enabled && (
        <p className="dim">
          Off — the crew works from what you give them. Jobs that would have fetched a page now
          cost a session instead.
        </p>
      )}
      {/* Who the bot knows (D-092): the opt-in audience, persisted — the To
          picker's list, visible where connections live. */}
      {connection.name === 'telegram' && connection.ready && audience !== null && (
        <div>
          <button className="work-link" onClick={() => setAudienceOpen((v) => !v)}>
            {audienceOpen ? 'hide the people' : 'show the people'}
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
    </>
  );

  const row = (connection: ConnectionInfo) => (
    <ConnectionRow
      key={connection.name}
      connection={connection}
      usage={usage.get(connection.name)}
      began={began}
      now={now}
      fact={
        connection.name === 'telegram' && connection.ready && audience !== null ? (
          <span className="fact">
            knows{' '}
            <b>
              {audience.length} {audience.length === 1 ? 'person' : 'people'}
            </b>
          </span>
        ) : undefined
      }
      drawerOpen={drawer === connection.name}
      onAddHere={() => openDrawer(connection.name)}
      onToggle={(enabled) => void toggle(connection.name, enabled)}
    >
      {body(connection)}
    </ConnectionRow>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Settings</span>
          <button onClick={onClose}>✕</button>
        </div>
        {/* Three boards (UI.md, step 15): what a run may read, what approval
            may send, and the app itself. The last one opened is remembered. */}
        <div className="p-tabs">
          <button className={tab === 'reads' ? 'p-tab on' : 'p-tab'} onClick={() => pick('reads')}>
            reads{settings ? ` · ${reads.length}` : ''}
          </button>
          <button className={tab === 'sends' ? 'p-tab on' : 'p-tab'} onClick={() => pick('sends')}>
            sends{settings ? ` · ${sends.length}` : ''}
          </button>
          <button className={tab === 'app' ? 'p-tab on' : 'p-tab'} onClick={() => pick('app')}>
            app
          </button>
        </div>
        <div className="m-body">
          {tab === 'reads' && (
            <>
              <p className="door-intro">
                What a run may read. The crew reaches outside by default — this is where you take
                that back, once, rather than deciding it again for every job.
              </p>
              {settings === null && <p className="dim">Loading…</p>}
              {alwaysOn.length > 0 && (
                <Section
                  panel="settings"
                  id="always-on"
                  label="always on, nothing to set up"
                  count={alwaysOn.length}
                  summary={alwaysOn.map((c) => c.label).join(' · ')}
                >
                  {alwaysOn.map(row)}
                </Section>
              )}
              {sources.length > 0 && <div className="sect">sources</div>}
              {sources.map(row)}
              {/* Any MCP server, not only the ones this app happens to ship
                  (D-244). It lives under `reads` because that is where a job's
                  reach is decided; a sending connection is still the outbox's
                  business and is not addable here. */}
              <AddConnection
                connections={settings?.connections ?? []}
                onAdded={(connections) =>
                  setSettings((prev) => (prev ? { ...prev, connections } : prev))
                }
              />
              <p className="lib-status door-foot">
                Switching a door off is level-wide: every job that would have used it costs a
                session instead. {trailNote(doors)}
              </p>
            </>
          )}
          {tab === 'sends' && (
            <>
              <p className="door-intro">
                What approval may send. Sends happen at review, never inside a run — the crew gets
                no tools from any of these.
              </p>
              {settings === null && <p className="dim">Loading…</p>}
              {sends.map(row)}
              {/* The tiers beyond the rows (D-077, served by the shelf route):
                  planned as quiet chips, and the refusals folded with the
                  reason on each row — so nobody waits for a channel this menu
                  will not grow. */}
              {shelf && shelf.planned.length > 0 && (
                <div className="minis door-planned">
                  <span className="minis-label">planned</span>
                  {shelf.planned.map((r) => (
                    <span key={r.channel} className="mini" title={r.detail}>
                      <ChannelLogo channel={r.channel} />
                      {r.label}
                    </span>
                  ))}
                </div>
              )}
              {shelf && shelf.never.length > 0 && (
                <Section
                  panel="settings"
                  id="never"
                  label="never on this menu"
                  count={`${shelf.never.length} channels`}
                  summary="each with its reason — so nobody waits for them"
                >
                  <div className="shelf">
                    {shelf.never.map((r) => (
                      <p key={r.channel} className="shelf-row">
                        <b>{r.label}</b> — {r.detail}
                      </p>
                    ))}
                  </div>
                </Section>
              )}
              {/* The payee allowlist (D-268). On this board because it is the
                  same question the rows above answer — what a review may let
                  out — even though nothing here is sent: approving a batch
                  writes a file, and you authorise it at the bank yourself. */}
              <Section
                panel="settings"
                id="wire"
                label="payee allowlist — who a transfer batch may pay"
                count={wire ? wire.payees.length : '…'}
                summary={
                  wire?.chargeAccount
                    ? `from account ${wire.chargeAccount}`
                    : 'no charge account set'
                }
              >
                <div className="secret-drawer">
                  <p className="dim secret-note">
                    A nómina is composed here and authorised at your bank by hand — the app never
                    calls a payment endpoint. A run says who and how much; the bank, the account
                    and the name on the file come from this list, and only you add to it. A batch
                    naming anybody who is not here is refused whole at review, with the payee
                    named.
                  </p>
                  <div className="secret-row">
                    <input
                      type="text"
                      placeholder="charge account — the account a batch debits, digits only"
                      aria-label="wire charge account"
                      value={chargeAccount}
                      spellCheck={false}
                      onChange={(e) => setChargeAccount(e.target.value)}
                    />
                    <button onClick={() => void saveWire()}>Save</button>
                  </div>
                  {wire?.payees.length ? (
                    <ul className="wire-payees">
                      {wire.payees.map((payee) => (
                        <li key={payee.rut}>
                          <span className="wire-who">
                            <b>{payee.name}</b> · {payee.rut}
                          </span>
                          <span className="wire-where">
                            banco {payee.bank} · cuenta {payee.account}
                            {payee.accountLabel ? ` · ${payee.accountLabel}` : ''}
                          </span>
                          {/* One click, no arming: taking a payee off can only
                              ever narrow what may be paid, so a confirmation
                              would guard the safe direction. */}
                          <button
                            className="wire-rm"
                            aria-label={`remove ${payee.name}`}
                            onClick={() => void removePayee(payee.rut)}
                          >
                            remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dim">
                      Nobody is on the list, so every batch is refused. Add the first payee below.
                    </p>
                  )}
                  <div className="secret-row">
                    <input
                      type="text"
                      placeholder="RUT — 76123456-0"
                      aria-label="payee RUT"
                      value={payee.rut}
                      spellCheck={false}
                      onChange={(e) => setPayee({ ...payee, rut: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="name — as it goes on the file"
                      aria-label="payee name"
                      value={payee.name}
                      spellCheck={false}
                      onChange={(e) => setPayee({ ...payee, name: e.target.value })}
                    />
                  </div>
                  <div className="secret-row">
                    <input
                      type="text"
                      placeholder="bank code — 016"
                      aria-label="payee bank code"
                      value={payee.bank}
                      spellCheck={false}
                      onChange={(e) => setPayee({ ...payee, bank: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="account number — digits only"
                      aria-label="payee account number"
                      value={payee.account}
                      spellCheck={false}
                      onChange={(e) => setPayee({ ...payee, account: e.target.value })}
                    />
                  </div>
                  <div className="secret-row">
                    <input
                      type="text"
                      placeholder="account enrolled as — only if it is not already enrolled"
                      aria-label="payee enrolled account name"
                      value={payee.accountLabel}
                      spellCheck={false}
                      onChange={(e) => setPayee({ ...payee, accountLabel: e.target.value })}
                    />
                    <button onClick={() => void addPayee()}>Add payee</button>
                  </div>
                  {wireNote && (
                    <p className={wireNote.error ? 'error' : 'dim'}>{wireNote.text}</p>
                  )}
                </div>
              </Section>
            </>
          )}
          {tab === 'app' && (
            <>
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
                <p className="stat-done">
                  claude-agent-sdk — jobs run real Claude sessions · {authWording(settings.auth.source)}.
                </p>
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
              <div className="sect">catalog</div>
              <p className="dim">Roles and skills are a global library shared by every level.</p>
              <div className="cat-btns">
                <button onClick={onOpenRoles}>Open roles &amp; skills</button>
                <button onClick={onOpenCrew}>Meet the crew</button>
              </div>
              <p className="dim">Meet the crew is the whole capability sheet in plain words — every trade, skill, power and door.</p>
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
                    Finished jobs keep the repo they cloned to work in. Nothing is sweepable right
                    now — clones under work still in review are kept.
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
                      only promoted, discarded or cleared jobs · {mb(copies.kept.bytes)} in{' '}
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
            </>
          )}
        </div>
        <div className="m-foot">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
