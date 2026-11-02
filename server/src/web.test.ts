import { lookup } from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CHARS,
  extractText,
  extractTitle,
  extractUrls,
  fetchPage,
  isAllowed,
  trim,
} from './web';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

describe('extractText', () => {
  it('drops scripts, styles and markup, keeping the words', () => {
    const html = `
      <html><head><title>T</title><style>.a{color:red}</style></head>
      <body><script>alert('no')</script><p>Hello there</p><p>Second line</p></body></html>`;
    const text = extractText(html);
    expect(text).toContain('Hello there');
    expect(text).toContain('Second line');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('<');
  });

  it('turns blocks into line breaks rather than running words together', () => {
    expect(extractText('<p>one</p><p>two</p>')).toBe('one\ntwo');
    expect(extractText('a<br>b')).toBe('a\nb');
  });

  it('marks list items', () => {
    expect(extractText('<ul><li>first</li><li>second</li></ul>')).toContain('- first');
  });

  it('decodes the entities that actually show up', () => {
    expect(extractText('<p>Tom &amp; Jerry &mdash; &quot;hi&quot;</p>')).toBe('Tom & Jerry — "hi"');
    expect(extractText('<p>&#65;&#x42;</p>')).toBe('AB');
  });

  it('collapses runaway whitespace', () => {
    expect(extractText('<p>a</p>\n\n\n\n\n<p>b</p>')).toBe('a\n\nb');
  });
});

describe('extractTitle', () => {
  it('reads the title when there is one', () => {
    expect(extractTitle('<html><title> A  Page </title></html>')).toBe('A Page');
  });

  it('says nothing when there is not', () => {
    expect(extractTitle('<html><body>hi</body></html>')).toBeUndefined();
    expect(extractTitle('<title></title>')).toBeUndefined();
  });
});

describe('trim', () => {
  it('leaves a short page alone', () => {
    expect(trim('short', 100)).toEqual({ text: 'short', truncated: false });
  });

  it('cuts to the budget and says it did', () => {
    const result = trim('x'.repeat(500), 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('[trimmed');
    expect(result.text.length).toBeLessThan(200);
  });

  it('prefers a line break so the tail is not a half sentence', () => {
    const text = `${'a'.repeat(80)}\n${'b'.repeat(80)}`;
    expect(trim(text, 100).text.startsWith(`${'a'.repeat(80)}\n\n[trimmed`)).toBe(true);
  });

  it('defaults to a budget that is a ceiling, not a suggestion', () => {
    const result = trim('y'.repeat(DEFAULT_MAX_CHARS * 3));
    expect(result.text.length).toBeLessThan(DEFAULT_MAX_CHARS + 100);
  });
});

describe('isAllowed', () => {
  it('permits any host when no list is given — the opt-in is the gate', () => {
    expect(isAllowed('https://example.com/x')).toBe(true);
  });

  it('honours a list, including subdomains', () => {
    const allow = ['example.com'];
    expect(isAllowed('https://example.com/a', allow)).toBe(true);
    expect(isAllowed('https://docs.example.com/a', allow)).toBe(true);
    expect(isAllowed('https://evil.com/a', allow)).toBe(false);
  });

  it('is not fooled by a lookalike host', () => {
    expect(isAllowed('https://notexample.com', ['example.com'])).toBe(false);
    expect(isAllowed('https://example.com.evil.com', ['example.com'])).toBe(false);
  });

  it('accepts a wildcard entry', () => {
    expect(isAllowed('https://docs.example.com', ['*.example.com'])).toBe(true);
  });

  it('refuses anything that is not http', () => {
    expect(isAllowed('file:///etc/passwd')).toBe(false);
    expect(isAllowed('ftp://example.com')).toBe(false);
    expect(isAllowed('javascript:alert(1)')).toBe(false);
    expect(isAllowed('not a url')).toBe(false);
  });
});

describe('extractUrls', () => {
  it('finds addresses in a sentence the user wrote', () => {
    expect(extractUrls('please read https://example.com/a and http://b.org/x')).toEqual([
      'https://example.com/a',
      'http://b.org/x',
    ]);
  });

  it('drops trailing sentence punctuation', () => {
    expect(extractUrls('see https://example.com/page.')).toEqual(['https://example.com/page']);
  });

  it('deduplicates and caps how many it will pre-fetch', () => {
    const text = 'a https://x.com/1 https://x.com/1 https://x.com/2 https://x.com/3 https://x.com/4';
    expect(extractUrls(text)).toEqual(['https://x.com/1', 'https://x.com/2', 'https://x.com/3']);
  });

  it('finds none when there are none', () => {
    expect(extractUrls('no links here')).toEqual([]);
  });
});

describe('fetchPage refuses addresses inside this machine or its network', () => {
  const resolve = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;
  const fetchMock = vi.fn();
  const page = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  const redirect = (location: string) =>
    new Response(null, { status: 302, headers: { location } });

  beforeEach(() => {
    resolve.mockReset();
    resolve.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => page('<p>public</p>'));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const refused = async (url: string, allow: string[] = []) => {
    const result = await fetchPage(url, { allow });
    expect(result.error).toMatch(/private address/);
    expect(result.text).toBe('');
  };

  it.each([
    ['loopback', ['http://127.0.0.1/', 'http://127.8.9.10/', 'http://2130706433/', 'http://[::1]/']],
    ['private', ['http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/']],
    ['unique-local IPv6', ['http://[fc00::1]/', 'http://[fd12:3456::1]/']],
    ['link-local (cloud metadata included)', ['http://169.254.169.254/latest/meta-data/', 'http://169.254.0.1/', 'http://[fe80::1]/']],
    ['unspecified', ['http://0.0.0.0/', 'http://[::]/']],
    ['IPv4-mapped IPv6', ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:0.0.0.0]/']],
  ])('refuses %s addresses and never connects', async (_, urls) => {
    for (const url of urls) await refused(url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a hostname that resolves to a private address', async () => {
    resolve.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await refused('https://intranet.example.com/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when any one of the resolved addresses is private', async () => {
    resolve.mockResolvedValue([
      { address: '93.184.215.14', family: 4 },
      { address: '::1', family: 6 },
    ]);
    await refused('https://example.com/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses whatever the allowlist says', async () => {
    resolve.mockResolvedValue([{ address: '192.168.0.10', family: 4 }]);
    await refused('https://router.example.com/', ['router.example.com']);
    await refused('http://127.0.0.1/', ['127.0.0.1']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a redirect to a private address', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://169.254.169.254/latest/meta-data/'));
    await refused('https://example.com/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a redirect to a hostname that resolves to a private address', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://inside.example.net/'));
    resolve
      .mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValueOnce([{ address: '172.20.0.3', family: 4 }]);
    await refused('https://example.com/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still reads a public page', async () => {
    fetchMock.mockResolvedValueOnce(page('<title>Hi</title><p>Hello there</p>'));
    const result = await fetchPage('https://example.com/a');
    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Hi');
    expect(result.text).toContain('Hello there');
  });

  it('still follows a redirect between public addresses', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('/moved'))
      .mockResolvedValueOnce(page('<p>moved here</p>'));
    const result = await fetchPage('https://example.com/a');
    expect(result.error).toBeUndefined();
    expect(result.text).toBe('moved here');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/moved');
  });

  it('does not over-block public addresses next to the private ranges', async () => {
    for (const url of ['http://172.32.0.1/', 'http://11.0.0.1/', 'http://192.169.0.1/', 'http://[2606:4700::1111]/']) {
      expect((await fetchPage(url)).error).toBeUndefined();
    }
  });
});
