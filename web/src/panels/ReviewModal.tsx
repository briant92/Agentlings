import { useEffect, useState } from 'react';
import type { DeliveryFile, Job, SendApprovalInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { CHANNEL_LABELS, ChannelLogo } from './ChannelLogo';
import { FileViewer } from './FileViewer';

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
  onClose,
}: {
  levelId: string;
  job: Job;
  file?: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DeliveryFile[] | null>(null);
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

  useEffect(() => {
    let alive = true;
    void api<{ files: DeliveryFile[] }>(lvl(levelId, `/jobs/${job.id}/output`)).then((data) => {
      if (alive) setFiles(data.files);
    });
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

  const resolve = async (action: 'promote' | 'discard') => {
    setRefusal(null);
    try {
      const reply = await api<Job & { sendApproval?: SendApprovalInfo }>(
        lvl(levelId, `/jobs/${job.id}/resolve`),
        postJson({ action }),
      );
      if (action === 'promote' && reply.sendApproval?.eligible) {
        setOffer(reply.sendApproval);
        return;
      }
      onClose();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
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
      else onClose();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setGranting(false);
    }
  };

  const sentTo = job.outboxSent?.sentTo ?? [];
  const unsent = job.outbox ? job.outbox.messages.filter((m) => !sentTo.includes(m.to)) : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal review" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className={`badge ${job.status}`}>{job.status}</span>
          {/* Which step of its sequence this was (D-105). */}
          {job.step && (
            <span className="badge">
              step {job.step.n} of {job.step.of}
            </span>
          )}
          <span className="m-title">{job.title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          {job.error && <p className="error">{job.error}</p>}
          {job.summary && <p className="rv-summary">{job.summary}</p>}
          {job.outboxError && <p className="error">{job.outboxError}</p>}
          {/* The mentioned-but-never-carried guard (D-093): a real 80¢ run
              was approved in good faith and sent nothing — this says so
              before the button does it again. */}
          {job.channelMention && !job.channel && !job.outbox && (
            <p className="rv-mention-guard">
              This job mentions {job.channelMention.label} but never carried a send channel —
              approving keeps the files and sends nothing. To send, reply on the job's card:
              &ldquo;Send it to … on {job.channelMention.label}&rdquo;.
            </p>
          )}
          {job.outbox && (
            // The outbox as mock screen 4 drew it (D-088): the channel's mark
            // on the header, a recipient's initial on each row — same rows,
            // same sent/failed truth, dressed.
            <div className="rv-outbox-card">
              <div className="rv-outbox-head">
                <ChannelLogo channel={job.outbox.channel} />
                <div>
                  <div className="rv-outbox-t">
                    Outbox — {job.outbox.messages.length} message
                    {job.outbox.messages.length === 1 ? '' : 's'} via{' '}
                    {CHANNEL_LABELS[job.outbox.channel] ?? job.outbox.channel}
                  </div>
                  <div className="rv-outbox-s">
                    {job.outbox.template &&
                      `template ${job.outbox.template.name} (${job.outbox.template.language}) · `}
                    {unsent.length > 0 ? 'approving sends them' : 'all sent'}
                  </div>
                </div>
              </div>
              <ul className="rv-outbox">
                {job.outbox.messages.map((m) => {
                  const failure = job.outboxSent?.failed.find((f) => f.to === m.to);
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
                          {sentTo.includes(m.to) && <span className="rv-msg-sent">sent</span>}
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
                      </div>
                    </li>
                  );
                })}
              </ul>
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
          {files === null && <p className="dim">Loading…</p>}
          {files && <FileViewer levelId={levelId} jobId={job.id} files={files} initial={file} />}
          {refusal && <p className="error">{refusal}</p>}
          {offer && !offer.auto && (
            <div className="rv-standing">
              <div className="rv-standing-t">
                Sent, and that makes {offer.approvals} approvals without a change. Let this job
                send itself?
              </div>
              <p className="rv-standing-b">
                Auto-send stays locked to {offer.recipients.join(', ')} on {offer.channel}
                {offer.template ? ` with the ${offer.template} template` : ''}. Anyone new, a
                changed template or another channel always comes back to you — and every send
                still lands in the inbox and the audit.
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
                className={unsent.length > 0 ? 'btn-send' : undefined}
                onClick={() => void resolve('promote')}
              >
                {unsent.length > 0 ? `Approve & send ${unsent.length}` : 'Approve'}
              </button>
              <button className="btn-quiet" onClick={() => void resolve('discard')}>
                Discard
              </button>
            </>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
