import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { headedAvailable } from './browserchannel';
import { doorUnavailable, NO_SCREEN, type Connection } from './connections';
import { REPO_ROOT } from './installpaths';

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
const CAPABILITY_FILE = read('AGENTLING.md');
const README = read('README.md');

/**
 * The tag as a *claim*, whitespace-tolerant, and only in its bold form.
 *
 * Bold is the tag; italic is prose naming it — the glossary and this file's own
 * header both mention *Not available hosted* in a sentence, and neither is a
 * capability being tagged. Making the difference load-bearing is what lets the
 * count below be exact instead of approximate.
 */
const BOLD_TAG = /\*\*Not\s+available\s+hosted\*\*/g;

interface Citation {
  name: string;
  probe: string;
  file: string;
}

/**
 * Parsed once: two `describe`s ask the same question of the same file.
 * `taggedCapabilities` is a function declaration, so it is hoisted above this.
 */
const TAGGED = taggedCapabilities(CAPABILITY_FILE);

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
function taggedCapabilities(text: string): Citation[] {
  const found: Citation[] = [];
  const re = /\*\*Not\s+available\s+hosted\*\*\s+\(\*([^*]+)\*\s+—\s+`([^`]+)`,\s+`([^`]+)`\)/g;
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

  it('counts a claim of the tag however it wraps, and only in its bold form', () => {
    // The hole the review found, and the reason the count is a regex now: an
    // UNCITED tag that wraps is invisible to `taggedCapabilities` — that is
    // what the count exists to catch — so if the count cannot see it either,
    // the two agree on a file with a silent hole in it.
    const uncitedAndWrapped = 'A sixth thing is **Not available\nhosted** and cites nothing.';
    expect(taggedCapabilities(uncitedAndWrapped)).toEqual([]);
    expect([...uncitedAndWrapped.matchAll(BOLD_TAG)]).toHaveLength(1);

    // Italic is prose naming the tag, not a capability claiming it. Both the
    // glossary and this file's own header do it, and neither owes a citation.
    expect([...'the statuses gain a fourth, *Not available hosted*.'.matchAll(BOLD_TAG)]).toEqual(
      [],
    );
  });
});

describe('the three lists agree', () => {
  const glossary = glossaryDiskBound(CONTEXT);

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
    expect(TAGGED.map((t) => t.name).sort()).toEqual([...glossary].sort());
  });

  it('the README tells a person deploying the same list', () => {
    expect(readmeDiskBound(README).sort()).toEqual([...glossary].sort());
  });

  it('every claim of the tag carries a citation', () => {
    // The count is what makes the regex reader safe: a tag the reader cannot
    // parse is invisible to it, so the two numbers are compared rather than
    // trusted. The legend row is the one deliberate difference — it defines
    // the tag rather than claiming it.
    //
    // Counted with the SAME whitespace tolerance the reader has. It was not,
    // and the review caught it: `split` on a literal-space string, over a file
    // this test itself calls prose wrapped at 79 columns. An uncited tag that
    // happened to wrap was invisible to both readers at once, so the guard
    // against exactly that passed — the fault D-274 records fixing in the
    // reader, still sitting in the guard. Measured, then fixed.
    const claims = [...CAPABILITY_FILE.matchAll(BOLD_TAG)].length;
    expect(claims).toBe(TAGGED.length + 1);
    expect(CAPABILITY_FILE).toMatch(/\|\s+\*\*Not\s+available\s+hosted\*\*\s+\|/);
  });
});

describe('every cited probe exists', () => {
  for (const { name, probe, file } of TAGGED) {
    it(`${name} cites ${probe} in ${file}`, () => {
      const full = path.join(REPO_ROOT, file);
      expect(existsSync(full), `${file} does not exist`).toBe(true);
      expect(readFileSync(full, 'utf8')).toContain(probe);
    });
  }
});

/**
 * …and the citation is not the proof. A file containing a string is the check
 * that once passed by matching text which already existed (PROJECT.md).
 *
 * What is *not* here is as deliberate as what is. Each probe's own refusing
 * branch is already pinned where the probe lives — `pickFolderAvailable` off
 * Windows in `pickFolder.test.ts`, `ocrAvailable` asking nobody off Windows in
 * `ocr.test.ts`, `headedAvailable` against a stray empty `DISPLAY` in
 * `browserchannel.test.ts`, `doorUnavailable` in `connections.test.ts` — and
 * copying those four here would be a second answer to each of four questions
 * (D-030), in the file whose whole subject is one probe having one reader. The
 * review of this ticket found exactly that, and it was cut rather than kept.
 *
 * What remains is the one assertion none of them makes: the two probes
 * *composed*.
 *
 * Two of the five cannot be asked here at all, and are not faked. `existsSync`
 * answers about the machine running the test, so repo work and the knowledge
 * store are proven by a real install refusing rather than by a unit test —
 * and `prove-hosted.mjs` does not reach them either. Named in D-274 rather
 * than papered over.
 */
describe('the probes refuse under the hosted shape', () => {
  it('supervised live acting: the two probes composed, as the runner composes them', () => {
    // `connections.test.ts` pins `doorUnavailable` against literal booleans and
    // `browserchannel.test.ts` pins `headedAvailable` against a container's
    // environment. Neither joins them, and the join is what the tag claims:
    // feed one probe's real answer to the other and a supervised door on a
    // Linux box with no display comes back refused.
    const watched = { name: 'browser-act', supervised: true } as Connection;
    expect(doorUnavailable(watched, headedAvailable('linux', {}))).toBe(NO_SCREEN);
    expect(doorUnavailable(watched, headedAvailable('linux', { DISPLAY: '' }))).toBe(NO_SCREEN);
    expect(doorUnavailable(watched, headedAvailable('win32', {}))).toBeNull();
  });
});
