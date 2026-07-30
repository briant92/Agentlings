import { useState } from 'react';
import type { LibraryHit } from '@agentlings/shared';
import { api, postJson } from '../api';

interface Preview {
  text: string;
  warnings: string[];
}

/**
 * Library search results, wherever they are shown. Shared so the rule holds
 * everywhere: the full text is one click away, and nothing installs unread.
 */
export function LibraryResults({
  hits,
  onInstalled,
}: {
  hits: LibraryHit[];
  onInstalled: (name: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const read = async (hit: LibraryHit) => {
    if (openId === hit.entry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(hit.entry.id);
    setPreview(null);
    setError(null);
    const { repo, path, sha } = hit.entry;
    try {
      setPreview(await api<Preview>('/api/library/preview', postJson({ repo, path, sha })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const install = async (hit: LibraryHit) => {
    setBusy(hit.entry.id);
    setError(null);
    const { repo, path, sha } = hit.entry;
    try {
      const installed = await api<{ name: string }>(
        '/api/library/install',
        postJson({ repo, path, sha }),
      );
      setDone((prev) => [...prev, hit.entry.id]);
      onInstalled(installed.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {hits.map((hit) => {
        const installed = hit.state === 'installed' || done.includes(hit.entry.id);
        return (
          <div key={hit.entry.id} className="lib-hit">
            <div className="lib-hit-head">
              <span className={hit.entry.kind === 'role' ? 'badge queued' : 'chip skill'}>
                {hit.entry.name}
              </span>
              <span className="dim lib-kind">{hit.entry.kind === 'role' ? 'job' : 'ability'}</span>
              {installed && <span className="badge done">in your library</span>}
              {!installed && hit.state === 'outdated' && (
                <span className="badge running">update available</span>
              )}
              <span className="dim lib-repo">
                {hit.entry.repo}
                {hit.entry.license ? ` · ${hit.entry.license}` : ''}
              </span>
            </div>
            <p className="lib-desc">{hit.entry.description}</p>
            <div className="actions">
              <button className="ghost" onClick={() => void read(hit)}>
                {openId === hit.entry.id ? 'Hide' : 'Read it first'}
              </button>
              <button
                disabled={busy === hit.entry.id || installed}
                onClick={() => void install(hit)}
              >
                {installed ? 'Added' : hit.state === 'outdated' ? 'Update' : 'Add to library'}
              </button>
            </div>
            {openId === hit.entry.id && (
              <div className="lib-preview">
                {preview === null && <p className="dim">loading…</p>}
                {preview?.warnings.map((warning) => (
                  <p key={warning} className="lib-warn">
                    ⚠ {warning}
                  </p>
                ))}
                {preview && <pre>{preview.text}</pre>}
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="error">{error}</p>}
    </>
  );
}
