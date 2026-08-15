import { describe, expect, it } from 'vitest';
import { bareSend, clarificationLines, draftingAsk, questionsFor, sendFacts } from './clarify';

const REPO = { hasRepo: true, tier: 'session' as const };
const NO_REPO = { hasRepo: false, tier: 'session' as const };

const ids = (text: string, ctx: Parameters<typeof questionsFor>[1] = REPO) =>
  questionsFor(text, ctx).map((q) => q.id);

describe('questionsFor: when it stays quiet', () => {
  it('says nothing about free work, however vague', () => {
    for (const tier of ['routed', 'tool'] as const) {
      expect(questionsFor('fix it properly', { hasRepo: true, tier })).toEqual([]);
    }
  });

  it('says nothing about an empty box', () => {
    expect(questionsFor('   ', REPO)).toEqual([]);
  });

  it('says nothing when the sentence already names its target', () => {
    expect(ids('add tests for formatUsd in server/src/ledger.ts')).toEqual([]);
  });

  it('accepts a bare filename as a target', () => {
    expect(ids('write EXPORTS.md')).toEqual([]);
  });

  it('accepts a camelCase identifier as a target', () => {
    expect(ids('add tests for formatUsd')).toEqual([]);
  });

  it('accepts a backticked target', () => {
    expect(ids('document `quoteFor` and how it picks a tier')).toEqual([]);
  });
});

describe('questionsFor: a send job asks its two facts first', () => {
  const SEND = { hasRepo: false, tier: 'session' as const, channel: 'gmail' };

  it('asks who and what, ahead of everything else', () => {
    expect(ids('I need to send an email to a friend', SEND)).toEqual(['send-to:gmail', 'send-say']);
  });

  it('never asks without a channel — the same sentence stays as it was', () => {
    expect(ids('I need to send an email to a friend', NO_REPO)).not.toContain('send-to');
  });

  it('hints per channel, and neutrally for a fork whose channel is unsettled', () => {
    const hintFor = (channel: string) =>
      questionsFor('send the reminder', { hasRepo: false, tier: 'session', channel }).find(
        (q) => q.id.startsWith('send-to'),
      )?.hint;
    expect(hintFor('gmail')).toContain('email address');
    expect(hintFor('telegram')).toContain('chat id');
    expect(hintFor('whatsapp')).toContain('no run may invent one');
  });

  it('both facts are free text', () => {
    for (const q of questionsFor('send the reminder', SEND)) {
      expect(q.freeText).toBe(true);
      expect(q.options).toEqual([]);
    }
  });

  it('the three-question cap holds, send facts first', () => {
    const got = ids('send everything about the launch', SEND);
    expect(got.length).toBeLessThanOrEqual(3);
    expect(got.slice(0, 2)).toEqual(['send-to:gmail', 'send-say']);
  });

  /**
   * Was "stays quiet on free tiers like every other question", and the
   * exception is the point (D-097). The other questions narrow what a *paid*
   * run will do, so free work has nothing to save by asking. These two are
   * the job's own content: an outbox with no recipient and no message cannot
   * be composed at any price, free included.
   *
   * Found live rather than here. A bare send goes free precisely *because*
   * both facts are in hand, so the old rule withheld the questions the user
   * had just answered and the fields vanished under them mid-type.
   */
  it('still asks its two facts when the work is free, because they are the work', () => {
    expect(ids('send the reminder', { hasRepo: false, tier: 'tool', channel: 'gmail' })).toEqual([
      'send-to:gmail',
      'send-say',
    ]);
  });

  it('asks nothing else on a free tier, since there is no run to narrow', () => {
    expect(questionsFor('just improve it', { hasRepo: true, tier: 'tool' })).toEqual([]);
  });
});

describe('clarificationLines: send answers ride only with the channel context', () => {
  it('forwards the two facts when the context carries the channel', () => {
    const lines = clarificationLines(
      'I need to send an email to a friend',
      { hasRepo: false, tier: 'session', channel: 'gmail' },
      { 'send-to:gmail': 'Ana <ana@gmail.com>', 'send-say': 'happy birthday from me' },
    );
    expect(lines).toEqual([
      'Who should this go to? Ana <ana@gmail.com>',
      'What should it say, roughly? happy birthday from me',
    ]);
  });

  it('drops them without it — an answer the user was never asked for does not ride', () => {
    const lines = clarificationLines(
      'I need to send an email to a friend',
      { hasRepo: false, tier: 'session' },
      { 'send-to': 'ana@gmail.com' },
    );
    expect(lines).toEqual([]);
  });
});

/**
 * One recipient per channel (D-180). D-179 gave a job several channels and
 * left the To field standing down entirely, because one box cannot mean two
 * channels; this asks per channel instead, and the id carries which.
 */
describe('questionsFor: a send on more than one channel', () => {
  const both = (over: Record<string, unknown> = {}) =>
    questionsFor('telegram Pepo the UF and email the figures to Ana', {
      hasRepo: false,
      tier: 'session',
      channel: 'telegram',
      channels: ['telegram', 'gmail'],
      ...over,
    });

  it('asks a recipient for each, and the message once', () => {
    expect(both().map((q) => q.id)).toEqual(['send-to:telegram', 'send-to:gmail', 'send-say']);
  });

  it('each recipient names its channel, and carries it for the client', () => {
    const [tg, gm] = both();
    expect(tg.channel).toBe('telegram');
    expect(gm.channel).toBe('gmail');
    expect(tg.ask).toContain('Telegram');
    expect(gm.ask).toContain('Gmail');
    // Each keeps its own channel's shape hint — a chat id is not an address.
    expect(tg.hint).toContain('chat id');
    expect(gm.hint).toContain('email address');
  });

  it('a single channel is asked the same way, without naming itself', () => {
    const one = questionsFor('email Ana the figures', {
      hasRepo: false,
      tier: 'session',
      channel: 'gmail',
    });
    expect(one.map((q) => q.id)).toEqual(['send-to:gmail', 'send-say']);
    expect(one[0].ask).toBe('Who should this go to?');
  });

  it('the send facts survive the cap, because they are the job’s own content', () => {
    // A sentence that would also earn narrowing questions: unbounded, no
    // format named. Four facts would have pushed the message out of a
    // three-question slice.
    const got = questionsFor('improve everything about the launch and tell them all', {
      hasRepo: false,
      tier: 'session',
      channel: 'calendar',
      channels: ['calendar', 'gmail'],
    });
    expect(got.filter((q) => q.id.startsWith('send-')).map((q) => q.id)).toEqual([
      'send-to:calendar',
      'send-say:calendar',
      'send-to:gmail',
      'send-say',
    ]);
  });

  it('calendar keeps its title beside itself — a title is not a message', () => {
    const got = questionsFor('book the review and email the agenda', {
      hasRepo: false,
      tier: 'session',
      channel: 'calendar',
      channels: ['calendar', 'gmail'],
    });
    expect(got.find((q) => q.id === 'send-say:calendar')?.label).toBe('Title');
    // And the shared Say is still the message for the channels that send one.
    expect(got.find((q) => q.id === 'send-say')?.label).toBe('Say');
  });

  it('a calendar-only job is asked no message at all', () => {
    const got = questionsFor('add the dentist to my calendar thursday 4pm', {
      hasRepo: false,
      tier: 'session',
      channel: 'calendar',
    });
    expect(got.map((q) => q.id)).toEqual(['send-to:calendar', 'send-say:calendar']);
  });

  it('each channel’s answer rides as its own line, naming the channel', () => {
    const lines = clarificationLines(
      'telegram Pepo the UF and email the figures to Ana',
      {
        hasRepo: false,
        tier: 'session',
        channel: 'telegram',
        channels: ['telegram', 'gmail'],
      },
      {
        'send-to:telegram': '6783316106',
        'send-to:gmail': 'ana@example.com',
        'send-say': 'the UF and the dollar for today',
      },
    );
    expect(lines).toEqual([
      'Who should this go to on Telegram? 6783316106',
      'Who should this go to on Gmail? ana@example.com',
      'What should it say, roughly? the UF and the dollar for today',
    ]);
  });

  it('an address given for one channel never rides as another’s', () => {
    const lines = clarificationLines(
      'telegram Pepo the UF and email the figures to Ana',
      {
        hasRepo: false,
        tier: 'session',
        channel: 'telegram',
        channels: ['telegram', 'gmail'],
      },
      { 'send-to:gmail': 'ana@example.com' },
    );
    expect(lines).toEqual(['Who should this go to on Gmail? ana@example.com']);
  });

  /**
   * A chain queued before the ids carried a channel still has its answers on
   * the job (D-177), so the old key has to keep working — for the first
   * channel only, which is the one it was collected for.
   */
  it('an answer stored under the old key still reaches the first channel', () => {
    const lines = clarificationLines(
      'telegram Pepo the UF and email the figures to Ana',
      {
        hasRepo: false,
        tier: 'session',
        channel: 'telegram',
        channels: ['telegram', 'gmail'],
      },
      { 'send-to': '6783316106' },
    );
    expect(lines).toEqual(['Who should this go to on Telegram? 6783316106']);
  });
});

describe('questionsFor: the dangling subject', () => {
  it('asks what a bare pronoun refers to', () => {
    expect(ids('fix it')).toContain('subject');
    expect(ids('make this faster')).toContain('subject');
    expect(ids('clean that up', NO_REPO)).toContain('subject');
  });

  it('leaves a long sentence alone, where the pronoun has something to bind to', () => {
    const long = 'add tests for formatUsd so that it handles an empty ledger without throwing';
    expect(ids(long)).not.toContain('subject');
  });

  it('is free text — there is nothing sensible to offer', () => {
    const [q] = questionsFor('fix it', REPO);
    expect(q.freeText).toBe(true);
    expect(q.options).toEqual([]);
  });
});

describe('questionsFor: the starting point', () => {
  it('asks for a file when there is a repo and none was named', () => {
    expect(ids('tighten up the error handling')).toContain('target');
  });

  it('does not ask when there is no repo to look in', () => {
    expect(ids('tighten up the error handling', NO_REPO)).not.toContain('target');
  });

  it('offers to let them look, so it is never a blocker', () => {
    const q = questionsFor('tighten up the error handling', REPO).find((x) => x.id === 'target');
    expect(q?.options.map((o) => o.label)).toEqual(['let them find it']);
    expect(q?.freeText).toBe(true);
  });
});

describe('questionsFor: the shape of the answer', () => {
  it('asks when the job is to go and find something and there is no repo', () => {
    expect(ids('find the price of Nike soccer shoes size 9', NO_REPO)).toContain('shape');
    expect(ids('compare the two hosting providers', NO_REPO)).toContain('shape');
  });

  it('does not ask when the job lands in a project instead', () => {
    expect(ids('find the price of Nike soccer shoes size 9', REPO)).not.toContain('shape');
  });
});

// Found by test drive, not by a unit test: the rules only knew about fetching
// verbs, so the vaguest brief the box can take was asked nothing at all.
describe('questionsFor: a brief that says what to make but not what to say', () => {
  it('asks what goes in it, repo or not', () => {
    expect(ids('Produce a PDF')).toContain('about');
    expect(ids('Produce a PDF', NO_REPO)).toContain('about');
    expect(ids('write a report', NO_REPO)).toContain('about');
    expect(ids('make a spreadsheet', NO_REPO)).toContain('about');
  });

  it('stays quiet once the brief says what it is about', () => {
    expect(ids('Produce a PDF of last week jobs', NO_REPO)).not.toContain('about');
    expect(ids('write a summary about the socket work', NO_REPO)).not.toContain('about');
    expect(ids('make a list of every exported function', NO_REPO)).not.toContain('about');
  });

  it('stays quiet when a target names the subject', () => {
    expect(ids('write a note in NOTES.md')).not.toContain('about');
    expect(ids('write EXPORTS.md')).not.toContain('about');
  });

  it('does not ask the format when the brief already named one', () => {
    expect(ids('Produce a PDF', NO_REPO)).not.toContain('shape');
    expect(ids('make a spreadsheet', NO_REPO)).not.toContain('shape');
  });

  it('does ask the format when the brief named none', () => {
    expect(ids('write a report', NO_REPO)).toContain('shape');
  });

  it('leaves repo work alone — its output is a change to the code', () => {
    expect(ids('write a report')).not.toContain('shape');
  });
});

describe('questionsFor: unbounded scope', () => {
  it('asks how far, on the words that name no bound', () => {
    for (const text of [
      'clean up the whole project',
      'improve the tests',
      'refactor everything in the server',
      'optimise the socket properly',
    ]) {
      expect(ids(text)).toContain('scope');
    }
  });

  it('does not ask when the work is already bounded', () => {
    expect(ids('add a test for formatUsd rounding')).not.toContain('scope');
  });
});

describe('questionsFor: never a form', () => {
  it('asks at most three, however bad the sentence', () => {
    const awful = 'improve all the things and clean up everything properly';
    expect(questionsFor(awful, REPO).length).toBeLessThanOrEqual(3);
  });

  it('gives every question a distinct id, so answers cannot collide', () => {
    const qs = questionsFor('just improve it', REPO);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it('is deterministic — the same sentence asks the same things', () => {
    const once = questionsFor('clean up the whole project', REPO);
    const twice = questionsFor('clean up the whole project', REPO);
    expect(once).toEqual(twice);
  });
});

describe('clarificationLines', () => {
  const text = 'tighten up the error handling';

  it('is empty when nothing was answered', () => {
    expect(clarificationLines(text, REPO, undefined)).toEqual([]);
    expect(clarificationLines(text, REPO, {})).toEqual([]);
  });

  it('turns a typed answer into an instruction', () => {
    expect(clarificationLines(text, REPO, { target: 'server/src/ledger.ts' })).toEqual([
      'Which file or folder should they start from? server/src/ledger.ts',
    ]);
  });

  it('expands a chosen option into what the session is actually told', () => {
    const lines = clarificationLines('find the price of running shoes', NO_REPO, {
      shape: 'a table',
    });
    expect(lines).toEqual(['What should come back? Answer as a table with the figures set out.']);
  });

  it('ignores answers to questions this sentence never raised', () => {
    expect(clarificationLines(text, REPO, { nonsense: 'delete everything' })).toEqual([]);
  });

  it('ignores a blank answer rather than sending an empty instruction', () => {
    expect(clarificationLines(text, REPO, { target: '   ' })).toEqual([]);
  });

  it('keeps the order the questions were asked in', () => {
    const lines = clarificationLines('just improve it', REPO, {
      scope: 'the clearest cases only',
      subject: 'the retry loop',
      target: 'let them find it',
    });
    expect(lines[0]).toContain('the retry loop');
    expect(lines[lines.length - 1]).toContain('clearest cases');
  });
});

/**
 * The bare send (D-097). A sentence that names no message has none anywhere,
 * so the desk asks for the words themselves rather than a gist — and the
 * test is what is *left* after the send words, the channel words and the
 * people this channel knows, because a subject test cannot work: "on
 * Telegram" and "with a summary" are the same preposition.
 */
describe('telling a bare send from one that carries content', () => {
  const NAMES = ['Brian Thornton', 'Jose Dussaillant', 'Jose Dussaillant (Pepo)'];
  const SEND = { hasRepo: false, tier: 'session' as const, channel: 'telegram', names: NAMES };
  const say = (text: string) => questionsFor(text, SEND).find((q) => q.id === 'send-say');

  it('asks for the words when the sentence names no message', () => {
    for (const text of [
      'I need to send a Telegram to Pepo',
      'Send a message to Pepo on Telegram',
      'shoot Pepo a telegram',
    ]) {
      expect(bareSend(text, NAMES), text).toBe(true);
      expect(say(text)?.ask, text).toBe('What should the message say?');
      expect(say(text)?.label, text).toBe('Words');
      expect(say(text)?.hint, text).toContain('as written');
    }
  });

  it('keeps the rough direction when there is something to write', () => {
    for (const text of [
      'Send Pepo the current Warzone meta summary on Telegram.',
      'Send me a Telegram with the latest Call of Duty: Warzone meta',
      'Text Pepo about dinner on Telegram',
      'Email Brian the Q3 numbers',
    ]) {
      expect(bareSend(text, NAMES), text).toBe(false);
      expect(say(text)?.ask, text).toBe('What should it say, roughly?');
      expect(say(text)?.label, text).toBe('Say');
    }
  });

  /**
   * The channel is an address, not a subject — this is the case that kills a
   * subject-preposition test, since "on Telegram" supplies the very evidence
   * such a test looks for.
   */
  it('does not read the channel word as the message', () => {
    expect(bareSend('Send a message to Pepo on Telegram', NAMES)).toBe(true);
  });

  /** A recipient is not a subject either — but only a known one can be told apart. */
  it('reads an unknown recipient as content, which is the old wording', () => {
    expect(bareSend('Send a telegram to Marcelo', NAMES)).toBe(false);
    expect(bareSend('Send a telegram to Marcelo', [...NAMES, 'Marcelo Rios'])).toBe(true);
  });

  it('asks nothing extra when no channel is in play', () => {
    expect(questionsFor('I need to send a Telegram to Pepo', NO_REPO)).toEqual([]);
  });
});

describe('the send the desk can compose without a session', () => {
  const NAMES = ['Jose Dussaillant (Pepo)'];
  const ctx = { channel: 'telegram', names: NAMES };
  const BARE = 'I need to send a Telegram to Pepo';
  const answers = { 'send-to': 'Jose Dussaillant — 6783316106', 'send-say': 'A DARLE' };

  it('holds both facts of a bare send', () => {
    expect(sendFacts(BARE, ctx, answers)).toEqual({
      to: 'Jose Dussaillant — 6783316106',
      words: 'A DARLE',
    });
  });

  it('refuses when there is a message to write', () => {
    expect(sendFacts('Text Pepo about dinner on Telegram', ctx, answers)).toBeNull();
  });

  it('refuses on a missing fact, since half a send composes nothing', () => {
    expect(sendFacts(BARE, ctx, { 'send-to': answers['send-to'] })).toBeNull();
    expect(sendFacts(BARE, ctx, { 'send-say': 'A DARLE' })).toBeNull();
    expect(sendFacts(BARE, ctx, { ...answers, 'send-say': '   ' })).toBeNull();
  });

  it('refuses without a channel, which is what makes it a send at all', () => {
    expect(sendFacts(BARE, { names: NAMES }, answers)).toBeNull();
  });

  /**
   * The hint's own escape hatch, matched as a fixed opening rather than a
   * fuzzy read of intent — D-093 refused fuzzy verb matching on the way in
   * and this is the same judgement on the way out.
   */
  it('hands it back to a session when the user asks for a draft', () => {
    expect(sendFacts(BARE, ctx, { ...answers, 'send-say': 'write it out: tell him I am late' })).toBeNull();
    expect(draftingAsk('write it out: tell him I am late')).toBe('tell him I am late');
  });

  it('leaves words that merely contain the phrase alone', () => {
    const said = 'tell him to write it out before Friday';
    expect(draftingAsk(said)).toBeNull();
    expect(sendFacts(BARE, ctx, { ...answers, 'send-say': said })?.words).toBe(said);
  });
});

/**
 * The escape hatch is addressed to the desk, not to the crew (D-097). Once
 * it has done its work — sending the job to a session instead of composing
 * it — the phrase is noise in the brief, and reads as part of what to write.
 */
describe('clarificationLines: the drafting request is spent at the desk', () => {
  const CTX = {
    hasRepo: false,
    tier: 'session' as const,
    channel: 'telegram',
    names: ['Jose Dussaillant (Pepo)'],
  };
  const BARE = 'I need to send a Telegram to Pepo';

  it('forwards the direction without the phrase that requested it', () => {
    const lines = clarificationLines(BARE, CTX, {
      'send-to': 'Jose Dussaillant — 6783316106',
      'send-say': 'write it out: tell him I am running late',
    });
    expect(lines[1]).toBe('What should the message say? tell him I am running late');
    expect(lines[1]).not.toContain('write it out');
  });

  it('leaves an ordinary answer exactly as typed', () => {
    const lines = clarificationLines(BARE, CTX, {
      'send-to': 'Jose Dussaillant — 6783316106',
      'send-say': 'A DARLE',
    });
    expect(lines[1]).toBe('What should the message say? A DARLE');
  });

  // The words only *contain* the phrase — stripping there would eat the message.
  it('does not strip it from the middle of a message', () => {
    const said = 'tell him to write it out before Friday';
    const lines = clarificationLines(BARE, CTX, {
      'send-to': 'Jose Dussaillant — 6783316106',
      'send-say': said,
    });
    expect(lines[1]).toBe(`What should the message say? ${said}`);
  });
});

/**
 * Calendar asks its own two facts (D-124, revising D-104's silence): who is
 * invited — optional, the 'Invitees' label the arrest reads — and the
 * title, verbatim. Times stay the sentence's job.
 */
describe('questionsFor: the calendar channel', () => {
  const CAL = { hasRepo: false, tier: 'session' as const, channel: 'calendar' };

  it('asks who is invited and what it is called, in calendar words', () => {
    const got = questionsFor('add the dentist to my calendar thursday 4pm', CAL);
    const to = got.find((q) => q.id.startsWith('send-to'));
    const say = got.find((q) => q.id.startsWith('send-say'));
    expect(to?.label).toBe('Invitees');
    expect(to?.hint).toContain('empty');
    expect(say?.label).toBe('Title');
    expect(say?.hint).toContain('exactly as written');
  });

  it('never takes the compose shortcut — an event needs times only a session parses', () => {
    // The settled-channel case: a pick or a schedule replay carries
    // channel without the word in the sentence, which is the one way a
    // calendar job's text can read bare. The telegram twin keeps the test
    // honest — the same sentence composes there, so the null below is the
    // guard refusing and not the sentence never being bare at all.
    const answers = { 'send-to': 'Andy — andy@x.com', 'send-say': 'Budget review' };
    expect(
      sendFacts('Send a message to Andy', { channel: 'telegram', names: ['Andy'] }, answers),
    ).toEqual({ to: 'Andy — andy@x.com', words: 'Budget review' });
    expect(
      sendFacts('Send a message to Andy', { channel: 'calendar', names: ['Andy'] }, answers),
    ).toBeNull();
  });

  it('slack and github asks carry their own To hints', () => {
    const slackQs = questionsFor('message the team on slack', {
      hasRepo: false,
      tier: 'session',
      channel: 'slack',
    });
    expect(slackQs.find((q) => q.id.startsWith('send-to'))?.hint).toContain('#general');
    const ghQs = questionsFor('comment on the issue on github', {
      hasRepo: false,
      tier: 'session',
      channel: 'github',
    });
    expect(ghQs.find((q) => q.id.startsWith('send-to'))?.hint).toContain('owner/repo#123');
  });
});
