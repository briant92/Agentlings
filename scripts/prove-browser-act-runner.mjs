// The live proof #16 owes for the MECHANISM (D-255, D-264), without the server:
//
//   node scripts/prove-browser-act-runner.mjs
//
// Spawns the real `agent-runner.mjs` — the child every paid session runs in —
// three times, each with a `.session.json` shaped as the executor writes it
// for a job holding `browser-act`, and reads the JSONL the runner speaks (the
// same lines the server keeps as the job's trajectory). A headed Edge window
// opens on this screen for each; a throwaway profile under `.agentlings/`,
// never a profile of yours.
//
//   A. the allowlisted, login-free form: navigate, fill, submit — every step
//      a `progress`/`observation` pair, the confirmation read back;
//   B. a domain off the list: the navigate REFUSED by name before it is made,
//      and that reason on the observation line the trajectory keeps;
//   C. the window closed mid-run (the browser process ended, which is what a
//      closed last tab does): the runner says so in one sentence and ends.
//
// Each is a real session and costs money (a few tens of cents). The routes —
// the form, the rule refusal, the sweeps — are `prove-browser-act.mjs`,
// against the running server, after a restart carries the code.

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(ROOT, 'server', 'src', 'executors', 'agent-runner.mjs');
const CATALOG = path.join(ROOT, 'catalog', 'connections.json');
const PROOF_ROOT = path.join(ROOT, '.agentlings', 'proofs');
const PROFILE = path.join(ROOT, '.agentlings', 'browser-act-proof-profile');
const RUN_MS = 8 * 60_000;
const FORM = 'https://www.selenium.dev/selenium/web/web-form.html';
const ALLOW = ['www.selenium.dev'];

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // Whatever the environment already holds.
}

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')).connections;
const act = catalog.find((c) => c.name === 'browser-act');
check('the catalog carries browser-act, supervised, with the twelve acting tools', act?.supervised === true && act.tools.includes('browser_fill_form') && act.tools.includes('browser_click'), `${act?.tools?.length} tools`);

// The brief the executor writes for this door, in substance (browserActBrief
// in claude.ts); the proof cannot import TypeScript, so it carries the lines
// that matter for the three runs.
const brief = [
  '## The browser you are acting in (browser-act)',
  'Your `mcp__browser-act__*` tools drive a VISIBLE browser window on the user’s screen. The user is watching every step, and every call and its result is written to the job’s trail.',
  `- Allowed sites: ${ALLOW.join(', ')}. Navigation anywhere else is refused by name; a page’s own requests off the list are blocked. Do not try to work around a refusal — report it in RESULT.md.`,
  '- The profile is already signed in by the user where a sign-in is needed. NEVER type a password, a one-time code or any credential, even if a page asks; say in RESULT.md that the page wanted a sign-in and stop there.',
  '- Fill and submit ordinary forms as the job asks. NEVER press the final confirm/pay/transfer button of a payment or a bank transfer — leave that step to the user and say so.',
  '- If the user closes the window, this session ends at once. Keep RESULT.md current as you go.',
  '- Snapshot before you act, and read the result of every action before the next one.',
].join('\n');

/** A `.session.json` as the executor writes one for a job holding browser-act. */
function sessionConfig(dir, prompt, allow) {
  return {
    cwd: dir,
    prompt,
    append: `You are a general-purpose worker agentling.\n\n## Job rules\n- Work only inside the sandbox (your working directory).\n- Write RESULT.md in the working directory: outcome first, evidence second.\n- You have 25 turns.\n\n${brief}`,
    allowedTools: ['Read', 'Write'],
    mcpTools: act.tools.map((t) => `mcp__browser-act__${t}`),
    maxTurns: 25,
    ...(process.env.AGENTLINGS_MODEL ? { model: process.env.AGENTLINGS_MODEL } : {}),
    mcpServers: { 'browser-act': { type: 'stdio', command: act.command, args: act.args, env: {} } },
    browserAct: { server: 'browser-act', profileDir: PROFILE, allow },
  };
}

/** Runs the real runner on a config; resolves with every JSONL line, the exit code and stderr. */
function runSession(name, config, { onEvent } = {}) {
  const dir = path.join(PROOF_ROOT, `browser-act-${name}-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, '.session.json');
  writeFileSync(configPath, JSON.stringify({ ...config, cwd: dir }, null, 2));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, configPath], { cwd: dir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end('{}');
    const events = [];
    let stderr = '';
    let buffer = '';
    const timer = setTimeout(() => child.kill(), RUN_MS);
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        try {
          const event = JSON.parse(line);
          events.push(event);
          if (event.type === 'progress') console.log(`  ${event.name}  ${JSON.stringify(event.input ?? {}).slice(0, 90)}`);
          if (event.type === 'observation' && event.ok === false) console.log(`  ✗ ${String(event.head).slice(0, 120)}`);
          onEvent?.(event, child);
        } catch {
          // not a line of the runner's
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // The raw lines, kept beside the sandbox for reading afterwards.
      writeFileSync(path.join(dir, 'runner-events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
      const ended = events.find((e) => e.type === 'result' || e.type === 'error');
      if (ended?.type === 'error') console.log(`  ended with an error: ${String(ended.message).slice(0, 160)}`);
      resolve({ dir, events, code, stderr });
    });
  });
}

const ONLY = process.argv[2]; // A, B or C to run one; nothing runs all three

const calls = (events, tool) => events.filter((e) => e.type === 'progress' && e.name === `mcp__browser-act__${tool}`);
const observations = (events) => events.filter((e) => e.type === 'observation');
const cost = (events) => events.find((e) => e.type === 'result' || e.type === 'error')?.meter?.costUsd;

/** Ends every Edge process running on the proof profile — what closing its last tab does. */
function endTheWindow() {
  const marker = path.basename(PROFILE);
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' } | Select-Object -ExpandProperty ProcessId`;
  const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`).toString().trim();
  const pids = out.split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid));
    } catch {
      // already gone
    }
  }
  return pids.length;
}

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROOF_ROOT, { recursive: true });
console.log('Three Edge windows will open on this screen, one per run. LEAVE THEM OPEN — closing one is the gesture that ends its run, which is what run C proves on purpose. (A rerun on 2026-08-25 saw windows closed within seconds of opening; the runner reported each as closed, which is right, and the proof read as failed, which is also right.)');

// ── A. the allowlisted form ─────────────────────────────────────────────────
if (!ONLY || ONLY === 'A') {
console.log('\nA. the allowlisted, login-free form — a window opens on this screen');
const a = await runSession(
  'form',
  sessionConfig(
    '',
    `Open ${FORM} in the browser. Fill the "Text input" with "agentlings proof", choose "Two" in the dropdown select, tick the checkbox that is not already ticked, and press Submit. Do not touch the password field. After submitting, read the page that comes back and write RESULT.md with its heading and its message, verbatim. Use only the browser tools for this; do not guess what the page shows.`,
    ALLOW,
  ),
);
check('A: the run ended with a result', a.events.some((e) => e.type === 'result') && a.code === 0, `exit ${a.code}${a.stderr ? ` — ${a.stderr.split('\n')[0].slice(0, 120)}` : ''}`);
// The runner closes its own window at the end; that close must not be read
// as the person's — the server keeps the last error line it sees, so one
// here would file a finished job as failed (caught on the first proof run).
check('A: no error line at all — the run’s own window close is not the person’s', !a.events.some((e) => e.type === 'error') && a.events.at(-1)?.type === 'result', a.events.find((e) => e.type === 'error')?.message);
check('A: the meter carries the cost', typeof cost(a.events) === 'number');
check('A: it navigated to the form through the door', calls(a.events, 'browser_navigate').some((e) => String(e.input?.url ?? '').startsWith(FORM)));
const acted = ['browser_fill_form', 'browser_type', 'browser_click', 'browser_select_option'].flatMap((t) => calls(a.events, t));
check('A: it ACTED — filled, selected or clicked — through the twelve', acted.length > 0, `${acted.length} acting calls: ${[...new Set(acted.map((e) => e.name.replace('mcp__browser-act__', '')))].join(', ')}`);
check('A: every acting call has its observation on the trail', acted.every((e) => observations(a.events).some((o) => o.id === e.id)));
check('A: nothing it did off the list — every navigate was allowed', !observations(a.events).some((o) => /refused:/.test(String(o.head))));
const resultA = existsSync(path.join(a.dir, 'RESULT.md')) ? readFileSync(path.join(a.dir, 'RESULT.md'), 'utf8') : '';
check('A: RESULT.md reports the confirmation page — the submit reached the far end', /form submitted|received/i.test(resultA), resultA.split('\n').find((l) => /submitted|received/i.test(l))?.slice(0, 100));
check('A: the window closed with the run — no Edge left on the proof profile', endTheWindow() === 0);
console.log(`  A cost $${cost(a.events)?.toFixed(4) ?? '?'}, ${a.events.filter((e) => e.type === 'progress').length} calls`);
}

// ── B. a domain off the list ────────────────────────────────────────────────
if (!ONLY || ONLY === 'B') {
console.log('\nB. a domain off the list');
const b = await runSession(
  'refused',
  sessionConfig(
    '',
    'Open https://example.com/ in the browser and write its main heading into RESULT.md. If the browser refuses, write RESULT.md saying exactly what it answered and stop.',
    ALLOW,
  ),
);
const refused = observations(b.events).filter((o) => o.ok === false && /^refused: example\.com is not on the browser-act allowlist \(www\.selenium\.dev\)/.test(String(o.head)));
check('B: the navigate was refused by name, with the list, on the observation line', refused.length > 0, refused[0]?.head);
check('B: the refusal answers the navigate call itself', refused.some((o) => calls(b.events, 'browser_navigate').some((c) => c.id === o.id)));
check('B: no page off the list was ever shown — every navigate observation is a refusal', calls(b.events, 'browser_navigate').length > 0 && calls(b.events, 'browser_navigate').every((c) => observations(b.events).find((o) => o.id === c.id)?.ok === false), `${calls(b.events, 'browser_navigate').length} navigates`);
check('B: the run still ended with a result of its own — a refusal is the tool’s answer, not the run’s failure', b.events.some((e) => e.type === 'result') && !b.events.some((e) => e.type === 'error') && b.code === 0, `exit ${b.code}`);
check('B: RESULT.md says what the browser answered', /refused: example\.com is not on the browser-act allowlist/.test(existsSync(path.join(b.dir, 'RESULT.md')) ? readFileSync(path.join(b.dir, 'RESULT.md'), 'utf8') : ''));
endTheWindow();
console.log(`  B cost $${cost(b.events)?.toFixed(4) ?? '?'}`);
}

// ── C. the window closed mid-run ────────────────────────────────────────────
if (!ONLY || ONLY === 'C') {
console.log('\nC. the window closed mid-run');
let ended = 0;
const c = await runSession(
  'closed',
  sessionConfig(
    '',
    `Open ${FORM} in the browser, take a snapshot, then wait 20 seconds with browser_wait_for, take another snapshot, and only then write RESULT.md describing the form's fields.`,
    ALLOW,
  ),
  {
    onEvent: (event) => {
      // The first page is up: the person closes the window.
      if (ended === 0 && event.type === 'observation' && event.ok !== false && /Page URL/.test(String(event.head))) {
        setTimeout(() => {
          ended = endTheWindow();
          console.log(`  closed the window (${ended} process${ended === 1 ? '' : 'es'} ended)`);
        }, 1500);
        ended = -1;
      }
    },
  },
);
const closedLine = c.events.find((e) => e.type === 'error' && /browser window was closed/.test(String(e.message)));
check('C: the run said the window was closed, in its own sentence', Boolean(closedLine), closedLine?.message);
check('C: and that sentence is the LAST error line — nothing wrote over it', Boolean(closedLine) && c.events.filter((e) => e.type === 'error').at(-1) === closedLine);
check('C: the runner exited non-zero, promptly, with no result', c.code !== 0 && !c.events.some((e) => e.type === 'result'), `exit ${c.code}`);
check('C: no RESULT.md — the run did not carry on after the window went', !existsSync(path.join(c.dir, 'RESULT.md')));
console.log(`  C cost $${cost(c.events)?.toFixed(4) ?? 'unknown (the SDK reports cost only on a result)'}`);
}

console.log(bad === 0 ? '\nBROWSER-ACT RUNNER: 0 failed' : `\nNOT PROVEN — ${bad} failed`);
process.exitCode = bad === 0 ? 0 : 1;
