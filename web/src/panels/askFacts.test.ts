import { describe, expect, it } from 'vitest';
import { alsoAskedLine } from './askFacts';

/**
 * D-178 made the second channel visible; D-179 made it *sendable*, so what
 * this line says changed with it. Carried is now every wired channel the
 * sentence asked for — one job, one message set each — and dropped is only a
 * channel no client can send, which is still named rather than swallowed.
 */
describe('alsoAskedLine (D-178, D-179)', () => {
  const ask = {
    asked: 'telegram',
    askedLabel: 'Telegram',
    state: 'ready',
    channel: 'telegram',
    also: [{ channel: 'gmail', label: 'Gmail', state: 'connectable' as const, detail: '' }],
  };

  it('says nothing when one channel was asked for', () => {
    expect(alsoAskedLine({ ...ask, also: [] }, null)).toBeNull();
    expect(alsoAskedLine({ asked: 'gmail', askedLabel: 'Gmail', state: 'ready' }, null)).toBeNull();
  });

  it('carries every wired channel, and drops none of them', () => {
    const line = alsoAskedLine(ask, null);
    expect(line?.carried.map((c) => c.channel)).toEqual(['telegram', 'gmail']);
    expect(line?.dropped).toEqual([]);
  });

  it('a pick leads the list without dropping the other', () => {
    const line = alsoAskedLine(ask, 'gmail');
    expect(line?.carried.map((c) => c.channel)).toEqual(['gmail', 'telegram']);
    expect(line?.dropped).toEqual([]);
  });

  it('a channel nothing can send is still named as dropped', () => {
    const line = alsoAskedLine(
      {
        asked: 'whatsapp',
        askedLabel: 'WhatsApp',
        state: 'never',
        also: [{ channel: 'gmail', label: 'Gmail', state: 'ready' as const, detail: '' }],
      },
      null,
    );
    expect(line?.carried.map((c) => c.channel)).toEqual(['gmail']);
    expect(line?.dropped.map((d) => d.channel)).toEqual(['whatsapp']);
  });

  it('a sentence whose channels can none of them send carries nothing', () => {
    const line = alsoAskedLine(
      {
        asked: 'whatsapp',
        askedLabel: 'WhatsApp',
        state: 'never',
        also: [{ channel: 'sms', label: 'SMS', state: 'planned' as const, detail: 'planned' }],
      },
      null,
    );
    expect(line?.carried).toEqual([]);
    expect(line?.dropped.map((d) => d.channel)).toEqual(['whatsapp', 'sms']);
  });
});
import {
  authoringSentence,
  matchRecipient,
  missingAttachment,
  missingRecipient,
  missingWords,
  recipientProblem,
} from './askFacts';

const BRIAN = { id: '8633678680', name: 'Brian Thornton', viaStart: true, sends: 1 };
const JOSE = {
  id: '6783316106',
  name: 'Jose Dussaillant',
  aliases: ['Jose Dussaillant (Pepo)'],
  viaStart: true,
  sends: 1,
};

describe('matchRecipient (D-094)', () => {
  it('finds Jose through the alias a reviewed send taught the roster', () => {
    expect(matchRecipient('Now send the same Telegram to Pepo', [BRIAN, JOSE])?.id).toBe(
      '6783316106',
    );
  });

  it('matches a plain first name, whole-word and case-blind', () => {
    expect(matchRecipient('send brian the summary on telegram', [BRIAN, JOSE])?.id).toBe(
      '8633678680',
    );
  });

  it('an ambiguous sentence prefills nobody', () => {
    const twins = [JOSE, { ...BRIAN, name: 'Jose Miguel' }];
    expect(matchRecipient('send it to Jose on telegram', twins)).toBeNull();
  });

  it('"me", short words and absent names prefill nobody', () => {
    expect(matchRecipient('Send me a Telegram with the meta', [BRIAN, JOSE])).toBeNull();
    expect(matchRecipient('send the reminder to Ana', [BRIAN, JOSE])).toBeNull();
  });

  it('never fires on a substring — Brianna is not Brian', () => {
    expect(matchRecipient('send Brianna the notes on telegram', [BRIAN])).toBeNull();
  });
});

describe('recipientProblem (D-091)', () => {
  it('a name is not a chat id — the 71¢ wall, caught at the desk', () => {
    expect(recipientProblem('telegram', 'Pepo Dussaillant')).toBe(
      '“Pepo Dussaillant” isn’t a chat id',
    );
  });

  it('digits anywhere satisfy the chat-id shape, name included', () => {
    expect(recipientProblem('telegram', '8633678680')).toBeNull();
    expect(recipientProblem('telegram', 'Brian — 8633678680')).toBeNull();
    expect(recipientProblem('whatsapp-business', '+56 9 1234 5678')).toBeNull();
  });

  it('gmail wants an @, not a name', () => {
    expect(recipientProblem('gmail', 'Ana')).toBe('“Ana” isn’t an email address');
    expect(recipientProblem('gmail', 'ana@example.com')).toBeNull();
  });

  it('whatsapp-business without digits names its want', () => {
    expect(recipientProblem('whatsapp-business', 'Pepo')).toBe('“Pepo” isn’t a number');
  });

  it('a channel with no declared shape objects to nothing', () => {
    // Slack held this role until D-104 gave it a shape; discord is still bare.
    expect(recipientProblem('discord', 'the team')).toBeNull();
  });

  it('a long wrong value is quoted truncated, not in full', () => {
    const long = 'Pepo Dussaillant of the Warzone squad, the tall one';
    const problem = recipientProblem('telegram', long)!;
    expect(problem).toContain('…');
    expect(problem.length).toBeLessThan(long.length + 20);
  });
});

describe('missingWords — the contract’s other un-inventable fact (D-087)', () => {
  const WORDS = [{ id: 'send-say', label: 'Words' }];
  const SAY = [{ id: 'send-say', label: 'Say' }];

  it('a bare send with the field empty is a doomed queue — the 26.8¢ wall', () => {
    expect(missingWords(WORDS, undefined)).toBe(true);
    expect(missingWords(WORDS, '   ')).toBe(true);
  });

  it('typed words clear it — “write it out” included, that session is chosen', () => {
    expect(missingWords(WORDS, 'A DARLE 💪')).toBe(false);
    expect(missingWords(WORDS, 'write it out: something warm')).toBe(false);
  });

  it('a content-bearing sentence (“Say”) may stay empty — writing it is the job', () => {
    expect(missingWords(SAY, '')).toBe(false);
    expect(missingWords(SAY, undefined)).toBe(false);
  });

  it('no say question asked, nothing to miss', () => {
    expect(missingWords([{ id: 'send-to' }], undefined)).toBe(false);
    expect(missingWords([], '')).toBe(false);
  });
});

describe('recipientProblem — slack and github (D-104)', () => {
  it('slack wants one token: a name with spaces and an email both arrest', () => {
    expect(recipientProblem('slack', '#general')).toBeNull();
    expect(recipientProblem('slack', 'C08ABCDEF')).toBeNull();
    expect(recipientProblem('slack', 'Brian Thornton')).toContain('#general');
    expect(recipientProblem('slack', 'me@example.com')).toContain('member id');
  });

  it('github wants the full reference', () => {
    expect(recipientProblem('github', 'briant92/Agentlings#12')).toBeNull();
    expect(recipientProblem('github', 'issue 12')).toContain('owner/repo#123');
    expect(recipientProblem('github', 'Agentlings#12')).toContain('owner/repo#123');
  });

  it('calendar wants an address in every comma part (D-124)', () => {
    expect(recipientProblem('calendar', 'Andy — andytg1111@gmail.com')).toBeNull();
    expect(
      recipientProblem('calendar', 'Andy — andy@x.com, Ana García — ana@y.com'),
    ).toBeNull();
    expect(recipientProblem('calendar', 'Ana García')).toContain('comma-separated');
    expect(recipientProblem('calendar', 'andy@x.com, Ana García')).toContain('comma-separated');
  });
});

describe('missingRecipient (D-124, D-180)', () => {
  const TO = (channel: string, label?: string) => ({
    id: `send-to:${channel}`,
    channel,
    ...(label ? { label } : {}),
  });

  it('an empty To dooms every messaging channel, as before', () => {
    expect(missingRecipient([TO('telegram')], {})).toEqual(['telegram']);
    expect(missingRecipient([TO('telegram')], { 'send-to:telegram': '  ' })).toEqual(['telegram']);
    expect(
      missingRecipient([TO('telegram')], { 'send-to:telegram': 'Brian — 8633678680' }),
    ).toEqual([]);
  });

  it('names only the channels actually empty, so the fix is obvious', () => {
    const both = [TO('telegram'), TO('gmail')];
    expect(missingRecipient(both, { 'send-to:telegram': '123' })).toEqual(['gmail']);
    expect(missingRecipient(both, {})).toEqual(['telegram', 'gmail']);
    expect(
      missingRecipient(both, { 'send-to:telegram': '123', 'send-to:gmail': 'a@b.com' }),
    ).toEqual([]);
  });

  it('empty Invitees queue — an event for just you is the ordinary case', () => {
    expect(missingRecipient([TO('calendar', 'Invitees')], {})).toEqual([]);
    // And a calendar beside a real send still reports only the send's gap.
    expect(missingRecipient([TO('calendar', 'Invitees'), TO('gmail')], {})).toEqual(['gmail']);
  });

  it('no To question, nothing missing', () => {
    expect(missingRecipient([], {})).toEqual([]);
  });
});

describe('missingAttachment (D-134)', () => {
  it('a sentence leaning on an attachment arrests an empty queue — the 5.3c wall', () => {
    expect(missingAttachment('Total the attached expenses by category and draw a chart', 0)).toBe(
      true,
    );
    expect(missingAttachment('Summarise the attachment', 0)).toBe(true);
    expect(missingAttachment('compare the two ATTACHMENTS', 0)).toBe(true);
  });

  it('a file on the queue clears it', () => {
    expect(missingAttachment('Total the attached expenses by category', 1)).toBe(false);
  });

  it('the bare verb never claims — "attach a summary" is about the run’s own output', () => {
    expect(missingAttachment('write the report and attach a summary to it', 0)).toBe(false);
  });

  it('detached and unattached are not attached', () => {
    expect(missingAttachment('move the detached notes into the archive', 0)).toBe(false);
    expect(missingAttachment('list the unattached fixtures', 0)).toBe(false);
  });

  // The outbound shape (D-159): "as an attachment" asks for the run's own
  // file to ride the send, which the outbox now really does — no claim
  // about the queue, so no arrest.
  it('"as an attachment" asks for output, not input — it queues', () => {
    expect(missingAttachment('email me the report as an attachment', 0)).toBe(false);
    expect(missingAttachment('send the summary as attachments to the team', 0)).toBe(false);
    expect(missingAttachment('telegram it to Brian as an attached file', 0)).toBe(false);
  });

  it('an inbound claim beside an outbound ask still arrests', () => {
    expect(missingAttachment('email the attached contract to Ana as an attachment', 0)).toBe(true);
  });

  it('an ordinary sentence says nothing about attachments', () => {
    expect(missingAttachment('tidy the notes', 0)).toBe(false);
  });
});

describe('authoringSentence (D-144)', () => {
  it('the proof sentence arrests — typed at the desk, it went to a worker', () => {
    expect(
      authoringSentence('Build me a level inspired in The Odyssey, with a 3D backdrop of the sea monster'),
    ).toBe(true);
  });

  it('the creating forms fire, whatever the article or a stray adjective', () => {
    expect(authoringSentence('make a new level about the deep sea')).toBe(true);
    expect(authoringSentence('author a world set in a lighthouse')).toBe(true);
    expect(authoringSentence('create an underwater world')).toBe(true);
    expect(authoringSentence('design us a quiet level for finance work')).toBe(true);
  });

  it('the level as this codebase’s noun queues untouched', () => {
    expect(authoringSentence('make the level select screen faster')).toBe(false);
    expect(authoringSentence('fix the level card thumbnails')).toBe(false);
    expect(authoringSentence('build the level list from the API')).toBe(false);
  });

  it('building other things is not authoring', () => {
    expect(authoringSentence('build me a dashboard for the ledger')).toBe(false);
    expect(authoringSentence('create a summary of this repo')).toBe(false);
    expect(authoringSentence('tidy the notes')).toBe(false);
  });
});
