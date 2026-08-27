import type { ClarifyQuestion, Quote } from '@agentlings/shared';
import { wantsOrganize } from './organize';
import { terms } from './recipes';

/**
 * Questions worth asking before any money moves.
 *
 * Deterministic and local by design. The concept matcher already has to work
 * with no auth and no network, and this sits in the same place in the flow —
 * an intake that stops working when the network does would be worse than one
 * that never asked. A model tier could sharpen these later; it must never
 * become what they depend on.
 *
 * Three rules keep it from becoming a form, which is the thing the one-box
 * intake was built not to be:
 *
 *  - never on work that is free, since there is nothing to save;
 *  - never more than a few, so answering stays cheaper than rewording;
 *  - never required, because Start must always work.
 */

/** Above this many questions the box has become a form. */
const MAX_QUESTIONS = 3;

/** Words that name no bound at all, so the run has to invent one. */
const UNBOUNDED =
  /\b(everything|every file|all the|the whole|the entire|properly|better|improve|optimi[sz]e|clean up|tidy|polish|fix up)\b/i;

/** Verbs that go and get something, where the shape of the answer is the job. */
const GATHERING = /\b(find|research|look up|compare|gather|search|price|prices|cost of)\b/i;

/**
 * Verbs that make something. Found by test drive: the rules only knew about
 * *fetching*, so "Produce a PDF" — the vaguest brief the box can take — was
 * asked nothing at all, while a paying session went off to guess what should
 * be in it. Making something is the case where the brief matters most.
 */
const PRODUCING = /\b(produce|write|make|create|draft|generate|prepare|build|design|publish)\b/i;

/** A named output format, so there is no point asking what shape to use. */
const FORMAT_NAMED =
  /\b(pdf|docx?|word|spreadsheet|xlsx?|csv|markdown|md|table|list|note|email|slide|deck|readme)\b/i;

/**
 * Something that says what the thing is *about*. A brief with one of these has
 * a subject, however terse — "a PDF of the ledger" needs no further asking.
 */
const SUBJECT_MATTER =
  /\b(about|of|for|from|with|covering|listing|explaining|summari[sz]ing|comparing|on)\b/i;

/** Something that looks like a file, a path, or a name worth starting from. */
const NAMED_TARGET = /[\w-]+\.[a-z]{1,5}\b|[\w-]+[/\\][\w-]+|`[^`]+`|\b[a-z]+[A-Z]\w*/;

const PRONOUN = /\b(it|this|that|these|those|them)\b/i;

/**
 * Per-channel wording for the recipient hint. Only the hint varies — the ask
 * itself never does, so the queue-time recompute matches whatever card the
 * user answered on even when a fork changed the channel between the two.
 */
/**
 * Words that only ever say *that* something is sent, never what (D-097).
 * Every inflection, for the reason D-090 gave: a verb that claims one form
 * and misses the rest lets the same sentence read two ways on two screens.
 */
const SEND_WORDS =
  /\b(send|sends|sending|sent|text|texts|texting|texted|message|messages|messaging|messaged|dm|dms|shoot|ping|write|writes|writing|drop|forward|reply)\b/gi;

/** Channel names, which are addresses rather than subjects. */
const CHANNEL_WORDS =
  /\b(telegram|whatsapp|gmail|email|e-mail|mail|slack|sms|discord|signal|imessage)\b/gi;

/**
 * The user asking, in the words the hint offers them, to have it drafted
 * after all. A fixed opening rather than a fuzzy read of intent: D-093
 * refused fuzzy verb matching on the way in, and this is the same judgement
 * on the way out — "test" and "text" are one letter apart.
 */
const WRITE_IT_OUT = /^\s*write it out\b[:,\s-]*/i;

/**
 * The recipient field's id for one channel (D-180) — scoped always, even when
 * there is only one channel, so there is a single rule rather than a rule and
 * an exception. `answers` is a flat map keyed by id, and an unscoped key would
 * be an address with no channel attached the moment a second one appears.
 */
export function sendToId(channel: string): string {
  return `send-to:${channel}`;
}

/**
 * The recipient the user gave for this channel.
 *
 * Reads the scoped key, then the bare `send-to` a card written before D-180
 * would have left on a chain's stored answers (D-177 carries them forward, so
 * a chain queued yesterday can still be mid-flight today). Only for the first
 * channel: the legacy key belongs to whichever channel the job then had, and
 * handing it to a second one would be attributing an address to a channel the
 * user never typed it for.
 */
export function recipientFor(
  answers: Record<string, string> | undefined,
  channel: string,
  first = true,
): string | undefined {
  const own = answers?.[sendToId(channel)]?.trim();
  if (own) return own;
  return first ? answers?.['send-to']?.trim() || undefined : undefined;
}

/** Channel labels for the questions that name one. */
const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  gmail: 'Gmail',
  slack: 'Slack',
  'whatsapp-business': 'WhatsApp Business',
  github: 'GitHub',
  calendar: 'Google Calendar',
  sms: 'SMS',
  discord: 'Discord',
};

const SEND_TO_HINTS: Record<string, string> = {
  gmail: 'A name and email address — no run may invent one.',
  telegram: 'A numeric chat id — each person taps Start on your bot once.',
  'whatsapp-business': 'A number with country code — no run may invent one.',
  slack: 'A channel like #general, or a member id — the bot must be in private channels.',
  github: 'The issue or PR as owner/repo#123 — no run may invent one.',
};

/** Free work has nothing to narrow: a routed answer and a tool both cost zero. */
function costsMoney(tier: Quote['tier']): boolean {
  return tier === 'oneshot' || tier === 'session';
}

/**
 * A pronoun with nothing behind it. The intake is one box and holds no
 * conversation, so "fix it" is not terse — it is unanswerable, and the run
 * will spend real turns guessing what "it" was.
 *
 * Only short sentences qualify. A long one that happens to say "so that it
 * handles empty input" has already said what it means.
 */
function dangling(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length <= 8 && PRONOUN.test(text) && !NAMED_TARGET.test(text);
}

/**
 * Says what to make, but not what to put in it — "Produce a PDF".
 *
 * Length is the guard rather than grammar: a brief long enough to carry a
 * subject usually does, and one that names a file or says what it is *about*
 * has already answered this. Being wrong here costs a question nobody needed,
 * which is why it only ever asks and never blocks.
 */
function contentless(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return (
    words.length <= 8 &&
    PRODUCING.test(text) &&
    !SUBJECT_MATTER.test(text) &&
    !NAMED_TARGET.test(text)
  );
}

/**
 * A send with no message anywhere in it — "send a Telegram to Sammy".
 *
 * The test is what is *left*, not what is there. Asking whether the sentence
 * has a subject cannot work: "on Telegram" and "with a summary" are the same
 * preposition, so the channel supplies the very evidence being looked for,
 * while "Send Sammy the current Warzone meta summary" carries real content
 * with no preposition at all. Strip the send words, the channel words and the
 * people this channel knows, then ask the recipe matcher's own stemmer what
 * survives. Nothing surviving means the message exists only in the user's
 * head, and the desk has to ask for it in their words (D-097).
 *
 * Names come from the roster because a recipient is not a subject. An unknown
 * one leaves a residue and reads as content-bearing — the old wording, which
 * is the safe way to be wrong: the desk asks for a gist where it could have
 * asked for the words, exactly as it did before this existed.
 */
export function bareSend(text: string, names: string[] = []): boolean {
  const known = new Set(names.flatMap((name) => terms(name)));
  const rest = text.replace(SEND_WORDS, ' ').replace(CHANNEL_WORDS, ' ');
  return terms(rest).every((token) => known.has(token));
}

/**
 * The send this job can be composed from without a session, or null.
 *
 * One function because the desk and the queue must agree: the plan prices it
 * free and the queue then has to actually route it free, and the two reading
 * the same sentence differently is the drift `clarificationLines` already
 * guards against.
 */
export function sendFacts(
  text: string,
  { channel, names }: { channel?: string; names?: string[] },
  answers: Record<string, string> | undefined,
): { to: string; words: string } | null {
  if (!channel || !answers) return null;
  // An event cannot be composed from To and Say alone — it needs a start
  // and an end that only a session parses from the sentence — so calendar
  // never takes the D-097 shortcut, even with both answers in hand (D-124).
  if (channel === 'calendar') return null;
  if (!bareSend(text, names)) return null;
  const to = recipientFor(answers, channel);
  const said = answers['send-say']?.trim();
  if (!to || !said) return null;
  // Asked for a draft after all: hand it back to a session, which is the one
  // thing this path must not do quietly.
  if (WRITE_IT_OUT.test(said)) return null;
  return { to, words: said };
}

/** The drafting request stripped, so a session is briefed with the direction alone. */
export function draftingAsk(said: string): string | null {
  return WRITE_IT_OUT.test(said) ? said.replace(WRITE_IT_OUT, '').trim() : null;
}

export function questionsFor(
  text: string,
  {
    hasRepo,
    tier,
    channel,
    names,
    channels,
  }: {
    hasRepo: boolean;
    tier: Quote['tier'];
    channel?: string;
    /** Every channel the job will carry, when it carries more than one (D-179). */
    channels?: string[];
    names?: string[];
  },
): ClarifyQuestion[] {
  if (!text.trim()) return [];
  // An organize job has exactly one input — the folder — and it comes from
  // the native Select Folder dialog, never a text box, because a browser
  // cannot reveal an absolute path (D-102/D-132). So it asks none of these
  // questions: the repo-target question ("which file or folder…") in
  // particular is a text box for the one thing that must be picked, which is
  // the worst possible ask. The desk shows the folder picker instead.
  if (wantsOrganize(text)) return [];
  const asked: ClarifyQuestion[] = [];

  // A send job asks its two facts first: the outbox contract refuses to
  // invent a recipient or a message (D-075), so a run without them can only
  // spend money asking for them — which a real 6¢ run did, and its whole
  // delivery was the question (D-087). Still never required: the arrest at
  // Start is the client's honesty, not a server gate.
  //
  // Calendar asks its own two (D-124, revising D-104's silence now that the
  // roster can resolve a name): who is invited — optional, because a
  // dentist appointment has no invitees, which is the 'Invitees' label the
  // arrest reads — and the title, used verbatim. Times stay the sentence's
  // job; the session parses them under the brief's contract.
  //
  // One recipient question per channel (D-180). D-179 gave a job several
  // channels and left this field standing down, because one To box cannot
  // mean two channels — a single answer would be given for one and applied
  // to both. The answer is not to ask less but to ask per channel: the id
  // carries the channel, so an address can never be attributed to a channel
  // the user did not type it for.
  //
  // The message is asked *once*, because it is one. Bodies may differ per
  // channel (D-179's brief says so) but the direction behind them does not,
  // and asking "what should it say" twice is the form this box exists not to
  // be. Calendar is the exception and not really one: its second fact is a
  // *title*, not a message, so it stays beside its own channel.
  const sending = (channels?.length ? channels : channel ? [channel] : []).filter(
    (name, i, all) => all.indexOf(name) === i,
  );
  const many = sending.length > 1;
  for (const each of sending) {
    if (each === 'calendar') {
      asked.push({
        id: sendToId('calendar'),
        channel: 'calendar',
        ask: many ? 'Who’s invited to the event?' : 'Who’s invited?',
        hint: 'Names or emails, comma-separated. Leave it empty for an event that’s just for you.',
        label: 'Invitees',
        options: [],
        freeText: true,
      });
      asked.push({
        id: `send-say:calendar`,
        channel: 'calendar',
        ask: 'What’s the event called?',
        hint: 'Used as the title, exactly as written. Your sentence carries the rest.',
        label: 'Title',
        options: [],
        freeText: true,
      });
      continue;
    }
    asked.push({
      id: sendToId(each),
      channel: each,
      // Named only when there is more than one — "Who should this go to on
      // Telegram?" beside a single Telegram card is noise, and the same
      // question has to read naturally on both cards.
      ask: many ? `Who should this go to on ${CHANNEL_LABELS[each] ?? each}?` : 'Who should this go to?',
      hint: SEND_TO_HINTS[each] ?? 'A name and where to reach them — no run may invent one.',
      options: [],
      freeText: true,
    });
  }
  // Two promises, and the wording is the whole difference. A sentence that
  // carries content is asking for a message to be *written*, so a rough
  // direction is the right ask and steering it is the job. A sentence that
  // carries none has no message anywhere but in the user's head, and asking
  // for it "roughly" both mislabels it and licenses a rewrite — which is
  // where "A DARLE" acquired an emoji nobody asked for (D-097).
  if (sending.some((each) => each !== 'calendar')) {
    asked.push(
      bareSend(text, names)
        ? {
            id: 'send-say',
            ask: 'What should the message say?',
            hint: 'Sent as written. Say “write it out” if you’d rather they draft it.',
            label: 'Words',
            options: [],
            freeText: true,
          }
        : {
            id: 'send-say',
            ask: 'What should it say, roughly?',
            hint: 'A line is enough — they write it out properly.',
            label: 'Say',
            options: [],
            freeText: true,
          },
    );
  }

  // Everything below narrows what a *paid* run will do, so free work has
  // nothing to save by asking. The send's two facts above are not that: they
  // are the job's own content, and an outbox with no recipient and no message
  // cannot be composed at all, at any price.
  //
  // Found live, not in the tests (D-097). Once both facts were in hand the
  // quote flipped to free — correctly — and this guard then withheld the very
  // questions the user had just answered, so the fields vanished under them
  // as they finished typing. The rule was written when free meant "the router
  // already knows the answer"; a tier whose freeness *depends* on the answers
  // breaks that assumption.
  if (!costsMoney(tier)) return capped(asked);

  if (dangling(text)) {
    asked.push({
      id: 'subject',
      ask: 'What should they work on?',
      hint: 'This asks for something in particular, but not what.',
      options: [],
      freeText: true,
    });
  }

  // A brief that says what to make but not what to put in it. Asked before
  // the starting point, because what the thing *is* outranks where to look.
  if (contentless(text)) {
    asked.push({
      id: 'about',
      ask: 'What should go in it?',
      hint: 'Otherwise they have to invent the contents.',
      options: [],
      freeText: true,
    });
  }

  // Measured on this project: every repo run used to open with `ls` before it
  // could do anything, spending one of its turns finding its bearings. A named
  // starting point is the same saving, made before the run rather than during.
  if (hasRepo && !NAMED_TARGET.test(text)) {
    asked.push({
      id: 'target',
      ask: 'Which file or folder should they start from?',
      hint: 'Naming one saves them a turn spent looking.',
      options: [{ label: 'let them find it', answer: 'Search the project for the right place.' }],
      freeText: true,
    });
  }

  // Only where there is no repository: a job that lands in a project already
  // knows what its output is — a change to the code.
  if (!hasRepo && (GATHERING.test(text) || PRODUCING.test(text)) && !FORMAT_NAMED.test(text)) {
    asked.push({
      id: 'shape',
      ask: 'What should come back?',
      options: [
        { label: 'a short answer', answer: 'Answer in a sentence or two.' },
        { label: 'a list', answer: 'Answer as a short list.' },
        { label: 'a table', answer: 'Answer as a table with the figures set out.' },
        { label: 'a written note', answer: 'Write it up as a note in a file.' },
      ],
    });
  }

  if (UNBOUNDED.test(text)) {
    asked.push({
      id: 'scope',
      ask: 'How far should this go?',
      hint: 'Unbounded work is what runs out of turns.',
      options: [
        { label: 'the clearest cases only', answer: 'Do the clearest cases and stop.' },
        { label: 'as far as it takes', answer: 'Be thorough, even if it takes longer.' },
      ],
    });
  }

  return capped(asked);
}

/**
 * The cap, applied to the questions it was written for (D-180).
 *
 * "Above this many the box has become a form" was aimed at questions that
 * *narrow a paid run* — there are always alternatives to asking one, and the
 * user can reword instead. A send fact has no alternative: the outbox contract
 * refuses to invent a recipient at any price, so dropping the third one off a
 * two-channel send does not save a question, it queues a job that must come
 * back and ask. Two channels is four fields at worst, and they arrive grouped
 * under their own channels, which is a card rather than a form.
 */
function capped(asked: ClarifyQuestion[]): ClarifyQuestion[] {
  const facts = asked.filter((q) => q.id.startsWith('send-'));
  const narrowing = asked.filter((q) => !q.id.startsWith('send-'));
  return [...facts, ...narrowing.slice(0, Math.max(0, MAX_QUESTIONS - facts.length))];
}

/**
 * The answers as lines for the session, in the order they were asked.
 *
 * The questions are recomputed from the same sentence rather than sent back by
 * the caller, which works only because the rules are deterministic — and is
 * what stops a caller inventing instructions the user never saw.
 */
export function clarificationLines(
  text: string,
  context: {
    hasRepo: boolean;
    tier: Quote['tier'];
    channel?: string;
    channels?: string[];
    names?: string[];
  },
  answers: Record<string, string> | undefined,
): string[] {
  if (!answers) return [];
  const lines: string[] = [];
  let firstRecipient = true;
  for (const question of questionsFor(text, context)) {
    // A recipient reads through the same door `sendFacts` uses, so a chain
    // whose answers were collected before the ids carried a channel (D-177
    // carries them forward; D-180 renamed them) still hands its address to
    // the step that asks for it. Only the first one may claim the old key.
    const scoped = question.channel && question.id.startsWith('send-to');
    const given = scoped
      ? recipientFor(answers, question.channel!, firstRecipient)
      : answers[question.id]?.trim();
    if (scoped) firstRecipient = false;
    if (!given) continue;
    const chosen = question.options.find((o) => o.label === given);
    // "write it out" is the hint's escape hatch, addressed to the desk rather
    // than to the crew (D-097). Once it has done its work — sending the job
    // to a session instead of composing it — the phrase is noise in the
    // brief, and worse than noise: it reads as part of what to write.
    const said = chosen ? chosen.answer : (draftingAsk(given) ?? given);
    lines.push(`${question.ask} ${said}`);
  }
  return lines;
}
