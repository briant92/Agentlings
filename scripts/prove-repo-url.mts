// Repo work from a URL — the live proof (#26, D-275).
//
//   npx tsx scripts/prove-repo-url.mts                (from the repo root)
//   npx tsx scripts/prove-repo-url.mts --repo owner/name
//
// **Against the real github.com**, with the real `GITHUB_TOKEN` from this
// install's secrets file, driving the very functions the resolve route calls.
// Nothing is mocked and no server is needed: the clone comes down over https,
// the branch goes up, and the pull request is opened and then read back from
// GitHub rather than from our own return value.
//
//   §1  the reader: what a level's repo is, decided one way for everybody
//   §2  the clone, over https — and the credential NOT left in it
//   §3  what the reviewer sees, and that the push carries exactly that
//   §4  the pull request, read back off GitHub
//   §5  the refusal that matters: a run that committed inside its own clone
//   §6  no token, no push — the credential is load-bearing, not decorative
//   §7  the local-path path, unchanged
//
// It writes nothing outside a throwaway folder in the system temp directory
// and the throwaway repository named by --repo. It leaves the branch and the
// pull request standing: they are the evidence.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { branchName, promotedLine, repoTarget } from '../packages/shared/src/index';
import {
  cloneRepo,
  patchFile,
  promoteToRemote,
  repoDir,
  summarizePatch,
  writeDiff,
} from '../server/src/gitwork';
import type { Http } from '../server/src/library';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const REPO = arg('repo') ?? 'briant92/agentlings-repo-url-proof';
const URL_ = `https://github.com/${REPO}`;

process.loadEnvFile('.env');
const TOKEN = process.env.GITHUB_TOKEN;

/** The real one. The server injects exactly this shape (D-187). */
const http: Http = (url, headers, init) => fetch(url, { headers, ...init });

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, detail?: string): void => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const api = async (p: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`https://api.github.com${p}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'agentlings',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const root = mkdtempSync(path.join(tmpdir(), 'agentlings-prove-repo-url-'));
const stamp = Date.now().toString(36);
/**
 * One job id per run, so a re-run opens its own branch instead of colliding —
 * and a distinct **first eight characters** per phase, because that is what
 * `branchName` slices. Ids sharing a prefix share a branch, which is how the
 * first run of this script reported a leak in §5 and §6 that was its own §4
 * branch answering 200. The instrument, not the mechanism.
 */
const job = {
  id: `1${stamp}`,
  title: 'Say hello properly',
  prompt: 'Make the greeting say Hello rather than Helo.',
};

try {
  console.log(`\nRepo work from a URL — live proof (#26, D-275)`);
  console.log(`repository ${URL_}`);
  console.log(`token      ${TOKEN ? `present, ${TOKEN.slice(0, 4)}… (${TOKEN.length} chars)` : 'ABSENT'}`);
  console.log(`job        ${job.id}\n`);

  // §1 ──────────────────────────────────────────────────────────────────────
  console.log('§1  the one reader');
  const target = repoTarget(URL_);
  ok('a GitHub https URL reads as a remote', target.kind === 'url');
  if (target.kind !== 'url') throw new Error('cannot continue: the URL did not read as a remote');
  ok('owner and name come off the URL', `${target.owner}/${target.name}` === REPO, `${target.owner}/${target.name}`);
  ok(
    'a folder on this disk still reads as a folder',
    repoTarget(process.cwd()).kind === 'path',
    process.cwd(),
  );
  ok(
    'a host that merely ends in the same letters is refused',
    repoTarget('https://notgithub.com/a/b').kind === 'unsupported',
  );

  // §2 ──────────────────────────────────────────────────────────────────────
  console.log('\n§2  the clone, over https');
  const sandbox = path.join(root, 'sandbox');
  const t0 = Date.now();
  await cloneRepo(URL_, sandbox, TOKEN);
  const repo = repoDir(sandbox);
  ok('the working copy is there', existsSync(path.join(repo, 'README.md')), `${Date.now() - t0} ms`);
  const config = readFileSync(path.join(repo, '.git', 'config'), 'utf8');
  ok('the remote in the clone is the plain URL', config.includes(`https://github.com/${REPO}`));
  // The whole point of the transient header: a session works in this clone.
  ok(
    'the token is NOWHERE in the clone the session gets',
    !TOKEN || !config.includes(TOKEN),
    'git config read back in full',
  );
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  ok('HEAD is the commit that was cloned', head === git(repo, 'rev-parse', 'refs/remotes/origin/HEAD').trim());

  // §3 ──────────────────────────────────────────────────────────────────────
  console.log('\n§3  what the reviewer sees is what gets pushed');
  writeFileSync(path.join(repo, 'greet.js'), "console.log('Hello');\n");
  writeFileSync(path.join(repo, 'NOTES.md'), `Written by the #26 proof, job ${job.id}.\n`);
  ok('the run left a diff', await writeDiff(sandbox));
  const changes = summarizePatch(readFileSync(patchFile(sandbox), 'utf8'));
  ok('the review card counts what changed', changes.files === 2, `${changes.files} files, +${changes.added} −${changes.removed}`);

  // §4 ──────────────────────────────────────────────────────────────────────
  console.log('\n§4  Approve: the branch and the pull request');
  const promoted = await promoteToRemote(sandbox, target, job, { http, token: TOKEN });
  ok('promote answered', promoted !== null);
  if (!promoted) throw new Error('cannot continue: promote pushed nothing');
  const branch = branchName(job.id, job.title);
  ok('the branch is the one the card named', promoted.branch === branch, branch);
  console.log(`        ${promotedLine(promoted)}`);
  if (promoted.prError) console.log(`        prError: ${promoted.prError}`);

  // Read back off GitHub, never off our own return value.
  const onRemote = await api(`/repos/${REPO}/branches/${encodeURIComponent(branch)}`);
  ok('GitHub has the branch', onRemote.status === 200, `HTTP ${onRemote.status}`);
  const files = await api(`/repos/${REPO}/contents/NOTES.md?ref=${encodeURIComponent(branch)}`);
  ok('and the file the run wrote is on it', files.status === 200);
  const base = await api(`/repos/${REPO}/contents/NOTES.md`);
  ok('the default branch is untouched — a promote proposes', base.status === 404, `HTTP ${base.status}`);
  const author = git(repo, 'log', '-1', '--format=%an <%ae>', branch).trim();
  ok('the commit carries its own identity', author === 'Agentlings <agentlings@localhost>', author);

  if (promoted.prUrl) {
    const pr = await api(`/repos/${REPO}/pulls/${promoted.prNumber}`);
    ok('GitHub has the pull request', pr.status === 200, promoted.prUrl);
    ok('it is open, from the branch, against the default', pr.body?.state === 'open' && pr.body?.head?.ref === branch, `${pr.body?.head?.ref} → ${pr.body?.base?.ref}`);
    ok('its body names the job that made it', String(pr.body?.body ?? '').includes(job.id));
  } else {
    ok('the pull request was opened', false, promoted.prError);
  }

  // §5 ──────────────────────────────────────────────────────────────────────
  console.log('\n§5  the refusal that matters: a run that committed in its clone');
  const second = path.join(root, 'committed');
  await cloneRepo(URL_, second, TOKEN);
  const secondRepo = repoDir(second);
  writeFileSync(path.join(secondRepo, 'SNEAKY.md'), 'the review never saw this\n');
  git(secondRepo, 'add', '-A');
  git(secondRepo, '-c', 'user.name=S', '-c', 'user.email=s@e', 'commit', '-q', '-m', 'mine');
  const sneakyJob = { ...job, id: `2${stamp}` };
  let refused = '';
  try {
    await promoteToRemote(second, target, sneakyJob, { http, token: TOKEN });
  } catch (err) {
    refused = err instanceof Error ? err.message : String(err);
  }
  ok('promote refused it', /committed inside its own clone/.test(refused));
  console.log(`        ${refused.slice(0, 120)}…`);
  const sneakyBranch = branchName(sneakyJob.id, sneakyJob.title);
  const nothing = await api(`/repos/${REPO}/branches/${encodeURIComponent(sneakyBranch)}`);
  ok('and nothing reached GitHub', nothing.status === 404, `HTTP ${nothing.status}`);

  // §6 ──────────────────────────────────────────────────────────────────────
  console.log('\n§6  no token, no push');
  const third = path.join(root, 'notoken');
  // The repository is public, so the clone needs no credential at all…
  await cloneRepo(URL_, third, undefined);
  ok('a public repo clones with no token', existsSync(path.join(repoDir(third), 'README.md')));
  writeFileSync(path.join(repoDir(third), 'greet.js'), "console.log('Hi');\n");
  await writeDiff(third);
  const anon = { ...job, id: `3${stamp}` };
  let pushFailed = '';
  try {
    await promoteToRemote(third, target, anon, { http, token: undefined });
  } catch (err) {
    pushFailed = err instanceof Error ? err.message : String(err);
  }
  // …and the push is where the credential is actually load-bearing. It must
  // fail rather than hang: GIT_TERMINAL_PROMPT=0 is what makes that true.
  ok('…but the push without one fails, and does not hang', pushFailed !== '');
  ok(
    'no anonymous branch reached GitHub',
    (await api(`/repos/${REPO}/branches/${encodeURIComponent(branchName(anon.id, anon.title))}`)).status === 404,
  );

  // §7 ──────────────────────────────────────────────────────────────────────
  console.log('\n§7  the local-path path, unchanged');
  const localOrigin = path.join(root, 'local-origin');
  execFileSync('git', ['init', '-q', localOrigin], { stdio: 'pipe' });
  git(localOrigin, 'config', 'user.name', 'Test');
  git(localOrigin, 'config', 'user.email', 't@e');
  writeFileSync(path.join(localOrigin, 'greet.js'), "console.log('Helo');\n");
  git(localOrigin, 'add', '.');
  git(localOrigin, 'commit', '-q', '-m', 'init');
  const localSandbox = path.join(root, 'local-sandbox');
  await cloneRepo(localOrigin, localSandbox);
  ok('a folder still clones locally', existsSync(path.join(repoDir(localSandbox), 'greet.js')));
  // Asked of git rather than of the config file's formatting, which is what
  // the first run of this script actually tested and got wrong.
  const localRemote = git(repoDir(localSandbox), 'remote', 'get-url', 'origin').trim();
  ok(
    'and it is a local clone, not a network one',
    !/^https?:/i.test(localRemote) && localRemote.endsWith('local-origin'),
    localRemote,
  );

  console.log(`\n${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ''}`);
  if (promoted.prUrl) console.log(`pull request: ${promoted.prUrl}`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {});
}
