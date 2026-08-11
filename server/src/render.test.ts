import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  callRender,
  RENDER_TOOL_NAMES,
  RENDER_TOOLS,
  renderAvailable,
  type PlateResult,
  type RenderResult,
} from './render';
import { alphaStats, decodePngA } from './raster';

/**
 * The refusals run everywhere. The two that render run only where Edge
 * exists — gated on the same probe production uses, and skipped honestly
 * otherwise, because a mocked renderer would prove nothing about the two
 * promises this module makes: a real PDF comes back, and nothing leaves the
 * machine while it is made.
 */
const available = await renderAvailable();

describe('the render tool list', () => {
  it('offers the print and plate tools, and their params fit the runner schema builder', () => {
    expect(RENDER_TOOL_NAMES).toEqual(['render_pdf', 'render_plate']);
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
    expect((await callRender('render_plate', {})).error).toContain('html is required');
  });

  it('refuses an oversized document with the remedy, before any browser starts', async () => {
    const result = await callRender('render_pdf', { html: 'x'.repeat(2_000_001) });
    expect(result.error).toContain('too large');
    expect(result.error).toContain('split');
  });

  it('refuses an unknown plate mode by name, never a silent default', async () => {
    const result = await callRender('render_plate', { html: '<p>x</p>', mode: 'alpha' });
    expect(result.error).toContain('no such mode: "alpha"');
    expect(result.error).toContain('cutout-overscan');
  });

  it('refuses an unknown finish by name — quantized is the absence', async () => {
    const result = await callRender('render_plate', { html: '<p>x</p>', finish: 'hd' });
    expect(result.error).toContain('no such finish: "hd"');
  });

  it('holds tile mode to its dimensions, and keeps them off every other mode', async () => {
    expect((await callRender('render_plate', { html: '<p>x</p>', mode: 'tile' })).error).toContain(
      'tileWidth',
    );
    expect(
      (await callRender('render_plate', { html: '<p>x</p>', mode: 'tile', tileWidth: 4000, tileHeight: 64 }))
        .error,
    ).toContain('8–512');
    expect(
      (await callRender('render_plate', { html: '<p>x</p>', tileWidth: 64 })).error,
    ).toContain('belong to mode "tile"');
  });
});

describe('rendering, on a machine that can', () => {
  it.runIf(available)(
    'prints real HTML to a real one-page PDF and counts it',
    async () => {
      const result = (await callRender('render_pdf', {
        html: '<html><body><h1>Studio</h1><p>one page</p></body></html>',
      })) as RenderResult;
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
        const result = (await callRender('render_pdf', {
          html: `<html><body><img src="${origin}/leak.png"><p>text</p></body></html>`,
        })) as RenderResult;
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

    /**
     * The plate's whole contract in one page: three.js arrives through the
     * vendored exception, a real WebGL scene draws, the network still gets
     * nothing, and the reply carries the plate already inside the backdrop
     * budget with its separation measured. A flat or black screenshot would
     * fail the colour floor — WebGL that silently did not run cannot pass.
     */
    it.runIf(available)(
      'a three.js scene renders offline into a quantized, measured plate',
      async () => {
        const html = `<html><head><meta charset="utf-8"></head><body style="margin:0">
<script type="module">
  fetch('${origin}/leak.json').catch(() => {});
  import * as THREE from 'http://three.local/three.module.js';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(2000, 900);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1433);
  scene.fog = new THREE.Fog(0x1a1433, 10, 60);
  const camera = new THREE.PerspectiveCamera(18, 2000 / 900, 0.1, 100);
  camera.position.set(0, 3, 30);
  const sun = new THREE.DirectionalLight(0xffc080, 2);
  sun.position.set(-10, 5, -10);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404070, 1));
  for (let i = 0; i < 8; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3, 4 + i, 3),
      new THREE.MeshStandardMaterial({ color: 0x5a3c60 }),
    );
    box.position.set(-14 + i * 4, (4 + i) / 2 - 2, -i * 4);
    scene.add(box);
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x241a38 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);
  renderer.render(scene, camera);
  document.title = 'ready';
</${'script'}></body></html>`;
        const result = (await callRender('render_plate', { html })) as PlateResult;
        expect(result.error).toBeUndefined();
        expect(result.width).toBe(2000);
        expect(result.height).toBe(900);
        expect(result.colours).toBeGreaterThanOrEqual(2);
        expect(result.colours).toBeLessThanOrEqual(128);
        expect(typeof result.worstSeparation).toBe('number');
        expect(typeof result.worstAt).toBe('number');
        const bytes = Buffer.from(result.png ?? '', 'base64');
        expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
        expect(hits).toBe(0);
      },
      60_000,
    );

    it.runIf(available)(
      'a page that never says ready is refused by name, not screenshotted early',
      async () => {
        const result = await callRender('render_plate', {
          html: '<html><head><title>plate</title></head><body><p>still drawing</p></body></html>',
        });
        expect(result.error).toContain('"ready"');
      },
      45_000,
    );

    /**
     * The cut-out contract end to end (v2): a transparent page with one solid
     * shape comes back at the overscan size with its holes kept, its alpha
     * already binary, and coverage in the receipt instead of separation —
     * what a cut-out does to legibility belongs to the composite.
     */
    it.runIf(available)(
      'cutout-overscan keeps transparency, snaps it binary, and reports coverage',
      async () => {
        const html = `<html><head><meta charset="utf-8"><style>
          html, body { margin: 0; background: transparent; }
          .ridge { position: absolute; left: 0; top: 0; width: 300px; height: 500px;
                   background: #0d1226; border-radius: 0 0 180px 0; }
        </style></head><body><div class="ridge"></div>
        <script>document.title = 'ready';</script></body></html>`;
        const result = (await callRender('render_plate', {
          html,
          mode: 'cutout-overscan',
        })) as PlateResult;
        expect(result.error).toBeUndefined();
        expect(result.width).toBe(2120);
        expect(result.height).toBe(900);
        expect(result.worstSeparation).toBeUndefined();
        expect(result.opaquePct).toBeGreaterThan(0);
        expect(result.opaquePct).toBeLessThan(50);
        expect(typeof result.partialSnapped).toBe('number');
        // The returned PNG really is binary: no partial alpha survives.
        const raster = decodePngA(Buffer.from(result.png ?? '', 'base64'));
        const stats = alphaStats(raster);
        expect(stats.partial).toBe(0);
        expect(stats.opaque).toBeGreaterThan(0);
        expect(stats.transparent).toBeGreaterThan(0);
        expect(hits).toBe(0);
      },
      60_000,
    );

    /**
     * The smooth finish (D-151): the render comes back exactly as the page
     * drew it — a gradient keeps its hundreds of colours and a soft edge
     * keeps its partial alpha, both of which the quantized path deliberately
     * destroys. The pair of runs is the proof the flag does anything.
     */
    it.runIf(available)(
      'finish smooth keeps the gradient and the soft edge as rendered',
      async () => {
        const html = `<html><head><style>
          html, body { margin: 0; background: transparent; }
          div { width: 900px; height: 500px; border-radius: 60px;
                background: linear-gradient(90deg, #102040, #f0e0c0); }
        </style></head><body><div></div>
        <script>document.title = 'ready';</script></body></html>`;
        const smoothRun = (await callRender('render_plate', {
          html,
          mode: 'cutout',
          finish: 'smooth',
        })) as PlateResult;
        expect(smoothRun.error).toBeUndefined();
        const smoothRaster = decodePngA(Buffer.from(smoothRun.png ?? '', 'base64'));
        expect(alphaStats(smoothRaster).partial).toBeGreaterThan(0);
        expect(smoothRun.colours).toBeGreaterThan(128);
        expect(smoothRun.partialSnapped).toBeUndefined();

        const quantizedRun = (await callRender('render_plate', {
          html,
          mode: 'cutout',
        })) as PlateResult;
        expect(quantizedRun.error).toBeUndefined();
        expect(alphaStats(decodePngA(Buffer.from(quantizedRun.png ?? '', 'base64'))).partial).toBe(
          0,
        );
        expect(quantizedRun.colours).toBeLessThanOrEqual(128);
      },
      90_000,
    );

    it.runIf(available)(
      'a tile renders at its own small size with alpha kept',
      async () => {
        const html = `<html><head><style>html, body { margin: 0; background: transparent; }
          div { width: 32px; height: 64px; background: #24406a; }
        </style></head><body><div></div>
        <script>document.title = 'ready';</script></body></html>`;
        const result = (await callRender('render_plate', {
          html,
          mode: 'tile',
          tileWidth: 64,
          tileHeight: 64,
        })) as PlateResult;
        expect(result.error).toBeUndefined();
        expect(result.width).toBe(64);
        expect(result.height).toBe(64);
        expect(result.opaquePct).toBeCloseTo(50, 0);
      },
      60_000,
    );
  });
});
