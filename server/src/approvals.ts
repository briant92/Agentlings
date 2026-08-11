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
export interface SendApproval {
  key: string;
  channel: string;
  /** Sorted and deduplicated. THE allowlist — auto-send reaches these and nobody else. */
  recipients: string[];
  /** The template name, where the channel sends templates. */
  template?: string;
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
    return Array.isArray(parsed) ? parsed.filter((a) => a?.key) : [];
  } catch {
    return []; // a torn file must not take the level down
  }
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

function signatureMatches(approval: SendApproval, outbox: Outbox): boolean {
  return (
    approval.channel === outbox.channel &&
    (approval.template ?? null) === (outbox.template?.name ?? null) &&
    sameRecipients(approval.recipients, recipientsOf(outbox))
  );
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
  outbox: Outbox,
  now: number,
): SendApproval {
  const key = approvalKey(prompt);
  const list = readApprovals(dir);
  const existing = list.find((a) => a.key === key);
  if (existing && signatureMatches(existing, outbox)) {
    existing.approvals += 1;
    existing.lastAt = now;
    writeApprovals(dir, list);
    return existing;
  }
  const fresh: SendApproval = {
    key,
    channel: outbox.channel,
    recipients: recipientsOf(outbox),
    ...(outbox.template?.name ? { template: outbox.template.name } : {}),
    approvals: 1,
    auto: false,
    lastAt: now,
  };
  if (existing) {
    Object.assign(existing, { auto: false, approvals: 1 });
    existing.channel = fresh.channel;
    existing.recipients = fresh.recipients;
    if (fresh.template) existing.template = fresh.template;
    else delete existing.template;
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
export function autoSendable(approval: SendApproval | undefined, outbox: Outbox): boolean {
  if (!approval?.auto) return false;
  if (approval.channel !== outbox.channel) return false;
  if ((approval.template ?? null) !== (outbox.template?.name ?? null)) return false;
  return outbox.messages.every((m) => approval.recipients.includes(m.to));
}

/**
 * The job-level guards: only a pure send job may skip review. Returns the
 * reason it may not, or null when it may — a run that also changed code or
 * produced files is work somebody has to look at, whatever its outbox says.
 */
export function autoBlocker(
  job: Pick<Job, 'status' | 'outbox' | 'outboxError' | 'changes' | 'compile'>,
  files: string[],
): string | null {
  if (job.compile) return 'a compile is never auto-sent';
  if (job.status !== 'done') return 'only a clean finish may auto-send';
  if (!job.outbox) return 'no outbox';
  if (job.outboxError) return 'the outbox did not parse';
  // A standing approval covered words to an allowlist, never files (D-159).
  // The extras check below already stops root deliverables from slipping out,
  // but an `input/` forward would pass it — this names the rule itself.
  if (job.outbox.messages.some((m) => m.files?.length)) {
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
    channel: approval.channel,
    recipients: approval.recipients,
    ...(approval.template ? { template: approval.template } : {}),
    approvals: approval.approvals,
    auto: approval.auto,
    eligible: !approval.auto && approval.approvals >= APPROVALS_FOR_AUTO,
  };
}
