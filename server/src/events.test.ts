import { describe, expect, it } from 'vitest';
import { EventLog } from './events';

describe('EventLog', () => {
  it('assigns increasing ids and notifies on emit', () => {
    const seen: number[] = [];
    const log = new EventLog((e) => seen.push(e.id));
    log.emit({ type: 'queued', jobId: 'j1', title: 'A' });
    log.emit({ type: 'started', jobId: 'j1', title: 'A', agentling: 'Pip' });
    expect(seen).toEqual([1, 2]);
    expect(log.history().map((e) => e.type)).toEqual(['queued', 'started']);
  });

  it('caps the replay buffer at 200 events', () => {
    const log = new EventLog(() => {});
    for (let i = 0; i < 250; i++) {
      log.emit({ type: 'queued', jobId: `j${i}`, title: 'x' });
    }
    const history = log.history();
    expect(history.length).toBe(200);
    expect(history[0].id).toBe(51);
    expect(history[history.length - 1].id).toBe(250);
  });
});
