import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CHARS,
  extractText,
  extractTitle,
  extractUrls,
  isAllowed,
  trim,
} from './web';

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
