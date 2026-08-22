import { describe, expect, it } from 'vitest';
import {
  briefForJob,
  channelBrief,
  channelShelf,
  claimedChannel,
  detectChannelAsk,
  LEGEND_CAP,
  legendAudience,
  droppedChannels,
  filelessChannels,
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
const slackConn: Connection = {
  name: 'slack',
  label: 'Send Slack messages',
  transport: 'builtin',
  tools: [],
  secrets: { SLACK_BOT_TOKEN: 'why' },
};
const githubConn: Connection = {
  name: 'github',
  label: 'Read a code host',
  transport: 'builtin',
  tools: ['list_issues'],
  secrets: { GITHUB_TOKEN: 'why' },
};
const CONNECTED = { connections: { telegram: true } };
const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

const ask = (
  prompt: string,
  settings: { connections?: Record<string, boolean> } = {},
  env: Record<string, string | undefined> = {},
) =>
  detectChannelAsk(
    prompt,
    [telegram, google, whatsappBusiness, slackConn, githubConn],
    settings,
    env,
  );

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
    const got = ask('message the team on discord about the launch', CONNECTED, TOKEN);
    expect(got?.asked).toBe('discord');
    expect(got?.state).toBe('planned');
    expect(got?.note).toContain('roadmap');
    expect(got?.options.map((o) => o.channel)).toEqual(['telegram', 'discord']);
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
    expect(shelf.planned.map((r) => r.channel)).toContain('sms');
    // Wired in D-104 — a channel must leave the planned shelf the day it works.
    expect(shelf.planned.map((r) => r.channel)).not.toContain('slack');
    const whatsapp = shelf.never.find((r) => r.channel === 'whatsapp');
    expect(whatsapp?.label).toBe('WhatsApp');
    expect(whatsapp?.detail).toContain('no API');
    for (const row of [...shelf.planned, ...shelf.never]) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.detail.length).toBeGreaterThan(0);
    }
  });

  // D-219: the one row that is a kind of act rather than an app. It is a
  // shelf row only — no sentence word maps to it, so intake is untouched.
  it('puts initiating a payment on the shelf of never, with the reason', () => {
    const payments = channelShelf().never.find((r) => r.channel === 'payments');
    expect(payments?.label).toBe('Payments and transfers');
    expect(payments?.detail).toMatch(/a wrong wire is gone/);
    expect(claimedChannel('wire 500 dollars to Ana')).toBeNull();
  });

  it('never lists a wired channel on either shelf', () => {
    const shelf = channelShelf();
    for (const wired of ['telegram', 'gmail', 'whatsapp-business', 'slack', 'calendar', 'github']) {
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
    // The channel's own limit (D-193), never the flat 2000 that refused a
    // message telegram itself would have carried.
    expect(brief).toContain('under 4096 characters');
    expect(brief).toContain('reviews every message and approves');
    // The chat-id rule, and the refusal to invent one.
    expect(brief).toContain('do not invent');
  });

  /**
   * The channel-pivot dead end, said before the run (D-193): a run once
   * pivoted a refused telegram send to gmail, and the frozen channel (D-079)
   * refused that too, after the session had ended. Each brief names its own
   * cap and says the channel cannot be switched.
   */
  it('quotes each channel its own body cap and says the channel is fixed', () => {
    const telegram = channelBrief('telegram')!;
    expect(telegram).toContain('The channel is fixed');
    expect(telegram).toContain('rides as an attached file');
    const gmail = channelBrief('gmail')!;
    expect(gmail).toContain('under 50000 characters');
    const slack = channelBrief('slack')!;
    expect(slack).toContain('under 40000 characters');
    expect(slack).toContain('said in RESULT.md instead');
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
    expect(channelBrief('sms')).toBeNull();
    expect(channelBrief('carrier-pigeon')).toBeNull();
  });

  // A capability nobody is told about is not one (D-031): the file-carrying
  // channels hear the files rule, and nobody else hears a word of it (D-159).
  //
  // "Not a word" was the rule until the corpus asked what a session does when
  // the user wants a file on Slack: it composes a "files" array, because
  // nothing said otherwise, and the contract refuses it once the work is
  // written and paid for. So the silence became a sentence. The assertion
  // below is the same one inverted — every channel is told where it stands,
  // and only two of them are told there is a field.
  it('tells telegram and gmail how "files" works, and every other channel that it has none', () => {
    for (const channel of ['telegram', 'gmail']) {
      const brief = channelBrief(channel)!;
      expect(brief).toContain('"files"');
      expect(brief).toContain('input/');
      expect(brief).toContain('real attachments');
      expect(brief).not.toContain('cannot carry attachments');
    }
    for (const channel of ['slack', 'whatsapp-business', 'calendar', 'github']) {
      const brief = channelBrief(channel)!;
      expect(brief).toContain('cannot carry attachments');
      // Told what to do about it, not merely that it cannot — an unusable
      // file has to be reported, or the user learns nothing at review.
      expect(brief).toContain('RESULT.md');
      // And never the shape: there is no field to fill in here.
      expect(brief).not.toContain('real attachments');
    }
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
  const job = (over: Partial<{ channels: string[]; prompt: string; send: { words: string } }> = {}) => ({
    prompt: 'send the reminder',
    ...over,
  });

  it('says nothing at all for a job with no channel', () => {
    expect(briefForJob(job(), audience, lastSend)).toBeUndefined();
  });

  it('hands the words to the brief when the desk held them', () => {
    const brief = briefForJob(
      job({ channels: ['telegram'], send: { words: 'A DARLE' } }),
      audience,
      lastSend,
    )!;
    expect(brief).toContain('wrote this message themselves');
    expect(brief).toContain('A DARLE');
  });

  it('leaves the block out when it held none', () => {
    const brief = briefForJob(job({ channels: ['telegram'] }), audience, lastSend)!;
    expect(brief).not.toContain('wrote this message themselves');
  });

  // D-094's wiring, which was equally unpinned: the audited body rides only
  // when the sentence asked for the same thing again.
  it('reaches for the last body only when the prompt asks for the same', () => {
    const asked = briefForJob(
      job({ channels: ['telegram'], prompt: 'send the same again to Pepo' }),
      audience,
      lastSend,
    )!;
    expect(asked).toContain('the last thing sent on this channel');
    const plain = briefForJob(job({ channels: ['telegram'] }), audience, lastSend)!;
    expect(plain).not.toContain('the last thing sent on this channel');
  });

  it('carries both when the sentence asks for the same and the desk holds words', () => {
    const brief = briefForJob(
      job({ channels: ['telegram'], prompt: 'send the same again', send: { words: 'A DARLE' } }),
      audience,
      lastSend,
    )!;
    expect(brief).toContain('A DARLE');
    expect(brief).toContain('the last thing sent on this channel');
  });
});

describe('legendAudience (D-122)', () => {
  const person = (
    id: string,
    name: string,
    sends: number,
    extra: Partial<{ aliases: string[]; username: string; viaContacts: boolean }> = {},
  ) => ({ id, name, viaStart: false, sends, ...extra });

  it('keeps who the sentence names, sent to or not', () => {
    const got = legendAudience('email Ana the summary', [
      person('ana@x.com', 'Ana García', 0, { viaContacts: true }),
      person('bo@x.com', 'Roberto Díaz', 0, { viaContacts: true }),
    ]);
    expect(got.map((p) => p.id)).toEqual(['ana@x.com']);
  });

  it('matches through aliases, the way the To prefill does (D-094)', () => {
    const got = legendAudience('send it to Pepo', [
      person('6783316106', 'Jose Dussaillant', 2, { aliases: ['Pepo'] }),
    ]);
    expect(got).toHaveLength(1);
  });

  it('drops an unmentioned, never-used contact — the book never rides whole', () => {
    const got = legendAudience('email the weekly report', [
      person('ana@x.com', 'Ana García', 0, { viaContacts: true }),
      person('used@x.com', 'Carmen Soto', 3),
    ]);
    expect(got.map((p) => p.id)).toEqual(['used@x.com']);
  });

  it('caps the added-on-history tail but never the named', () => {
    const many = Array.from({ length: LEGEND_CAP + 10 }, (_, i) =>
      person(`p${i}@x.com`, `Persona${i} Apellido`, i + 1),
    );
    const unnamed = legendAudience('email the report', many);
    expect(unnamed).toHaveLength(LEGEND_CAP);
    // Ranked by use: the biggest sender leads.
    expect(unnamed[0]?.sends).toBe(LEGEND_CAP + 10);

    const prompt = `email ${many.map((p) => p.name.split(' ')[0]).join(' and ')}`;
    expect(legendAudience(prompt, many)).toHaveLength(LEGEND_CAP + 10);
  });

  it('a two-letter name cannot claim a mention — the prefill rule, mirrored', () => {
    expect(legendAudience('email bo now', [person('bo@x.com', 'Bo', 0)])).toHaveLength(0);
  });
});

describe('briefForJob filters the legend (D-122)', () => {
  const roster = [
    { id: 'ana@x.com', name: 'Ana García', viaStart: false, viaContacts: true, sends: 0 },
    { id: 'luis@x.com', name: 'Luis Vera', viaStart: false, viaContacts: true, sends: 0 },
  ];

  it('a job naming nobody gets no legend from a book of unused contacts', () => {
    const brief = briefForJob(
      { channels: ['gmail'], prompt: 'email the weekly summary' },
      () => roster,
      () => undefined,
    )!;
    expect(brief).not.toContain('Known recipients');
    expect(brief).not.toContain('ana@x.com');
  });

  it('a job naming a contact carries exactly them', () => {
    const brief = briefForJob(
      { channels: ['gmail'], prompt: 'email Ana the weekly summary' },
      () => roster,
      () => undefined,
    )!;
    expect(brief).toContain('Ana García — ana@x.com');
    expect(brief).not.toContain('luis@x.com');
  });
});

/**
 * The scoped claims (D-104): a channel's own verbs claim only beside its
 * word, so the calendar can hear "add" and "book" without every coding
 * sentence that says "create" becoming a send.
 */
describe('scoped claims — calendar and github', () => {
  const GOOGLE_ENV = {
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'rt',
  };

  it('calendar claims on its own verbs beside its word', () => {
    expect(ask('add the dentist to my calendar thursday at 4pm')?.asked).toBe('calendar');
    expect(ask('put the padel game on my calendar')?.asked).toBe('calendar');
    expect(ask('book a table friday and add it to the calendar')?.asked).toBe('calendar');
  });

  it('the scoped verbs claim nothing away from their word', () => {
    // The over-fire this design exists to refuse: an everyday coding verb
    // beside an unrelated channel word must stay a mention, not a send.
    expect(ask('create a test for the telegram module')).toBeNull();
    expect(ask('add retries to the slack fetcher')).toBeNull();
  });

  it('a calendar word with no verb at all stays a question, not a claim', () => {
    expect(ask('what is on my calendar this week')).toBeNull();
    expect(mentionsChannel('what is on my calendar this week')?.channel).toBe('calendar');
  });

  it('calendar rides the google connection: ready exactly when google is', () => {
    const ready = ask('add the dentist to my calendar', { connections: { google: true } }, GOOGLE_ENV);
    expect(ready?.state).toBe('ready');
    expect(ready?.channel).toBe('calendar');
    expect(ask('add the dentist to my calendar')?.state).toBe('connectable');
  });

  it('github claims on "comment on", and the plural stays a read', () => {
    const got = ask('comment on briant92/Agentlings#12 on github saying the census matches', {
      connections: { github: true },
    }, { GITHUB_TOKEN: 'g' });
    expect(got?.asked).toBe('github');
    expect(got?.state).toBe('ready');
    expect(ask('read the comments on github issue 5')).toBeNull();
    expect(mentionsChannel('read the comments on github issue 5')?.channel).toBe('github');
  });

  it('slack is wired now: ready with a token, connectable without', () => {
    expect(
      ask('message the team on slack about the launch', { connections: { slack: true } }, {
        SLACK_BOT_TOKEN: 'xoxb',
      })?.state,
    ).toBe('ready');
    expect(ask('message the team on slack about the launch')?.state).toBe('connectable');
  });
});

/**
 * The intake benchmark (`npm run bench:intake`) put eight of fifty-one
 * sentences on the confirmation card for one reason: the channel names people
 * use as verbs were in no verb list. These pin both halves — what now claims,
 * and what must still stay quiet.
 */
describe('a channel name standing where the verb goes', () => {
  it('claims at the start of a sentence, with an object after it', () => {
    expect(ask('telegram Pepo the UF and the dollar for today')?.asked).toBe('telegram');
    expect(ask('slack the release notes to the team')?.asked).toBe('slack');
  });

  it('claims after a sequence marker, which is where a chain puts it', () => {
    // steps.ts's own worked example, which until now claimed nothing.
    expect(ask('summarise the expenses csv, then telegram Brian the total')?.asked).toBe('telegram');
    expect(ask('pull the figures. Telegram me the differences')?.asked).toBe('telegram');
    expect(ask('write the note, and telegram it to Ana')?.asked).toBe('telegram');
  });

  it('bare "and" is not a lead — an ordinary "and" must not read as a send', () => {
    // The sentence has to put the channel word itself after the bare "and",
    // and be the earliest channel mentioned, or the claim is refused for a
    // different reason and the assertion proves nothing. Found by mutation:
    // widening the lead to `\s+and\s+` left the whole file green.
    expect(ask('summarise the csv and telegram usage for the month')).toBeNull();
    expect(ask('compare the slack and telegram clients')).toBeNull();
    expect(mentionsChannel('summarise the csv and telegram usage for the month')?.channel).toBe(
      'telegram',
    );
  });

  it('the channel word as a noun still claims nothing', () => {
    expect(ask('write a test for the telegram module')).toBeNull();
    expect(ask('summarise the mail export in input/')).toBeNull();
    expect(ask('the telegram bot token is missing')).toBeNull();
  });

  it('a channel at the end of a clause is a mention, not a verb', () => {
    // D-093's case stands: the typo'd verb still buys a question, not a claim.
    expect(ask('Sen me a Telegram with the UF')).toBeNull();
    expect(mentionsChannel('Sen me a Telegram with the UF')?.channel).toBe('telegram');
  });

  it('slack claims on "post ... on slack", and not on a post about slack', () => {
    expect(ask('post the build log to the team on slack')?.asked).toBe('slack');
    expect(ask('post the release notes to #general in slack')?.asked).toBe('slack');
    expect(ask('write a blog post about slack')).toBeNull();
    // A hash channel on its own names no product: the channel word is still
    // what identifies the channel, here as everywhere else.
    expect(ask('post the release notes to #general')).toBeNull();
  });
});

/**
 * The silent drop (D-178). A job carries one channel and the earliest mention
 * wins, so a second channel used to vanish with no card, no question and no
 * near-miss line — the only way the desk could be wrong about a send without
 * saying so. These pin what is now named, and that the naming did not become
 * a second, looser claim rule.
 */
describe('the channels an ask could not take', () => {
  it('names the second channel, whichever way round the sentence puts them', () => {
    const one = ask('telegram Pepo the UF for today and email the same figures to Ana');
    expect(one?.asked).toBe('telegram');
    expect(one?.also?.map((o) => o.channel)).toEqual(['gmail']);

    const two = ask('email the board the quarterly numbers and send me a telegram when it lands');
    expect(two?.asked).toBe('gmail');
    expect(two?.also?.map((o) => o.channel)).toEqual(['telegram']);
  });

  it('carries each one with its own state, so the card can offer the swap', () => {
    const got = ask(
      'telegram Pepo the UF and email the figures to Ana',
      { connections: { telegram: true } },
      TOKEN,
    );
    expect(got?.state).toBe('ready');
    // Google is not connected in this fixture, so its option says so rather
    // than inheriting Telegram's state.
    expect(got?.also?.[0]).toMatchObject({ channel: 'gmail', state: 'connectable' });
  });

  it('names a second channel beside a scoped claim, and a planned one too', () => {
    expect(
      ask('book the review on my calendar and email the agenda to everyone invited')?.also?.map(
        (o) => o.channel,
      ),
    ).toEqual(['gmail']);
    expect(ask('email Ana the note and sms me when it lands')?.also?.[0]).toMatchObject({
      channel: 'sms',
      state: 'planned',
    });
  });

  it('a send verb anywhere does NOT claim a second channel — the evidence is local', () => {
    // The over-fire this rule exists to refuse: `SEND_VERBS` is tested against
    // the whole prompt for the asked channel, and reusing it here would read
    // a Telegram send into a sentence about a Telegram export.
    expect(ask('email Ana the summary of the telegram export')?.also).toBeUndefined();
    expect(ask('email Ana a note about the slack outage')?.also).toBeUndefined();
  });

  it('a sentence with one channel carries no also at all', () => {
    expect(ask('email Ana the Q3 expenses')?.also).toBeUndefined();
    expect(ask('telegram Pepo the total')?.also).toBeUndefined();
  });

  it('the dropped list is everything asked for minus what is carried', () => {
    const got = ask('telegram Pepo the UF and email the figures to Ana');
    expect(droppedChannels(got, ['telegram'])).toEqual([{ channel: 'gmail', label: 'Gmail' }]);
    // The case that cannot be seen from `also` alone: picking the second
    // channel on the fork card makes the asked one the dropped one.
    expect(droppedChannels(got, ['gmail'])).toEqual([{ channel: 'telegram', label: 'Telegram' }]);
    // A draft job carrying neither drops both, in the order they were asked.
    expect(droppedChannels(got, undefined).map((d) => d.channel)).toEqual(['telegram', 'gmail']);
    // One channel, or none at all, drops nothing.
    expect(droppedChannels(ask('email Ana the note'), ['gmail'])).toEqual([]);
    expect(droppedChannels(null, ['gmail'])).toEqual([]);
  });

  it('a file is named for the channels that cannot carry it, and only those', () => {
    // Slack has no "files" field, so the one thing this sentence asks for is
    // the one thing that cannot happen — said at the desk, not after the run.
    expect(filelessChannels('Post the build log file to the team on Slack', ['slack'])).toEqual([
      { channel: 'slack', label: 'Slack', phrase: 'file' },
    ]);
    // The same file on a channel that carries one is not worth a word.
    expect(filelessChannels('Send Pepo the contract PDF on Telegram', ['telegram'])).toEqual([]);
    // Two channels, one of each (D-179): the file rides on Telegram and the
    // warning names Slack alone. A warning that named the send rather than
    // the channel would be wrong about half of it.
    expect(
      filelessChannels('send the report PDF to Pepo on telegram and post it on slack', [
        'telegram',
        'slack',
      ]).map((f) => f.channel),
    ).toEqual(['slack']);
    // No send at all carries nothing, so there is nothing to warn about.
    expect(filelessChannels('Produce a PDF', [])).toEqual([]);
  });

  it('a file the work reads is not a file the send carries', () => {
    // The fault the corpus scan found and the benchmark could not: eight of
    // its sentences name a file as the *input*. Here the send is the total,
    // and warning that the CSV will not be attached is a warning about an
    // attachment nobody asked for.
    expect(filelessChannels('Summarise the expenses CSV and post the total on Slack', ['slack'])).toEqual(
      [],
    );
    expect(filelessChannels('First read the PDF, then post me a table on Slack', ['slack'])).toEqual(
      [],
    );
    // "Attach" is exempt from the position rule because it can only mean one
    // thing — here it precedes the channel and still asks for a ride.
    expect(
      filelessChannels('Read the contract, then attach it to a Slack post', ['slack']).length,
    ).toBe(1);
  });

  it('a channel name with a person as its object claims after a bare "and"', () => {
    expect(ask('email it to Ana and telegram me the headline')?.also?.[0]?.channel).toBe(
      'telegram',
    );
    // Still not a claim where the object is a thing rather than a person.
    expect(ask('email Ana the report and telegram usage for the month')?.also).toBeUndefined();
  });
});

describe('the three new briefs (D-104)', () => {
  it('slack names the channel shape and the invite rule', () => {
    const brief = channelBrief('slack')!;
    expect(brief).toContain('#general');
    expect(brief).toContain('private channel');
    expect(brief).toContain('Do not invent channels');
  });

  it('calendar carries the event contract whole', () => {
    const brief = channelBrief('calendar')!;
    expect(brief).toContain('"event"');
    expect(brief).toContain('primary');
    expect(brief).toContain('One event per outbox');
    expect(brief).toContain('never invent one');
    expect(brief).toContain('2026-08-13T18:00:00');
  });

  it('github wants the reference shape and the user voice', () => {
    const brief = channelBrief('github')!;
    expect(brief).toContain('owner/repo#number');
    expect(brief).toContain('Never invent a number');
    expect(brief).toContain('their voice');
  });
});
