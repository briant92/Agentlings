import {
  MAX_OUTBOX_BODY_CHARS,
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
];

const LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  'whatsapp-business': 'WhatsApp Business',
  gmail: 'Gmail',
  slack: 'Slack',
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
};

/** Decided in D-077 and wired in later slices; the card says so plainly. */
const PLANNED: Record<string, string> = {
  slack: 'Posts in your workspace as your own bot — planned',
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
  if (!SEND_VERBS.test(p)) return null;
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
 * The outbox contract, told to the session (closing D-075's deferral by
 * D-031's rule: a capability nobody is told about is not one). Only for
 * channels that exist — a job whose ask fell to "draft" carries no channel
 * and hears nothing.
 */
export function channelBrief(channel: string, audience: AudiencePerson[] = []): string | null {
  if (!CHANNELS[channel]) return null;
  const shape =
    channel === 'gmail'
      ? `{"channel":"gmail","messages":[{"to":"<email address>","name":"<who this is, shown at review>","subject":"<short subject>","body":"..."}]}`
      : channel === 'whatsapp-business'
        ? `{"channel":"whatsapp-business","template":{"name":"<approved template name>","language":"es"},"messages":[{"to":"<number with country code>","name":"<who this is, shown at review>","params":["<template parameter>","..."],"body":"<the message as it will read, for review>"}]}`
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
    ...(channel === 'whatsapp-business'
      ? [
          '- Business-initiated WhatsApp only sends pre-approved templates. Use exactly the template name the user gave; if they named none, do not invent one — write RESULT.md saying an approved template name is needed.',
          '- "params" are the template\'s body parameters, in order; "body" is the message as it will read, so the review shows real words. "to" is the number with country code. Do not invent numbers — report the missing ones in RESULT.md.',
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
