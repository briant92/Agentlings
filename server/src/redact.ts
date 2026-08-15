import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_WITHHELD_ITEMS,
  MAX_WITHHELD_VALUES,
  MIN_WITHHELD_CHARS,
  type Outbox,
  type Withheld,
  type WithheldItem,
} from '@agentlings/shared';
import { outboxFilePath } from './outbox';

/**
 * Withholding (D-181): a sentence that asks for something to be kept out of
 * what goes out, and the gate that checks it actually was.
 *
 * The app does not promise that nothing sensitive leaves. It cannot: of the
 * three real withholding sentences this was built against, only one names a
 * pattern at all — "with the customer names removed" and "leaving out anything
 * confidential" are judgements, and a rule claiming to catch them would be
 * claiming a coverage no rule has. **False confidence at the one irreversible
 * moment is worse than no promise**, which is why the pattern-scanning design
 * was refused rather than shipped as a weaker version of this.
 *
 * What is promised instead is checkable: the run declares the literal values it
 * removed, and Approve refuses to send anything that still contains one. A
 * thing the run never noticed is not caught, and the review says so in those
 * words rather than implying a sweep nobody performed.
 */

/**
 * Verbs that only ever mean "keep this out". Each is a word people reach for
 * deliberately — nobody asks to "redact" something by accident.
 */
const WITHHOLD_VERBS =
  /\b(redact(?:s|ed|ing)?|anonymi[sz]e[sd]?|anonymi[sz]ing|pseudonymi[sz]e[sd]?|obfuscate[sd]?|withh(?:old|olds|eld|olding))\b/i;

/**
 * "…with the client names removed", "…minus the salaries blanked out". The
 * verb is at the end here, so the phrase has to span from the preposition to
 * it — bounded, so a "removed" three sentences later cannot pair with a
 * "with" that had nothing to do with it.
 */
const REMOVED_PHRASE =
  /\b(?:with|minus|but)\b[^.!?]{0,60}\b(?:removed|redacted|stripped|blanked|hidden|masked|omitted|taken out|left out)\b/i;

/**
 * The plain-words forms, each naming what is kept out. "Leave out" and "omit"
 * claim on their own — they have no other everyday sense — while "without"
 * needs an object worth withholding, because "do it without breaking the
 * tests" is the commonest sentence in this codebase's own history.
 */
const LEAVE_OUT =
  /\b(?:leav(?:e|es|ing) (?:out|off)|omit(?:s|ted|ting)?|strip(?:s|ped|ping)? out|black(?:ed|ing)? out)\b|\bwithout (?:the |any |their |all )?(?:names?|surnames?|numbers?|addresses|emails?|salaries|salary|figures|details|identifiers?|ids?|rut|personal|client|customer|patient|staff)\b/i;

/**
 * "Mask everything except the totals" — the allowlist form, and the safest
 * shape a person can ask for, since everything unnamed is kept out. `mask`
 * needs its own guard: a bitmask and an input mask are ordinary code words,
 * so it claims only where something is being kept from someone.
 */
const MASK_PHRASE =
  /\bmask(?:s|ed|ing)?\b[^.!?]{0,40}\b(?:except|but|other than|apart from)\b|\b(?:except|but|other than)\b[^.!?]{0,40}\bmask(?:s|ed|ing)?\b/i;

/**
 * Does this sentence ask for something to be kept out of what goes out?
 *
 * The asymmetry here is the opposite of the send-detection card's (D-079),
 * and deliberately. Over-firing costs a job its free tiers and adds a
 * paragraph to a brief; under-firing means a sentence that asked for a
 * redaction gets none and nothing anywhere says so. So this leans towards
 * claiming — but not past the point of nonsense: `mask` and `without` are
 * everyday code words and are guarded by what they act on.
 */
export function wantsWithholding(text: string): boolean {
  return (
    WITHHOLD_VERBS.test(text) ||
    REMOVED_PHRASE.test(text) ||
    LEAVE_OUT.test(text) ||
    MASK_PHRASE.test(text)
  );
}

export const WITHHELD_FILE = 'WITHHELD.json';

export type WithheldRead =
  | { withheld: Withheld; error?: undefined }
  | { withheld?: undefined; error: string };

/** Parses WITHHELD.json from a sandbox: null when absent, the reason when invalid. */
export function readWithheld(dir: string): WithheldRead | null {
  const file = path.join(dir, WITHHELD_FILE);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  return checkWithheld(parsed);
}

/**
 * The contract, over an already-parsed value. Strict, and every refusal names
 * its reason: this file decides whether a send is refused, so a malformed one
 * reading as "nothing was withheld" would turn the gate off silently — which
 * is the one failure mode a safety check must not have.
 */
export function checkWithheld(parsed: unknown): WithheldRead {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'not an object with "items"' };
  }
  const { items, note } = parsed as { items?: unknown; note?: unknown };
  if (!Array.isArray(items) || items.length === 0) {
    return { error: '"items" must be a non-empty array' };
  }
  if (items.length > MAX_WITHHELD_ITEMS) {
    return { error: `${items.length} items — the cap is ${MAX_WITHHELD_ITEMS}` };
  }
  if (note !== undefined && typeof note !== 'string') {
    return { error: '"note" must be a string when present' };
  }
  const clean: WithheldItem[] = [];
  let values = 0;
  for (const [i, raw] of items.entries()) {
    const n = i + 1;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { error: `item ${n} is not an object` };
    }
    const { what, values: list } = raw as { what?: unknown; values?: unknown };
    if (typeof what !== 'string' || what.trim() === '') {
      return { error: `item ${n}: "what" must say what was taken out` };
    }
    if (!Array.isArray(list) || list.length === 0) {
      return { error: `item ${n}: "values" must be a non-empty array of the strings removed` };
    }
    const kept: string[] = [];
    for (const value of list) {
      if (typeof value !== 'string') return { error: `item ${n}: every value must be a string` };
      const trimmed = value.trim();
      // A one- or two-character value matches almost every message, so a gate
      // holding one would refuse every send this job ever makes. Refused at
      // the door with the reason, rather than turning into a mystery block.
      if (trimmed.length < MIN_WITHHELD_CHARS) {
        return {
          error: `item ${n}: "${trimmed}" is under ${MIN_WITHHELD_CHARS} characters — too short to check against a message`,
        };
      }
      if (!kept.includes(trimmed)) kept.push(trimmed);
    }
    values += kept.length;
    if (values > MAX_WITHHELD_VALUES) {
      return { error: `over ${MAX_WITHHELD_VALUES} values — that is a document, not a redaction list` };
    }
    clean.push({ what: what.trim(), values: kept });
  }
  return {
    withheld: { items: clean, ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}) },
  };
}

/** File types the gate can read. Anything else is named as unscanned, never assumed clean. */
const READABLE = new Set(['.md', '.txt', '.csv', '.json', '.tsv', '.log', '.html', '.xml', '.yml', '.yaml']);
/** Past this, a file is not read — a gate that stalls on a huge file blocks the review. */
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

export interface Leak {
  /** The value that survived. */
  value: string;
  /** What it was supposed to be an instance of, for the message at review. */
  what: string;
  /** Where it was found: a recipient's message, or a file riding with one. */
  where: string;
}

export interface GateResult {
  leaks: Leak[];
  /** Files that rode along and could not be read, named rather than assumed clean. */
  unscanned: string[];
}

/**
 * Everything declared withheld that is still present in what would go out.
 *
 * Case-insensitive substring, deliberately the loosest match available: this
 * decides whether a send is *refused*, and a refusal is recoverable while a
 * leak is not. "Acme" must catch "ACME's", and a boundary-aware match would
 * miss exactly that.
 *
 * Message text, subject and file *names* are checked, and so are the contents
 * of files the gate can read. A binary — a PDF, a spreadsheet — is reported as
 * unscanned, because the alternative is to say nothing and let the review
 * assume it was covered.
 */
export function withholdingLeaks(
  outboxes: Outbox[],
  withheld: Withheld,
  dir?: string,
): GateResult {
  const leaks: Leak[] = [];
  const unscanned: string[] = [];
  const seen = new Set<string>();
  const found = (value: string, what: string, where: string) => {
    const key = `${value}|${where}`;
    if (seen.has(key)) return;
    seen.add(key);
    leaks.push({ value, what, where });
  };
  for (const outbox of outboxes) {
    for (const message of outbox.messages) {
      const label = `${outbox.channel} → ${message.name ?? message.to}`;
      const text = [message.body, message.subject ?? '', ...(message.files ?? [])].join('\n');
      for (const item of withheld.items) {
        for (const value of item.values) {
          if (text.toLowerCase().includes(value.toLowerCase())) found(value, item.what, label);
        }
      }
      for (const name of message.files ?? []) {
        const full = dir ? outboxFilePath(dir, name) : null;
        const ext = path.extname(name).toLowerCase();
        if (!full || !existsSync(full)) continue;
        if (!READABLE.has(ext) || statSync(full).size > MAX_SCAN_BYTES) {
          if (!unscanned.includes(name)) unscanned.push(name);
          continue;
        }
        let contents: string;
        try {
          contents = readFileSync(full, 'utf8').toLowerCase();
        } catch {
          if (!unscanned.includes(name)) unscanned.push(name);
          continue;
        }
        for (const item of withheld.items) {
          for (const value of item.values) {
            if (contents.includes(value.toLowerCase())) {
              found(value, item.what, `${label} — ${name}`);
            }
          }
        }
      }
    }
  }
  return { leaks, unscanned };
}

/** The refusal a leaking send earns, or null when the gate passes. */
export function withholdingRefusal(result: GateResult): string | null {
  if (result.leaks.length === 0) return null;
  const named = result.leaks
    .slice(0, 4)
    .map((leak) => `"${leak.value}" (${leak.what}) in ${leak.where}`)
    .join('; ');
  const more = result.leaks.length > 4 ? ` and ${result.leaks.length - 4} more` : '';
  return `the run said it removed these and they are still there — ${named}${more}. Nothing was sent.`;
}
