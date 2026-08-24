import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Connection } from './connections';
import { draftProblem } from './userconnections';
import { offerable, readSuggestions, type Suggestion } from './suggestions';

const SHIPPED = fileURLToPath(new URL('../../catalog/suggestions.json', import.meta.url));
const shipped = readSuggestions(SHIPPED);

const dir = () => mkdtempSync(path.join(tmpdir(), 'suggest-'));

describe('reading the file', () => {
  it('is empty rather than fatal when absent or broken', () => {
    const d = dir();
    expect(readSuggestions(path.join(d, 'nope.json'))).toEqual([]);
    const broken = path.join(d, 'b.json');
    writeFileSync(broken, '{not json');
    expect(readSuggestions(broken)).toEqual([]);
  });

  it('skips a shape that cannot be dialled', () => {
    const file = path.join(dir(), 's.json');
    writeFileSync(
      file,
      JSON.stringify({
        suggestions: [
          { name: 'a', label: 'A', transport: 'stdio' }, // no command
          { name: 'b', label: 'B', transport: 'http' }, // no url
          { name: 'c', label: 'C', transport: 'carrier-pigeon', url: 'https://x/' },
          { name: 'd', label: 'D', transport: 'http', url: 'https://x/' },
        ],
      }),
    );
    expect(readSuggestions(file).map((s) => s.name)).toEqual(['d']);
  });
});

describe('what is offered', () => {
  const list: Suggestion[] = [
    { name: 'xero', label: 'Xero', transport: 'stdio', command: 'npx' },
    { name: 'notion', label: 'Notion', transport: 'stdio', command: 'npx' },
  ];

  it('drops any whose name is already taken — offering one is offering a dead end', () => {
    const installed: Connection[] = [{ name: 'xero', label: 'Xero', transport: 'stdio' }];
    expect(offerable(list, installed).map((s) => s.name)).toEqual(['notion']);
  });

  it('offers everything when nothing is installed', () => {
    expect(offerable(list, []).map((s) => s.name)).toEqual(['xero', 'notion']);
  });
});

/**
 * The shipped file itself, held to the rules the form will hold it to. A
 * suggestion that cannot be submitted is worse than no suggestion: the user
 * clicks it, fills in a key, and is told no by a validator we could have run
 * ourselves.
 */
describe('the shipped suggestions', () => {
  it('are a real list, so a file that stopped parsing fails here', () => {
    expect(shipped.length).toBeGreaterThan(0);
  });

  it('every one would pass the add form’s own validation', () => {
    for (const s of shipped) {
      expect([s.name, draftProblem(s, [])]).toEqual([s.name, null]);
    }
  });

  it('none names tools — those come from the server, never from a file (D-244)', () => {
    for (const s of shipped) {
      expect([s.name, 'tools' in s]).toEqual([s.name, false]);
    }
  });

  it('every one says where its shape was read, and links the page to check it against', () => {
    for (const s of shipped) {
      expect([s.name, Boolean(s.source), Boolean(s.docs)]).toEqual([s.name, true, true]);
    }
  });

  it('every declared secret is named by the thing that needs it', () => {
    // A key nothing references is a key the user is asked for and never used.
    for (const s of shipped) {
      const referenced = `${s.command ?? ''} ${(s.args ?? []).join(' ')} ${s.url ?? ''} ${JSON.stringify(s.headers ?? {})}`;
      for (const name of Object.keys(s.secrets ?? {})) {
        // stdio servers take theirs through `env`, so only http has to name it.
        if (s.transport === 'http') {
          expect([s.name, name, referenced.includes(`\${${name}}`)]).toEqual([s.name, name, true]);
        }
      }
    }
  });

  it('carries no secret VALUE, only names and reasons', () => {
    const raw = JSON.stringify(shipped);
    // The shapes are public; a value would mean somebody pasted a live key
    // into a file that ships.
    expect(raw).not.toMatch(/sk_live|rk_live|ntn_[A-Za-z0-9]{10}/);
  });

  it('reaches http suggestions over https only', () => {
    for (const s of shipped.filter((x) => x.transport === 'http')) {
      expect([s.name, s.url?.startsWith('https://')]).toEqual([s.name, true]);
    }
  });
});
