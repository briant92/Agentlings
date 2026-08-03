import { describe, expect, it } from 'vitest';
import type { Http } from './library';
import { SEARCH_TOOL_NAMES, callSearch } from './search';

/** A fake Custom Search: no network, and it records the URL it was asked for. */
function fake(
  payload: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): { http: Http; urls: string[] } {
  const urls: string[] = [];
  const http: Http = async (url) => {
    urls.push(url);
    return { ok, status, text: async () => JSON.stringify(payload) };
  };
  return { http, urls };
}

const RESULTS = {
  items: [
    {
      title: 'A <b>page</b> about it',
      snippet: 'The <b>answer</b> is in\n  here somewhere.',
      link: 'https://example.com/a',
    },
    { title: 'Another', snippet: 'More.', link: 'https://example.com/b' },
  ],
};

const KEYS = { key: 'k', cx: 'engine-1' };

describe('callSearch', () => {
  it('grants one tool, and refuses any other name', async () => {
    expect(SEARCH_TOOL_NAMES).toEqual(['search_web']);
    const { http } = fake(RESULTS);
    expect(await callSearch('search_everything', { query: 'x' }, { http, ...KEYS })).toEqual({
      error: 'no such tool: search_everything',
    });
  });

  it('returns each result as title, link and snippet', async () => {
    const { http } = fake(RESULTS);
    const { text } = await callSearch('search_web', { query: 'the answer' }, { http, ...KEYS });
    expect(text).toContain('1. A page about it');
    expect(text).toContain('https://example.com/a');
    // Markup stripped and the wrapped snippet collapsed onto one line.
    expect(text).toContain('The answer is in here somewhere.');
    expect(text).not.toContain('<b>');
  });

  // Search finds, `fetch_page` reads. Saying so is what stops a session
  // treating a two-line snippet as the answer.
  it('says how to read one', async () => {
    const { http } = fake(RESULTS);
    const { text } = await callSearch('search_web', { query: 'x' }, { http, ...KEYS });
    expect(text).toContain('fetch_page');
  });

  it('asks for the count it was given, clamped to what Google allows', async () => {
    const { http, urls } = fake(RESULTS);
    await callSearch('search_web', { query: 'x', count: 99 }, { http, ...KEYS });
    expect(urls[0]).toContain('num=10');
    await callSearch('search_web', { query: 'x', count: 0 }, { http, ...KEYS });
    expect(urls[1]).toContain('num=5');
  });

  it('escapes everything it puts in the URL, not just the query', async () => {
    const { http, urls } = fake(RESULTS);
    await callSearch('search_web', { query: 'a b&c=d' }, { http, key: 'k/1', cx: 'e&2' });
    expect(urls[0]).toContain('q=a%20b%26c%3Dd');
    expect(urls[0]).toContain('key=k%2F1');
    expect(urls[0]).toContain('cx=e%262');
  });

  /**
   * Both halves are required and they fail differently: no key is "you have not
   * set this up", no engine id is "you set up half of it". Reported before
   * calling out, because Google refuses either way and asking would spend a
   * turn to be told the same thing.
   */
  describe('when it is not configured', () => {
    it('names the key when that is what is missing', async () => {
      const { http, urls } = fake(RESULTS);
      const result = await callSearch('search_web', { query: 'x' }, { http, cx: 'e' });
      expect(result.error).toContain('GOOGLE_API_KEY');
      expect(result.error).not.toContain('GOOGLE_CSE_ID');
      expect(urls).toEqual([]);
    });

    it('names the engine id when only that is missing', async () => {
      const { http } = fake(RESULTS);
      const result = await callSearch('search_web', { query: 'x' }, { http, key: 'k' });
      expect(result.error).toContain('GOOGLE_CSE_ID');
      expect(result.error).not.toContain('GOOGLE_API_KEY');
    });

    it('names both when neither is set', async () => {
      const { http } = fake(RESULTS);
      const result = await callSearch('search_web', { query: 'x' }, { http });
      expect(result.error).toContain('GOOGLE_API_KEY');
      expect(result.error).toContain('GOOGLE_CSE_ID');
    });
  });

  it('requires a query', async () => {
    const { http } = fake(RESULTS);
    expect((await callSearch('search_web', { query: '   ' }, { http, ...KEYS })).error).toBe(
      'query is required',
    );
  });

  /**
   * Google puts the actionable part in the body and conflates a rejected key
   * with an exhausted quota under 403, so the message is worth more than the
   * status. Passing it through means the session is told what to fix.
   */
  it('passes on what the service said went wrong', async () => {
    const { http } = fake({ error: { message: 'API key not valid. Please pass a valid API key.' } }, { ok: false, status: 400 });
    const { error } = await callSearch('search_web', { query: 'x' }, { http, ...KEYS });
    expect(error).toContain('API key not valid');
  });

  it('falls back to the status when the body says nothing useful', async () => {
    const { http } = fake({}, { ok: false, status: 503 });
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEYS })).error).toContain(
      '503',
    );
  });

  it('does not choke on an error body that is not JSON', async () => {
    const http: Http = async () => ({ ok: false, status: 502, text: async () => '<html>nope' });
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEYS })).error).toContain(
      '502',
    );
  });

  // The likeliest cause of an empty result is a search engine still set to the
  // handful of sites it was created with, so the answer says so.
  it('reports nothing found as an answer, and names the usual cause', async () => {
    const { http } = fake({ items: [] });
    const result = await callSearch('search_web', { query: 'nothing at all' }, { http, ...KEYS });
    expect(result.error).toBeUndefined();
    expect(result.text).toContain('No results');
    expect(result.text).toContain('whole web');
  });

  it('survives a reply that is not the shape it expects', async () => {
    const { http } = fake({ unexpected: true });
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEYS })).text).toContain(
      'No results',
    );
  });

  it('reports an unreachable service rather than throwing', async () => {
    const http: Http = async () => {
      throw new Error('ENOTFOUND');
    };
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEYS })).error).toContain(
      'could not reach',
    );
  });
});
