import { useEffect, useRef, useState } from 'react';
import type {
  Agentling,
  CarryManifest,
  DeliveryFile,
  DeliverySummary,
  Job,
  PackDraft,
  Quote,
  SendApprovalInfo,
  TrajectoryLine,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { CHANNEL_LABELS, ChannelLogo } from './ChannelLogo';
import { carryNote } from './carry';
import { cutNotice } from './cut';
import { factsOf, replyFromPending } from './facts';
import { fileUrl, railSummary } from './files';
import { FileViewer } from './FileViewer';
import { Section } from './Section';
import { callsOf } from './strip';
import { TurnsStrip } from './TurnsStrip';
import { moveRows, movesLeft, movesSummary } from './moves';
import { noSendLine } from './noSend';
import { allLooks, renderScenePreview } from '../world/looks';

/**
 * A calendar event's when, as the card shows it (D-104). A zoneless string
 * parses as local time, which is exactly the semantics the send gives it;
 * one that will not parse is shown as written rather than hidden.
 */
function eventSpan(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} → ${end}`;
  const sameDay = s.toDateString() === e.toDateString();
  const time = (d: Date) => d.toTimeString().slice(0, 5);
  const day = (d: Date) => d.toDateString().slice(0, 10);
  return `${day(s)} ${time(s)} → ${sameDay ? '' : `${day(e)} `}${time(e)}`;
}

/** Full sandbox contents in an overlay; Esc, backdrop, or Close dismisses. */
export function ReviewModal({
  levelId,
  job,
  /** The file to open on, when the inbox already knows which one was clicked. */
  file,
  queue,
  crew,
  onDecided,
  onClose,
}: {
  levelId: string;
  job: Job;
  file?: string;
  /** Set when this review is a stop in the parcel desk's flow. */
  queue?: { position: number; total: number; onSkip: () => void };
  /** The level's crew, so the facts strip can name who did it. */
  crew?: readonly Agentling[];
  /**
   * A verdict landed (promote, discard, more turns, a reply, a redo) — the
   * desk advances to the next parcel. Absent, deciding simply closes.
   */
  onDecided?: () => void;
  onClose: () => void;
}) {
  const decided = onDecided ?? onClose;
  const [files, setFiles] = useState<DeliveryFile[] | null>(null);
  /** The folders beside the files — work/, input/ — with their weight (UI.md, step 17). */
  const [dirs, setDirs] = useState<DeliverySummary['dirs']>([]);
  /** The sandbox's trail (D-211), or the word that there is none; null until the route answers. */
  const [trail, setTrail] = useState<{ trail: boolean; lines: TrajectoryLine[] } | null>(null);
  // An Approve the server refused (a channel switched off, a recipient the
  // channel rejected) — shown here, with the job left reviewable (D-075).
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * The standing-approval offer, when this approve earned it (D-082). The
   * job is already promoted by the time this shows — the offer is the last
   * step of the review, not a gate on it.
   */
  const [offer, setOffer] = useState<SendApprovalInfo | null>(null);
  const [granting, setGranting] = useState(false);
  /** The name this world installs under; editable, because a clash must be fixable here. */
  const [packSlug, setPackSlug] = useState(job.packDraft?.slug ?? '');
  /** What carrying on would cost, fetched from the route that will charge it. */
  const [carryQuote, setCarryQuote] = useState<Quote | null>(null);
  /** What the next leg receives, from the list the copy is made from (UI.md, step 10). */
  const [carries, setCarries] = useState<CarryManifest | null>(null);
  const [clarify, setClarify] = useState('');
  const [busy, setBusy] = useState(false);
  const approveRef = useRef<HTMLButtonElement>(null);
  // Either limit reads as cut (D-138): a run stopped by the clock is as
  // continuable as one stopped by turns — same sandbox, its own quote. But a
  // run already continued must not offer it twice (D-139): a second press is
  // a second charge against work someone is already doing.
  const canCarryOn = Boolean(
    (job.meter?.outOfTurns || job.meter?.timedOut) && !job.continuedBy,
  );
  // A cut said as a boundary, not an annulment (D-138; D-015/D-025: often
  // the ordinary ending): the raw error in red above a reviewable delivery
  // read as "definitively unfinished" even when the checker was clean, so a
  // cut run names which limit ended it — and what landed — in one neutral
  // sentence. Real failures keep the red.
  const cutLine = cutNotice({
    outOfTurns: job.meter?.outOfTurns,
    timedOut: job.meter?.timedOut,
    turns: job.meter?.turns,
    hasWorldDraft: Boolean(job.packDraft),
    patchedFiles: job.changes?.files ?? 0,
    files,
  });

  useEffect(() => {
    let alive = true;
    void api<{ files: DeliveryFile[]; dirs?: DeliverySummary['dirs'] }>(
      lvl(levelId, `/jobs/${job.id}/output`),
    ).then((data) => {
      if (!alive) return;
      setFiles(data.files);
      setDirs(data.dirs ?? []);
    });
    // The sandbox's own trail (D-211), or the word that there is none. A
    // routed answer had no session to trace, so it is not asked.
    if (!job.meter?.routed) {
      void api<{ trail: boolean; lines: TrajectoryLine[] }>(
        lvl(levelId, `/jobs/${job.id}/trajectory`),
      )
        .then((data) => alive && setTrail(data))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [levelId, job.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * What More turns costs, from the route that will actually charge it.
   * Fetched rather than guessed for D-097's reason: a desk that quotes one
   * number and a queue that bills another is the worst of both.
   */
  useEffect(() => {
    if (!canCarryOn) return;
    let alive = true;
    void api<{ quote: Quote; carries?: CarryManifest }>(
      lvl(levelId, `/jobs/${job.id}/continue/quote`),
    )
      .then((data) => {
        if (!alive) return;
        setCarryQuote(data.quote);
        setCarries(data.carries ?? null);
      })
      // A quote that will not load must not hide the button: carrying on is
      // still the right move, it just stops claiming a price it does not have.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [levelId, job.id, canCarryOn]);

  // Approve takes focus, so a run you already trust is one keystroke after
  // REVIEW — the speed the terminal's bare Approve used to give (D-114).
  useEffect(() => {
    if (!offer) approveRef.current?.focus();
  }, [offer]);

  const resolve = async (action: 'promote' | 'discard') => {
    setRefusal(null);
    try {
      const reply = await api<Job & { sendApproval?: SendApprovalInfo }>(
        lvl(levelId, `/jobs/${job.id}/resolve`),
        postJson({ action, ...(job.packDraft ? { packSlug } : {}) }),
      );
      if (action === 'promote' && reply.sendApproval?.eligible) {
        setOffer(reply.sendApproval);
        return;
      }
      decided();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    }
  };

  /** The router answered without a session and the user disagrees: full run, router off. */
  const redo = async () => {
    setRefusal(null);
    setBusy(true);
    try {
      await api(lvl(levelId, `/jobs/${job.id}/redo`), { method: 'POST' });
      decided();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Buy the run more turns: same sandbox, its own quote, charged only if it lands. */
  const carryOn = async () => {
    setRefusal(null);
    setBusy(true);
    try {
      await api(lvl(levelId, `/jobs/${job.id}/continue`), { method: 'POST' });
      decided();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Answer the agentling: a new job carrying this one's sandbox forward. */
  const send = async () => {
    const text = clarify.trim();
    if (!text || busy) return;
    setRefusal(null);
    setBusy(true);
    try {
      await api(lvl(levelId, `/jobs/${job.id}/reply`), postJson({ text }));
      decided();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const setAutoSend = async (auto: boolean) => {
    if (!offer) return;
    setGranting(true);
    try {
      const updated = await api<SendApprovalInfo>(
        lvl(levelId, '/approvals'),
        postJson({ key: offer.key, auto }),
      );
      if (auto) setOffer(updated);
      else decided();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setGranting(false);
    }
  };

  // Per channel throughout (D-179): who has been reached on Gmail says
  // nothing about the same address on Telegram, so the two are never pooled.
  const sentOn = (channel: string) =>
    job.outboxSent?.find((stamp) => stamp.channel === channel)?.sentTo ?? [];
  const unsent = (job.outbox ?? []).flatMap((outbox) =>
    outbox.messages.filter((m) => !sentOn(outbox.channel).includes(m.to)),
  );
  const moveLeft = job.moves ? movesLeft(job.moves.moves, job.movesRun?.done ?? []) : [];
  const movedCount = job.movesRun?.done.length ?? 0;
  const worker = crew?.find((a) => a.id === job.assignedTo);
  const facts = factsOf(job, worker ? { name: worker.name, role: worker.role } : null);

  /** Undo a reorganization: the server replays the journal backwards (D-132). */
  const undoMoves = async () => {
    setRefusal(null);
    setBusy(true);
    try {
      await api(lvl(levelId, `/jobs/${job.id}/reverse-moves`), { method: 'POST' });
      onClose();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal review" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className={`badge ${job.status}`}>{job.status}</span>
          {/* Which step of its sequence this was (D-105). */}
          {/* Which hand of its party this was, or its gather (TEAMWORK T2). */}
          {job.party && (
            <span className="badge">
              {job.party.gather ? 'the gather' : `hand ${job.party.hand} of ${job.party.of}`}
            </span>
          )}
          {job.step && (
            <span className="badge">
              step {job.step.n} of {job.step.of}
            </span>
          )}
          <span className="m-title rv-title">{job.title}</span>
          {/* The desk's flow strip: where this stop sits in the pile, the way
              back, and past it without a verdict. */}
          {queue && (
            <span className="rv-queue">
              <button className="ghost" onClick={onClose}>
                ◂ pile
              </button>
              <span className="dim">
                {queue.position} of {queue.total}
              </span>
              <button className="ghost" onClick={queue.onSkip}>
                skip ▸
              </button>
            </span>
          )}
          <button onClick={onClose}>✕</button>
        </div>
        {/* The facts strip (UI.md, step 3): who, spend against the quote,
            turns, minutes, tool calls, when — all already on the meter, said
            once here instead of found in three places. */}
        {facts.length > 0 && (
          <div className="rv-facts">
            {facts.map((fact, i) => (
              <span key={i} className="rv-fact">
                {i > 0 && <span className="sep">|</span>}
                {fact.pre && `${fact.pre} `}
                <b>{fact.value}</b>
                {fact.post && ` ${fact.post}`}
              </span>
            ))}
          </div>
        )}
        <div className="m-body">
          {/* The sentence that produced all of this, verbatim, with the desk
              answers that rode along — the trace from result back to ask
              (D-136). Collapsed because a continuation's stitched prompt runs
              long; the mermaid drawing's <details> precedent (D-125). */}
          <details className="rv-prompt">
            <summary>the ask</summary>
            <p>{job.prompt}</p>
            {job.clarifications && job.clarifications.length > 0 && (
              <ul>
                {job.clarifications.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </details>
          {cutLine && <p className="rv-cut">{cutLine}</p>}
          {!cutLine && job.error && <p className="error">{job.error}</p>}
          {job.summary && <p className="rv-summary">{job.summary}</p>}
          {/* The check pass verdict (TEAMWORK T1, D-194): a second agentling
              read this work against the brief and the world. Above the
              messages on purpose, like the withheld panel — the reviewer
              should know a claim was refuted before reading the claims. It
              informs; Approve still decides. */}
          {job.checkVerdict && (
            <div className={`rv-check rv-check-${job.checkVerdict.verdict}`}>
              <div className="rv-check-t">
                {job.checkVerdict.verdict === 'confirmed'
                  ? `Checked${job.checkVerdict.by ? ` by ${job.checkVerdict.by}` : ''} — the claims held`
                  : job.checkVerdict.verdict === 'refuted'
                    ? `Checked${job.checkVerdict.by ? ` by ${job.checkVerdict.by}` : ''} — a claim was refuted`
                    : `The check reported no verdict${job.checkVerdict.note ? ` — ${job.checkVerdict.note}` : ''}`}
              </div>
              {!!job.checkVerdict.findings?.length && (
                <ul className="rv-check-list">
                  {job.checkVerdict.findings.map((finding, i) => (
                    <li key={i}>{finding}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {job.checked && !job.checkVerdict && (job.status === 'done' || job.status === 'partial') && (
            <p className="rv-check-pending">
              A check pass is running — its verdict lands here, and nothing auto-sends before it
              reports.
            </p>
          )}
          {/* The third mention-guard (D-193): the channel was carried, the run
              composed, and the contract refused the file — so the send the
              summary may well be claiming does not exist. Same voice as the
              D-093 and D-178 guards below; the bare error line stays for
              channel-less jobs whose runs invented an outbox. */}
          {noSendLine(job) ? (
            <p className="rv-mention-guard">{noSendLine(job)}</p>
          ) : (
            job.outboxError && <p className="error">{job.outboxError}</p>
          )}
          {job.packDraftError && <p className="error">{job.packDraftError}</p>}
          {job.packDraft && (
            <PackCard
              draft={job.packDraft}
              slug={packSlug}
              onSlug={setPackSlug}
              levelId={levelId}
              jobId={job.id}
            />
          )}
          {/* The split a plan job proposed (TEAMWORK T3, D-196): approving
              is what queues these hands — the model proposed, this review
              disposes, and nothing has run yet. */}
          {job.partyDraftError && (
            <p className="rv-error">
              {job.partyDraftError} — approving queues nothing until the plan says properly what
              to run.
            </p>
          )}
          {job.partyDraft && (
            <div className="rv-withheld">
              <div className="rv-withheld-t">
                The proposed party — approving queues these {job.partyDraft.hands.length} hands
              </div>
              <ul className="rv-check-list">
                {job.partyDraft.hands.map((hand, i) => (
                  <li key={i}>
                    {hand.prompt}
                    {hand.loadBearing ? ' — load-bearing: the party halts without it' : ''}
                    {hand.scope?.length ? (
                      <span className="rv-withheld-n"> · owns {hand.scope.join(', ')}</span>
                    ) : null}
                    {hand.why ? <span className="rv-withheld-n"> · {hand.why}</span> : null}
                  </li>
                ))}
              </ul>
              {job.partyDraft.notes && (
                <p className="rv-withheld-note">{job.partyDraft.notes}</p>
              )}
              <p className="rv-withheld-foot">
                Nothing has run yet. Approve queues the hands at once; a gather assembles their
                work when the last one delivers. Discard queues nothing.
              </p>
            </div>
          )}
          {/* The mentioned-but-never-carried guard (D-093): a real 80¢ run
              was approved in good faith and sent nothing — this says so
              before the button does it again. */}
          {job.channelMention && !job.channels?.length && !job.outbox?.length && (
            <p className="rv-mention-guard">
              This job mentions {job.channelMention.label} but never carried a send channel —
              approving keeps the files and sends nothing. To send, reply on the job's card:
              &ldquo;Send it to … on {job.channelMention.label}&rdquo;.
            </p>
          )}
          {/* The other half of the same honesty (D-178): this job did carry a
              channel, and the sentence asked for another one it could not
              take. Approving sends what is below and nothing on the rest, so
              the card says which — it renders beside a real outbox, because
              a send having happened is exactly when the missing one is
              easiest to assume happened too. */}
          {!!job.alsoAsked?.length && (
            <p className="rv-mention-guard">
              This job also asked to send via {job.alsoAsked.map((a) => a.label).join(' and ')},
              which it could not carry — approving sends{' '}
              {job.channels?.length ? 'only what is shown here' : 'nothing'} and nothing there. To
              send the rest, queue it as its own job.
            </p>
          )}
          {/* What the run says it kept out, and what that promise covers
              (D-181). Above the messages on purpose: the reviewer should know
              a redaction was claimed before reading what is going out, not
              after. The limits are stated in the same breath as the claim —
              the app checks what the run declared, not everything sensitive. */}
          {job.withheldError && (
            <p className="rv-error">
              {job.withheldError} — approving sends nothing until the run says properly what it
              took out.
            </p>
          )}
          {job.withheld && (
            <div className="rv-withheld">
              <div className="rv-withheld-t">Kept out of these messages</div>
              <ul className="rv-withheld-list">
                {job.withheld.items.map((item) => (
                  <li key={item.what}>
                    <span className="rv-withheld-what">{item.what}</span>
                    <span className="rv-withheld-n">
                      {item.values.length} {item.values.length === 1 ? 'value' : 'values'}
                    </span>
                  </li>
                ))}
              </ul>
              {job.withheld.note && <p className="rv-withheld-note">{job.withheld.note}</p>}
              <p className="rv-withheld-foot">
                Approve checks every message, subject and readable attachment for these and refuses
                to send if one is still there. It checks what the run said it removed — not
                everything that might be sensitive, and not inside a PDF or a spreadsheet.
              </p>
            </div>
          )}
          {(job.outbox ?? []).map((outbox) => {
            // One card per channel (D-179), each with its own sent/failed
            // truth — a job may have reached everyone on Telegram and nobody
            // on Gmail, and one merged card could only lie about one of them.
            const sent = sentOn(outbox.channel);
            const stamp = job.outboxSent?.find((s) => s.channel === outbox.channel);
            const left = outbox.messages.filter((m) => !sent.includes(m.to)).length;
            return (
            // The outbox as mock screen 4 drew it (D-088): the channel's mark
            // on the header, a recipient's initial on each row — same rows,
            // same sent/failed truth, dressed.
            <div className="rv-outbox-card" key={outbox.channel}>
              <div className="rv-outbox-head">
                <ChannelLogo channel={outbox.channel} />
                <div>
                  <div className="rv-outbox-t">
                    Outbox — {outbox.messages.length} message
                    {outbox.messages.length === 1 ? '' : 's'} via{' '}
                    {CHANNEL_LABELS[outbox.channel] ?? outbox.channel}
                  </div>
                  <div className="rv-outbox-s">
                    {outbox.template &&
                      `template ${outbox.template.name} (${outbox.template.language}) · `}
                    {left > 0 ? 'approving sends them' : 'all sent'}
                  </div>
                </div>
              </div>
              <ul className="rv-outbox">
                {outbox.messages.map((m) => {
                  const failure = stamp?.failed.find((f) => f.to === m.to);
                  return (
                    <li key={m.to}>
                      <span className="rv-av" aria-hidden="true">
                        {(m.name ?? m.to).trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <div className="rv-msg">
                        <div className="rv-msg-head">
                          <span className="rv-msg-to">
                            {m.name ?? m.to}
                            {m.name && <span className="rv-msg-addr"> · {m.to}</span>}
                          </span>
                          {sent.includes(m.to) && <span className="rv-msg-sent">sent</span>}
                          {failure && <span className="rv-msg-failed">{failure.reason}</span>}
                        </div>
                        {m.subject && <div className="rv-msg-subject">{m.subject}</div>}
                        {m.event && (
                          // The event as it will land (D-104): the when, and
                          // who gets an invitation — approving creates it.
                          <div className="rv-msg-event">
                            📅 {eventSpan(m.event.start, m.event.end)}
                            {m.event.attendees?.length
                              ? ` · invites ${m.event.attendees.join(', ')}`
                              : ''}
                          </div>
                        )}
                        <div className="rv-msg-body">{m.body}</div>
                        {m.params && m.params.length > 0 && (
                          // What is actually transmitted for a template send —
                          // the body above is the claimed rendering.
                          <div className="rv-msg-params">sends: [{m.params.join(' · ')}]</div>
                        )}
                        {m.files && m.files.length > 0 && (
                          // Files that ride this message as real attachments
                          // (D-159). A sandbox-root file opens in the viewer;
                          // an input/ forward has no serving route and shows
                          // as the name it will arrive under.
                          <div className="rv-msg-files">
                            {m.files.map((f) =>
                              f.includes('/') ? (
                                <span key={f}>📎 {f.split('/').pop()}</span>
                              ) : (
                                <a
                                  key={f}
                                  href={fileUrl(levelId, job.id, f)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  📎 {f}
                                </a>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
          {job.movesError && <p className="rv-error">{job.movesError}</p>}
          {job.moves && job.organizeRoot && (
            // A folder reorganization (D-132): from→to rows, the plain-words
            // count, and the caution that a move inside a synced folder syncs.
            // Approve replays it under the picked root; undo replays it back.
            <div className="rv-moves-card">
              <div className="rv-moves-head">
                <div className="rv-moves-t">
                  Reorganize — {movesSummary(job.moves.moves)}
                  {movedCount > 0 && <span className="rv-moves-done"> · {movedCount} done</span>}
                </div>
                <div className="rv-moves-s" title={job.organizeRoot}>
                  in {job.organizeRoot}
                </div>
              </div>
              <ul className="rv-moves">
                {moveRows(job.moves.moves).map((r) => (
                  <li key={`${r.from}→${r.to}`}>
                    <span className="rv-move-from">{r.from}</span>
                    <span className="rv-move-arrow" aria-hidden="true"> → </span>
                    <span className="rv-move-to">{r.to}</span>
                  </li>
                ))}
              </ul>
              <p className="rv-moves-note">
                Files are moved, never deleted, and only after you approve. A move inside a synced
                folder (OneDrive, Dropbox) will sync.
              </p>
              {movedCount > 0 && (
                <button className="btn-quiet" disabled={busy} onClick={() => void undoMoves()}>
                  Undo the moves
                </button>
              )}
            </div>
          )}
          {job.changes && job.changes.files > 0 && (
            <>
              <div className="sect">
                files this would change · +{job.changes.added} −{job.changes.removed}
              </div>
              <ul className="rv-files">
                {job.changes.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          {/* Where it got to and what it did not, so granting turns is a
              judgement rather than a coin flip (D-114). Absent means the
              close-out never ran — said plainly, never as "nothing left". */}
          {/* Where the turns went (UI.md, step 17): the trail's session pass
              as one block per call. A run from before the trail says so
              rather than showing an empty strip. */}
          {trail && !trail.trail && (
            <p className="rv-trail-empty">
              where the turns went — no trail for this run: trails began on Aug 22, 2026, so only
              runs from then on show their strip here.
            </p>
          )}
          {trail?.trail && (
            <Section
              panel="review"
              id="turns"
              label="where the turns went"
              count={`${callsOf(trail.lines).length} calls`}
              defaultOpen
            >
              <TurnsStrip lines={trail.lines} />
            </Section>
          )}
          {job.pending && (
            // A section that folds once read (UI.md, step 3): the account stays
            // a tap away, and the files below it come up the screen.
            <Section
              panel="review"
              id="pending"
              label="what is left"
              count={job.pending.items.length > 0 ? `${job.pending.items.length} items` : 'nothing'}
              defaultOpen
            >
              <div className="rv-pending">
                <p className="rv-pending-state">{job.pending.state}</p>
                {job.pending.items.length > 0 ? (
                  <ul className="rv-pending-list">
                    {job.pending.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="dim">Nothing — it believed the work finished.</p>
                )}
              </div>
            </Section>
          )}
          {!job.pending && canCarryOn && (
            <p className="dim">
              No account of what is left — the write-up did not run, so carrying on is a guess.
            </p>
          )}
          <Section
            panel="review"
            id="files"
            label="files"
            count={files === null ? '…' : railSummary(files, dirs)}
            defaultOpen
          >
            {files === null && <p className="dim">Loading…</p>}
            {files && (
              <FileViewer
                levelId={levelId}
                jobId={job.id}
                files={files}
                dirs={dirs}
                carries={carries}
                initial={file}
              />
            )}
          </Section>
          {refusal && <p className="error">{refusal}</p>}
          {offer && !offer.auto && (
            <div className="rv-standing">
              <div className="rv-standing-t">
                Sent, and that makes {offer.approvals} approvals without a change. Let this job
                send itself?
              </div>
              <p className="rv-standing-b">
                Auto-send stays locked to{' '}
                {offer.channels
                  .map(
                    (c) =>
                      `${c.recipients.join(', ')} on ${c.channel}${
                        c.template ? ` with the ${c.template} template` : ''
                      }`,
                  )
                  .join('; ')}
                . Anyone new, a changed template or another channel always comes back to you — and
                every send still lands in the inbox and the audit.
              </p>
              <div className="rv-standing-btns">
                <button onClick={onClose}>Keep reviewing</button>
                <button
                  className="btn-amber"
                  disabled={granting}
                  onClick={() => void setAutoSend(true)}
                >
                  {granting ? '…' : 'Auto-send from the next run'}
                </button>
              </div>
            </div>
          )}
          {offer?.auto && (
            <div className="rv-standing">
              <div className="rv-standing-t">Auto-send is on for this job.</div>
              <p className="rv-standing-b">
                The next clean run sends to the approved recipients without waiting. Turn it off
                any time in crew → backoffice, or right here.
              </p>
              <div className="rv-standing-btns">
                <button disabled={granting} onClick={() => void setAutoSend(false)}>
                  Turn it off
                </button>
                <button onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </div>
        <div className="m-foot">
          {/* `partial` gets the same actions the terminal card offers it:
              without this, "See the changes" on the status that most needs
              reviewing opened a modal whose only button was Close. */}
          {!offer && (job.status === 'done' || job.status === 'partial') && (
            <>
              <button
                ref={approveRef}
                className={unsent.length > 0 || moveLeft.length > 0 ? 'btn-send' : undefined}
                onClick={() => void resolve('promote')}
              >
                {unsent.length > 0
                  ? `Approve & send ${unsent.length}`
                  : moveLeft.length > 0
                    ? `Approve & move ${moveLeft.filter((m) => m.op === 'move').length}`
                    : 'Approve'}
              </button>
              <button className="btn-quiet" onClick={() => void resolve('discard')}>
                Discard
              </button>
              {/* A routed answer cost nothing and can be wrong (D-015); this
                  pays for the full session with the router off. Lost its door
                  when D-114 moved the decision in here — restored (D-116). */}
              {job.meter?.routed && (
                <button className="btn-quiet" disabled={busy} onClick={() => void redo()}>
                  Do it properly
                </button>
              )}
            </>
          )}
          {/* Only for a run the server will actually let continue — a button
              certain to be refused is worse than none. */}
          {!offer && canCarryOn && (
            <div className="rv-carry">
              <div className="rv-carry-row">
                <button className="btn-more" disabled={busy} onClick={() => void carryOn()}>
                  {job.meter?.timedOut && !job.meter?.outOfTurns ? 'More time' : 'More turns'}
                  {carryQuote ? ` · up to $${carryQuote.ceilingUsd.toFixed(2)}` : ''}
                </button>
                {/* The asymmetry that makes this an easy call: a cut run is
                    filed failed and priced at zero, so only a landing costs. */}
                <span className="rv-free">charged only if it finishes</span>
              </div>
              {/* What the next leg receives, from the manifest the copy is
                  made from (UI.md, step 17) — work/ stays behind, and the
                  note says so before the button is pressed. */}
              {carries && <p className="rv-carry-note">{carryNote(carries, dirs)}</p>}
              {/* The reply, started from the run's own account of what is
                  left (UI.md, step 3) — the two-leg shape SPATIAL §6 keeps
                  arriving at, one tap from the list that names the legs. */}
              {job.pending && job.pending.items.length > 0 && (
                <p className="rv-carry-note">
                  <button
                    className="work-link"
                    onClick={() => setClarify(replyFromPending(job.pending))}
                  >
                    start the reply from what is left
                  </button>
                  {' '}— puts the {job.pending.items.length} items above into the box
                </p>
              )}
            </div>
          )}
          {/* An answered failure says so instead of asking again (D-139) —
              the reply box already did its work once. */}
          {!offer && job.status === 'failed' && job.continuedBy && (
            <span className="dim">answered — a follow-up run is carrying it on</span>
          )}
          {!offer && !(job.status === 'failed' && job.continuedBy) && (
            // On a failed job the Approve/Discard pair this wording trailed is
            // not rendered, and "Or …" dangling after nothing read as
            // decoration — a real reviewer took the whole modal for
            // close-only (D-135). Standalone wording and the amber lift make
            // the reply what it is there: the primary action.
            <span className={job.status === 'failed' ? 'rv-clarify answer' : 'rv-clarify'}>
              <input
                value={clarify}
                placeholder={
                  job.status === 'failed'
                    ? 'Answer them…'
                    : 'Or tell them what to do differently…'
                }
                aria-label={
                  job.status === 'failed' ? 'Answer the agentling' : 'Tell the agentling what to do'
                }
                onChange={(e) => setClarify(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
              />
              <button disabled={!clarify.trim() || busy} onClick={() => void send()}>
                Send
              </button>
            </span>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The world a run authored, shown before it is installed (M4).
 *
 * The picture is drawn from the pack's own data through the interpreter that
 * will draw it for real — so it cannot flatter the pack, and a scene that
 * would render badly renders badly here. Approving a world you cannot see is
 * exactly what this exists to prevent, so a preview that were merely
 * decorative would be worse than none at all.
 *
 * At true proportions rather than card-shaped: how tall a world is, is one of
 * the few things a pack decides that you cannot change afterwards.
 */
function PackCard({
  draft,
  slug,
  onSlug,
  levelId,
  jobId,
}: {
  draft: PackDraft;
  slug: string;
  onSlug: (next: string) => void;
  levelId: string;
  jobId: string;
}) {
  const { pack } = draft;
  // A draft's plates live in its sandbox (D-143); fetch them so the preview
  // shows the world Approve would install, not the world minus its picture.
  // A plate that fails to load costs only itself — the preview still draws.
  const plateFiles = pack.backdrop?.plates ?? [];
  const occlusionFile = pack.backdrop?.occlusion;
  const [plateImages, setPlateImages] = useState<HTMLImageElement[]>([]);
  const [occlusionImage, setOcclusionImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (plateFiles.length === 0 && !occlusionFile) return;
    let gone = false;
    const fetchImage = async (name: string): Promise<HTMLImageElement | null> => {
      try {
        const img = new Image();
        img.src = fileUrl(levelId, jobId, name);
        await img.decode();
        return img;
      } catch {
        return null;
      }
    };
    void Promise.all(plateFiles.map(fetchImage)).then((images) => {
      if (!gone) setPlateImages(images.filter((img): img is HTMLImageElement => img !== null));
    });
    if (occlusionFile) {
      void fetchImage(occlusionFile).then((img) => {
        if (!gone) setOcclusionImage(img);
      });
    }
    return () => {
      gone = true;
    };
    // The file list is identity enough: a draft's plates never change names
    // without the whole draft changing, which remounts the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, jobId, plateFiles.join('|'), occlusionFile]);
  const preview = renderScenePreview(pack, pack.theme, 520, plateImages, occlusionImage);
  const backdropOps = pack.backdrop?.ops?.length ?? 0;
  // Whether this name is free, checked here rather than at Approve. The first
  // collision surfaced only after the button, naming a folder the reviewer had
  // never seen, with no way to change it — so a good pack was discarded for
  // want of a rename. The clash is visible before the click now.
  const clash = allLooks().find((l) => l.installed && l.id === slug);

  return (
    <div className="rv-pack">
      <div className="rv-pack-head">
        <span className="rv-pack-t">{pack.name}</span>
        <span className="dim">
          {pack.viewH} tall, ground at {pack.groundY}
        </span>
      </div>
      <img
        className="rv-pack-shot"
        src={preview.url}
        height={preview.height}
        alt={`The ${pack.name} world, drawn from the pack`}
      />
      <div className="rv-pack-facts">
        <span>{pack.ops.length} foreground ops</span>
        {plateFiles.length > 0 && (
          <span className={plateImages.length > 0 ? '' : 'rv-pack-warn'}>
            {plateImages.length > 0
              ? `plate ${plateFiles.join(', ')}`
              : `plate ${plateFiles.join(', ')} — not shown; it did not load`}
          </span>
        )}
        {occlusionFile && (
          <span className={occlusionImage ? '' : 'rv-pack-warn'}>
            {occlusionImage
              ? `occlusion ${occlusionFile}`
              : `occlusion ${occlusionFile} — not shown; it did not load`}
          </span>
        )}
        {backdropOps > 0 && <span>{backdropOps} backdrop</span>}
        {pack.backdrop?.scrim && <span>scrim {pack.backdrop.scrim.alpha}</span>}
        <span className={pack.rim ? '' : 'rv-pack-warn'}>
          {pack.rim ? `rim ${pack.rim}` : 'no rim — the crew may vanish into it'}
        </span>
        {pack.ambient?.length ? <span>{pack.ambient.length} ambient</span> : null}
      </div>
      <div className="rv-pack-name">
        <label htmlFor="rv-pack-slug">Install as</label>
        <input
          id="rv-pack-slug"
          value={slug}
          onChange={(e) => onSlug(e.target.value)}
          spellCheck={false}
        />
      </div>
      {clash && (
        <p className="rv-pack-clash">
          That name already belongs to <strong>{clash.label}</strong> on your palette. Pick
          another and this one installs beside it.
        </p>
      )}
      <p className="rv-pack-prov">{pack.provenance}</p>
      <p className="dim">
        Approving installs this world. It joins the palette for new levels; no existing level
        changes.
      </p>
    </div>
  );
}
