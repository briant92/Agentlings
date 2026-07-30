/**
 * Going outside, cheaply. A raw page handed to a model is tens of thousands
 * of tokens it pays to wade through, so nothing here returns a page: it
 * returns readable text, trimmed to a budget, from a host that was allowed.
 *
 * Deliberately dependency-free and not a browser — no JavaScript, no login
 * flows. It reads documents, which is what "read this and tell me" needs.
 */

/** ~4 characters per token, so this is roughly a 3k-token ceiling. */
export const DEFAULT_MAX_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 15_000;
/** Refuse to even decode something obviously enormous. */
const MAX_BYTES = 5_000_000;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (match) => {
      const named = ENTITIES[match.toLowerCase()];
      if (named) return named;
      const numeric = /^&#(\d+);$/.exec(match);
      return numeric ? String.fromCodePoint(Number(numeric[1])) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

/** The page's title, if it declared one. */
export function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return title || undefined;
}

/** Markup in, readable text out. Block elements become line breaks. */
export function extractText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface Trimmed {
  text: string;
  truncated: boolean;
}

/** Cuts at a line break where it can, so the tail isn't a half sentence. */
export function trim(text: string, maxChars = DEFAULT_MAX_CHARS): Trimmed {
  if (text.length <= maxChars) return { text, truncated: false };
  const cut = text.slice(0, maxChars);
  const boundary = cut.lastIndexOf('\n');
  const body = boundary > maxChars * 0.6 ? cut.slice(0, boundary) : cut;
  return { text: `${body}\n\n[trimmed — the page was longer]`, truncated: true };
}

/**
 * Host allowlist. An empty list means the opt-in itself is the gate: a job
 * that never asked for this connection cannot reach the web at all.
 */
export function isAllowed(url: string, allow: string[] = []): boolean {
  let host: string;
  let protocol: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    protocol = parsed.protocol;
  } catch {
    return false;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  if (allow.length === 0) return true;
  return allow.some((entry) => {
    const pattern = entry.trim().toLowerCase().replace(/^\*\./, '');
    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

/** URLs written into a job's own words, for fetching before the session runs. */
export function extractUrls(text: string, limit = 3): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const cleaned = found.map((url) => url.replace(/[.,;:]+$/, ''));
  return [...new Set(cleaned)].slice(0, limit);
}

export interface PageResult {
  url: string;
  title?: string;
  text: string;
  truncated: boolean;
  /** Set instead of text when the page could not be read. */
  error?: string;
}

/** A page as compact readable text, or an explained failure. Never throws. */
export async function fetchPage(
  url: string,
  options: { allow?: string[]; maxChars?: number } = {},
): Promise<PageResult> {
  if (!isAllowed(url, options.allow)) {
    return { url, text: '', truncated: false, error: 'that address is not on the allowed list' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'agentlings', accept: 'text/html,text/plain,*/*' },
    });
    if (!res.ok) {
      return { url, text: '', truncated: false, error: `the site returned ${res.status}` };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/|json|xml/i.test(type)) {
      return { url, text: '', truncated: false, error: `not a readable document (${type})` };
    }
    const raw = (await res.text()).slice(0, MAX_BYTES);
    const body = /html/i.test(type) ? extractText(raw) : raw.trim();
    const { text, truncated } = trim(body, options.maxChars);
    const title = /html/i.test(type) ? extractTitle(raw) : undefined;
    return { url, ...(title ? { title } : {}), text, truncated };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'the site took too long to answer'
        : err instanceof Error
          ? err.message
          : String(err);
    return { url, text: '', truncated: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
