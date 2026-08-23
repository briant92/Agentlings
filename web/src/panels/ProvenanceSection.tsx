import { useEffect, useState } from 'react';
import type {
  CrewMember,
  ProvenanceDryRun,
  ProvenanceHit,
  ProvenanceNeighbourhood,
  ProvenanceNode,
  ProvenanceSummary,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { countWords, FLAG_WORD, grouped, KIND_ORDER, KIND_WORD, originWords } from './provenance';
import { ExpandRow, Section } from './Section';

/**
 * Where did this come from (D-225): the level's own record, searchable, and
 * for any one record everything one hop away — the job a lesson was learnt
 * on, the method that job ran under, the tool that method compiled to. And
 * beneath it what a session would be handed for a sentence, by the same
 * selection the run makes, so the eight notes and five lessons stop being a
 * number in a document and become something you can look at.
 *
 * Every line here is text. Nothing in this section writes anything, and
 * nothing a run reads comes from it.
 */

/** Typing pauses this long before the search is sent. */
const DEBOUNCE_MS = 250;

function Flags({ node }: { node: ProvenanceNode }) {
  if (!node.flags?.length) return null;
  return (
    <>
      {node.flags.map((f) => (
        <span key={f} className="k-gone">
          {FLAG_WORD[f]}
        </span>
      ))}
    </>
  );
}

function Record({
  node,
  words,
  onPick,
}: {
  node: ProvenanceNode;
  /** The sentence from the record being looked at, when there is one. */
  words?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="k-source">
      <span className="k-label" title={originWords(node)}>
        <button className="work-link" onClick={() => onPick(node.id)}>
          {node.label}
        </button>
        {words && <span className="k-via"> · {words}</span>}
      </span>
      <Flags node={node} />
    </div>
  );
}

export function ProvenanceSection({ levelId }: { levelId: string }) {
  const [summary, setSummary] = useState<ProvenanceSummary | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProvenanceHit[] | null>(null);
  const [around, setAround] = useState<ProvenanceNeighbourhood | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [sentence, setSentence] = useState('');
  const [who, setWho] = useState('');
  const [dry, setDry] = useState<ProvenanceDryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A server started before this section existed answers 404 to every route
  // here; said as what it is rather than as Hono's "Not Found".
  const fail = (err: unknown) =>
    setError(
      err instanceof Error && /not found/i.test(err.message)
        ? 'The server is older than this panel — restart it (npm run serve) to map the level.'
        : err instanceof Error
          ? err.message
          : String(err),
    );

  useEffect(() => {
    setSummary(null);
    setAround(null);
    setHits(null);
    api<ProvenanceSummary>(lvl(levelId, '/provenance')).then(setSummary).catch(fail);
    api<CrewMember[]>(lvl(levelId, '/crew')).then(setCrew).catch(() => setCrew([]));
  }, [levelId]);

  // The search is sent when typing pauses, never per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const timer = setTimeout(() => {
      api<{ hits: ProvenanceHit[] }>(lvl(levelId, `/provenance/search?q=${encodeURIComponent(q)}`))
        .then((r) => setHits(r.hits))
        .catch(fail);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [levelId, query]);

  const look = async (id: string): Promise<void> => {
    try {
      setAround(await api<ProvenanceNeighbourhood>(lvl(levelId, `/provenance?node=${encodeURIComponent(id)}`)));
    } catch (err) {
      fail(err);
    }
  };

  const tryIt = async (): Promise<void> => {
    const text = sentence.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      setDry(
        await api<ProvenanceDryRun>(
          lvl(levelId, '/provenance/dry-run'),
          postJson({ text, ...(who ? { agentling: who } : {}) }),
        ),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const total = summary ? Object.values(summary.nodes).reduce((a, b) => a + b, 0) : 0;
  const unresolved = summary ? Object.values(summary.unresolved).reduce((a, b) => a + b, 0) : 0;
  const groups = around ? grouped(around) : [];

  return (
    <>
      <Section
        panel="knowledge"
        id="provenance"
        label="where did this come from"
        count={summary ? `${total} records` : '…'}
        summary="search the level’s own record · every record and what it came from"
      >
        {summary && (
          <p className="lib-status">
            {KIND_ORDER.filter((k) => summary.nodes[k] > 0)
              .map((k) => countWords(k, summary.nodes[k]))
              .join(' · ')}
            {' · '}mapped in {Math.round(summary.buildMs)} ms
            {unresolved > 0 && ` · ${unresolved} pointer${unresolved === 1 ? '' : 's'} to nothing on file`}
          </p>
        )}
        <input
          className="lib-search"
          placeholder="a word from a lesson, a job title, a file name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits && hits.length === 0 && (
          <p className="lib-status">Nothing on file shares a word with that.</p>
        )}
        {hits && hits.length > 0 && (
          <>
            <p className="lib-status">
              {hits.length} record{hits.length === 1 ? '' : 's'}, the ones sharing most words first —
              the same ranking a session’s notes get.
            </p>
            {hits.map(({ node, shared }) => (
              <Record
                key={node.id}
                node={node}
                words={`${KIND_WORD[node.kind]} · ${shared} shared word${shared === 1 ? '' : 's'}`}
                onPick={(id) => void look(id)}
              />
            ))}
          </>
        )}
        {around && (
          <ExpandRow
            open
            className="k-around"
            head={
              <span className="nm">
                {KIND_WORD[around.node.kind]}: {around.node.label}
                <span className="d"> · {originWords(around.node)}</span>
              </span>
            }
          >
            <Flags node={around.node} />
            {groups.length === 0 && <p className="lib-status">Nothing on file points at this, and it points at nothing.</p>}
            {groups.map((g) => (
              <div key={g.kind}>
                <p className="lib-status">{countWords(g.kind, g.rows.length)}</p>
                {g.rows.map(({ node, words }, i) => (
                  <Record key={`${node.id}-${i}`} node={node} words={words} onPick={(id) => void look(id)} />
                ))}
              </div>
            ))}
            {around.more > 0 && (
              <p className="lib-status">
                {around.more} more connection{around.more === 1 ? '' : 's'} past the first 50 — search for the record you want instead.
              </p>
            )}
          </ExpandRow>
        )}
      </Section>

      <Section
        panel="knowledge"
        id="dry-run"
        label="what would a session be handed?"
        summary="type a sentence · see the notes and lessons a run of it would read · nothing runs"
      >
        <p className="lib-status">
          A run reads the eight level notes most about its sentence and its agentling’s five newest
          lessons. This shows exactly those, chosen the way the run chooses them, and starts nothing.
        </p>
        <input
          className="lib-search"
          placeholder="Reconcile the attached bank statement against the ledger"
          value={sentence}
          disabled={busy}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void tryIt();
          }}
        />
        <p className="lib-status">
          {crew.length > 0 && (
            <>
              <select value={who} onChange={(e) => setWho(e.target.value)} disabled={busy}>
                <option value="">any agentling</option>
                {crew.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              {' · '}
            </>
          )}
          <button className="work-link" disabled={busy || !sentence.trim()} onClick={() => void tryIt()}>
            {busy ? 'looking…' : 'show me'}
          </button>
        </p>
        {dry && (
          <>
            <p className="lib-status">
              The router would price this as <b>{dry.tier}</b>.
              {dry.tier === 'routed' && ' That is free — answered from what is on file, or fetched, or composed.'}
            </p>
            <p className="lib-status">
              <b>{dry.notes.length}</b> of the eight note slots would be filled
              {dry.notes.length === 0 && ' — nothing on file shares a word with the sentence'}:
            </p>
            {dry.notes.map((line, i) => (
              <div key={i} className="k-source">
                <span className="k-label">{line}</span>
              </div>
            ))}
            {dry.recall.length > 0 && dry.recall.length !== dry.notes.length && (
              <p className="lib-status">
                Asked as a question, the free recall tier would answer from the first {dry.recall.length}.
              </p>
            )}
            {dry.agentling && (
              <>
                <p className="lib-status">
                  <b>{dry.lessons.length}</b> of {dry.agentling}’s five lesson slots would be filled —
                  the newest, whatever the sentence:
                </p>
                {dry.lessons.map((line, i) => (
                  <div key={i} className="k-source">
                    <span className="k-label">{line}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </Section>
      {error && <p className="lib-warn">{error}</p>}
    </>
  );
}
