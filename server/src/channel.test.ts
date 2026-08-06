import { describe, expect, it } from 'vitest';
import {
  briefForJob,
  channelBrief,
  channelShelf,
  detectChannelAsk,
  mentionsChannel,
  RESEND_WORDS,
} from './channel';
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
const whatsappBusiness: Connection = {
  name: 'whatsapp-business',
  label: 'Send WhatsApp Business messages',
  transport: 'builtin',
  tools: [],
  secrets: { WHATSAPP_TOKEN: 'why', WHATSAPP_PHONE_NUMBER_ID: 'why' },
};
const CONNECTED = { connections: { telegram: true } };
const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

const ask = (
  prompt: string,
  settings: { connections?: Record<string, boolean> } = {},
  env: Record<string, string | undefined> = {},
) => detectChannelAsk(prompt, [telegram, google, whatsappBusiness], settings, env);

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

  it('inflected verbs claim too — the 65¢ run that slipped past as a participle (D-090)', () => {
    const real = ask(
      'I need a summary of the current Call of Duty: Warzone meta to be sent to my friend Pepo Dussaillant on Telegram',
      CONNECTED,
      TOKEN,
    );
    expect(real?.asked).toBe('telegram');
    expect(ask('she texted the group on whatsapp about it')?.asked).toBe('whatsapp');
    expect(ask('I reminded everyone on telegram already — do it again Friday')?.asked).toBe(
      'telegram',
    );
  });

  it('an inflection is a verb, never a channel word — mentions stay quiet', () => {
    expect(ask('summarize the emailed report')).toBeNull(); // "emailed" fails the channel boundary
    expect(ask('the messaging layer needs a refactor')).toBeNull(); // verb shape, no channel
    // Verb and channel evidence in one inflected word is deliberately not
    // enough: "email Ana" fires on the bare double-duty form, this does not.
    expect(ask('this should be emailed to Ana')).toBeNull();
  });

  it('"send a mail" is an email ask — bare "mail" claims as a channel word only', () => {
    const got = ask('send a mail to a friend');
    expect(got?.asked).toBe('gmail');
    expect(got?.state).toBe('connectable');
    expect(ask('summarise the mail export')).toBeNull(); // word, no verb
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
    // Both alternatives are wired now (D-080, D-081) — live states, not promises.
    expect(got?.options[1].state).toBe('connectable');
    expect(got?.options[1].detail).toContain('business number');
    expect(got?.options[2].state).toBe('connectable');
  });

  it('"on whatsapp business" is its own wired ask, not the personal refusal', () => {
    const got = ask('send the padel reminder on whatsapp business', CONNECTED, TOKEN);
    expect(got?.asked).toBe('whatsapp-business');
    expect(got?.state).toBe('connectable');
    expect(got?.channel).toBe('whatsapp-business');
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

describe('mentionsChannel (D-093)', () => {
  it('finds the typo-stranded mention — the 80¢ run, verbatim', () => {
    const got = mentionsChannel('Sen me a Telegram with the latest Call of Duty: Warzone meta');
    expect(got).toEqual({ channel: 'telegram', label: 'Telegram', wired: true });
  });

  it('earliest mention wins, and an unwired channel says so', () => {
    expect(mentionsChannel('the whatsapp or telegram export')?.channel).toBe('whatsapp');
    expect(mentionsChannel('the whatsapp export')?.wired).toBe(false);
  });

  it('finds nothing to question in a sentence with no channel word', () => {
    expect(mentionsChannel('summarise the monthly economic indicators')).toBeNull();
  });
});

describe('channelShelf', () => {
  it('serves the planned tier and the refusals with their reasons, labelled', () => {
    const shelf = channelShelf();
    expect(shelf.planned.map((r) => r.channel)).toContain('slack');
    const whatsapp = shelf.never.find((r) => r.channel === 'whatsapp');
    expect(whatsapp?.label).toBe('WhatsApp');
    expect(whatsapp?.detail).toContain('no API');
    for (const row of [...shelf.planned, ...shelf.never]) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.detail.length).toBeGreaterThan(0);
    }
  });

  it('never lists a wired channel on either shelf', () => {
    const shelf = channelShelf();
    for (const wired of ['telegram', 'gmail', 'whatsapp-business']) {
      expect(shelf.planned.map((r) => r.channel)).not.toContain(wired);
      expect(shelf.never.map((r) => r.channel)).not.toContain(wired);
    }
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

  it('tells a whatsapp job templates-only, params-in-order, and never to invent either', () => {
    const brief = channelBrief('whatsapp-business')!;
    expect(brief).toContain('"template"');
    expect(brief).toContain('pre-approved template');
    expect(brief).toContain('"params"');
    expect(brief).toContain('country code');
    expect(brief).toContain('do not invent one');
  });

  it('says nothing for a channel that does not exist', () => {
    expect(channelBrief('slack')).toBeNull();
    expect(channelBrief('carrier-pigeon')).toBeNull();
  });

  it('carries the audience legend, and the user-given address still wins (D-092)', () => {
    const brief = channelBrief('telegram', [
      { id: '8633678680', name: 'Brian Thornton', viaStart: true, sends: 1 },
      { id: '71', name: 'Pepo Dussaillant', viaStart: true, sends: 0 },
    ])!;
    expect(brief).toContain('Known recipients');
    expect(brief).toContain('Brian Thornton — 8633678680');
    expect(brief).toContain('Pepo Dussaillant — 71');
    expect(brief).toContain('gives directly always wins');
    expect(brief).toContain('never invent one');
  });

  /**
   * The fidelity clause (D-097). A session only ever sees the user's own
   * words when the contract refused what the desk held, and before this it
   * was told nothing about whose words they were — the run that turned
   * "A DARLE" into "A DARLE 💪" had every instruction inviting a rewrite.
   */
  describe('words the user wrote themselves', () => {
    const brief = () => channelBrief('telegram', [], undefined, 'A DARLE')!;

    it('carries them verbatim and says they are the message', () => {
      expect(brief()).toContain('wrote this message themselves');
      expect(brief()).toContain('exactly as written');
      expect(brief()).toContain('A DARLE');
      expect(brief()).toContain('It is not a brief for a message; it is the message');
    });

    // The instruction has to be followable. The commonest way a session sees
    // this at all is a body the contract refused for length, so "send it
    // exactly" and nothing else would be an order it cannot obey.
    it('says what to do when the words will not fit', () => {
      expect(brief()).toContain('keep their wording');
      expect(brief()).toContain('what had to give');
    });

    it('adds nothing when the words are not the user’s', () => {
      const plain = channelBrief('telegram')!;
      expect(plain).not.toContain('wrote this message themselves');
      expect(plain).not.toContain('exactly as written');
    });

    // Two different promises about two different texts: one is what the user
    // just typed, the other is what was sent last time (D-094).
    it('is not the reuse block, and both can ride together', () => {
      const both = channelBrief('telegram', [], 'the last thing sent', 'A DARLE')!;
      expect(both).toContain('wrote this message themselves');
      expect(both).toContain('asked to send the same thing again');
      expect(both).toContain('the last thing sent');
    });
  });

  it('an empty roster adds no legend at all', () => {
    expect(channelBrief('telegram', [])).not.toContain('Known recipients');
    expect(channelBrief('telegram')).not.toContain('Known recipients');
  });

  it('carries the last sent body verbatim when the prompt asked for the same (D-094)', () => {
    const brief = channelBrief('telegram', [], '*Warzone meta* — equip the FG42.')!;
    expect(brief).toContain('reuse this text');
    expect(brief).toContain('*Warzone meta* — equip the FG42.');
    expect(brief).toContain('it was reused');
    expect(channelBrief('telegram', [])).not.toContain('reuse this text');
  });
});

describe('RESEND_WORDS (D-094)', () => {
  it('hears the ways people ask for the same thing again', () => {
    for (const p of [
      'Now send the same Telegram to Pepo',
      'send it again to Ana',
      'resend the reminder',
      'send Pepo one like the last message',
    ]) {
      expect(RESEND_WORDS.test(p)).toBe(true);
    }
  });

  it('stays quiet on a fresh request', () => {
    expect(RESEND_WORDS.test('Send me a Telegram with the latest Warzone meta')).toBe(false);
    expect(RESEND_WORDS.test('send a sample loadout to Ana')).toBe(false);
  });
});

/**
 * The wiring, not the brief (D-097). Deleting the line that handed a job's
 * own words to `channelBrief` broke no test at all, while the brief itself
 * was covered from three directions — a correct function reached by nobody,
 * which is the same fault as the two job builders that dropped a field in
 * silence. So the decisions about *which* blocks ride are tested here.
 */
describe('briefForJob', () => {
  const audience = () => [];
  const lastSend = () => 'the last thing sent on this channel';
  const job = (over: Partial<{ channel: string; prompt: string; send: { words: string } }> = {}) => ({
    prompt: 'send the reminder',
    ...over,
  });

  it('says nothing at all for a job with no channel', () => {
    expect(briefForJob(job(), audience, lastSend)).toBeUndefined();
  });

  it('hands the words to the brief when the desk held them', () => {
    const brief = briefForJob(
      job({ channel: 'telegram', send: { words: 'A DARLE' } }),
      audience,
      lastSend,
    )!;
    expect(brief).toContain('wrote this message themselves');
    expect(brief).toContain('A DARLE');
  });

  it('leaves the block out when it held none', () => {
    const brief = briefForJob(job({ channel: 'telegram' }), audience, lastSend)!;
    expect(brief).not.toContain('wrote this message themselves');
  });

  // D-094's wiring, which was equally unpinned: the audited body rides only
  // when the sentence asked for the same thing again.
  it('reaches for the last body only when the prompt asks for the same', () => {
    const asked = briefForJob(
      job({ channel: 'telegram', prompt: 'send the same again to Pepo' }),
      audience,
      lastSend,
    )!;
    expect(asked).toContain('the last thing sent on this channel');
    const plain = briefForJob(job({ channel: 'telegram' }), audience, lastSend)!;
    expect(plain).not.toContain('the last thing sent on this channel');
  });

  it('carries both when the sentence asks for the same and the desk holds words', () => {
    const brief = briefForJob(
      job({ channel: 'telegram', prompt: 'send the same again', send: { words: 'A DARLE' } }),
      audience,
      lastSend,
    )!;
    expect(brief).toContain('A DARLE');
    expect(brief).toContain('the last thing sent on this channel');
  });
});
