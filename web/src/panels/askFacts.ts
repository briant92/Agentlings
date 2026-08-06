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
};

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
