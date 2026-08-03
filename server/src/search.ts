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
 * verbose JSON — ranking metadata, thumbnails, pagemaps, per result. If we own
 * the call we own the size. What comes back here is three fields a result,
 * which is what a session needs to choose a URL and hand it to `fetch_page` —
 * the two tools compose, and both trim.
 *
 * Google's Programmable Search Engine, over its official JSON API. Scraping the
 * search page was never an option: it is against the terms, and D-035 already
 * measured what it returns to a crawler — 429 and a CAPTCHA, which is exactly
 * the wall the job in D-053 died against.
 */

/** Enough to choose from, few enough to stay a small prompt. */
const DEFAULT_COUNT = 5;
/** Google's own per-request ceiling; asking for more is an error, not a page 2. */
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

interface GoogleItem {
  title?: unknown;
  snippet?: unknown;
  link?: unknown;
}

/** Google marks matched terms up and wraps snippets; both are noise in a prompt. */
function plain(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export interface SearchCredentials {
  http: Http;
  /** `GOOGLE_API_KEY`. */
  key?: string;
  /** `GOOGLE_CSE_ID` — which Programmable Search Engine to ask. */
  cx?: string;
}

/**
 * Runs one search. `http` is injected so tests need no network, exactly as the
 * code host and the library sync do.
 */
export async function callSearch(
  tool: string,
  args: Record<string, unknown>,
  options: SearchCredentials,
): Promise<SearchResult> {
  if (tool !== 'search_web') return { error: `no such tool: ${tool}` };

  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'query is required' };

  // Both halves are required and they fail differently, so they are named
  // separately: a missing key is "you have not set this up", a missing engine
  // id is "you set up half of it". Reported before calling out, because Google
  // refuses either way and asking would spend a turn to be told the same.
  const missing = [
    ...(options.key ? [] : ['GOOGLE_API_KEY']),
    ...(options.cx ? [] : ['GOOGLE_CSE_ID']),
  ];
  if (missing.length > 0) {
    return { error: `no ${missing.join(' and no ')} is set, so the crew cannot search` };
  }

  const asked = typeof args.count === 'number' ? args.count : DEFAULT_COUNT;
  const count = Math.max(1, Math.min(MAX_COUNT, Math.trunc(asked) || DEFAULT_COUNT));

  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(options.key!)}` +
    `&cx=${encodeURIComponent(options.cx!)}&q=${encodeURIComponent(query)}&num=${count}`;

  let res;
  try {
    res = await options.http(url, { accept: 'application/json' });
  } catch (err) {
    return {
      error: `could not reach the search service: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const raw = await res.text().catch(() => '');
  let payload: { items?: GoogleItem[]; error?: { message?: unknown } };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    payload = {};
  }

  if (!res.ok) {
    // Google puts the actionable part in the body — "API key not valid",
    // "Request contains an invalid argument" for a bad engine id, quota
    // messages by name. Preferred over mapping status codes, which conflate
    // a rejected key and an exhausted quota under 403.
    const said = plain(payload.error?.message);
    return { error: said ? `the search service refused: ${said}` : `the search service answered ${res.status}` };
  }

  const results = (payload.items ?? []).filter((r) => plain(r.link));
  if (results.length === 0) {
    return {
      text: `No results for "${query}". If this keeps happening, check the search engine is set to search the whole web rather than a list of sites.`,
    };
  }

  return {
    text: [
      `Results for "${query}":`,
      '',
      ...results.slice(0, count).map((r, i) => {
        const title = plain(r.title) || plain(r.link);
        const snippet = clip(plain(r.snippet), MAX_SNIPPET);
        return `${i + 1}. ${title}\n   ${plain(r.link)}${snippet ? `\n   ${snippet}` : ''}`;
      }),
      '',
      'Read one with fetch_page to get its full text.',
    ].join('\n'),
  };
}
