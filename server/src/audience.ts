import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AudiencePerson } from '@agentlings/shared';
import type { GoogleContact } from './google';
import type { SendRecord } from './sends';

/**
 * The audience roster (D-092): the people a sending channel can actually
 * reach, persisted by name so nobody types an address twice. What counts as
 * an honest source is the channel's rule, not ours, and the channels differ
 * (D-122): on Telegram the roster IS reachability — getUpdates (whoever
 * tapped Start; 24 hours of hellos, so once seen means remembered) plus
 * sends.jsonl (whoever a reviewed send already went to), and no one else —
 * while on Gmail any address is reachable and the roster is autofill, so the
 * user's own saved contacts join on the consent they already gave. What a
 * paid session is told stays narrower than this file either way: the brief's
 * legend carries relevant people only, never the book (channel.ts, D-122).
 *
 * One file per channel, global like the bot itself — a level does not have
 * its own Telegram audience any more than it has its own bot.
 */

/**
 * Whose roster a channel reads (D-124). Calendar invites gmail-reachable
 * people — its attendees are email addresses — so its picker, its prefill
 * and its session legend all draw the gmail book; a calendar.json would
 * only ever have held "primary". Every seam that reads an audience goes
 * through this, so the mapping cannot be honoured in one place and missed
 * in another (the D-119/D-120 lesson).
 */
export function rosterChannel(channel: string): string {
  return channel === 'calendar' ? 'gmail' : channel;
}

export function audienceFile(sandboxRoot: string, channel: string): string {
  return path.join(sandboxRoot, 'audience', `${channel}.json`);
}

export function readAudience(sandboxRoot: string, channel: string): AudiencePerson[] {
  const file = audienceFile(sandboxRoot, channel);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as AudiencePerson[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // a torn file forgets nobody for long — the next merge rebuilds
  }
}

export function writeAudience(
  sandboxRoot: string,
  channel: string,
  people: AudiencePerson[],
): void {
  mkdirSync(path.dirname(audienceFile(sandboxRoot, channel)), { recursive: true });
  writeFileSync(audienceFile(sandboxRoot, channel), `${JSON.stringify(people, null, 2)}\n`);
}

/** A chat as getUpdates shows it, already flattened by the caller. */
export interface SeenChat {
  id: string;
  name: string;
  username?: string;
}

/**
 * Fold freshly-seen chats into the roster. Tapping Start is the strongest
 * fact we learn — it flips `viaStart` and refreshes the name to whatever
 * the person currently calls themselves; it never loses a send count.
 */
export function mergeChats(people: AudiencePerson[], chats: SeenChat[]): AudiencePerson[] {
  const next = new Map(people.map((p) => [p.id, { ...p }]));
  for (const chat of chats) {
    const known = next.get(chat.id);
    if (known) {
      known.viaStart = true;
      known.name = chat.name || known.name;
      if (chat.username) known.username = chat.username;
    } else {
      next.set(chat.id, {
        id: chat.id,
        name: chat.name || chat.id,
        ...(chat.username ? { username: chat.username } : {}),
        viaStart: true,
        sends: 0,
      });
    }
  }
  return [...next.values()];
}

/**
 * Fold the send audit into the roster: every delivered send counts, and a
 * person known only from sends wears the name the review showed — or their
 * id, until anything better is learned. Counted from zero each time, so
 * re-merging the whole audit stays idempotent.
 */
export function mergeSends(
  people: AudiencePerson[],
  sends: SendRecord[],
  channel: string,
): AudiencePerson[] {
  const next = new Map(people.map((p) => [p.id, { ...p, sends: 0 }]));
  for (const record of sends) {
    if (record.channel !== channel || !record.ok) continue;
    const known = next.get(record.to);
    if (known) {
      known.sends += 1;
      if (known.name === known.id && record.name) known.name = record.name;
      // A reviewed name that differs from what Telegram says becomes an
      // alias (D-094) — "Pepo" is how the user knows Jose, and the prefill
      // matches on it. Set semantics keep the whole-audit re-merge
      // idempotent.
      if (
        record.name &&
        record.name !== known.name &&
        record.name !== known.id &&
        !(known.aliases ?? []).includes(record.name)
      ) {
        known.aliases = [...(known.aliases ?? []), record.name];
      }
    } else {
      next.set(record.to, {
        id: record.to,
        name: record.name ?? record.to,
        viaStart: false,
        sends: 1,
      });
    }
  }
  return [...next.values()];
}

/**
 * Fold the user's saved contacts in (D-122). The contact-book name wins when
 * it is a real name — it is the name the user chose for them — but an
 * address-as-name never overwrites a name a reviewed send taught; aliases
 * and send counts survive untouched, and re-merging the whole book is
 * idempotent. A contact deleted at Google stays here until forgotten in
 * Settings: the roster is a record of who is known, not a mirror.
 */
export function mergeContacts(
  people: AudiencePerson[],
  contacts: GoogleContact[],
): AudiencePerson[] {
  const next = new Map(people.map((p) => [p.id, { ...p }]));
  for (const contact of contacts) {
    const known = next.get(contact.id);
    if (known) {
      known.viaContacts = true;
      if (contact.name !== contact.id) known.name = contact.name;
    } else {
      next.set(contact.id, {
        id: contact.id,
        name: contact.name,
        viaContacts: true,
        viaStart: false,
        sends: 0,
      });
    }
  }
  return [...next.values()];
}

export function removePerson(
  sandboxRoot: string,
  channel: string,
  id: string,
): AudiencePerson[] {
  const kept = readAudience(sandboxRoot, channel).filter((p) => p.id !== id);
  writeAudience(sandboxRoot, channel, kept);
  return kept;
}

/**
 * Whoever has said hello to the bot lately, flattened to chats. getUpdates
 * retains ~24 hours, which is why the roster persists what this returns
 * rather than asking again. The http seam is injected so a test never
 * touches the network — the same shape the search connection uses.
 */
export async function telegramChats(
  token: string,
  http: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }> = (url) =>
    fetch(url),
): Promise<SeenChat[]> {
  const reply = await http(`https://api.telegram.org/bot${token}/getUpdates`);
  if (!reply.ok) return [];
  const body = (await reply.json()) as {
    result?: { message?: { chat?: { id?: number; first_name?: string; last_name?: string; username?: string } } }[];
  };
  const chats = new Map<string, SeenChat>();
  for (const update of body.result ?? []) {
    const chat = update.message?.chat;
    if (!chat || typeof chat.id !== 'number') continue;
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim();
    chats.set(String(chat.id), {
      id: String(chat.id),
      name: name || String(chat.id),
      ...(chat.username ? { username: chat.username } : {}),
    });
  }
  return [...chats.values()];
}
