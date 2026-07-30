import type { JobEvent } from '@agentlings/shared';

const BUFFER_LIMIT = 200;

/** Assigns ids, keeps a replay buffer for new connections, notifies on emit. */
export class EventLog {
  private events: JobEvent[] = [];
  private nextId = 1;

  constructor(private onEmit: (event: JobEvent) => void) {}

  emit(partial: Omit<JobEvent, 'id' | 'at'>): void {
    const event: JobEvent = { ...partial, id: this.nextId++, at: Date.now() };
    this.events.push(event);
    if (this.events.length > BUFFER_LIMIT) this.events.shift();
    this.onEmit(event);
  }

  history(): JobEvent[] {
    return this.events;
  }
}
