/**
 * Spawned by ledger.died.test.ts and killed from outside.
 *
 * Wires what index.ts wires — a queue, a Sim, and the ledger's open row on
 * the start hook — starts one job on an executor that never returns, prints
 * the job id once the row is on disk, and then stays alive until the test
 * kills it. It does nothing on the way out because it is given no way to:
 * that is the whole point.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { append, openRow } from './ledger';
import { JobQueue } from './queue';
import { Sim } from './sim';

const root = process.argv[2];
if (!root) throw new Error('usage: ledger.died.fixture.ts <sandboxRoot>');
const levelDir = path.join(root, 'levels', 'lvl');
mkdirSync(levelDir, { recursive: true });

const queue = new JobQueue(levelDir);
const sim = new Sim(
  [{ id: 'a1', name: 'Pip', color: 0x7bd88f, role: 'worker' }],
  queue,
  { run: () => new Promise(() => {}) },
  undefined,
  undefined,
  (agentling, job) => {
    append(root, openRow(job, 'lvl', agentling.role, Date.now()));
    console.log(`open ${job.id}`);
  },
);
const job = queue.add({ title: 'T', prompt: 'p' });
for (let i = 0; i < 500 && queue.get(job.id)?.status !== 'running'; i++) sim.step();
if (queue.get(job.id)?.status !== 'running') throw new Error('the job never started');
// Alive until killed: the executor's promise holds nothing, so the loop
// would otherwise drain and exit cleanly — the one thing this must not do.
setInterval(() => {}, 60_000);
