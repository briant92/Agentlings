import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRender, RENDER_TOOL_NAMES, RENDER_TOOLS, renderAvailable } from './render';

/**
 * The refusals run everywhere. The two that render run only where Edge
 * exists — gated on the same probe production uses, and skipped honestly
 * otherwise, because a mocked renderer would prove nothing about the two
 * promises this module makes: a real PDF comes back, and nothing leaves the
 * machine while it is made.
 */
const available = await renderAvailable();

describe('the render tool list', () => {
  it('offers exactly one tool, and its params fit the runner schema builder', () => {
    expect(RENDER_TOOL_NAMES).toEqual(['render_pdf']);
    for (const tool of RENDER_TOOLS) {
      for (const param of tool.params) {
        expect(['string', 'number']).toContain(param.type);
        expect(param.describe.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('callRender refusals', () => {
  it('refuses a tool it does not have, by name', async () => {
    expect((await callRender('render_docx', {})).error).toContain('no such tool');
  });

  it('asks for the document when html is missing or blank', async () => {
    expect((await callRender('render_pdf', {})).error).toContain('html is required');
    expect((await callRender('render_pdf', { html: '   ' })).error).toContain('html is required');
  });

  it('refuses an oversized document with the remedy, before any browser starts', async () => {
    const result = await callRender('render_pdf', { html: 'x'.repeat(2_000_001) });
    expect(result.error).toContain('too large');
    expect(result.error).toContain('split');
  });
});

describe('rendering, on a machine that can', () => {
  it.runIf(available)(
    'prints real HTML to a real one-page PDF and counts it',
    async () => {
      const result = await callRender('render_pdf', {
        html: '<html><body><h1>Studio</h1><p>one page</p></body></html>',
      });
      expect(result.error).toBeUndefined();
      const bytes = Buffer.from(result.pdf ?? '', 'base64');
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(result.pages).toBe(1);
      expect(result.bytes).toBe(bytes.length);
    },
    45_000,
  );

  describe('the offline rule', () => {
    let server: Server;
    let origin = '';
    let hits = 0;

    beforeAll(async () => {
      server = createServer((_req, res) => {
        hits += 1;
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it.runIf(available)(
      'a document that asks for the network gets a PDF and the network gets nothing',
      async () => {
        const result = await callRender('render_pdf', {
          html: `<html><body><img src="${origin}/leak.png"><p>text</p></body></html>`,
        });
        // The render succeeds — a blocked image is a broken picture, not a
        // failed document — and the request never left the page.
        expect(result.error).toBeUndefined();
        expect(Buffer.from(result.pdf ?? '', 'base64').subarray(0, 5).toString('latin1')).toBe(
          '%PDF-',
        );
        expect(hits).toBe(0);
      },
      45_000,
    );
  });
});
