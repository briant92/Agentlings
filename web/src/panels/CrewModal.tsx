import { useEffect, useState } from 'react';
import type { ConnectionInfo, CrewCv, CrewRole, SettingsInfo, SkillInfo } from '@agentlings/shared';
import { api } from '../api';
import {
  cardFacts,
  carriedBy,
  doorState,
  LADDER,
  NEVER,
  POWERS,
  REACH,
  SKILLS,
  spendLine,
  tradeCopy,
  type DoorState,
} from './crew';
import { fills, NO_SEAT, search, tally, type Position } from './positions';
import type { HireFor } from '../screens/hire';

/**
 * Meet the crew (Settings → catalog): AGENTLING.md as a character-select
 * screen. Six boards — trades, skills, powers, reach, price, never. The
 * trades board reads the role files, the quote ceiling and the ledger off
 * `/api/crew`; skills come off `/api/skills`, doors off `/api/settings`; only
 * the plain-language prose is typed, in `crew.ts`. The positions board
 * (D-229) starts from a human job instead: `positions.ts` grades each duty
 * against what is built, and HIRE hands the trade to the level picker.
 */

type Board = 'trades' | 'skills' | 'powers' | 'reach' | 'price' | 'never' | 'positions';
const BOARDS: Board[] = ['trades', 'skills', 'powers', 'reach', 'price', 'never', 'positions'];
const MARK: Record<Position['duties'][number]['grade'], string> = { y: '✓', p: '◐', n: '✕' };

/** 12 × 14 cells: h hat · s skin · b body (the trade's tint) · k ink. */
const SPRITE = [
  '....hhhh....',
  '...hhhhhh...',
  '...ssssss...',
  '...sksssk...',
  '...ssssss...',
  '....ssss....',
  '..bbbbbbbb..',
  '.bbbbbbbbbb.',
  '.bbbbbbbbbb.',
  '..bbbbbbbb..',
  '...bb..bb...',
  '...bb..bb...',
  '..kkk..kkk..',
];

function Sprite({ tint, hat, big }: { tint: string; hat: string; big?: boolean }) {
  const colour: Record<string, string> = { h: hat, s: '#eec39a', b: tint, k: '#222034' };
  const cells: { x: number; y: number; c: string }[] = [];
  SPRITE.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '.') cells.push({ x, y, c: colour[c] });
    }),
  );
  return (
    <span className={big ? 'cv-sprite big' : 'cv-sprite'} aria-hidden="true">
      {cells.map(({ x, y, c }) => (
        <i key={`${x}-${y}`} style={{ transform: `translate(${x * 4}px, ${y * 4}px)`, background: c }} />
      ))}
    </span>
  );
}

const usd = (n: number) => (n < 1 ? `${Math.round(n * 100)}c` : `$${n.toFixed(2)}`);

const PILL: Record<DoorState, string> = {
  on: 'on',
  key: 'needs a key',
  off: 'off',
  send: 'send · at approval',
};

export function CrewModal({ onClose, onHire }: { onClose: () => void; onHire: (hire: HireFor) => void }) {
  const [cv, setCv] = useState<CrewCv | null>(null);
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [doors, setDoors] = useState<ConnectionInfo[] | null>(null);
  const [board, setBoard] = useState<Board>('trades');
  const [picked, setPicked] = useState(0);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<string | null>(null);

  useEffect(() => {
    void api<CrewCv>('/api/crew').then(setCv).catch(() => setCv({ roles: [], turnCeiling: 40, defaultTurns: 10, tiers: { oneshot: { samples: 0, meanUsd: 0 }, session: { samples: 0, meanUsd: 0 } } }));
    void api<SkillInfo[]>('/api/skills').then(setSkills).catch(() => setSkills([]));
    void api<SettingsInfo>('/api/settings').then((s) => setDoors(s.connections)).catch(() => setDoors([]));
  }, []);

  const roles = cv?.roles ?? [];
  const current: CrewRole | undefined = roles[picked];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (board !== 'trades' || roles.length === 0) return;
      if (e.key === 'ArrowRight') setPicked((p) => (p + 1) % roles.length);
      if (e.key === 'ArrowLeft') setPicked((p) => (p + roles.length - 1) % roles.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, roles.length, onClose]);

  const sheet = (role: CrewRole) => {
    const copy = tradeCopy(role);
    const facts = cardFacts(role, cv?.defaultTurns ?? 10);
    const spend = spendLine(role);
    const ceiling = cv?.turnCeiling ?? 40;
    return (
      <div className="cv-sheet">
        <div className="cv-head">
          <Sprite tint={copy.tint} hat={copy.hat} big />
          <div>
            <h2>{role.name}</h2>
            <span className="cv-tag">{copy.tag}</span>
            <p className="cv-blurb">{copy.blurb}</p>
          </div>
        </div>
        <div className="cv-stat">
          <span className="cv-k">turns</span>
          <span className="cv-bar">
            <b style={{ width: `${(facts.turns / ceiling) * 100}%` }} />
          </span>
          <span className="cv-v">
            {facts.turns}/{ceiling}
          </span>
        </div>
        {/* Nominal beside measured: the bar is the average as a share of the ceiling. */}
        <div className="cv-stat">
          <span className="cv-k">may cost</span>
          <span className="cv-bar cost">
            <b style={{ width: `${spend.share * 100}%` }} />
          </span>
          <span className="cv-v">up to {spend.ceiling}</span>
        </div>
        <p className="cv-measured dim">
          has cost: <b>{spend.measured}</b>
        </p>
        <div className="cv-kv">
          <span className="cv-k">model</span>
          <span>{facts.model}</span>
          <span className="cv-k">tools</span>
          <span className="cv-chips">
            {facts.tools.map((t) => (
              <span key={t} className="cv-chip tool">
                {t}
              </span>
            ))}
          </span>
          <span className="cv-k">skills</span>
          <span className="cv-chips">
            {role.skills.map((s) => (
              <span key={s} className="cv-chip">
                {s}
              </span>
            ))}
          </span>
        </div>
        {copy.moves.length > 0 && (
          <div className="cv-moves">
            <h3>special moves</h3>
            <ul>
              {copy.moves.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {/* One trade fills more than one human job, so the positions are
            tracked here, on the trade, and the positions board carries no cost. */}
        {fills(role.name).length > 0 && (
          <p className="cv-fills dim">
            fills:{' '}
            {fills(role.name).map((t, i) => (
              <span key={t}>
                {i > 0 && ' · '}
                <button
                  className="work-link"
                  onClick={() => {
                    setPosition(t);
                    setBoard('positions');
                  }}
                >
                  {t}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>
    );
  };

  const positions = search(query);
  const shown = positions.find((p) => p.title === position) ?? positions[0];
  const positionsBoard = () => {
    const t = shown ? tally(shown) : null;
    const trade = shown?.trade ? tradeCopy({ name: shown.trade, description: '' }) : null;
    return (
      <>
        <p className="door-intro">
          Start from a job a person would apply for. Each duty is graded against what is built — done,
          partly, or not this crew's — with what the grade rests on. A count, never a percentage.
        </p>
        <div className="cv-search">
          <label htmlFor="cv-q">who would you hire?</label>
          <input
            id="cv-q"
            type="search"
            autoComplete="off"
            placeholder="bookkeeper · fix bugs · someone for my inbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="dim cv-hint">
          {query.trim() === ''
            ? 'Type a job title, or what you need done. Pick a card to see the match.'
            : positions.length > 0
              ? `${positions.length} position${positions.length === 1 ? '' : 's'} match — the nearest first, never just one`
              : `Nothing matches. The crew has no seat for ${NO_SEAT.join(' · ')} — each needs a person to talk, act or pay.`}
        </p>
        <div className="cv-positions">
          {positions.map((p) => (
            <button
              key={p.title}
              className={p.trade ? 'cv-pos' : 'cv-pos noseat'}
              aria-pressed={shown?.title === p.title}
              onClick={() => setPosition(p.title)}
            >
              <span className="cv-pos-t">{p.title}</span>
              <span className="cv-pos-aka">{p.aka.slice(0, 3).join(' · ')}</span>
              <span className="cv-pips">
                {p.duties.map((x, i) => (
                  <i key={i} className={`cv-pip ${x.grade}`} />
                ))}
                <small>{p.trade ? `→ ${p.trade}` : 'no seat'}</small>
              </span>
            </button>
          ))}
        </div>
        {shown && t && (
          <div className="cv-match">
            <div className="cv-col">
              <h2>
                {shown.title}
                <small>the human posting</small>
              </h2>
              <h3>responsibilities</h3>
              <ul>
                {shown.duties.map((x) => (
                  <li key={x.text}>{x.text}</li>
                ))}
              </ul>
              <h3>skills asked for</h3>
              <span className="cv-chips">
                {shown.skills.map((x) => (
                  <span key={x} className="cv-chip">
                    {x}
                  </span>
                ))}
              </span>
              <h3>also known as</h3>
              <span className="cv-chips">
                {shown.aka.map((x) => (
                  <span key={x} className="cv-chip tool">
                    {x}
                  </span>
                ))}
              </span>
            </div>
            <div className="cv-col">
              {shown.trade && trade ? (
                <div className="cv-head">
                  <Sprite tint={trade.tint} hat={trade.hat} />
                  <div>
                    <h2>
                      {shown.trade}
                      <small>the crew's match</small>
                    </h2>
                    <span className="cv-tag">{trade.tag}</span>
                  </div>
                </div>
              ) : (
                <h2>
                  no seat<small>the crew's match</small>
                </h2>
              )}
              <div className="cv-tally">
                <span className="y">✓ does {t.y}</span>
                <span className="p">◐ partly {t.p}</span>
                <span className="n">✕ not this crew {t.n}</span>
              </div>
              <div className="cv-verdicts">
                {shown.duties.map((x) => (
                  <div key={x.text} className={`cv-duty ${x.grade}`}>
                    <span className="cv-m">{MARK[x.grade]}</span>
                    <div>
                      <b>{x.text}</b>
                      <span>{x.why}</span>
                    </div>
                  </div>
                ))}
              </div>
              {shown.trade ? (
                <>
                  {shown.needs.length > 0 && (
                    <p className="cv-needs dim">
                      needs: <b>{shown.needs.join(' · ')}</b>
                    </p>
                  )}
                  {shown.also && (
                    <p className="cv-needs dim">
                      also fits: <b>{shown.also}</b>
                    </p>
                  )}
                  <button
                    className="cv-hire"
                    onClick={() => onHire({ role: shown.trade as string, text: shown.title.toLowerCase() })}
                  >
                    hire a {shown.trade} — pick the level
                  </button>
                </>
              ) : (
                <div className="cv-noseat">
                  <h3>why no seat</h3>
                  <p>
                    Every duty that defines this job needs a person to talk, act or pay — the three things an
                    agentling never does. The one draftable piece is graded above, and that is a job for a
                    worker, not a seat.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cv" onClick={(e) => e.stopPropagation()}>
        <div className="m-head cv-marquee">
          <div>
            <span className="cv-title">Meet the crew</span>
            <span className="dim cv-sub">
              What an agentling can do, in plain words. The numbers are read from the app, not typed.
            </span>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="p-tabs">
          {BOARDS.map((b) => (
            <button key={b} className={board === b ? 'p-tab on' : 'p-tab'} onClick={() => setBoard(b)}>
              {b}
            </button>
          ))}
        </div>
        <div className="m-body">
          {board === 'trades' && (
            <>
              {cv === null && <p className="dim">Loading…</p>}
              {cv && (
                <div className="cv-select">
                  <div className="cv-roster">
                    {roles.map((r, i) => {
                      const copy = tradeCopy(r);
                      return (
                        <button
                          key={r.name}
                          className="cv-slot"
                          aria-pressed={i === picked}
                          title={r.name}
                          onClick={() => setPicked(i)}
                        >
                          <Sprite tint={copy.tint} hat={copy.hat} />
                          <span className="cv-nm">{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {current && sheet(current)}
                </div>
              )}
            </>
          )}
          {board === 'skills' && (
            <>
              <p className="door-intro">
                A skill is a short rulebook an agentling reads before it starts. A trade carries some by default;
                you can hand any skill to any trade from its card.
              </p>
              {skills === null && <p className="dim">Loading…</p>}
              <div className="cv-grid">
                {(skills ?? []).map((s) => {
                  const who = carriedBy(s.name, roles);
                  return (
                    <div key={s.name} className="cv-card">
                      <h3>{s.name}</h3>
                      <p>{SKILLS[s.name] ?? s.description}</p>
                      <div className="cv-who dim">{who.length > 0 ? `carried by ${who.join(' · ')}` : 'on the shelf — no trade carries it'}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {board === 'powers' && (
            <>
              <p className="door-intro">
                What any agentling can do once it has a job, whatever its trade. It works inside its own folder
                and never leaves it.
              </p>
              <div className="cv-grid">
                {POWERS.map((p) => (
                  <div key={p.name} className="cv-card">
                    <h3>
                      {p.name}
                      {p.partial && <span className="cv-pill part">partial</span>}
                    </h3>
                    <p>{p.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {board === 'reach' && (
            <>
              <p className="door-intro">
                Doors to the outside world. The rest open when you add a key in Settings. A sending door gives a
                working agentling no tools at all — a message goes out only when you approve it.
              </p>
              {doors === null && <p className="dim">Loading…</p>}
              <div className="cv-grid">
                {(doors ?? []).map((d) => {
                  const state = doorState(d);
                  return (
                    <div key={d.name} className={state === 'on' || state === 'send' ? 'cv-card' : 'cv-card off'}>
                      <h3>
                        {d.label}
                        <span className={`cv-pill ${state}`}>{PILL[state]}</span>
                      </h3>
                      <p>{REACH[d.name] ?? d.description}</p>
                      {state === 'key' && <div className="cv-who dim">needs {d.missingSecrets.join(', ')}</div>}
                    </div>
                  );
                })}
                <div className="cv-card">
                  <h3>Your own notes</h3>
                  <p>Read every job, from the level folder. Deliberately not a door: no key, no switch, no way to close it.</p>
                </div>
              </div>
            </>
          )}
          {board === 'price' && (
            <>
              <p className="door-intro">
                Before a job runs, the app tries to answer it without waking anyone. Five of the seven ways cost
                nothing. The rule is never guess: if the job's shape is not recognised exactly, it goes to a full
                session.
              </p>
              <div className="cv-ladder">
                {LADDER.map((r) => {
                  const t = r.tier === 'oneshot' ? cv?.tiers.oneshot : r.tier === 'agent' ? cv?.tiers.session : null;
                  const cost = !r.paid ? 'free' : t && t.samples > 0 ? `${usd(t.meanUsd)} avg` : r.cost;
                  return (
                    <div key={r.tier} className={r.paid ? 'cv-rung paid' : 'cv-rung'}>
                      <span className="cv-t">{r.tier}</span>
                      <p>{r.text}</p>
                      <span className="cv-c">{cost}</span>
                    </div>
                  );
                })}
              </div>
              <p className="lib-status door-foot">
                {cv && cv.tiers.session.samples > 0
                  ? `Measured over ${cv.tiers.oneshot.samples + cv.tiers.session.samples} paid runs on this machine. `
                  : ''}
                You are never billed above the quote, and work that failed is on the house.
              </p>
            </>
          )}
          {board === 'positions' && positionsBoard()}
          {board === 'never' && (
            <>
              <p className="door-intro">Some things an agentling will not do, by decision rather than by accident.</p>
              <div className="cv-grid never">
                {NEVER.map((n) => (
                  <div key={n.name} className="cv-card">
                    <h3>{n.name}</h3>
                    <p>{n.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="m-foot cv-foot">
          <span className="dim">← → to browse the trades · Esc to close</span>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
