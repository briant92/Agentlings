import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { boardStatus, installOnet, loadBoard, scoreProfile, searchBoard, syncOnet, titleMatch } from './jobboard';

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/workprofiles/onet');

/** A release-shaped zip built from the checked-in slice, files nested the way the real zip nests them. */
async function fixtureZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of ['Occupation Data.txt', 'Task Statements.txt', 'Alternate Titles.txt', 'Read Me.txt', 'Skills.txt']) {
    zip.file(`db_30_0_text/${f}`, readFileSync(path.join(FIXTURE, f)));
  }
  return zip.generateAsync({ type: 'uint8array' });
}

describe('job board install', () => {
  it('is absent until installed, then reports the release and the count', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jobboard-'));
    expect(boardStatus(root)).toEqual({ present: false });
    expect(loadBoard(root)).toEqual([]);
    const status = await installOnet(root, await fixtureZip());
    expect(status).toEqual({ present: true, version: '30.0', occupations: 2 });
    const profiles = loadBoard(root);
    expect(profiles.map((p) => p.occupationId)).toEqual(['15-1252.00', '43-3031.00']);
    // Skills.txt was in the zip and deliberately not unpacked; the adapter tolerates that.
    expect(profiles[0].skills).toEqual([]);
    expect(profiles[0].tasks.length).toBeGreaterThan(0);
  });

  it('refuses a zip that is not a release', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jobboard-'));
    const zip = new JSZip();
    zip.file('whatever.txt', 'hello');
    await expect(installOnet(root, await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      /not an O\*NET text release/,
    );
    expect(boardStatus(root).present).toBe(false);
  });

  it('sync downloads through the given fetch and refuses a bad answer', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jobboard-'));
    const bytes = await fixtureZip();
    const ok = (async () =>
      ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) as Response)();
    const status = await syncOnet(root, () => ok);
    expect(status.present).toBe(true);
    await expect(
      syncOnet(root, async () => ({ ok: false, status: 503 }) as Response),
    ).rejects.toThrow(/503/);
  });
});

describe('job board search', () => {
  const profiles = (() => {
    const root = mkdtempSync(path.join(tmpdir(), 'jobboard-'));
    return (async () => {
      await installOnet(root, await fixtureZip());
      return loadBoard(root);
    })();
  })();

  it('finds by title and alias before duty, and an empty query returns nothing', async () => {
    const list = await profiles;
    expect(searchBoard(list, 'bookkeeping').map((p) => p.occupationId)).toEqual(['43-3031.00']);
    expect(searchBoard(list, '')).toEqual([]);
    // A duty word alone still finds, ranked below a name hit.
    const dev = list[0];
    expect(scoreProfile(dev, dev.title)).toBeGreaterThan(0);
  });

  it('the hire hint fires on a name, not on one shared duty word', async () => {
    const list = await profiles;
    expect(titleMatch(list, 'bookkeeping')?.occupationId).toBe('43-3031.00');
    expect(titleMatch(list, 'account clerk')?.occupationId).toBe('43-3031.00');
    expect(titleMatch(list, 'software developer')?.occupationId).toBe('15-1252.00');
    // "reports" appears in duties of both; no name carries it → no hint.
    expect(titleMatch(list, 'someone to write quarterly reports for me')).toBeNull();
  });
});
