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
};

export function recipientProblem(channel: string, to: string): string | null {
  const shape = SHAPES[channel];
  if (!shape || shape.test.test(to)) return null;
  const shown = to.length > 24 ? `${to.slice(0, 24)}…` : to;
  return `“${shown}” isn’t ${shape.wants}`;
}
