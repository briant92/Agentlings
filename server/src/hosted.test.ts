import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { headedAvailable } from './browserchannel';
import { doorUnavailable, NO_SCREEN, type Connection } from './connections';
import { REPO_ROOT } from './installpaths';
import { forgetOcrAvailability, ocrAvailable } from './ocr';
import { pickFolderAvailable } from './pickFolder';

/**
 * The *Not available hosted* tag, held against the probes that produce it.
 *
 * `AGENTLING.md` is derived, never authored (PROJECT.md): where it disagrees
 * with the code the code wins. A status typed by hand is exactly the thing
 * that file is not allowed to contain, and a fifth status is the easiest one
 * to get wrong — it is invisible on this machine, where every probe says yes.
 *
 * So the tag is written in one machine-readable shape and read back here.
 * Three lists have to agree, and each is read from its own file rather than
 * retyped: the glossary says which capabilities are disk-bound, the capability
 * file tags them and cites each probe, and the README tells a person deploying
 * the same list. Any one of the three edited alone fails.
 *
 * `container.test.ts` is the prior art — a file that cannot import the modules
 * it describes, read and put to the functions that actually answer it.
 */
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const CONTEXT = read('CONTEXT.md');
const CAPABILITIES = read('AGENTLING.md');
const README = read('README.md');

const TAG = 'Not available hosted';

/**
 * The glossary's own list of what a hosted install refuses, out of the
 * *Hosted* entry rather than retyped here. `CONTEXT.md` is the vocabulary
 * (PROJECT.md), so it is the list the other two answer to and not a copy.
 */
function glossaryDiskBound(text: string): string[] {
  const entry = text.match(/\*\*Hosted\*\*:\n([\s\S]*?)\n_Avoid_/);
  if (!entry) throw new Error('CONTEXT.md has no Hosted entry');
  const listed = entry[1].replace(/\n/g, ' ').match(/refuses at its probe — (.*?)\./);
  if (!listed) throw new Error('the Hosted entry no longer lists what a probe refuses');
  return listed[1].split(',').map((s) => s.trim());
}

/**
 * Every tagged capability in `AGENTLING.md`, with the probe it cites.
 *
 * The shape is ``**Not available hosted** (*name* — `probe`, `file`)``. One
 * regex rather than a search for the tag followed by a hunt for a citation, so
 * that a tag with no citation is *not found* — and the count check below is
 * what turns "not found" into a failure. A reader that silently skips what it
 * cannot parse is this repository's oldest scar.
 *
 * Every gap is `\s+`, not a space: this file is prose wrapped at 79 columns, so
 * a citation breaks across lines wherever it happens to fall. The first draft
 * read three of the five and reported the other two as absent — a reader that
 * was really measuring where the line breaks were.
 */
function taggedCapabilities(text: string): { name: string; probe: string; file: string }[] {
  const found: { name: string; probe: string; file: string }[] = [];
  const re = /\*\*Not available hosted\*\*\s+\(\*([^*]+)\*\s+—\s+`([^`]+)`,\s+`([^`]+)`\)/g;
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (const m of text.matchAll(re)) {
    found.push({ name: flat(m[1]), probe: flat(m[2]), file: flat(m[3]) });
  }
  return found;
}

/** What the README tells a person deploying their install cannot do. */
function readmeDiskBound(text: string): string[] {
  const section = text.match(/\n## What an install cannot do hosted\n([\s\S]*?)(?=\n## )/);
  if (!section) throw new Error('README.md has no hosted section');
  return [...section[1].matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1]);
}

/**
 * The readers, before anything is asserted through them.
 *
 * Each of the three has one job — find a list — and each would report an empty
 * list just as confidently against a file that had lost the thing it looks
 * for. `prove-standing-ui` asserted on an empty string for four tickets
 * running (#29), so the negative cases are here on purpose.
 */
describe('the readers', () => {
  it('reads the glossary list, and stops at the entry it was asked for', () => {
    const text = [
      '**Hosted**:',
      'Said of an install with no operator disk under it. A capability tagged *Not',
      'available hosted* is one such an install refuses at its probe — one thing,',
      'and another thing.',
      '_Avoid_: cloud',
      '',
      '**Catalog**:',
      'refuses at its probe — a thing that is not on the hosted list.',
      '_Avoid_: nothing',
      '',
    ].join('\n');
    expect(glossaryDiskBound(text)).toEqual(['one thing', 'and another thing']);
  });

  it('throws rather than answer nothing when the glossary entry has gone', () => {
    expect(() => glossaryDiskBound('**Install**:\nsomething\n_Avoid_: nothing\n')).toThrow();
    expect(() => glossaryDiskBound('**Hosted**:\nno list at all\n_Avoid_: cloud\n')).toThrow();
  });

  it('reads a tag with its citation, and does not see one without', () => {
    const cited = '**Not available hosted** (*OCR* — `ocrAvailable`, `server/src/ocr.ts`)';
    expect(taggedCapabilities(cited)).toEqual([
      { name: 'OCR', probe: 'ocrAvailable', file: 'server/src/ocr.ts' },
    ]);
    expect(taggedCapabilities('**Not available hosted**, and nothing else')).toEqual([]);
  });

  it('reads a citation that wraps across lines', () => {
    // The defect this reader shipped with: three of the five tags fell either
    // side of a line break and were reported as simply absent.
    const wrapped =
      '**Not available hosted** (*the folder\norganizer* —\n`pickFolderAvailable`,\n`server/src/pickFolder.ts`)';
    expect(taggedCapabilities(wrapped)).toEqual([
      {
        name: 'the folder organizer',
        probe: 'pickFolderAvailable',
        file: 'server/src/pickFolder.ts',
      },
    ]);
  });

  it('reads the README list, and stops at the next section', () => {
    const text = [
      '',
      '## What an install cannot do hosted',
      '',
      '- **one thing** — because of a probe',
      '- **another thing** — because of another',
      '',
      '## Something else',
      '',
      '- **not this one** — a different list',
      '',
    ].join('\n');
    expect(readmeDiskBound(text)).toEqual(['one thing', 'another thing']);
  });

  it('throws rather than answer nothing when the README section has gone', () => {
    expect(() => readmeDiskBound('\n## Deploying\n\n- **a thing**\n\n## Next\n')).toThrow();
  });
});

describe('the three lists agree', () => {
  const glossary = glossaryDiskBound(CONTEXT);
  const tagged = taggedCapabilities(CAPABILITIES);

  it('the glossary names five disk-bound capabilities', () => {
    // Not a magic number: it is the count the tag, the README and the probe
    // checks below are all sized against, so it is asserted where it is read.
    expect(glossary).toEqual([
      'repo work from a local path',
      'the folder organizer',
      'OCR',
      'the knowledge store over folders',
      'supervised live acting',
    ]);
  });

  it('the capability file tags exactly those, and each exactly once', () => {
    expect(tagged.map((t) => t.name).sort()).toEqual([...glossary].sort());
  });

  it('the README tells a person deploying the same list', () => {
    expect(readmeDiskBound(README).sort()).toEqual([...glossary].sort());
  });

  it('every occurrence of the tag carries a citation', () => {
    // The count is what makes the regex reader safe: a tag it cannot parse is
    // invisible to it, so the two numbers are compared rather than trusted.
    // The legend row is the one deliberate exception — it defines the tag.
    const occurrences = CAPABILITIES.split(TAG).length - 1;
    expect(occurrences).toBe(tagged.length + 1);
    expect(CAPABILITIES).toContain(`| **${TAG}** |`);
  });
});

describe('every cited probe exists', () => {
  for (const { name, probe, file } of taggedCapabilities(CAPABILITIES)) {
    it(`${name} cites ${probe} in ${file}`, () => {
      const full = path.join(REPO_ROOT, file);
      expect(existsSync(full), `${file} does not exist`).toBe(true);
      expect(readFileSync(full, 'utf8')).toContain(probe);
    });
  }
});

/**
 * …and the citation is not the proof. A file containing a string is the check
 * that once passed by matching text which already existed (PROJECT.md). What
 * follows puts each probe that *can* be asked to the hosted shape — Linux, no
 * display — and reads its answer.
 *
 * Two of the five cannot be asked here and are not faked. `existsSync` on the
 * operator's own path answers about the machine running the test, so repo work
 * and the knowledge store are proven by a real install refusing rather than by
 * a unit test; that gap is named in D-274 rather than papered over.
 */
describe('the probes refuse under the hosted shape', () => {
  const platform = process.platform;
  const asPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true });
  afterEach(() => {
    asPlatform(platform);
    forgetOcrAvailability();
  });

  it('the folder organizer: no Windows, no dialog', () => {
    expect(pickFolderAvailable('linux')).toBe(false);
    expect(pickFolderAvailable('win32')).toBe(true);
  });

  it('supervised live acting: no display, no window to watch', () => {
    const watched: Connection = {
      name: 'browser-act',
      label: 'Act in a browser you can watch',
      transport: 'stdio',
      supervised: true,
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    };
    expect(headedAvailable('linux', {})).toBe(false);
    expect(headedAvailable('linux', { DISPLAY: ':0' })).toBe(true);
    expect(doorUnavailable(watched, headedAvailable('linux', {}))).toBe(NO_SCREEN);
    expect(doorUnavailable(watched, headedAvailable('win32', {}))).toBeNull();
  });

  it('OCR: no Windows engine, and it asks nobody', async () => {
    asPlatform('linux');
    forgetOcrAvailability();
    await expect(ocrAvailable()).resolves.toBe(false);
  });
});
