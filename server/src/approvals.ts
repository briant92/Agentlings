import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job, Outbox, SendApprovalInfo } from '@agentlings/shared';
import { OUTBOX_FILE } from './outbox';
import { PAPERWORK } from './outputs';
import { normalise } from './recipes';

/**
 * Standing approval for a recurring send — M5.11's last slice, designed in
 * D-075 and built in D-082. Deliberately *not* called a leash: the codebase
 * already has one (the recipe's five turns), and two mechanisms sharing a
 * word is how two notions get collapsed (D-030).
 *
 * The scope is the job — keyed by its normalised prompt, the same identity
 * recipes and quotes use — plus its channel, its recipient set, and the
 * template where the channel uses one. **The recipient set is the security
 * boundary**: an outbox naming anyone outside it drops back to review, so
 * nothing a session *read* can add a recipient a human never approved.
 * Bodies are deliberately not locked — a weekly reminder's words change by
 * design — and an auto-sent job still lands in the inbox as promoted work
 * with every message on its card, plus a row per send in sends.jsonl.
 */
/** One channel's half of an approved signature (D-179). */
export interface ApprovedChannel {
  channel: string;
  /** Sorted and deduplicated. THE allowlist — auto-send reaches these and nobody else. */
  recipients: string[];
  /** The template name, where the channel sends templates. */
  template?: string;
}

export interface SendApproval {
  key: string;
  /**
   * Every channel this job sends on, with its own allowlist (D-179).
   *
   * The scope stays the job, which is why this is a list inside one approval
   * rather than an approval per channel: a two-channel job that could
   * auto-send one half and hold the other would send *some* of a send nobody
   * reviewed, which is worse than either whole answer. Covered means covered
   * everywhere.
   *
   * Approvals written before D-179 carry a flat channel and recipients; they
   * are lifted into a one-entry list on read.
   */
  channels: ApprovedChannel[];
  /** Consecutive unchanged approvals; any signature change starts over. */
  approvals: number;
  auto: boolean;
  grantedAt?: number;
  lastAt: number;
}

/** Clean, unchanged reviews before auto-send may even be offered. */
export const APPROVALS_FOR_AUTO = 3;

export function approvalsFile(dir: string): string {
  return path.join(dir, 'send-approvals.json');
}

export function readApprovals(dir: string): SendApproval[] {
  const file = approvalsFile(dir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SendApproval[];
    return Array.isArray(parsed) ? parsed.filter((a) => a?.key).map(liftApproval) : [];
  } catch {
    return []; // a torn file must not take the level down
  }
}

/**
 * An approval written before D-179 made the signature a list, lifted on read.
 *
 * A grant is a security boundary, so this must never widen one: the lifted
 * entry carries exactly the channel, recipients and template that were
 * approved, and a row too damaged to say what was approved keeps its count
 * but grants nothing — `channels: []` matches no outbox, so `autoSendable`
 * refuses and the send goes back to a human.
 */
function liftApproval(approval: SendApproval): SendApproval {
  if (Array.isArray(approval.channels)) return approval;
  const legacy = approval as SendApproval & {
    channel?: string;
    recipients?: string[];
    template?: string;
  };
  approval.channels = legacy.channel
    ? [
        {
          channel: legacy.channel,
          recipients: legacy.recipients ?? [],
          ...(legacy.template ? { template: legacy.template } : {}),
        },
      ]
    : [];
  delete legacy.channel;
  delete legacy.recipients;
  delete legacy.template;
  return approval;
}

function writeApprovals(dir: string, list: SendApproval[]): void {
  writeFileSync(approvalsFile(dir), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
}

/** The same identity a recipe has: the job is its prompt (D-072). */
export function approvalKey(prompt: string): string {
  return normalise(prompt);
}

function recipientsOf(outbox: Outbox): string[] {
  return [...new Set(outbox.messages.map((m) => m.to))].sort();
}

function sameRecipients(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** The signature of what is being sent, channels in the order they arrive. */
function signatureOf(outboxes: Outbox[]): ApprovedChannel[] {
  return outboxes.map((outbox) => ({
    channel: outbox.channel,
    recipients: recipientsOf(outbox),
    ...(outbox.template?.name ? { template: outbox.template.name } : {}),
  }));
}

function signatureMatches(approval: SendApproval, outboxes: Outbox[]): boolean {
  const now = signatureOf(outboxes);
  // A channel added or dropped is a change like any other: what was trusted
  // is not what is now being sent.
  if (approval.channels.length !== now.length) return false;
  return now.every((sending) => {
    const approved = approval.channels.find((c) => c.channel === sending.channel);
    return (
      !!approved &&
      (approved.template ?? null) === (sending.template ?? null) &&
      sameRecipients(approved.recipients, sending.recipients)
    );
  });
}

/**
 * A human approved this send. Unchanged signature → the count grows; any
 * change — channel, template, recipients — starts the count over **and
 * revokes any standing grant**, because what was trusted is not what is
 * now being sent.
 */
export function recordApproval(
  dir: string,
  prompt: string,
  outboxes: Outbox[],
  now: number,
): SendApproval {
  const key = approvalKey(prompt);
  const list = readApprovals(dir);
  const existing = list.find((a) => a.key === key);
  if (existing && signatureMatches(existing, outboxes)) {
    existing.approvals += 1;
    existing.lastAt = now;
    writeApprovals(dir, list);
    return existing;
  }
  const fresh: SendApproval = {
    key,
    channels: signatureOf(outboxes),
    approvals: 1,
    auto: false,
    lastAt: now,
  };
  if (existing) {
    Object.assign(existing, { auto: false, approvals: 1 });
    existing.channels = fresh.channels;
    delete existing.grantedAt;
    existing.lastAt = now;
    writeApprovals(dir, list);
    return existing;
  }
  list.push(fresh);
  writeApprovals(dir, list);
  return fresh;
}

/** Grant or revoke. Granting is refused until the approvals are earned. */
export function setAuto(
  dir: string,
  key: string,
  auto: boolean,
  now: number,
): { approval?: SendApproval; error?: string } {
  const list = readApprovals(dir);
  const approval = list.find((a) => a.key === key);
  if (!approval) return { error: 'no standing approval by that key' };
  if (auto && approval.approvals < APPROVALS_FOR_AUTO) {
    return {
      error: `not earned yet — ${approval.approvals} of ${APPROVALS_FOR_AUTO} unchanged approvals`,
    };
  }
  approval.auto = auto;
  if (auto) approval.grantedAt = now;
  else delete approval.grantedAt;
  writeApprovals(dir, list);
  return { approval };
}

/**
 * May this outbox go without review? The allowlist question, asked at the
 * only moment it matters. Subset on purpose: sending to *fewer* approved
 * people is fine; anyone new is not.
 */
export function autoSendable(approval: SendApproval | undefined, outboxes: Outbox[]): boolean {
  if (!approval?.auto) return false;
  // Every channel being sent must be one this grant covers. Sending fewer
  // channels than were approved is fine for the same reason sending to fewer
  // people is: the grant bounds the reach, it does not require using it.
  return outboxes.every((outbox) => {
    const approved = approval.channels.find((c) => c.channel === outbox.channel);
    if (!approved) return false;
    if ((approved.template ?? null) !== (outbox.template?.name ?? null)) return false;
    return outbox.messages.every((m) => approved.recipients.includes(m.to));
  });
}

/**
 * The job-level guards: only a pure send job may skip review. Returns the
 * reason it may not, or null when it may — a run that also changed code or
 * produced files is work somebody has to look at, whatever its outbox says.
 */
export function autoBlocker(
  job: Pick<
    Job,
    | 'status'
    | 'outbox'
    | 'outboxError'
    | 'changes'
    | 'compile'
    | 'withheld'
    | 'withheldError'
    | 'checked'
    | 'checkVerdict'
    | 'party'
    | 'mailTrigger'
  >,
  files: string[],
): string | null {
  if (job.compile) return 'a compile is never auto-sent';
  // A job a mail queued is excluded from standing approval outright (D-248):
  // mail in → reply out → their auto-reply back in is a loop that spends
  // money on its own echo, and the human in the moment is what breaks it.
  // The poll's own guards bound the loop; this is the policy on top.
  if (job.mailTrigger) return 'a mail-triggered job is always reviewed';
  // A gather is always reviewed (TEAMWORK T2): its prompt is one fixed
  // sentence shared by every party, so a standing approval earned on one
  // party's sends would silently cover every later party reaching the same
  // recipients — D-120's key problem in a new coat. Until approvals key on
  // the party's own request, the human stays in the loop.
  if (job.party?.gather) return 'a gather is always reviewed';
  // A job the desk asked to have checked auto-sends only on a confirmed
  // verdict (TEAMWORK T1, D-194). Pending holds it because the check is the
  // point of asking; refuted holds it because a claim is wrong; a check that
  // named no verdict or never reported holds it too, because a check that
  // vanished is not a check that passed. The check's own completion re-asks
  // this gate, so a confirming verdict releases the send with nobody waiting.
  if (job.checked) {
    if (!job.checkVerdict) return 'its check has not reported yet';
    if (job.checkVerdict.verdict === 'refuted') return 'its check refuted a claim';
    if (job.checkVerdict.verdict !== 'confirmed') return 'its check reported no verdict';
  }
  // A run that withheld something is a run that made a judgement about what a
  // person may see (D-181). A standing grant covered *recipients*, never that
  // — and the one thing worse than a redaction nobody checked is a redaction
  // nobody looked at, sent automatically. The declaration failing to parse
  // blocks for the same reason: something was withheld and the record of it
  // is broken.
  if (job.withheld || job.withheldError) return 'a run that withheld something is always reviewed';
  if (job.status !== 'done') return 'only a clean finish may auto-send';
  if (!job.outbox?.length) return 'no outbox';
  if (job.outboxError) return 'the outbox did not parse';
  // A standing approval covered words to an allowlist, never files (D-159).
  // The extras check below already stops root deliverables from slipping out,
  // but an `input/` forward would pass it — this names the rule itself.
  if (job.outbox.some((outbox) => outbox.messages.some((m) => m.files?.length))) {
    return 'the outbox sends files — a file leaves only through review';
  }
  if (job.changes && job.changes.files > 0) return 'the run also changed code';
  const extras = files.filter((f) => !PAPERWORK.has(f) && f !== OUTBOX_FILE);
  if (extras.length > 0) return `the run also produced ${extras.join(', ')}`;
  return null;
}

export function describeApproval(approval: SendApproval): SendApprovalInfo {
  return {
    key: approval.key,
    channels: approval.channels,
    approvals: approval.approvals,
    auto: approval.auto,
    eligible: !approval.auto && approval.approvals >= APPROVALS_FOR_AUTO,
  };
}
