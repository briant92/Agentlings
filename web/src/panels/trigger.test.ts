import { describe, expect, it } from 'vitest';
import { previewLine } from './trigger';

describe('previewLine — the four states of a trigger rule (D-248)', () => {
  it('states a checked fact, with the newest match, when the rule reaches something', () => {
    const got = previewLine({
      status: 200,
      body: { count: 4, more: false, newest: 'Tue 2026-08-19 09:14 — Banco — Estado', capPerDay: 10 },
    });
    expect(got.tone).toBe('hit');
    expect(got.text).toBe(
      'matched 4 in the last 7 days, none from you · newest: Tue 2026-08-19 09:14 — Banco — Estado',
    );
  });

  it('warns, not errors, when nothing matched — the rule can still fire', () => {
    const got = previewLine({ status: 200, body: { count: 0, more: false, capPerDay: 10 } });
    expect(got.tone).toBe('miss');
    expect(got.text).toContain('nothing matched');
    expect(got.text).toContain('can still fire');
  });

  it('names the spend when the rule is as broad as the cap', () => {
    expect(previewLine({ status: 200, body: { count: 10, more: false, capPerDay: 10 } })).toEqual({
      tone: 'miss',
      text: 'matched 10 this week — at up to 10 firings a day this would spend on nearly every mail',
    });
    expect(previewLine({ status: 200, body: { count: 10, more: true, capPerDay: 10 } }).text).toContain(
      'matched 10+',
    );
  });

  it("repeats the server's own wall when Google is not connected", () => {
    const got = previewLine({ status: 502, body: { error: 'Google is not connected, so mail cannot fire this' } });
    expect(got.tone).toBe('miss');
    expect(got.text).toContain('Google is not connected');
  });

  it('says nothing for a query the server refused', () => {
    expect(previewLine({ status: 400, body: { error: 'a mail trigger needs a Gmail query' } })).toEqual({
      tone: 'idle',
      text: '',
    });
  });
});
