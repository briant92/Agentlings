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
import { wantsWithholding } from './redact';

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
  // "Post the release notes to the team on Slack". `post` cannot be a global
  // send verb — "write a blog post about slack" would fire one — so it claims
  // only when the channel word is standing where a destination stands.
  slack: /\bpost(?:s|ed|ing)?\b[^.]*\b(?:on|to|in)\s+(?:the\s+)?(?:#[\w-]+|slack)\b/,
};

/**
 * Where a verb stands: the start, after a full stop or a comma, or after a
 * sequence marker. Bare "and" is deliberately not a lead — "compare the
 * telegram and slack clients" would claim a send on a question about code,
 * and this file's rule is that a missed card costs a lesson while a wrong
 * card costs trust. ", and telegram Brian" still leads, because the comma is
 * the evidence that a second instruction has started.
 */
const VERB_LEAD = String.raw`(?:^|[,;.]\s*(?:and\s+)?|\bthen\s+)`;

/**
 * A channel word standing where the verb goes (measured 2026-08-14): "Telegram
 * Pepo the total", "Slack the release notes to the team".
 *
 * `SEND_VERBS` knew email, text, dm and ping but not the channel names people
 * use as verbs, so eight of fifty-one benchmark sentences fell to D-093's
 * confirmation card — including the one `steps.ts` uses as its own worked
 * example, "…then telegram Brian the total". D-090's lesson at a new seam: a
 * verb list that claims one form and misses the rest lets the same sentence
 * read two ways on two screens.
 *
 * Only channels whose names are actually spoken as verbs. Nobody says "Gmail
 * Ana the report" — "email" is already a send verb — and a calendar is not
 * something you do to a person.
 */
const CHANNEL_AS_VERB: Record<string, RegExp> = Object.fromEntries(
  ['telegram', 'slack', 'sms', 'discord'].map((word) => [
    word,
    new RegExp(
      // A following word is required: "send it on telegram." is a mention with
      // the channel at the end of the clause, not a verb with an object.
      `${VERB_LEAD}${word}\\s+\\w` +
        // Or the name with a person as its object, which needs no lead at all:
        // "…and telegram me the headline". A pronoun cannot be the noun half
        // of a phrase like "the telegram clients", so this is the one form
        // safe to claim after a bare "and" — and it is how a second channel
        // is usually written when the first one already took the sentence.
        `|\\b${word}\\s+(?:me|us|him|her|them|everyone)\\b`,
      'i',
    ),
  ]),
);

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
 * The channels this job is not carrying, out of everything the sentence asked
 * for (D-178) — what the review says approving will not send.
 *
 * Here rather than inline in the route, for `queuedJobSpec`'s reason: the
 * layers between a route and a job are where the faults have been, and this
 * one has a case that is easy to get wrong and impossible to see — picking
 * Gmail on the fork card makes the *asked* channel the dropped one, so a list
 * built from `also` alone names neither.
 */
export function droppedChannels(
  ask: ChannelAsk | null,
  /**
   * Every channel the job carries, not just the first (D-179). A job that now
   * sends on both must name neither as dropped, and one that carries a wired
   * channel beside a `planned` one must still name the planned one.
   */
  carried: string[] | undefined,
): { channel: string; label: string }[] {
  if (!ask?.also?.length) return [];
  const carrying = new Set(carried ?? []);
  return [
    { channel: ask.asked, label: ask.askedLabel },
    ...ask.also.map((option) => ({ channel: option.channel, label: option.label })),
  ].filter((named) => !carrying.has(named.channel));
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

/** Every channel word in the sentence, earliest first, with where it ends. */
function channelHits(p: string): { channel: string; at: number; end: number }[] {
  const hits: { channel: string; at: number; end: number }[] = [];
  for (const [re, channel] of CHANNEL_WORDS) {
    const hit = re.exec(p);
    if (hit) hits.push({ channel, at: hit.index, end: hit.index + hit[0].length });
  }
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * The channels the sentence asks to send on *besides* the one this job will
 * carry (D-178) — "…and email the same figures to Ana".
 *
 * The evidence has to be local, which is the whole difficulty. `SEND_VERBS` is
 * tested against the whole prompt, and rightly so for the asked channel: "to
 * be sent to my friend on Telegram" puts its verb far from its word (D-090).
 * Reused as-is for a *second* channel it would claim on any send verb anywhere
 * — "email Ana the summary of the telegram export" would report a Telegram
 * send nobody asked for, and a wrong card costs trust.
 *
 * So a later channel claims on evidence of its own: its name standing where a
 * verb goes, its own scoped verbs, or a send verb in the stretch of sentence
 * between the channel before it and itself. Nothing here loosens the asked
 * channel's gate, which is untouched above.
 */
function alsoAsked(p: string, asked: string): string[] {
  const hits = channelHits(p);
  const from = hits.findIndex((hit) => hit.channel === asked);
  if (from < 0) return [];
  const found: string[] = [];
  let previousEnd = hits[from].end;
  for (const hit of hits.slice(from + 1)) {
    const stretch = p.slice(previousEnd, hit.end);
    if (
      CHANNEL_AS_VERB[hit.channel]?.test(p) ||
      SCOPED_CLAIMS[hit.channel]?.test(p) ||
      SEND_VERBS.test(stretch)
    ) {
      found.push(hit.channel);
    }
    previousEnd = hit.end;
  }
  return found;
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
  // verbs claim only beside its word (D-104), and its own name claims when it
  // is standing where the verb goes. Anything less is a mention, and mentions
  // are D-093's question, never a claim.
  if (
    !SEND_VERBS.test(p) &&
    !SCOPED_CLAIMS[asked]?.test(p) &&
    !CHANNEL_AS_VERB[asked]?.test(p)
  ) {
    return null;
  }

  const askedLabel = LABELS[asked] ?? asked;
  const own = optionFor(asked, connections, settings, env);
  // Every card carries them, whatever the asked channel's own state: a job
  // that cannot send at all still asked for two, and the second must not
  // disappear because the first happened to be unwired.
  const also = alsoAsked(p, asked).map((channel) =>
    optionFor(channel, connections, settings, env),
  );
  const withAlso = <T extends ChannelAsk>(ask: T): T =>
    also.length > 0 ? { ...ask, also } : ask;

  if (own.state === 'ready') {
    return withAlso({
      asked,
      askedLabel,
      state: 'ready',
      channel: asked,
      note: `Sends via ${askedLabel} — every message waits for your review before anything goes out.`,
      options: [],
    });
  }
  if (own.state === 'connectable') {
    return withAlso({
      asked,
      askedLabel,
      state: 'connectable',
      channel: asked,
      note: `${askedLabel} isn't connected yet. Connect it now, or Start queues the job anyway — you connect before approving the messages.`,
      options: [own],
    });
  }
  if (own.state === 'planned') {
    return withAlso({
      asked,
      askedLabel,
      state: 'planned',
      note: `${askedLabel} isn't wired yet — it's on the roadmap. Pick a channel that works today, or Start queues this as a draft job that sends nothing.`,
      options: [...forkOptions(asked, connections, settings, env), own],
    });
  }
  return withAlso({
    asked,
    askedLabel,
    state: 'never',
    note: `${NEVER[asked] ?? `${askedLabel} is not available`}. Pick a channel that can, or Start queues this as a draft job that sends nothing.`,
    options: forkOptions(asked, connections, settings, env),
  });
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
  job: { channels?: string[]; prompt: string; send?: { words: string } },
  audience: (channel: string) => AudiencePerson[],
  lastSend: (channel: string) => string | undefined,
): string | undefined {
  if (!job.channels?.length) return undefined;
  // One brief per channel, each with its own legend and its own contract
  // (D-179), then the block that says how the file holds both — the brief a
  // run is given has to describe the file it is asked to write, and a session
  // told two contracts and no way to combine them would write the second over
  // the first.
  const briefs = job.channels
    .map((channel) =>
      channelBrief(
        channel,
        legendAudience(job.prompt, audience(channel)),
        // "The same again" reuses the audited body instead of rebuilding and
        // drifting (D-094).
        RESEND_WORDS.test(job.prompt) ? lastSend(channel) : undefined,
        // Words the desk already holds, reaching a session anyway — the outbox
        // contract refused them and the job fell through (D-097).
        job.send?.words,
      ),
    )
    .filter((brief): brief is string => brief !== null);
  if (briefs.length === 0) return undefined;
  const withholding = wantsWithholding(job.prompt) ? withholdingBlock() : [];
  if (briefs.length === 1) return [briefs[0], ...withholding].join('\n');
  return [...briefs, ...severalChannelsBlock(job.channels), ...withholding].join('\n');
}

/**
 * The withholding contract, told to the session (D-181).
 *
 * Told because a capability nobody is told about is not one (D-031) — but more
 * than that: the gate at Approve checks this file, so a run that withholds
 * something and never declares it gets no credit for it, and a run that
 * declares nothing has its send judged as an ordinary one. The instruction and
 * the check are the same sentence, said once.
 */
function withholdingBlock(): string[] {
  return [
    '',
    '## You were asked to keep something out',
    'This job asks for something to be withheld from what goes out. Do it, and then **declare it**: write WITHHELD.json in the working directory, exactly this shape:',
    '{"items":[{"what":"the customer names","values":["Acme Corp","Jane Doe"]}],"note":"<anything the reviewer should know about your judgement>"}',
    '- "values" are the literal strings you took out, exactly as they appeared in the source. Approve searches every message, subject and readable attachment for them and **refuses to send** if one is still there — so this is a check on your own work, not paperwork.',
    '- "what" is for the person reviewing: "the customer names", "the salary figures". One item per kind of thing.',
    '- Every value must be at least 3 characters. A shorter one matches almost any message and would block the send outright.',
    '- Declare what you actually removed, never what you merely intended to. An empty or missing file means you withheld nothing, and the send is judged as an ordinary one.',
    '- If you could not do it — the source did not say which names are the clients, say — do not send. Write RESULT.md explaining what you could not tell apart, and leave the outbox out.',
    '- The check is on the text and on attachments it can read. A PDF or a spreadsheet is named as unscanned at review rather than assumed clean, so take extra care with what rides as a file.',
  ];
}

/** How one OUTBOX.json holds a send per channel (D-179). */
function severalChannelsBlock(channels: string[]): string[] {
  return [
    '',
    '## This job sends on more than one channel',
    `You were asked to send via ${channels.map((c) => LABELS[c] ?? c).join(' and ')}, and the work behind them is one job — do it once, then write one message set per channel.`,
    'Write OUTBOX.json as a LIST of the objects described above, one per channel and never two for the same one:',
    `[{"channel":"${channels[0]}","messages":[...]}, {"channel":"${channels[1]}","messages":[...]}]`,
    '- Each channel keeps its own rules exactly as described above — its own recipients, its own limits, and its own "files" rule.',
    '- The message bodies do not have to match. Write what suits each channel and each audience; the figures behind them must agree, because they came from one piece of work.',
    '- If you can only reach one of them — an address you were not given, say — write the outbox for the one you can and say plainly in RESULT.md what is missing for the other. Never invent a recipient, and never drop a channel silently.',
    '- The user reviews every message on every channel, and approving sends them all.',
  ];
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
