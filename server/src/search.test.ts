import { describe, expect, it } from 'vitest';
import type { Http } from './library';
import { SEARCH_TOOL_NAMES, callSearch } from './search';

/** A fake Brave: no network, and it records the URL it was asked for. */
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
  web: {
    results: [
      {
        title: 'A <strong>page</strong> about it',
        description: 'The <strong>answer</strong> is in here somewhere.',
        url: 'https://example.com/a',
      },
      { title: 'Another', description: 'More.', url: 'https://example.com/b' },
    ],
  },
};

const KEY = { token: 'k' };

describe('callSearch', () => {
  it('grants one tool, and refuses any other name', async () => {
    expect(SEARCH_TOOL_NAMES).toEqual(['search_web']);
    const { http } = fake(RESULTS);
    expect(await callSearch('search_everything', { query: 'x' }, { http, ...KEY })).toEqual({
      error: 'no such tool: search_everything',
    });
  });

  it('returns each result as title, link and snippet', async () => {
    const { http } = fake(RESULTS);
    const { text } = await callSearch('search_web', { query: 'the answer' }, { http, ...KEY });
    expect(text).toContain('1. A page about it');
    expect(text).toContain('https://example.com/a');
    expect(text).toContain('The answer is in here somewhere.');
    // Brave wraps matched terms in <strong>; that is noise in a prompt.
    expect(text).not.toContain('<strong>');
  });

  /**
   * Brave escapes the text around the terms it marks up, so a snippet arrives
   * with tags *and* entities. Seen on the first real search, where an
   * apostrophe came through as `&#x27;` — noise the model pays to read.
   */
  it('decodes the entities Brave escapes, not just the tags', async () => {
    const { http } = fake({
      web: {
        results: [
          {
            title: 'Barcelona&#x27;s season',
            description: 'Tom &amp; Jerry &lt;3 &quot;quoted&quot; &#8212; dash',
            url: 'https://example.com/a',
          },
        ],
      },
    });
    const { text } = await callSearch('search_web', { query: 'x' }, { http, ...KEY });
    expect(text).toContain("Barcelona's season");
    expect(text).toContain('Tom & Jerry <3 "quoted" — dash');
    expect(text).not.toContain('&#');
    expect(text).not.toContain('&amp;');
  });

  // An entity that is not one stays as it was, rather than being eaten.
  it('leaves something that only looks like an entity alone', async () => {
    const { http } = fake({
      web: { results: [{ title: 'A&B', description: 'x &notreal; y', url: 'https://e.com/a' }] },
    });
    const { text } = await callSearch('search_web', { query: 'x' }, { http, ...KEY });
    expect(text).toContain('A&B');
    expect(text).toContain('&notreal;');
  });

  // Search finds, `fetch_page` reads. Saying so is what stops a session
  // treating a two-line snippet as the answer.
  it('says how to read one', async () => {
    const { http } = fake(RESULTS);
    const { text } = await callSearch('search_web', { query: 'x' }, { http, ...KEY });
    expect(text).toContain('fetch_page');
  });

  it('asks for the count it was given, clamped', async () => {
    const { http, urls } = fake(RESULTS);
    await callSearch('search_web', { query: 'x', count: 99 }, { http, ...KEY });
    expect(urls[0]).toContain('count=10');
    await callSearch('search_web', { query: 'x', count: 0 }, { http, ...KEY });
    expect(urls[1]).toContain('count=5');
  });

  it('escapes the query rather than pasting it into a URL', async () => {
    const { http, urls } = fake(RESULTS);
    await callSearch('search_web', { query: 'a b&c=d' }, { http, ...KEY });
    expect(urls[0]).toContain('q=a%20b%26c%3Dd');
  });

  /**
   * A missing key is a configuration answer, not a rate limit to discover at
   * run time — Brave refuses anonymous calls outright, so asking would only
   * spend a turn to be told the same thing.
   */
  it('says plainly when there is no key, without calling out', async () => {
    const { http, urls } = fake(RESULTS);
    const result = await callSearch('search_web', { query: 'x' }, { http });
    expect(result.error).toContain('BRAVE_API_KEY');
    expect(urls).toEqual([]);
  });

  it('requires a query', async () => {
    const { http } = fake(RESULTS);
    expect((await callSearch('search_web', { query: '   ' }, { http, ...KEY })).error).toBe(
      'query is required',
    );
  });

  // The two a user can act on are named; everything else reports its status.
  it('names a rejected key and an exhausted quota', async () => {
    const rejected = fake({}, { ok: false, status: 401 });
    expect((await callSearch('search_web', { query: 'x' }, { http: rejected.http, ...KEY })).error)
      .toContain('rejected');
    const spent = fake({}, { ok: false, status: 429 });
    expect((await callSearch('search_web', { query: 'x' }, { http: spent.http, ...KEY })).error)
      .toContain('quota');
    const other = fake({}, { ok: false, status: 503 });
    expect((await callSearch('search_web', { query: 'x' }, { http: other.http, ...KEY })).error)
      .toContain('503');
  });

  it('reports nothing found as an answer, not an error', async () => {
    const { http } = fake({ web: { results: [] } });
    const result = await callSearch('search_web', { query: 'nothing at all' }, { http, ...KEY });
    expect(result.error).toBeUndefined();
    expect(result.text).toContain('No results');
  });

  it('survives a reply that is not the shape it expects', async () => {
    const { http } = fake({ unexpected: true });
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEY })).text).toContain(
      'No results',
    );
  });

  it('reports an unreachable service rather than throwing', async () => {
    const http: Http = async () => {
      throw new Error('ENOTFOUND');
    };
    expect((await callSearch('search_web', { query: 'x' }, { http, ...KEY })).error).toContain(
      'could not reach',
    );
  });
});
