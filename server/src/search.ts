import type { Http } from './library';
import type { ToolSpec } from './github';

/**
 * Finding a page, as opposed to reading one.
 *
 * The crew could always read a URL you named and never find one, and that gap
 * is not refused politely — it is substituted. Measured on two real jobs asking
 * the same question: one fell back to model knowledge and said so, the other
 * spent its whole budget driving a browser at a search engine and died there
 * (D-053). So the cheapest fix for that failure is not a better browser, it is
 * a search box.
 *
 * Builtin rather than a stdio MCP server, for the reason D-040 established for
 * the code host: the reply size is the whole cost, and a search API answers in
 * verbose JSON — dates, thumbnails, profiles, ranking metadata, per result. If
 * we own the call we own the size. What comes back here is three fields a
 * result, which is what a session needs to choose a URL and hand it to
 * `fetch_page` — the two tools compose, and both trim.
 */

/** Enough to choose from, few enough to stay a small prompt. */
const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;
/** A snippet is for choosing a link, not for reading instead of one. */
const MAX_SNIPPET = 200;

export const SEARCH_TOOLS: ToolSpec[] = [
  {
    name: 'search_web',
    description:
      'Search the web and return ranked results as title, snippet and URL. Use it to find a page, then read the one you want with fetch_page.',
    params: [
      { name: 'query', type: 'string', required: true, describe: 'what to search for' },
      {
        name: 'count',
        type: 'number',
        describe: `how many results, 1-${MAX_COUNT} (default ${DEFAULT_COUNT})`,
      },
    ],
  },
];

export const SEARCH_TOOL_NAMES = SEARCH_TOOLS.map((t) => t.name);

export interface SearchResult {
  text?: string;
  error?: string;
}

interface BraveResult {
  title?: unknown;
  description?: unknown;
  url?: unknown;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Brave marks matched terms with `<strong>` and escapes the text around them,
 * so a snippet arrives with both tags and entities in it. Both are noise a
 * model pays to read — seen live on the first real search, where an apostrophe
 * came through as `&#x27;`.
 */
function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.startsWith('#')) {
        const point = code[1]?.toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 ? String.fromCodePoint(point) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Runs one search. `http` is injected so tests need no network, exactly as the
 * code host and the library sync do.
 */
export async function callSearch(
  tool: string,
  args: Record<string, unknown>,
  options: { http: Http; token?: string },
): Promise<SearchResult> {
  if (tool !== 'search_web') return { error: `no such tool: ${tool}` };

  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'query is required' };
  // A key is required, not optional as it is for the library: Brave refuses
  // anonymous calls outright, so a missing key is a configuration answer rather
  // than a rate limit to discover at run time.
  if (!options.token) {
    return { error: 'no BRAVE_API_KEY is set, so the crew cannot search' };
  }

  const asked = typeof args.count === 'number' ? args.count : DEFAULT_COUNT;
  const count = Math.max(1, Math.min(MAX_COUNT, Math.trunc(asked) || DEFAULT_COUNT));

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  let res;
  try {
    res = await options.http(url, {
      accept: 'application/json',
      'accept-encoding': 'gzip',
      'x-subscription-token': options.token,
    });
  } catch (err) {
    return { error: `could not reach the search service: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    // 401 and 429 are the two a user can act on, so they are named rather than
    // reported as a bare status.
    if (res.status === 401) return { error: 'the search key was rejected (401)' };
    if (res.status === 429) return { error: 'the search quota is used up for now (429)' };
    return { error: `the search service answered ${res.status}` };
  }

  let payload: { web?: { results?: BraveResult[] } };
  try {
    payload = JSON.parse(await res.text()) as typeof payload;
  } catch {
    return { error: 'the search service sent something unreadable' };
  }

  const results = (payload.web?.results ?? []).filter((r) => plain(r.url));
  if (results.length === 0) return { text: `No results for "${query}".` };

  return {
    text: [
      `Results for "${query}":`,
      '',
      ...results.slice(0, count).map((r, i) => {
        const title = plain(r.title) || plain(r.url);
        const snippet = clip(plain(r.description), MAX_SNIPPET);
        return `${i + 1}. ${title}\n   ${plain(r.url)}${snippet ? `\n   ${snippet}` : ''}`;
      }),
      '',
      'Read one with fetch_page to get its full text.',
    ].join('\n'),
  };
}
