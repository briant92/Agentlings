import { useEffect, useState } from 'react';
import type { RoleInfo, SkillInfo } from '@agentlings/shared';
import { api, postJson } from '../api';

/** Roster of installed roles and skills, plus install-from-URL (GitHub etc). */
export function RolesModal({ onClose }: { onClose: () => void }) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'role' | 'skill'>('role');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setRoles(await api<RoleInfo[]>('/api/roles'));
    setSkills(await api<SkillInfo[]>('/api/skills'));
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const install = async () => {
    setStatus(null);
    setError(null);
    try {
      const installed = await api<{ kind: string; name: string }>(
        '/api/templates/install',
        postJson({ url, kind }),
      );
      setStatus(`Installed ${installed.kind} "${installed.name}".`);
      setUrl('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Roles &amp; skills</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <div className="sect">roles · {roles.length}</div>
          {roles.map((r) => (
            <div key={r.name} className="role-row">
              <span className="badge queued">{r.name}</span>
              <span className="dim r-desc">{r.description}</span>
              <span className="r-meta">
                {r.tools.join(' · ') || 'no tools'}
                {r.skills.length > 0 && ` · skills: ${r.skills.join(', ')}`}
              </span>
            </div>
          ))}
          <div className="sect">skills · {skills.length}</div>
          {skills.map((s) => (
            <div key={s.name} className="role-row">
              <span className="chip skill">{s.name}</span>
              <span className="dim r-desc">{s.description}</span>
            </div>
          ))}
          <div className="sect">install from template</div>
          <p className="dim install-hint">
            Paste a link to a Claude subagent .md or a SKILL.md on GitHub — blob links are
            converted to raw automatically.
          </p>
          <div className="install-row">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'role' | 'skill')}>
              <option value="role">role</option>
              <option value="skill">skill</option>
            </select>
            <input
              placeholder="https://github.com/user/repo/blob/main/agents/reviewer.md"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button disabled={!url.trim()} onClick={() => void install()}>
              Install
            </button>
          </div>
          {status && <p className="stat-done">{status}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
