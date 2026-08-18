import { existsSync, readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The engine itself is Windows and a language pack, so nothing here talks to
 * it: the shell is replaced and what is tested is the wiring around it — the
 * one-invocation-per-document claim the file measures, the list file WinRT
 * insists on, the failure it must not report as a blank page, and the probe
 * that makes `win32` necessary rather than sufficient.
 */

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const { OCR_SCALE, forgetOcrAvailability, ocrAvailable, ocrImages } = await import('./ocr');

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

/** Every spawn seen, with the list file's contents read before it is deleted. */
let calls: { args: string[]; listFile: string; list: string }[] = [];

function engineAnswers(reply: { stdout?: string; stderr?: string; code: number | null }) {
  spawnMock.mockImplementation((_cmd: string, args: string[]) => {
    const listFile = args[args.indexOf('-ListFile') + 1];
    calls.push({ args, listFile, list: readFileSync(listFile, 'utf8') });
    const child = new FakeChild();
    setImmediate(() => {
      if (reply.stdout) child.stdout.emit('data', Buffer.from(reply.stdout, 'utf8'));
      if (reply.stderr) child.stderr.emit('data', Buffer.from(reply.stderr, 'utf8'));
      child.emit('close', reply.code);
    });
    return child;
  });
}

const platform = process.platform;
const asPlatform = (value: string) =>
  Object.defineProperty(process, 'platform', { value, configurable: true });

beforeEach(() => {
  calls = [];
  spawnMock.mockReset();
  forgetOcrAvailability();
  asPlatform('win32');
});

afterEach(() => asPlatform(platform));

describe('the measured scale', () => {
  it('renders a page at twice its own size', () => {
    // Pinned, not incidental: 1 recovered 5 of 22 tokens, 3 was no better than
    // 2 and 4 was worse. A change here is a new measurement, not a tweak.
    expect(OCR_SCALE).toBe(2);
  });
});

describe('ocrImages', () => {
  it('answers an empty list without asking the engine', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await expect(ocrImages([])).resolves.toEqual([]);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reads a whole document in one invocation, not one per page', async () => {
    engineAnswers({
      code: 0,
      stdout: JSON.stringify({
        pages: [
          { text: 'page one', error: null },
          { text: 'page two', error: null },
          { text: '', error: null },
          { text: null, error: 'that page is not a picture' },
        ],
      }),
    });

    const pages = await ocrImages(['a.png', 'b.png', 'c.png', 'd.png']);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(pages).toHaveLength(4);
    expect(pages[0]).toEqual({ text: 'page one', error: null });
    // A blank page is a success with no words, not a failure.
    expect(pages[2]).toEqual({ text: '', error: null });
    expect(pages[3].text).toBeNull();
  });

  it('hands the pages over as absolute paths, one per line', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await ocrImages(['scan.png', 'second.png']);

    const lines = calls[0].list.split('\n').filter(Boolean);
    expect(lines).toEqual([path.resolve('scan.png'), path.resolve('second.png')]);
    // Resolved as the platform writes them: a forward-slash path fails in
    // WinRT, and it used to fail silently.
    for (const line of lines) expect(path.isAbsolute(line)).toBe(true);
  });

  it('runs the script through a non-interactive shell that shows no window', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await ocrImages(['scan.png']);

    const [cmd, args, options] = spawnMock.mock.calls[0];
    expect(cmd).toBe('powershell.exe');
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-NonInteractive');
    expect(args[args.indexOf('-File') + 1]).toMatch(/winocr\.ps1$/);
    expect(options).toMatchObject({ windowsHide: true });
  });

  it('answers a reply that carries no pages at all as no pages', async () => {
    engineAnswers({ code: 0, stdout: '{"ok":true}' });
    await expect(ocrImages(['scan.png'])).resolves.toEqual([]);
  });

  it('a failed engine is an error, never a blank page', async () => {
    engineAnswers({ code: 1, stderr: 'noise above\nOcrEngine: no language pack\n' });
    await expect(ocrImages(['scan.png'])).rejects.toThrow('OcrEngine: no language pack');
  });

  it('a clean exit that said nothing is still a failure', async () => {
    engineAnswers({ code: 0, stdout: '   ' });
    await expect(ocrImages(['scan.png'])).rejects.toThrow('the OCR engine exited with 0');
  });

  it('names the exit code when the shell said nothing either', async () => {
    engineAnswers({ code: 9, stderr: '' });
    await expect(ocrImages(['scan.png'])).rejects.toThrow('the OCR engine exited with 9');
  });

  it('a reply that is not JSON fails rather than half-reading', async () => {
    engineAnswers({ code: 0, stdout: 'Cannot bind argument' });
    await expect(ocrImages(['scan.png'])).rejects.toThrow();
  });

  it('takes its scratch directory back afterwards, success or failure', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await ocrImages(['scan.png']);
    engineAnswers({ code: 1, stderr: 'it broke' });
    await expect(ocrImages(['scan.png'])).rejects.toThrow();

    expect(calls).toHaveLength(2);
    for (const call of calls) expect(existsSync(path.dirname(call.listFile))).toBe(false);
  });

  it('a spawn that never starts is reported, not hung', async () => {
    spawnMock.mockImplementation(() => {
      const child = new FakeChild();
      setImmediate(() => child.emit('error', new Error('powershell.exe not found')));
      return child;
    });
    await expect(ocrImages(['scan.png'])).rejects.toThrow('powershell.exe not found');
  });
});

describe('ocrAvailable', () => {
  it('is false off Windows, and asks nobody', async () => {
    asPlatform('linux');
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await expect(ocrAvailable()).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('really speaks to the engine, because win32 is not sufficient', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    await expect(ocrAvailable()).resolves.toBe(true);
    // Probing through `ocrImages` would answer an empty list without asking,
    // and report every Windows machine as capable.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(calls[0].list.trim()).toBe('');
  });

  it('is false when the engine is there but cannot answer', async () => {
    engineAnswers({ code: 1, stderr: 'no language pack installed' });
    await expect(ocrAvailable()).resolves.toBe(false);
  });

  it('asks once per process, however many times it is asked', async () => {
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    const [first, second] = await Promise.all([ocrAvailable(), ocrAvailable()]);
    expect(await ocrAvailable()).toBe(true);
    expect(first).toBe(second);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('forgetting the answer makes it ask again', async () => {
    engineAnswers({ code: 1, stderr: 'no language pack installed' });
    expect(await ocrAvailable()).toBe(false);

    forgetOcrAvailability();
    engineAnswers({ code: 0, stdout: '{"pages":[]}' });
    expect(await ocrAvailable()).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
