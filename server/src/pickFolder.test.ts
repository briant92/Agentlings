import { describe, expect, it } from 'vitest';
import { parsePickOutput, pickFolder } from './pickFolder';

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
});
