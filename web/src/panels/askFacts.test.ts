import { describe, expect, it } from 'vitest';
import { matchRecipient, missingWords, recipientProblem } from './askFacts';

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
});
