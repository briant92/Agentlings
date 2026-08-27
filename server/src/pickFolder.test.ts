import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NO_ORGANIZE_HERE,
  NO_PICKER,
  PICK_TIMEOUT_MS,
  parsePickOutput,
  pickFolder,
  pickFolderAvailable,
} from './pickFolder';

// The dialog itself is a person and a window, so tests only ever run the
// seams around it: the output contract, and the one-at-a-time gate.

describe('parsePickOutput — the contract the script and the server share', () => {
  it('an absolute path is the answer', () => {
    expect(parsePickOutput('C:\\Users\\MSI\\Documents\\Garantías\r\n', 0, '')).toEqual({
      path: 'C:\\Users\\MSI\\Documents\\Garantías',
    });
  });

  it('the last non-empty line wins — Add-Type may chat above it', () => {
    const noisy = 'Compiling…\r\n\r\nC:\\Users\\MSI\\Papers\r\n';
    expect(parsePickOutput(noisy, 0, '')).toEqual({ path: 'C:\\Users\\MSI\\Papers' });
  });

  it('the sentinel means the person said no, which is an answer', () => {
    expect(parsePickOutput('CANCELLED\r\n', 0, '')).toEqual({ cancelled: true });
  });

  it('silence on a clean exit is a failure, not a pick', () => {
    expect(parsePickOutput('', 0, '')).toEqual({
      error: 'the folder dialog closed without an answer',
    });
  });

  it('a non-zero exit tells its stderr, last line only', () => {
    const picked = parsePickOutput('', 1, 'line one\r\nAdd-Type: it broke\r\n');
    expect(picked).toEqual({ error: 'the folder dialog failed — Add-Type: it broke' });
  });
});

describe('pickFolder — one dialog at a time', () => {
  const slow = (answer: string) => () =>
    new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) =>
      setTimeout(() => resolve({ stdout: answer, stderr: '', code: 0 }), 30),
    );

  it('a second ask while one is open is refused, not queued', async () => {
    const first = pickFolder(slow('C:\\picked\r\n'));
    const second = await pickFolder(slow('C:\\other\r\n'));
    expect(second).toEqual({ error: 'a folder dialog is already open — finish that one first' });
    expect(await first).toEqual({ path: 'C:\\picked' });
  });

  it('the gate reopens after the answer, including a refused one', async () => {
    expect(await pickFolder(slow('CANCELLED\r\n'))).toEqual({ cancelled: true });
    expect(await pickFolder(slow('C:\\again\r\n'))).toEqual({ path: 'C:\\again' });
  });

  it('the gate reopens after a dialog that threw, not just one that answered', async () => {
    const broken = () => Promise.reject(new Error('COM said no'));
    await expect(pickFolder(broken)).rejects.toThrow('COM said no');
    expect(await pickFolder(slow('C:\\after\r\n'))).toEqual({ path: 'C:\\after' });
  });

  it('the gate reopens after the script failed, too', async () => {
    const failing = () => Promise.resolve({ stdout: '', stderr: 'it broke', code: 1 });
    expect(await pickFolder(failing)).toEqual({ error: 'the folder dialog failed — it broke' });
    expect(await pickFolder(slow('C:\\after\r\n'))).toEqual({ path: 'C:\\after' });
  });
});

describe('parsePickOutput — the edges of that contract', () => {
  it('a folder actually called CANCELLED is a path, because a real answer is absolute', () => {
    // Why the sentinel can be a bare word at all: it cannot collide with one.
    expect(parsePickOutput('C:\\Users\\MSI\\CANCELLED\r\n', 0, '')).toEqual({
      path: 'C:\\Users\\MSI\\CANCELLED',
    });
  });

  it('whitespace on a clean exit is silence, not a path', () => {
    expect(parsePickOutput('\r\n   \r\n\t\r\n', 0, '')).toEqual({
      error: 'the folder dialog closed without an answer',
    });
  });

  it('a failure with nothing to say says only that', () => {
    expect(parsePickOutput('', 1, '   \r\n')).toEqual({ error: 'the folder dialog failed' });
  });

  it('a killed shell — no code at all — is a failure, told with its reason', () => {
    // The timeout path resolves with code 1, but a signalled child gives null;
    // anything that is not a clean 0 must not be read as a pick.
    expect(parsePickOutput('C:\\half-written', null, 'nobody picked within 5 minutes')).toEqual({
      error: 'the folder dialog failed — nobody picked within 5 minutes',
    });
  });

  it('a bare newline-only unix reply parses the same way', () => {
    expect(parsePickOutput('Compiling…\n/home/msi/papers\n', 0, '')).toEqual({
      path: '/home/msi/papers',
    });
  });
});

describe('pickFolder off Windows', () => {
  const platform = process.platform;
  afterEach(() =>
    Object.defineProperty(process, 'platform', { value: platform, configurable: true }),
  );

  it('points at the typed path instead, and opens nothing', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const run = vi.fn();
    expect(await pickFolder(run)).toEqual({
      error: 'the folder dialog needs Windows — type the path instead',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('and the refusal does not hold the gate shut', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    await pickFolder(vi.fn());
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const run = () => Promise.resolve({ stdout: 'C:\\ok\r\n', stderr: '', code: 0 });
    expect(await pickFolder(run)).toEqual({ path: 'C:\\ok' });
  });
});

describe('how long a person may browse', () => {
  it('is five minutes, and the message that quotes it agrees', () => {
    expect(PICK_TIMEOUT_MS).toBe(300_000);
    expect(PICK_TIMEOUT_MS / 60000).toBe(5);
  });
});

/**
 * #30: the desk has to know BEFORE it offers the button. An organize sentence
 * on a hosted install used to get "Choose the folder to organize…", a click,
 * and the refusal — which is the same shape #24 found on supervised acting,
 * one layer up.
 */
describe('the two refusals, which are not one refusal', () => {
  // The first live hosted run put NO_PICKER on the work bar, where it read
  // "…type the path instead" beside a bar with nothing to type a path into.
  it('the work bar\'s sentence offers no typed path, because there is none', () => {
    expect(NO_PICKER).toContain('type the path');
    expect(NO_ORGANIZE_HERE).not.toContain('type the path');
  });

  it('and it says what is missing rather than what platform is wanted', () => {
    expect(NO_ORGANIZE_HERE).toMatch(/desktop|screen/);
    expect(NO_ORGANIZE_HERE).toContain('picked');
  });

  // The review's catch: the browser was composing the first half of this
  // sentence, at two separate sites. The server owns what the client renders
  // (PROJECT.md), so the sentence has to be whole here — it names its own
  // subject, and a caller has nothing left to prepend.
  it('is a whole sentence, so no caller has to supply its subject', () => {
    expect(NO_ORGANIZE_HERE).toMatch(/^organizing /);
  });
});

describe('pickFolderAvailable', () => {
  it('is Windows and nothing else', () => {
    expect(pickFolderAvailable('win32')).toBe(true);
    expect(pickFolderAvailable('linux')).toBe(false);
    expect(pickFolderAvailable('darwin')).toBe(false);
  });

  // One rule, two readers — the same discipline `doorUnavailable` is held to.
  // A desk that offers the button and a dialog that then refuses is two
  // answers to one question (D-032).
  it('agrees with what pickFolder itself does', async () => {
    const platform = process.platform;
    try {
      for (const p of ['win32', 'linux', 'darwin'] as const) {
        Object.defineProperty(process, 'platform', { value: p, configurable: true });
        // A cancel, so the mock needs no path of its own: what is under test
        // is whether the dialog was reached at all.
        const run = vi.fn(() => Promise.resolve({ stdout: 'CANCELLED', stderr: '', code: 0 }));
        const picked = await pickFolder(run);
        if (pickFolderAvailable(p)) expect(run).toHaveBeenCalled();
        else expect(picked).toEqual({ error: NO_PICKER });
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    }
  });
});
