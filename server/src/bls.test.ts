import { describe, expect, it } from 'vitest';
import { BLS_TOOL_NAMES, callBls } from './bls';
import type { Http } from './library';

/** A fake BLS: no network, recording what was actually posted. */
function fake(
  payload: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): { http: Http; calls: { url: string; init?: { method?: string; body?: string } }[] } {
  const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
  const http: Http = async (url, _headers, init) => {
    calls.push({ url, init });
    return { ok, status, text: async () => JSON.stringify(payload) };
  };
  return { http, calls };
}

const CPI = {
  status: 'REQUEST_SUCCEEDED',
  Results: {
    series: [
      {
        seriesID: 'CUUR0000SA0',
        data: [
          { year: '2026', period: 'M07', periodName: 'July', value: '324.1' },
          { year: '2026', period: 'M06', periodName: 'June', value: '323.0' },
          // The annual average, which wears a month's shape.
          { year: '2025', period: 'M13', periodName: 'Annual', value: '318.4' },
        ],
      },
    ],
  },
};

const NOW = Date.UTC(2026, 7, 15);

describe('callBls', () => {
  it('posts the key in the body, never in the URL', async () => {
    const { http, calls } = fake(CPI);
    const got = await callBls(
      'bls_series',
      { seriesIds: 'CUUR0000SA0' },
      { http, token: 'secret-key', now: NOW },
    );
    expect(got.error).toBeUndefined();

    const [call] = calls;
    // The whole reason this door exists rather than the web one.
    expect(call.init?.method).toBe('POST');
    expect(call.url).not.toContain('secret-key');
    expect(call.url).toContain('/publicAPI/v2/');
    const sent = JSON.parse(call.init?.body ?? '{}');
    expect(sent.registrationkey).toBe('secret-key');
    expect(sent.seriesid).toEqual(['CUUR0000SA0']);
    // Two years of window by default, ending this year.
    expect(sent.endyear).toBe('2026');
    expect(sent.startyear).toBe('2025');
  });

  it('drops the annual average and returns months newest first', async () => {
    const { http } = fake(CPI);
    const got = await callBls('bls_series', { seriesIds: 'CUUR0000SA0' }, { http, token: 'k', now: NOW });
    const [series] = got.series!;
    expect(series.seriesId).toBe('CUUR0000SA0');
    // M13 is gone: comparing a year's average against a month reads as a change.
    expect(series.observations.map((o) => o.label)).toEqual(['July 2026', 'June 2026']);
    expect(series.observations[0]).toMatchObject({ year: 2026, month: 7, value: 324.1 });
  });

  it('batches several ids into one call, deduped and upper-cased', async () => {
    const { http, calls } = fake({
      status: 'REQUEST_SUCCEEDED',
      Results: {
        series: [
          { seriesID: 'CUUR0000SA0', data: [] },
          { seriesID: 'LNS14000000', data: [] },
        ],
      },
    });
    await callBls(
      'bls_series',
      { seriesIds: 'cuur0000sa0, LNS14000000 , CUUR0000SA0' },
      { http, token: 'k', now: NOW },
    );
    expect(JSON.parse(calls[0].init?.body ?? '{}').seriesid).toEqual([
      'CUUR0000SA0',
      'LNS14000000',
    ]);
    // One call for the lot — the reason registering is worth it at all.
    expect(calls).toHaveLength(1);
  });

  /**
   * The shape a live call produced, and the reason this test exists in this
   * form: a bad id is **not** omitted. BLS answers REQUEST_SUCCEEDED, echoes
   * the id back with an empty `data`, and explains itself in `message`. The
   * first version of this test asserted the omitted-id shape — which the
   * service never produces — so it passed while the door shipped an empty
   * series to the caller as if it were an answer.
   */
  it('names a series that came back empty, and carries the reason BLS gave', async () => {
    const { http } = fake({
      status: 'REQUEST_SUCCEEDED',
      message: ['Invalid Series for Series NOTASERIES00'],
      Results: {
        series: [
          { seriesID: 'CUUR0000SA0', data: [{ year: '2026', period: 'M07', periodName: 'July', value: '324.1' }] },
          { seriesID: 'NOTASERIES00', data: [] },
        ],
      },
    });
    const got = await callBls(
      'bls_series',
      { seriesIds: 'CUUR0000SA0,NOTASERIES00' },
      { http, token: 'k', now: NOW },
    );
    // Fails the whole call: the good row alone would read as a complete answer.
    expect(got.series).toBeUndefined();
    expect(got.error).toContain('NOTASERIES00');
    expect(got.error).toContain('Invalid Series');
  });

  it('names a series BLS leaves out altogether, for the same reason', async () => {
    const { http } = fake({
      status: 'REQUEST_SUCCEEDED',
      Results: { series: [{ seriesID: 'CUUR0000SA0', data: [] }] },
    });
    const got = await callBls(
      'bls_series',
      { seriesIds: 'CUUR0000SA0,LNS14000000' },
      { http, token: 'k', now: NOW },
    );
    expect(got.series).toBeUndefined();
    expect(got.error).toContain('LNS14000000');
  });

  it('reads the refusal BLS reports inside a 200', async () => {
    const { http } = fake({
      status: 'REQUEST_NOT_PROCESSED',
      message: ['the daily threshold for total number of requests has been reached'],
    });
    const got = await callBls('bls_series', { seriesIds: 'CUUR0000SA0' }, { http, token: 'k', now: NOW });
    // Named, because it is the one thing registering was meant to fix.
    expect(got.error).toContain('quota is used up');
    expect(got.series).toBeUndefined();
  });

  it('refuses without a key instead of falling back to the shared keyless bucket', async () => {
    const { http, calls } = fake(CPI);
    const got = await callBls('bls_series', { seriesIds: 'CUUR0000SA0' }, { http, now: NOW });
    expect(got.error).toContain('BLS_REGISTRATION_KEY');
    expect(got.error).toContain('registrationEngine');
    // And it never reached the network to find that out.
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty ask, an oversized batch, and an unknown tool', async () => {
    const { http } = fake(CPI);
    expect((await callBls('bls_series', {}, { http, token: 'k' })).error).toContain('required');
    const many = Array.from({ length: 51 }, (_, i) => `S${i}`).join(',');
    expect((await callBls('bls_series', { seriesIds: many }, { http, token: 'k' })).error).toContain(
      '50 at most',
    );
    expect((await callBls('nope', { seriesIds: 'X' }, { http, token: 'k' })).error).toContain(
      'no such tool',
    );
  });

  it('says what it is when the service is unreachable or unreadable', async () => {
    const boom: Http = async () => {
      throw new Error('ECONNRESET');
    };
    expect((await callBls('bls_series', { seriesIds: 'X' }, { http: boom, token: 'k' })).error).toContain(
      'ECONNRESET',
    );
    const junk: Http = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    expect((await callBls('bls_series', { seriesIds: 'X' }, { http: junk, token: 'k' })).error).toContain(
      'unreadable',
    );
    const { http } = fake({}, { ok: false, status: 503 });
    expect((await callBls('bls_series', { seriesIds: 'X' }, { http, token: 'k' })).error).toContain('503');
  });

  it('exposes exactly the one tool the catalog grants', () => {
    expect(BLS_TOOL_NAMES).toEqual(['bls_series']);
  });
});
