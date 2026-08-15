import type { ChannelOption } from '@agentlings/shared';

/**
 * What the desk can say about a recipient before money moves (D-091): the
 * channel names its own shape — a chat id has digits, an address has an @ —
 * and a To that cannot possibly reach anyone earns the Start arrest, with
 * the value quoted so the button says exactly what is wrong. Null means
 * nothing to object to; a channel with no declared shape objects to nothing.
 *
 * Learned from a real 71¢ run: the desk asked "who should this go to?",
 * accepted "Pepo Dussaillant" for a channel whose contract wants a numeric
 * chat id, and the run could only refuse honestly after the money was spent.
 */
const SHAPES: Record<string, { test: RegExp; wants: string }> = {
  telegram: { test: /\d/, wants: 'a chat id' },
  'whatsapp-business': { test: /\d/, wants: 'a number' },
  gmail: { test: /@/, wants: 'an email address' },
  // One token, optional #/@ prefix — "Brian Thornton" and an email both fail,
  // which is exactly what Slack's own API would refuse less legibly (D-104).
  slack: { test: /^[#@]?[\w-]+$/, wants: 'a channel like #general or a member id' },
  github: { test: /^[\w.-]+\/[\w.-]+#\d+$/, wants: 'an issue as owner/repo#123' },
  // Invitees, comma-separated (D-124): every part must carry an address —
  // "Ana García" alone is the 71¢ wall again; "Ana — ana@x.com" passes the
  // way every picker pick does. Empty never reaches this: an event with no
  // invitees is ordinary, and the arrest only inspects a filled field.
  calendar: {
    test: /^[^,]*@[^,]*(,[^,]*@[^,]*)*$/,
    wants: 'email addresses, comma-separated',
  },
};

/**
 * What the desk has to say when a sentence asked for more channels than a job
 * can carry (D-178): which one it is taking, which it is dropping, and which
 * of the dropped ones the user could switch to instead.
 *
 * Here rather than inside the JSX for this panel's usual reason — the web
 * suite renders nothing, so logic left in a component is logic nothing checks.
 * The picked channel wins over the ask's own, because a fork-pick can make the
 * *asked* channel the dropped one.
 */
export function alsoAskedLine(
  ask: { asked: string; askedLabel: string; state: string; channel?: string; also?: ChannelOption[] },
  picked: string | null,
): { carried: { channel: string; label: string } | null; dropped: ChannelOption[] } | null {
  if (!ask.also?.length) return null;
  const named: ChannelOption[] = [
    { channel: ask.asked, label: ask.askedLabel, state: ask.state as ChannelOption['state'], detail: '' },
    ...ask.also,
  ];
  const carrying = picked ?? ask.channel ?? null;
  const carried = named.find((n) => n.channel === carrying) ?? null;
  return {
    carried: carried ? { channel: carried.channel, label: carried.label } : null,
    dropped: named.filter((n) => n.channel !== carrying),
  };
}

export function recipientProblem(channel: string, to: string): string | null {
  const shape = SHAPES[channel];
  if (!shape || shape.test.test(to)) return null;
  const shown = to.length > 24 ? `${to.slice(0, 24)}…` : to;
  return `“${shown}” isn’t ${shape.wants}`;
}

/**
 * A bare send whose words are still in the user's head — D-087's second
 * fact, arrested like the first. The server marks the bare case by
 * labelling the say question "Words", its promise to send verbatim; a
 * content-bearing sentence gets "Say", and an empty Say is fine because
 * writing the message is the job. With the "Words" label there and the
 * field empty, the queue is doomed the way "no recipient" is: the outbox
 * contract forbids inventing the message, so the run can only spend money
 * asking for what the desk was already holding — a real 26.8¢ session
 * did exactly that, and its whole delivery was "what to say."
 */
export function missingWords(
  questions: { id: string; label?: string }[],
  say: string | undefined,
): boolean {
  return questions.some((q) => q.id === 'send-say' && q.label === 'Words') && !say?.trim();
}

/**
 * An empty To that dooms the queue — every channel's contract but one
 * refuses to invent a recipient. The exception is the 'Invitees' label
 * (D-124): an event for just you is the ordinary case, so an empty
 * invitees field queues exactly as a dentist appointment should.
 */
export function missingRecipient(
  questions: { id: string; label?: string }[],
  to: string | undefined,
): boolean {
  return (
    questions.some((q) => q.id === 'send-to' && q.label !== 'Invitees') && !to?.trim()
  );
}

/**
 * A sentence that leans on an attachment the queue is not carrying (D-134).
 * The proof run queued "Total the attached expenses…" with nothing attached,
 * and the analyst's only possible delivery was the question back — 4 turns,
 * 5.3c, absorbed (D-131's amendment). Only the claiming forms fire —
 * "attached", "attachment(s)" — never the bare verb: "attach a summary to
 * it" instructs the run about its own output, it does not claim a file
 * rides along. The second press still queues, because the sentence itself
 * may carry the content ("summarise the attached: <pasted text>").
 *
 * "As an attachment" is the outbound shape (D-159): it asks for the run's
 * own file to ride the send, which the outbox now genuinely does — the
 * sentence claims nothing about the queue, so it must not be arrested.
 */
export function missingAttachment(text: string, attachedCount: number): boolean {
  const inboundClaims = text.replace(/\bas (?:an? )?attach(?:ed|ments?)\b/gi, '');
  return attachedCount === 0 && /\battach(?:ed|ments?)\b/i.test(inboundClaims);
}

/**
 * A sentence asking for a new world, typed where worlds are not made (D-144).
 *
 * Authoring arrives by the New Level door, deliberately (D-110): the door
 * prices it as design work and installs only at Approve, while the desk's
 * matcher reads "build me a level" as ordinary building and hands it to a
 * worker. The proof sentence was real — "Build me a level inspired in The
 * Odyssey, with a 3D backdrop of the sea monster" — assigned to a worker at
 * the desk, the first of the phrasings D-110 said it was waiting for.
 *
 * Only the creating forms fire: a making verb, an article, then level/world
 * within a couple of words. "Make the level select screen faster" — the
 * level as this codebase's noun — queues untouched, and one extra press
 * still queues anything: the desk warns, the user decides (D-134's contract).
 */
export function authoringSentence(text: string): boolean {
  return /\b(?:build|make|create|author|design)\s+(?:me\s+|us\s+)?(?:a|an|another|new)\s+(?:\w+\s+){0,2}(?:level|world)\b/i.test(
    text,
  );
}

/** A person as the matcher needs them — the roster row's naming half. */
interface Nameable {
  id: string;
  name: string;
  username?: string;
  aliases?: string[];
}

/**
 * The one person the sentence plainly names, or nobody (D-094). Tokens of
 * three letters and up from names, usernames and reviewed aliases, matched
 * as whole words — "to Pepo" finds Jose through the alias a reviewed send
 * taught the roster. Exactly one candidate prefills; ambiguity and absence
 * prefill nothing, because a guessed recipient is worse than an empty
 * field the arrest will catch.
 */
export function matchRecipient<T extends Nameable>(prompt: string, people: T[]): T | null {
  const text = prompt.toLowerCase();
  const hits = people.filter((person) =>
    [person.name, person.username ?? '', ...(person.aliases ?? [])]
      .flatMap((source) => source.toLowerCase().split(/[^\p{L}\p{N}]+/u))
      .some(
        (token) =>
          token.length >= 3 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(text),
      ),
  );
  return hits.length === 1 ? hits[0] : null;
}
