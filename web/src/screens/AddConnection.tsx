import { useState } from 'react';
import type { ConnectionInfo } from '@agentlings/shared';
import { api } from '../api';

/**
 * Adding a connection the app did not ship (D-244).
 *
 * The form deliberately mirrors the shape an MCP server's own README already
 * gives you — a command and arguments, or a URL and a header — because that is
 * what a user will have in front of them when they come here. Nothing is
 * invented for them to translate.
 *
 * **Nothing is saved until a server answers.** The one button both checks and
 * keeps: the tools it reports are what the connection will grant, so a
 * connection cannot exist in a state where nobody knows what it can do.
 *
 * Above the form (D-256): the **verified-here shelf** — the doors this install
 * has actually connected to, each with where its shape came from and when the
 * server answered — and a **browse over the public MCP registry**, which fills
 * the form from an entry and saves nothing. The browse replaced the D-245
 * chips; its rule survives them: a fill names its source and date, and the
 * probe is still the only thing that makes one real.
 */

interface SecretRow {
  name: string;
  why: string;
  value: string;
}

/** A registry entry as the form can take it — never a connection. */
interface Fill {
  name: string;
  label: string;
  description?: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  secrets?: Record<string, string>;
  docs?: string;
  source: string;
}
interface Hit {
  id: string;
  version: string;
  fill: Fill;
}
interface Omitted {
  id: string;
  why: string;
}

/**
 * The browse's states, each named. `unreachable` exists so that the registry
 * being down never shows as an empty list — which would read as "no such
 * server", the one thing the browse must never say by accident.
 */
type Browse =
  | { state: 'idle' }
  | { state: 'searching'; query: string }
  | { state: 'found'; query: string; hits: Hit[]; omitted: Omitted[]; truncated: boolean }
  | { state: 'unreachable'; query: string; error: string };

const blankSecret = (): SecretRow => ({ name: '', why: '', value: '' });

const day = (iso: string) => iso.slice(0, 10);
/** The distinct reasons entries were passed over, as one clause. */
const reasons = (omitted: Omitted[]) => [...new Set(omitted.map((o) => o.why))].join('; ');

export function AddConnection({
  connections,
  onAdded,
}: {
  connections: ConnectionInfo[];
  onAdded: (connections: ConnectionInfo[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [secrets, setSecrets] = useState<SecretRow[]>([blankSecret()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState<Browse>({ state: 'idle' });
  const [chosen, setChosen] = useState<Hit | null>(null);

  // The shelf lists what this install's probe has read a tool list from, and
  // nothing else: the stamp is written at the add (D-256), so a row without
  // one — a hand-edited file — is not a verified door and is not shown.
  const verified = connections.filter((c) => c.added && c.verifiedAt);

  const search = () => {
    const q = query.trim();
    if (!q) return;
    setBrowse({ state: 'searching', query: q });
    api<{ hits: Hit[]; omitted: Omitted[]; truncated: boolean }>(`/api/connections/registry?q=${encodeURIComponent(q)}`)
      .then((r) => setBrowse({ state: 'found', query: q, hits: r.hits, omitted: r.omitted, truncated: r.truncated }))
      .catch((err: unknown) =>
        setBrowse({ state: 'unreachable', query: q, error: err instanceof Error ? err.message : String(err) }),
      );
  };

  /** Fill the form from a registry entry. Nothing is submitted by choosing one. */
  const choose = (hit: Hit) => {
    const s = hit.fill;
    setChosen(hit);
    setError(null);
    setFound(null);
    setName(s.name);
    setLabel(s.label);
    setTransport(s.transport);
    if (s.transport === 'stdio') {
      setCommand(s.command ?? 'npx');
      setArgs((s.args ?? []).join('\n'));
    } else {
      setUrl(s.url ?? '');
      setHeaders(
        Object.entries(s.headers ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'),
      );
    }
    const declared = Object.entries(s.secrets ?? {});
    setSecrets(declared.length ? declared.map(([n, why]) => ({ name: n, why, value: '' })) : [blankSecret()]);
  };

  const draft = () => {
    const declared: Record<string, string> = {};
    for (const row of secrets) {
      if (row.name.trim()) declared[row.name.trim()] = row.why.trim() || 'needed by this server';
    }
    const base = {
      name: name.trim(),
      label: label.trim(),
      transport,
      secrets: declared,
      // Where the shape came from, for the shelf. Absent means typed by hand,
      // and the server says so.
      ...(chosen ? { source: chosen.fill.source } : {}),
    };
    if (transport === 'stdio') {
      return {
        ...base,
        command: command.trim(),
        // One argument per line, because arguments contain spaces and quoting
        // rules are the thing everybody gets wrong when a form splits on them.
        args: args.split('\n').map((a) => a.trim()).filter(Boolean),
      };
    }
    const parsed: Record<string, string> = {};
    for (const line of headers.split('\n')) {
      const at = line.indexOf(':');
      if (at <= 0) continue;
      parsed[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return { ...base, url: url.trim(), headers: parsed };
  };

  const values = () => {
    const out: Record<string, string> = {};
    for (const row of secrets) {
      if (row.name.trim() && row.value) out[row.name.trim()] = row.value;
    }
    return out;
  };

  const submit = (keep: boolean) => {
    setBusy(true);
    setError(null);
    setFound(null);
    api<{ tools: string[]; connections?: ConnectionInfo[] }>(
      keep ? '/api/connections' : '/api/connections/probe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft: draft(), values: values() }),
      },
    )
      .then((reply) => {
        setFound(reply.tools);
        if (reply.connections) {
          onAdded(reply.connections);
          setOpen(false);
          reset();
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const reset = () => {
    setName('');
    setLabel('');
    setTransport('stdio');
    setCommand('npx');
    setArgs('');
    setUrl('');
    setHeaders('');
    setSecrets([blankSecret()]);
    setFound(null);
    setError(null);
    setChosen(null);
    setQuery('');
    setBrowse({ state: 'idle' });
  };

  if (!open) {
    return (
      <button className="addc-open" onClick={() => setOpen(true)}>
        + add a connection of your own
      </button>
    );
  }

  return (
    <div className="addc">
      <p className="addc-intro">
        Any MCP server. Paste what its own instructions give you — a command to run here, or a
        web address to reach. It is checked before it is kept, and what it can do is read from the
        server rather than typed.
      </p>

      {verified.length > 0 && (
        <div className="addc-shelf">
          <div className="addc-section-head">verified here</div>
          {/* Only what this install has connected to — never a shape from a
              file — with where it came from and when the server answered. */}
          {verified.map((c) => (
            <div className="addc-shelf-row" key={c.name}>
              <span className="addc-shelf-label">{c.label}</span>
              <span className="addc-shelf-meta">
                answered {day(c.verifiedAt ?? '')} · shape from {c.source ?? 'not recorded'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="addc-registry">
        <div className="addc-section-head">or find one in the public MCP registry</div>
        <form
          className="addc-registry-search"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            className="addc-registry-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="a product, a company, a kind of data…"
            spellCheck={false}
          />
          <button type="submit" disabled={browse.state === 'searching' || !query.trim()}>
            {browse.state === 'searching' ? 'searching…' : 'search'}
          </button>
        </form>
        {browse.state === 'unreachable' && (
          <p className="addc-registry-down">
            The registry could not be reached, so nothing is listed — that is not the same as no such
            server. ({browse.error}) Try again in a moment, or paste the server&rsquo;s own
            instructions below.
          </p>
        )}
        {browse.state === 'found' && browse.hits.length === 0 && (
          <p className="addc-note addc-registry-none">
            Nothing in the registry matches &ldquo;{browse.query}&rdquo;
            {browse.omitted.length > 0
              ? ` in a shape this form can carry (${browse.omitted.length} passed over: ${reasons(browse.omitted)})`
              : ''}
            . Its own instructions can still be pasted below.
          </p>
        )}
        {browse.state === 'found' && browse.hits.length > 0 && (
          <>
            <div className="addc-registry-hits">
              {browse.hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`addc-registry-hit${chosen?.id === h.id ? ' on' : ''}`}
                  title={h.fill.description}
                  onClick={() => choose(h)}
                >
                  <span className="addc-registry-hit-name">
                    {h.fill.label} <small>{h.id} v{h.version}</small>
                  </span>
                  <span className="addc-registry-hit-meta">
                    {h.fill.transport === 'stdio' ? 'runs here' : 'runs elsewhere'} ·{' '}
                    {Object.keys(h.fill.secrets ?? {}).length
                      ? `keys: ${Object.keys(h.fill.secrets ?? {}).join(', ')}`
                      : 'no key named'}
                  </span>
                </button>
              ))}
            </div>
            {browse.omitted.length > 0 && (
              <p className="addc-note">
                {browse.omitted.length} more passed over — a shape this form cannot carry:{' '}
                {reasons(browse.omitted)}.
              </p>
            )}
            {/* A cut list must say so, or the rest reads as "no such server". */}
            {browse.truncated && (
              <p className="addc-note">
                The registry had more than this page for &ldquo;{browse.query}&rdquo; — only the first
                page is shown; try a more particular word.
              </p>
            )}
          </>
        )}
        {/* Said plainly, because it is the difference between a fill and a
            claim: a picked entry is what its authors published, and has not
            been connected to from here. The user's own check is what makes
            any of it true. */}
        {chosen ? (
          <p className="addc-note addc-registry-source">
            Shape from {chosen.fill.source}.{' '}
            {chosen.fill.docs && (
              <a href={chosen.fill.docs} target="_blank" rel="noreferrer">
                their page
              </a>
            )}{' '}
            — check it against theirs. Nothing here has been tried from this machine; pressing check
            is what tries it.
          </p>
        ) : (
          <p className="addc-note addc-registry-source">
            Picking one only fills the form, never tried from here — your check is what makes it
            real.
          </p>
        )}
      </div>

      <div className="addc-grid">
        <label>
          short name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="xero"
            spellCheck={false}
          />
        </label>
        <label>
          label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Xero accounting" />
        </label>
      </div>

      <div className="addc-kind">
        <button
          className={transport === 'stdio' ? 'on' : ''}
          onClick={() => setTransport('stdio')}
          type="button"
        >
          runs here
        </button>
        <button
          className={transport === 'http' ? 'on' : ''}
          onClick={() => setTransport('http')}
          type="button"
        >
          runs elsewhere
        </button>
      </div>

      {transport === 'stdio' ? (
        <div className="addc-grid">
          <label>
            command
            <input value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} />
          </label>
          <label>
            arguments — one per line
            <textarea
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={'-y\n@xeroapi/xero-mcp-server@latest'}
            />
          </label>
        </div>
      ) : (
        <div className="addc-grid">
          <label>
            address
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/v1"
              spellCheck={false}
            />
          </label>
          <label>
            headers — one per line, <code>Name: value</code>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={'Authorization: Bearer ${MY_TOKEN}'}
            />
          </label>
        </div>
      )}

      <div className="addc-secrets">
        <div className="addc-secrets-head">
          keys it needs
          <button type="button" onClick={() => setSecrets([...secrets, blankSecret()])}>
            + another
          </button>
        </div>
        {/* Written to .env like every other credential here (D-078), and only
            once the server has answered — a connection that never worked
            leaves nothing behind. */}
        {secrets.map((row, i) => (
          <div className="addc-secret" key={i}>
            <input
              value={row.name}
              placeholder="XERO_CLIENT_ID"
              spellCheck={false}
              onChange={(e) =>
                setSecrets(secrets.map((r, j) => (i === j ? { ...r, name: e.target.value } : r)))
              }
            />
            <input
              value={row.value}
              type="password"
              placeholder="paste the value"
              onChange={(e) =>
                setSecrets(secrets.map((r, j) => (i === j ? { ...r, value: e.target.value } : r)))
              }
            />
          </div>
        ))}
        <p className="addc-note">
          Use <code>{'${NAME}'}</code> in a header to stand for a key — the value is filled in when
          a job runs and never written into the job's own folder. A key already in <code>.env</code>{' '}
          under that name is used as it is.
        </p>
      </div>

      {found && !error && (
        <p className="addc-found">
          answered with {found.length} tool{found.length === 1 ? '' : 's'}: {found.join(', ')}
        </p>
      )}
      {error && <p className="addc-error">{error}</p>}

      <div className="addc-actions">
        <button disabled={busy} onClick={() => submit(false)} type="button">
          {busy ? 'checking…' : 'check'}
        </button>
        <button className="addc-keep" disabled={busy} onClick={() => submit(true)} type="button">
          check and add
        </button>
        <button
          className="addc-cancel"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          type="button"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
