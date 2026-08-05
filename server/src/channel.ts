import {
  MAX_OUTBOX_BODY_CHARS,
  MAX_OUTBOX_MESSAGES,
  type ChannelAsk,
  type ChannelOption,
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
// there would miss the plainest phrasing a send request has.
const SEND_VERBS = /\b(send|remind|message|notify|text|ping|dm|e-?mail)\b/;

/**
 * Word → channel, matched at the word's position in the prompt; the earliest
 * mention wins, so "on WhatsApp or Telegram" asks for WhatsApp. "signal"
 * needs a preposition because "send a signal to the process" is code talk,
 * not a messaging request.
 */
const CHANNEL_WORDS: [RegExp, string][] = [
  [/\btelegram\b/, 'telegram'],
  [/\bwhats\s?app\b/, 'whatsapp'],
  [/\b(gmail|e-?mail)\b/, 'gmail'],
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
};

/** Decided in D-077 and wired in later slices; the card says so plainly. */
const PLANNED: Record<string, string> = {
  'whatsapp-business':
    'Real WhatsApp, ≈$0.03 a message, arrives from a business number — planned, needs Meta setup first',
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
export function channelBrief(channel: string): string | null {
  if (!CHANNELS[channel]) return null;
  const shape =
    channel === 'gmail'
      ? `{"channel":"gmail","messages":[{"to":"<email address>","name":"<who this is, shown at review>","subject":"<short subject>","body":"..."}]}`
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
    '- The user reviews every message and approves before anything is sent.',
  ].join('\n');
}
