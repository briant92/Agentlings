import { describe, expect, it } from 'vitest';
import { noSendLine } from './noSend';

describe('the no-send guard at Approve', () => {
  it('says a refused outbox sends nothing, with the contract’s own reason', () => {
    const line = noSendLine({
      channels: ['telegram'],
      outboxError: 'OUTBOX.json: message 1: "body" is 3325 characters — telegram’s limit is 4096',
    });
    expect(line).toContain('approving keeps the files and sends nothing');
    expect(line).toContain('3325 characters');
  });

  it('says a missing outbox sends nothing too — silence is not a smaller failure', () => {
    const line = noSendLine({ channels: ['gmail'] });
    expect(line).toContain('wrote no outbox');
    expect(line).toContain('sends nothing');
  });

  it('stays quiet when a real outbox is there to show its own cards', () => {
    expect(noSendLine({ channels: ['telegram'], outbox: [{ channel: 'telegram' }] })).toBeNull();
  });

  it('stays quiet on a job that never carried a channel — D-093’s guard owns that', () => {
    expect(noSendLine({ outboxError: 'OUTBOX.json: not valid JSON' })).toBeNull();
    expect(noSendLine({})).toBeNull();
  });
});
