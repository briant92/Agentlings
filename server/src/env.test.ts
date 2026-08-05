import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { secretValueProblem, storeSecret, upsertEnvLine } from './env';

describe('upsertEnvLine', () => {
  it('replaces the commented line .env.example ships, in place', () => {
    const content = '# The Telegram connection.\n# TELEGRAM_BOT_TOKEN=\n\n# Next section\nOTHER=1\n';
    const out = upsertEnvLine(content, 'TELEGRAM_BOT_TOKEN', 'tok');
    expect(out).toBe('# The Telegram connection.\nTELEGRAM_BOT_TOKEN=tok\n\n# Next section\nOTHER=1\n');
  });

  it('replaces a live line without touching anything else', () => {
    const content = 'A=1\nGITHUB_TOKEN=old\nB=2\n';
    expect(upsertEnvLine(content, 'GITHUB_TOKEN', 'new')).toBe('A=1\nGITHUB_TOKEN=new\nB=2\n');
  });

  it('appends when no line matches, keeping the single trailing newline', () => {
    expect(upsertEnvLine('A=1\n', 'B', '2')).toBe('A=1\nB=2\n');
  });

  it('handles an empty or absent file', () => {
    expect(upsertEnvLine('', 'A', '1')).toBe('A=1\n');
  });

  it('keeps CRLF files CRLF — .env is also a hand-edited file', () => {
    const out = upsertEnvLine('A=1\r\n# B=\r\n', 'B', '2');
    expect(out).toBe('A=1\r\nB=2\r\n');
  });

  it('does not mistake a longer name for a prefix of it', () => {
    const content = 'GITHUB_TOKEN_BACKUP=x\n';
    expect(upsertEnvLine(content, 'GITHUB_TOKEN', 'y')).toBe(
      'GITHUB_TOKEN_BACKUP=x\nGITHUB_TOKEN=y\n',
    );
  });
});

describe('secretValueProblem', () => {
  it.each([
    ['an empty paste', '', 'paste the token first'],
    ['whitespace inside', 'ab cd', 'no spaces'],
    ['a line break', 'ab\ncd', 'no spaces'],
    ['a quote', 'ab"cd', 'no quotes'],
    ['a hash', 'ab#cd', 'no quotes'],
    ['a runaway paste', 'x'.repeat(501), 'longer than any token'],
  ])('refuses %s', (_, value, reason) => {
    expect(secretValueProblem(value)).toContain(reason);
  });

  it('accepts the shapes real tokens take', () => {
    expect(secretValueProblem('8213004551:AAGw4Yc-abc_DEF')).toBeNull();
    expect(secretValueProblem('github_pat_11ABC')).toBeNull();
  });
});

describe('storeSecret', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-env-'));
  });

  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('creates the file when absent, and patches the live env view', () => {
    const file = path.join(dir, '.env');
    const env: Record<string, string | undefined> = {};
    storeSecret(file, 'TELEGRAM_BOT_TOKEN', 'tok', env);
    expect(readFileSync(file, 'utf8')).toBe('TELEGRAM_BOT_TOKEN=tok\n');
    expect(env.TELEGRAM_BOT_TOKEN).toBe('tok');
  });

  it('is a guest in an existing file — everything else survives byte-identical', () => {
    const file = path.join(dir, '.env');
    writeFileSync(file, '# mine\nANTHROPIC_API_KEY=sk-real\n# BRAVE_API_KEY=\n');
    const env: Record<string, string | undefined> = {};
    storeSecret(file, 'BRAVE_API_KEY', 'BSA-key', env);
    expect(readFileSync(file, 'utf8')).toBe('# mine\nANTHROPIC_API_KEY=sk-real\nBRAVE_API_KEY=BSA-key\n');
  });
});
