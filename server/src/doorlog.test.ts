import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { doorLine, logDoor } from './doorlog';

const AT = 1787000000000;

describe('the door trail', () => {
  it('records the ask and the first line of the answer', () => {
    const line = JSON.parse(
      doorLine(
        'mail',
        'mail_search',
        { query: 'newer_than:1d' },
        { text: '16 messages for "newer_than:1d", newest first:\nMon…' },
        AT,
      ),
    );
    expect(line).toEqual({
      at: AT,
      door: 'mail',
      tool: 'mail_search',
      args: '{"query":"newer_than:1d"}',
      ok: true,
      head: '16 messages for "newer_than:1d", newest first:',
    });
  });

  it('marks a refused call and keeps the sentence', () => {
    const line = JSON.parse(
      doorLine('calendar', 'calendar_events', {}, { error: 'Google refused the calendar — x' }, AT),
    );
    expect(line.ok).toBe(false);
    expect(line.head).toBe('Google refused the calendar — x');
  });

  it('clips long args and heads rather than copying the answer', () => {
    const line = JSON.parse(
      doorLine('web', 'fetch_page', { url: 'x'.repeat(500) }, { text: 'y'.repeat(500) }, AT),
    );
    expect(line.args.length).toBeLessThanOrEqual(201);
    expect(line.args.endsWith('…')).toBe(true);
    expect(line.head.length).toBeLessThanOrEqual(161);
    expect(line.head.endsWith('…')).toBe(true);
  });

  it('says something even for a result that is neither text nor error', () => {
    const line = JSON.parse(doorLine('render', 'render_pdf', {}, { width: 800 } as never, AT));
    expect(line.ok).toBe(true);
    expect(line.head).toBe('{"width":800}');
  });

  it('appends one line per call, and a bad root swallows rather than throws', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'doors-'));
    logDoor(dir, 'mail', 'mail_search', { query: 'a' }, { text: 'ok' }, AT);
    logDoor(dir, 'mail', 'mail_read', { id: 'm1' }, { error: 'no' }, AT + 1);
    const lines = readFileSync(path.join(dir, 'doors.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).tool).toBe('mail_read');

    expect(() =>
      logDoor(path.join(dir, 'no', 'such', 'dir'), 'web', 'fetch_page', {}, { text: '' }, AT),
    ).not.toThrow();
  });
});
