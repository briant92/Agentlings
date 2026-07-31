import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentlingProfile, RoleInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { renderPortrait } from '../world/sprites';

/** The worker's file: portrait, role, boundaries, skills, memory, career. */
export function ProfileModal({
  levelId,
  agentlingId,
  onClose,
}: {
  levelId: string;
  agentlingId: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<AgentlingProfile | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const portraitRef = useRef<HTMLCanvasElement>(null);

  const refresh = useCallback(async () => {
    const data = await api<AgentlingProfile>(lvl(levelId, `/agentlings/${agentlingId}`));
    setProfile(data);
    setSelectedRole(data.agentling.role);
  }, [levelId, agentlingId]);

  useEffect(() => {
    void refresh();
    void api<RoleInfo[]>('/api/roles').then(setRoles);
  }, [refresh]);

  useEffect(() => {
    if (portraitRef.current) renderPortrait(portraitRef.current, 3, profile?.agentling.color);
  }, [profile === null, profile?.agentling.color]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const assign = async () => {
    await api(lvl(levelId, `/agentlings/${agentlingId}/role`), postJson({ role: selectedRole }));
    await refresh();
  };

  if (!profile) return null;
  const { agentling, role, memory } = profile;
  const lessons = memory.slice(-5);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <canvas ref={portraitRef} className="portrait" />
          <div className="p-id">
            <span className="p-name">
              {agentling.name} <span className="badge queued">{agentling.role}</span>
            </span>
            <span className="dim p-desc">{role?.description ?? 'No role definition found.'}</span>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          {agentling.jobDescription && (
            <>
              <div className="sect">hired to</div>
              <p className="hire-quote">“{agentling.jobDescription}”</p>
            </>
          )}
          <div className="sect">boundaries · tools</div>
          <div className="chips">
            {(role?.tools ?? []).map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
            {(role?.tools ?? []).length === 0 && <span className="dim">none declared</span>}
          </div>
          <div className="sect">skills</div>
          <div className="chips">
            {(role?.skills ?? []).map((s) => (
              <span key={s} className="chip skill">
                {s}
              </span>
            ))}
            {(role?.skills ?? []).length === 0 && <span className="dim">none</span>}
          </div>
          <div className="sect">memory · {memory.length} lessons</div>
          {lessons.length === 0 && <p className="dim">No lessons yet. Work builds memory.</p>}
          {lessons.length > 0 && (
            <ul className="lessons">
              {lessons.map((lesson, i) => (
                <li key={i}>{lesson}</li>
              ))}
            </ul>
          )}
          <div className="career">
            <span className="stat-done">{agentling.jobsDone} delivered</span>
            <span className="stat-failed">{agentling.jobsFailed} failed</span>
          </div>
        </div>
        <div className="m-foot p-foot">
          <span className="dim">role:</span>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <button disabled={selectedRole === agentling.role} onClick={() => void assign()}>
            Assign
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
