import { describe, expect, it } from 'vitest';
import { channelBrief, detectChannelAsk } from './channel';
import type { Connection } from './connections';

const telegram: Connection = {
  name: 'telegram',
  label: 'Send Telegram messages',
  transport: 'builtin',
  tools: [],
  secrets: { TELEGRAM_BOT_TOKEN: 'why' },
};
const google: Connection = {
  name: 'google',
  label: 'Send Gmail, as you',
  transport: 'builtin',
  tools: [],
  secrets: {
    GOOGLE_OAUTH_CLIENT_ID: 'why',
    GOOGLE_OAUTH_CLIENT_SECRET: 'why',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'why',
  },
};
const CONNECTED = { connections: { telegram: true } };
const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

const ask = (
  prompt: string,
  settings: { connections?: Record<string, boolean> } = {},
  env: Record<string, string | undefined> = {},
) => detectChannelAsk(prompt, [telegram, google], settings, env);

/**
 * Detection follows the router's rule: claim only what is unmistakably a
 * request to message someone, and under-fire everywhere else — a wrong card
 * at the desk costs trust, a missed one costs nothing the run can't say.
 */
describe('detectChannelAsk — when it fires', () => {
  it('needs a send verb and a channel word together', () => {
    expect(ask('remind Ana about padel on telegram', CONNECTED, TOKEN)?.asked).toBe('telegram');
    expect(ask('summarise the whatsapp export chat')).toBeNull(); // word, no verb
    expect(ask('remind me to buy milk tomorrow')).toBeNull(); // verb, no word
    expect(ask('list the repo modules')).toBeNull();
  });

  it('is case-insensitive and survives "WhatsApp" spelled apart', () => {
    expect(ask('Send weekly reminders via Whats App')?.asked).toBe('whatsapp');
  });

  it('the earliest mention wins, not the catalog order', () => {
    expect(ask('message everyone on whatsapp, or telegram if easier')?.asked).toBe('whatsapp');
  });

  it('"send a signal" is code talk, "notify me on signal" is not', () => {
    expect(ask('send a signal to the worker process when the build ends')).toBeNull();
    expect(ask('notify me on signal when the build ends')?.asked).toBe('signal');
  });
});

describe('detectChannelAsk — what the card says', () => {
  it('a connected channel is a quiet chip, not a card', () => {
    const got = ask('send the padel reminder on telegram', CONNECTED, TOKEN);
    expect(got?.state).toBe('ready');
    expect(got?.channel).toBe('telegram');
    expect(got?.options).toEqual([]);
    expect(got?.note).toContain('review');
  });

  it('an unconnected wired channel offers the drawer and queue-anyway', () => {
    const got = ask('send the padel reminder on telegram');
    expect(got?.state).toBe('connectable');
    expect(got?.channel).toBe('telegram'); // Start still carries it
    expect(got?.note).toContain("isn't connected yet");
    expect(got?.options.map((o) => o.state)).toEqual(['connectable']);
  });

  it('whatsapp gets the honest fork: the reason, then what can actually send', () => {
    const got = ask('send weekly padel reminders to Ana and Luis on whatsapp', CONNECTED, TOKEN);
    expect(got?.state).toBe('never');
    expect(got?.channel).toBeUndefined();
    expect(got?.note).toContain('no API');
    expect(got?.options.map((o) => o.channel)).toEqual([
      'telegram',
      'whatsapp-business',
      'gmail',
    ]);
    expect(got?.options[0].state).toBe('ready');
    expect(got?.options[1].state).toBe('planned');
    expect(got?.options[1].detail).toContain('business number');
    // Gmail is wired now (D-080) — its row carries a live state, not a promise.
    expect(got?.options[2].state).toBe('connectable');
  });

  it('an email ask is connectable once google is in the catalog', () => {
    const got = ask('email the summary to the team every friday', CONNECTED, TOKEN);
    expect(got?.asked).toBe('gmail');
    expect(got?.state).toBe('connectable');
    expect(got?.channel).toBe('gmail');
    expect(got?.options[0].detail).toContain('Connect Google');
  });

  it('a planned channel says roadmap and offers what works today', () => {
    const got = ask('message the team on slack about the launch', CONNECTED, TOKEN);
    expect(got?.asked).toBe('slack');
    expect(got?.state).toBe('planned');
    expect(got?.note).toContain('roadmap');
    expect(got?.options.map((o) => o.channel)).toEqual(['telegram', 'slack']);
  });

  it('a never channel states its reason on the card', () => {
    const got = ask('dm the team on linkedin about the launch');
    expect(got?.state).toBe('never');
    expect(got?.note).toContain('closed to personal automation');
  });
});

describe('channelBrief', () => {
  it('tells a telegram job the contract, the caps and who sends', () => {
    const brief = channelBrief('telegram')!;
    expect(brief).toContain('OUTBOX.json');
    expect(brief).toContain('"channel":"telegram"');
    expect(brief).toContain('Up to 20 messages');
    expect(brief).toContain('under 2000 characters');
    expect(brief).toContain('reviews every message and approves');
    // The chat-id rule, and the refusal to invent one.
    expect(brief).toContain('do not invent');
  });

  it('tells a gmail job about addresses, subjects and whose voice it writes in', () => {
    const brief = channelBrief('gmail')!;
    expect(brief).toContain('"channel":"gmail"');
    expect(brief).toContain('"subject"');
    expect(brief).toContain('email address');
    expect(brief).toContain("user's own address");
    expect(brief).toContain('do not invent');
  });

  it('says nothing for a channel that does not exist', () => {
    expect(channelBrief('slack')).toBeNull();
    expect(channelBrief('carrier-pigeon')).toBeNull();
  });
});
