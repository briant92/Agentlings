// What a trial run actually did: the ledger row, the recipe it banked or
// matched, the trail's tool calls in order, and the deliverables.
//
//   node read-trial.mjs <jobId>

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4600';
const LEVEL = 'training-ground';
const ROOT = 'C:/Users/MSI/Dev/Agentlings/.agentlings';
const id = process.argv[2];
if (!id) {
  console.error('usage: node read-trial.mjs <jobId>');
  process.exit(1);
}

const lines = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l)];
          } catch {
            return [];
          }
        })
    : [];

// Ledger row(s) for the job.
const rows = lines(path.join(ROOT, 'ledger.jsonl')).filter((r) => r.jobId === id);
for (const r of rows) {
  console.log('ledger:', JSON.stringify({ tier: r.tier, jobClass: r.jobClass, outcome: r.outcome, costUsd: r.costUsd, priceUsd: r.priceUsd, turns: r.turns, turnsAllowed: r.turnsAllowed, cut: r.cut, recipeKey: r.recipeKey, toolsUsed: r.toolsUsed, lastTool: r.lastTool }));
}
if (rows.length === 0) console.log('ledger: no row yet');

// Recipes on the level: anything keyed like the trial sentence.
const levelDir = path.join(ROOT, 'levels', LEVEL);
for (const name of readdirSync(levelDir)) {
  if (!/recipe/i.test(name)) continue;
  const file = path.join(levelDir, name);
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : (parsed.recipes ?? Object.values(parsed));
    for (const rec of list) {
      if (!/reconcile/i.test(rec.key ?? '')) continue;
      console.log(`recipe (${name}):`, JSON.stringify({ key: rec.key?.slice(0, 60), hits: rec.hits, successes: rec.successes, capabilities: rec.capabilities, answer: rec.answer ? rec.answer.slice(0, 80) : undefined, approach: rec.approach?.slice(0, 400) }));
    }
  } catch {
    /* not a recipes file */
  }
}

// The trail: every tool call in order, clipped.
const res = await fetch(`${BASE}/api/levels/${LEVEL}/jobs/${id}/trajectory`);
const body = await res.json().catch(() => ({}));
const trail = Array.isArray(body) ? body : (body.lines ?? body.trajectory ?? []);
console.log(`trail: ${trail.length} lines`);
let n = 0;
for (const l of trail) {
  const kind = l.kind ?? l.type;
  if (kind === 'call' || kind === 'progress' || l.name) {
    n += 1;
    console.log(`  ${String(n).padStart(2)} [${l.pass ?? ''}] ${l.name ?? kind}: ${String(l.args ?? l.input ?? '').slice(0, 110)}`);
  } else if (kind === 'end' || kind === 'compact') {
    console.log(`  -- ${kind}: ${JSON.stringify(l).slice(0, 160)}`);
  }
}

// Deliverables.
const out = await fetch(`${BASE}/api/levels/${LEVEL}/jobs/${id}/output`);
const outputs = await out.json().catch(() => ({}));
const names = (outputs.files ?? outputs.outputs ?? (Array.isArray(outputs) ? outputs : [])).map((f) => f.name ?? f);
console.log('outputs:', names.join(', '));
