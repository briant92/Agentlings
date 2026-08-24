import { useEffect, useState } from 'react';
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
 */

interface SecretRow {
  name: string;
  why: string;
  value: string;
}

/**
 * A shape the app ships, read from a vendor's own docs — never a connection.
 * Choosing one fills this form; the probe is still what makes it real.
 */
interface Suggestion {
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
  source?: string;
}

const blankSecret = (): SecretRow => ({ name: '', why: '', value: '' });

export function AddConnection({ onAdded }: { onAdded: (connections: ConnectionInfo[]) => void }) {
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [chosen, setChosen] = useState<Suggestion | null>(null);

  useEffect(() => {
    if (!open) return;
    // Fetched when the form opens rather than at mount: it is one small list
    // and nobody should pay for it on every Settings visit.
    void api<{ suggestions: Suggestion[] }>('/api/connections/suggestions')
      .then((r) => setSuggestions(r.suggestions))
      .catch(() => setSuggestions([]));
  }, [open]);

  /** Fill the form from a shipped shape. Nothing is submitted by choosing one. */
  const choose = (s: Suggestion) => {
    setChosen(s);
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
    setArgs('');
    setUrl('');
    setHeaders('');
    setSecrets([blankSecret()]);
    setFound(null);
    setError(null);
    setChosen(null);
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

      {suggestions.length > 0 && (
        <div className="addc-suggest">
          <div className="addc-suggest-head">start from one of these</div>
          <div className="minis">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className={`mini addc-chip${chosen?.name === s.name ? ' on' : ''}`}
                title={s.description}
                onClick={() => choose(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* Said plainly, because it is the difference between a suggestion
              and a claim: these shapes come from each vendor's own page and
              have not been connected to from here. The user's own check is
              what makes any of it true. */}
          {chosen ? (
            <p className="addc-note">
              Shape from {chosen.source ?? 'the vendor'}.{' '}
              {chosen.docs && (
                <a href={chosen.docs} target="_blank" rel="noreferrer">
                  their instructions
                </a>
              )}{' '}
              — check it against theirs. Nothing here has been tried from this machine; pressing
              check is what tries it.
            </p>
          ) : (
            <p className="addc-note">
              Filled in from each vendor&rsquo;s own instructions, never tried from here. They only
              fill the form — your check is what makes one real.
            </p>
          )}
        </div>
      )}

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
          a job runs and never written into the job's own folder.
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
