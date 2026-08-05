import { describe, expect, it } from 'vitest';
import { recipientProblem } from './askFacts';

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
    expect(recipientProblem('slack', 'the team')).toBeNull();
  });

  it('a long wrong value is quoted truncated, not in full', () => {
    const long = 'Pepo Dussaillant of the Warzone squad, the tall one';
    const problem = recipientProblem('telegram', long)!;
    expect(problem).toContain('…');
    expect(problem.length).toBeLessThan(long.length + 20);
  });
});
