import {
  MAX_OUTBOX_BODY_CHARS,
  MAX_OUTBOX_FILE_BYTES,
  MAX_OUTBOX_FILES,
  MAX_OUTBOX_MESSAGES,
  type AudiencePerson,
  type ChannelAsk,
  type ChannelOption,
  type ChannelShelf,
} from '@agentlings/shared';
import { CHANNELS } from './channels';
import { missingSecrets, type Connection } from './connections';
import { connectionEnabled, type StoredSettings } from './settings';

/**
 * Intake detection for sending (D-079): does this sentence want to message
 * someone on a channel, and what can the app honestly offer?
 *
 * Deterministic and free, like everything else at the desk (D-011): a send
 * verb plus a channel word claims, anything less does not — a prompt that
 * merely *mentions* WhatsApp is not a request to message anyone, and the
 * router's rule applies here too: a missed card costs a failed run's lesson,
 * a wrong card costs trust. Under-firing is the safe direction.
 *
 * Everything the card says is derived from the catalog and Settings at ask
 * time, so the same sentence gets a different card once Telegram is
 * connected — the states are the drawer's own (D-078), not a second opinion.
 */

// "email" and "dm" are verbs as often as nouns — "email the summary to the
// team" carries its channel in its verb, and demanding a second send word
// there would miss the plainest phrasing a send request has. Each verb
// matches its inflections too: a real 65¢ run slipped past on "to be sent
// to my friend on Telegram", did the research, and could only report that
// the send was blocked on capability (D-090).
const SEND_VERBS =
  /\b(send(?:s|ing)?|sent|remind(?:s|ed|ing)?|messag(?:e[sd]?|ing)|notif(?:y|ies|ied|ying)|text(?:s|ed|ing)?|ping(?:s|ed|ing)?|dm(?:s|ed|ing)?|e-?mail(?:s|ed|ing)?)\b/;

/**
 * Word → channel, matched at the word's position in the prompt; the earliest
 * mention wins, so "on WhatsApp or Telegram" asks for WhatsApp. "signal"
 * needs a preposition because "send a signal to the process" is code talk,
 * not a messaging request.
 */
const CHANNEL_WORDS: [RegExp, string][] = [
  [/\btelegram\b/, 'telegram'],
  // Before plain whatsapp: same match position, and on a tie the earlier
  // entry wins — "on whatsapp business" is a different, wired ask.
  [/\bwhats\s?app business\b/, 'whatsapp-business'],
  [/\bwhats\s?app\b/, 'whatsapp'],
  // Bare "mail" claims only as the channel word, never as a verb — in both
  // lists one word would satisfy both gates, and a mere mention ("summarise
  // the mail export") would fire the card.
  [/\b(g|e-?)?mail\b/, 'gmail'],
  [/\bslack\b/, 'slack'],
  [/\bsms\b/, 'sms'],
  [/\bdiscord\b/, 'discord'],
  [/\b(on|via|through|in)\s+signal\b/, 'signal'],
  [/\bimessage\b/, 'imessage'],
  [/\blinkedin\b/, 'linkedin'],
  [/\bwechat\b/, 'wechat'],
  [/\b(messenger|instagram)\b/, 'messenger'],
  [/\bcalendar\b/, 'calendar'],
  [/\bgithub\b/, 'github'],
];

/**
 * Verbs that claim only beside their own channel's word (D-104). "Create",
 * "add" and "book" are everyday coding words — as global send verbs they
 * would read "create a test for the telegram module" as a send — but next
 * to "calendar" they are exactly how a person asks for an event. GitHub's
 * are phrases, and singular on purpose: "comment on" claims while "read the
 * comments on github issue 5" does not, because \b refuses the plural.
 */
const SCOPED_CLAIMS: Record<string, RegExp> = {
  calendar:
    /\b(add(?:s|ed|ing)?|put(?:s|ting)?|creat(?:e[sd]?|ing)|book(?:s|ed|ing)?|schedul(?:e[sd]?|ing)|invit(?:e[sd]?|ing))\b/,
  github: /\b(comment on|repl(?:y|ies|ied|ying)\s+(?:to|on)|post(?:s|ed|ing)?\s+a\s+comment)\b/,
};

const LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  'whatsapp-business': 'WhatsApp Business',
  gmail: 'Gmail',
  slack: 'Slack',
  calendar: 'Google Calendar',
  github: 'GitHub',
  sms: 'SMS',
  discord: 'Discord',
  signal: 'Signal',
  imessage: 'iMessage',
  linkedin: 'LinkedIn',
  wechat: 'WeChat',
  messenger: 'Messenger / Instagram',
};

/** Per-channel one-liners for the states the drawer can change (D-078). */
const WIRED_COPY: Record<string, { ready: string; connectable: string }> = {
  telegram: {
    ready: 'Free — every message waits for your review before anything sends',
    connectable: 'Free — each person taps Start on your bot once. Connect it in Settings.',
  },
  gmail: {
    ready: 'Arrives as you, from your own address — every message waits for your review',
    connectable: 'Arrives as you, from your own address. Connect Google in Settings.',
  },
  'whatsapp-business': {
    ready: 'Real WhatsApp, from your business number — every message waits for your review',
    connectable:
      'Real WhatsApp — pre-approved templates, per-message pricing, arrives from a business number. The Meta walkthrough is in Settings.',
  },
  slack: {
    ready: 'Posts as your own bot — every message waits for your review',
    connectable: 'Posts as your own bot in your workspace. Create the app and paste its token in Settings.',
  },
  calendar: {
    ready: 'Creates the event on your own Google Calendar when you approve it',
    connectable:
      'Creates events on your own calendar. Connect Google in Settings — the one consent covers Gmail and Calendar.',
  },
  github: {
    ready: 'Posts the comment from your own account when you approve it',
    connectable:
      'Posts comments as you, at approval only. Needs your GitHub token in Settings, with issue write access.',
  },
};

/** Decided in D-077 and wired in later slices; the card says so plainly. */
const PLANNED: Record<string, string> = {
  sms: 'Reaches phones with no apps, ≈1¢ a message — planned',
  discord: 'Posts as a bot in your server — planned',
};

/** Refused with the reason on the row (D-077), so nobody waits for these. */
const NEVER: Record<string, string> = {
  whatsapp: 'Personal WhatsApp has no API, and unofficial routes get numbers banned',
  signal: 'Signal has no official API',
  imessage: 'iMessage has no API outside a Mac',
  linkedin: "LinkedIn's API is closed to personal automation",
  wechat: 'WeChat official accounts need Chinese business verification',
  messenger: "Meta's DM APIs are for business accounts behind Meta app review",
};

/**
 * A channel word in the sentence with no send verb beside it (D-093): the
 * near-miss the ask deliberately stays quiet on, surfaced as a question
 * instead of a claim — "Sen me a Telegram" was a real 80¢ run whose typo'd
 * verb turned a send into research. Same table as the ask, earliest
 * mention wins, so the two can never disagree about what was mentioned.
 */
export function mentionsChannel(
  text: string,
): { channel: string; label: string; wired: boolean } | null {
  const p = text.toLowerCase();
  let found: string | null = null;
  let at = Infinity;
  for (const [re, channel] of CHANNEL_WORDS) {
    const hit = re.exec(p);
    if (hit && hit.index < at) {
      found = channel;
      at = hit.index;
    }
  }
  if (!found) return null;
  return { channel: found, label: LABELS[found] ?? found, wired: !!CHANNELS[found] };
}

/**
 * The honest shelf Settings shows under the wired connections (D-088): the
 * planned tier, and the refused one with its reason on the row — D-077's
 * tiers, served from the same maps the ask-card reads so the two can never
 * disagree.
 */
export function channelShelf(): ChannelShelf {
  const row = (source: Record<string, string>) => (channel: string) => ({
    channel,
    label: LABELS[channel] ?? channel,
    detail: source[channel],
  });
  return {
    planned: Object.keys(PLANNED).map(row(PLANNED)),
    never: Object.keys(NEVER).map(row(NEVER)),
  };
}

function wiredState(
  channel: string,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): ChannelOption | null {
  const client = CHANNELS[channel];
  if (!client) return null;
  const connection = connections.find((c) => c.name === client.connection);
  if (!connection) return null;
  const usable =
    missingSecrets(connection, env).length === 0 && connectionEnabled(connection, settings, env);
  const copy = WIRED_COPY[channel] ?? {
    ready: 'Every message waits for your review before anything sends',
    connectable: 'Connect it in Settings.',
  };
  return {
    channel,
    label: LABELS[channel] ?? channel,
    state: usable ? 'ready' : 'connectable',
    detail: usable ? copy.ready : copy.connectable,
  };
}

function optionFor(
  channel: string,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): ChannelOption {
  const wired = wiredState(channel, connections, settings, env);
  if (wired) return wired;
  if (PLANNED[channel]) {
    return { channel, label: LABELS[channel] ?? channel, state: 'planned', detail: PLANNED[channel] };
  }
  return {
    channel,
    label: LABELS[channel] ?? channel,
    state: 'never',
    detail: NEVER[channel] ?? 'not available',
  };
}

/** The alternatives a blocked ask offers, per D-077's fork: what works now first. */
function forkOptions(
  asked: string,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): ChannelOption[] {
  const alternatives =
    asked === 'whatsapp' ? ['telegram', 'whatsapp-business', 'gmail'] : ['telegram'];
  return alternatives
    .filter((channel) => channel !== asked)
    .map((channel) => optionFor(channel, connections, settings, env));
}

export function detectChannelAsk(
  prompt: string,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): ChannelAsk | null {
  const p = prompt.toLowerCase();
  let asked: string | null = null;
  let at = Infinity;
  for (const [re, channel] of CHANNEL_WORDS) {
    const hit = re.exec(p);
    if (hit && hit.index < at) {
      asked = channel;
      at = hit.index;
    }
  }
  if (!asked) return null;
  // The global send verbs claim for every channel; a channel's own scoped
  // verbs claim only beside its word (D-104). Anything less is a mention,
  // and mentions are D-093's question, never a claim.
  if (!SEND_VERBS.test(p) && !SCOPED_CLAIMS[asked]?.test(p)) return null;

  const askedLabel = LABELS[asked] ?? asked;
  const own = optionFor(asked, connections, settings, env);

  if (own.state === 'ready') {
    return {
      asked,
      askedLabel,
      state: 'ready',
      channel: asked,
      note: `Sends via ${askedLabel} — every message waits for your review before anything goes out.`,
      options: [],
    };
  }
  if (own.state === 'connectable') {
    return {
      asked,
      askedLabel,
      state: 'connectable',
      channel: asked,
      note: `${askedLabel} isn't connected yet. Connect it now, or Start queues the job anyway — you connect before approving the messages.`,
      options: [own],
    };
  }
  if (own.state === 'planned') {
    return {
      asked,
      askedLabel,
      state: 'planned',
      note: `${askedLabel} isn't wired yet — it's on the roadmap. Pick a channel that works today, or Start queues this as a draft job that sends nothing.`,
      options: [...forkOptions(asked, connections, settings, env), own],
    };
  }
  return {
    asked,
    askedLabel,
    state: 'never',
    note: `${NEVER[asked] ?? `${askedLabel} is not available`}. Pick a channel that can, or Start queues this as a draft job that sends nothing.`,
    options: forkOptions(asked, connections, settings, env),
  };
}

/**
 * A prompt that asks for what was sent before (D-094). Deterministic like
 * every desk word list; a stray "previous" in an unrelated send costs only
 * a brief that carries one extra body the run ignores.
 */
export const RESEND_WORDS = /\b(same|again|resend|re-send|like (?:the )?last|previous)\b/i;

/**
 * The send brief this particular job should hear, or nothing.
 *
 * Every decision about *which* of the optional blocks ride lives here rather
 * than at the call site, because that wiring is where the faults have been:
 * removing the line that hands a job's own words to the brief broke no test
 * at all, while `channelBrief` itself was covered from three directions. Same
 * shape as the two job builders that dropped a field in silence (D-097) — a
 * correct function reached by nobody.
 */
/** Legend rows past this bound wait to be named or used; the book never rides whole. */
export const LEGEND_CAP = 20;

/**
 * Who the brief's legend may name (D-122): people the sentence mentions,
 * then people already sent to, and never the whole roster. A contact book
 * runs to hundreds, and handing every row to every send session prices the
 * user's whole address book into each prompt — context costs on every turn
 * (D-053) — for recipients the job will never touch. Mention matching
 * mirrors the To prefill's rule (askFacts.matchRecipient: whole words,
 * tokens of three letters or more, aliases and usernames included) minus
 * the uniqueness demand — a legend may hold both Anas and let the session
 * say which is missing.
 */
export function legendAudience(prompt: string, people: AudiencePerson[]): AudiencePerson[] {
  const text = prompt.toLowerCase();
  const mentioned = (person: AudiencePerson) =>
    [person.name, person.username ?? '', ...(person.aliases ?? [])]
      .flatMap((source) => source.toLowerCase().split(/[^\p{L}\p{N}]+/u))
      .some(
        (token) =>
          token.length >= 3 &&
          new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(text),
      );
  const named = people.filter(mentioned);
  const used = people
    .filter((person) => person.sends > 0 && !named.includes(person))
    .sort((a, b) => b.sends - a.sends);
  // Everyone the prompt names stays, past the cap included — the sentence
  // asked for them; the cap only bounds the people added on history alone.
  return [...named, ...used].slice(0, Math.max(named.length, LEGEND_CAP));
}

export function briefForJob(
  job: { channel?: string; prompt: string; send?: { words: string } },
  audience: (channel: string) => AudiencePerson[],
  lastSend: (channel: string) => string | undefined,
): string | undefined {
  if (!job.channel) return undefined;
  return (
    channelBrief(
      job.channel,
      legendAudience(job.prompt, audience(job.channel)),
      // "The same again" reuses the audited body instead of rebuilding and
      // drifting (D-094).
      RESEND_WORDS.test(job.prompt) ? lastSend(job.channel) : undefined,
      // Words the desk already holds, reaching a session anyway — the outbox
      // contract refused them and the job fell through (D-097).
      job.send?.words,
    ) ?? undefined
  );
}

/**
 * The outbox contract, told to the session (closing D-075's deferral by
 * D-031's rule: a capability nobody is told about is not one). Only for
 * channels that exist — a job whose ask fell to "draft" carries no channel
 * and hears nothing.
 */
export function channelBrief(
  channel: string,
  audience: AudiencePerson[] = [],
  /** The last body sent on this channel, when the prompt asked for the same. */
  lastSentBody?: string,
  /**
   * The message the user wrote themselves, when the desk asked for the words
   * rather than a gist (D-097).
   *
   * Reaches a session by exactly one route today: the outbox contract refused
   * what the desk held — in practice a body over the channel's limit — and
   * the job fell through to a run that can explain itself. Everything else
   * carrying the user's own words is composed in code and never gets here.
   *
   * Narrow on purpose, and stated plainly because the obvious wider readings
   * are wrong. A *continuation* holds no send facts (the reply route takes
   * only text, and carrying the old ones forward would let a brief insist on
   * words the reply may have just superseded — guessing which, this project
   * does not do). A *content-bearing* send has no own-words to protect: there
   * the user gave a direction and writing the message is the job.
   *
   * Without it a fall-through has nothing telling it whose words these are,
   * which is how "A DARLE" acquired an emoji — every instruction that run had
   * invited a rewrite (D-097).
   */
  ownWords?: string,
): string | null {
  if (!CHANNELS[channel]) return null;
  const shape =
    channel === 'telegram'
      ? `{"channel":"telegram","messages":[{"to":"<chat id>","name":"<who this is, shown at review>","body":"...","files":["<a file you wrote, only when one should ride>"]}]}`
      : channel === 'gmail'
      ? `{"channel":"gmail","messages":[{"to":"<email address>","name":"<who this is, shown at review>","subject":"<short subject>","body":"...","files":["<a file you wrote, only when one should ride>"]}]}`
      : channel === 'whatsapp-business'
        ? `{"channel":"whatsapp-business","template":{"name":"<approved template name>","language":"es"},"messages":[{"to":"<number with country code>","name":"<who this is, shown at review>","params":["<template parameter>","..."],"body":"<the message as it will read, for review>"}]}`
        : channel === 'slack'
          ? `{"channel":"slack","messages":[{"to":"#general or a member id","name":"<who this is, shown at review>","body":"..."}]}`
          : channel === 'calendar'
            ? `{"channel":"calendar","messages":[{"to":"primary","subject":"<the event title>","body":"<a short description, shown at review>","event":{"start":"2026-08-13T18:00:00","end":"2026-08-13T19:00:00","attendees":["ana@example.com"]}}]}`
            : channel === 'github'
              ? `{"channel":"github","messages":[{"to":"owner/repo#123","body":"<the comment, exactly as it will post — markdown is fine>"}]}`
              : `{"channel":"${channel}","messages":[{"to":"<chat id>","name":"<who this is, shown at review>","body":"..."}]}`;
  return [
    '## Sending messages',
    `This job sends messages via ${LABELS[channel] ?? channel}. No tool sends anything — composing is your job; sending is not.`,
    'Write OUTBOX.json in the working directory, exactly this shape:',
    shape,
    `- Up to ${MAX_OUTBOX_MESSAGES} messages, one per recipient, each body under ${MAX_OUTBOX_BODY_CHARS} characters.`,
    ...(channel === 'telegram'
      ? [
          '- "to" is the numeric Telegram chat id. If the user named people but gave no chat ids, do not invent any — leave those messages out and say in RESULT.md which ids are missing.',
        ]
      : []),
    ...(channel === 'gmail'
      ? [
          '- "to" is the recipient\'s email address, and every message wants a short "subject". If the user named people but gave no addresses, do not invent any — leave those messages out and say in RESULT.md which addresses are missing.',
          '- The mail arrives from the user\'s own address, so write it in their voice.',
        ]
      : []),
    ...(channel === 'telegram' || channel === 'gmail'
      ? [
          `- "files" sends real attachments: names of files you wrote in the working directory ("report.pdf") or a file the user attached ("input/contract.pdf") — forward slashes, up to ${MAX_OUTBOX_FILES} per message, ${MAX_OUTBOX_FILE_BYTES / (1024 * 1024)} MB each. Only files that actually exist, and only when the user asked for a file to ride — otherwise leave "files" out.`,
        ]
      : []),
    ...(channel === 'whatsapp-business'
      ? [
          '- Business-initiated WhatsApp only sends pre-approved templates. Use exactly the template name the user gave; if they named none, do not invent one — write RESULT.md saying an approved template name is needed.',
          '- "params" are the template\'s body parameters, in order; "body" is the message as it will read, so the review shows real words. "to" is the number with country code. Do not invent numbers — report the missing ones in RESULT.md.',
        ]
      : []),
    ...(channel === 'slack'
      ? [
          '- "to" is a channel like #general or a Slack member id. The bot must already be in a private channel to post there. Do not invent channels — report missing ones in RESULT.md.',
        ]
      : []),
    ...(channel === 'calendar'
      ? [
          '- One event per outbox, exactly. "to" is the calendar — write "primary" unless the user named another. "subject" is the event title; "body" is a short description the review shows.',
          '- "event.start" and "event.end" are date-times like 2026-08-13T18:00:00, written in the user\'s own local time exactly as they said it — never converted, and the end after the start.',
          '- "attendees" are email addresses and invitations go out to them at approval. Only addresses the user gave or the known-recipients list carries — never invent one; leave attendees out and say so in RESULT.md instead.',
          '- If the clarifications answer "Who’s invited?", the attendees are exactly those addresses — nobody added, nobody dropped. If they answer the title, "subject" is that text verbatim, not a rewrite of it.',
        ]
      : []),
    ...(channel === 'github'
      ? [
          '- "to" is the issue or pull request as owner/repo#number — from the user\'s words or the thread you read. Never invent a number; report a missing one in RESULT.md.',
          '- The comment posts from the user\'s own account, so write it in their voice, exactly as it should appear.',
        ]
      : []),
    // The user's own words (D-097). Before the desk learned to ask for them,
    // it asked what the message should say *roughly* and promised the crew
    // would "write it out properly" — so "A DARLE" went out as "A DARLE 💪",
    // with every layer agreeing that a rewrite was wanted. Where the words
    // are already the user's, say so plainly and once.
    //
    // The limit is named in the same breath because the commonest way a
    // session sees this at all is a body the contract refused for length: an
    // instruction to send it exactly as written and nothing else would be an
    // instruction it cannot follow.
    ...(ownWords
      ? [
          '- The user wrote this message themselves. Use it as the body exactly as written — do not reword it, expand it, shorten it, or add anything to it, an emoji included. It is not a brief for a message; it is the message:',
          '```',
          ownWords,
          '```',
          `- If it will not fit the ${MAX_OUTBOX_BODY_CHARS}-character limit, keep their wording and split it across messages to the same person only if the channel allows; otherwise say in RESULT.md what had to give, and why. Never quietly improve it.`,
        ]
      : []),
    // The reuse block (D-094): "send the same again" means this text, not a
    // rebuild that drifts. Integrity is the point — reuse verbatim, adjust
    // only what the user asked (recipient, greeting), and say it is reused.
    ...(lastSentBody
      ? [
          '- The user asked to send the same thing again. This is the last message sent on this channel, verbatim — reuse this text, adjusting only what the user asked for (recipient, greeting), and say in RESULT.md that it was reused:',
          '```',
          lastSentBody,
          '```',
        ]
      : []),
    // The legend (D-092): "send it to Pepo" resolves by lookup instead of
    // failing honestly, while the never-invent rule keeps its teeth — an id
    // the user gives directly always wins, and a name that is neither on
    // the roster nor given an id stays missing, exactly as before.
    ...(audience.length > 0
      ? [
          '- Known recipients, for when the user names someone without an address:',
          ...audience.map((p) => `  - ${p.name} — ${p.id}`),
          '- An address the user gives directly always wins. A name not on this list and without an address is missing — report it in RESULT.md, never invent one.',
        ]
      : []),
    '- The user reviews every message and approves before anything is sent.',
  ].join('\n');
}
