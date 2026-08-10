// Checks an art pack before it goes anywhere near the app.
//   npm run art:check                  — checks the art pack currently installed
//   npm run pack:check -- path/to.json — checks any pack, art or level
//
// Run this on anything a supplier, a free pack or a commission hands over:
// it answers "will this work" without opening the app.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENTLING_PACK,
  slugProblem,
  validateLevelPack,
  validatePack,
  type LevelPack,
} from '@agentlings/shared';
import { checkPlates } from '../server/src/plates';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2] ?? path.join(ROOT, 'web', 'public', 'art', 'agentling.json');

if (!existsSync(target)) {
  console.error(`No atlas at ${target}`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown> & {
  meta?: { image?: string };
};

// Three shapes now go through here. Dispatching on shape rather than on a flag
// or a second command means whatever you were handed can just be pointed at
// this, which is the whole job: answering "will this work" without opening the
// app.
//
// The wrapper matters more than it looks. A run's deliverable is PACK.json,
// which is `{ slug, pack }` — and the brief tells the session to check exactly
// that file. Without this branch the checker answered "not recognisably a
// pack" for the one file it most needed to judge, so the instruction could
// only be satisfied before the file reached its final shape. Found by the
// first real authoring run.
const wrapped = 'pack' in json || 'slug' in json;
const kind = 'frames' in json ? 'art' : wrapped || 'ops' in json ? 'level' : 'unknown';

if (kind === 'unknown') {
  console.log(`Checking ${path.relative(ROOT, target)}`);
  console.log(
    '  error   not recognisably a pack: an art pack has "frames", a level pack has "ops",',
  );
  console.log('          and a run\'s deliverable has "slug" and "pack"');
  process.exit(1);
}

const level = wrapped ? (json as { pack?: unknown }).pack : json;
const problems =
  kind === 'art' ? validatePack(json, AGENTLING_PACK) : validateLevelPack(level);

// The slug is only present on the wrapper, and it is the half the install can
// still refuse after the pack itself is perfect — which is exactly what the
// first real authoring run hit: a flawless pack that Approve would not take,
// because the name was already in use. The checker can see the packs folder,
// so it can say so here instead.
if (wrapped) {
  const dir = path.join(ROOT, 'web', 'public', 'packs');
  const taken = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  const says = slugProblem((json as { slug?: unknown }).slug, taken);
  if (says) problems.unshift({ level: 'error', message: says });
}

// A level pack sits beside its plates — in its installed folder, or at the
// sandbox root beside PACK.json (D-143) — so the raster half of the plate
// rules runs right here, exactly as the server runs it at scan and harvest.
if (kind === 'level' && problems.every((p) => p.level !== 'error')) {
  problems.push(...checkPlates(level as LevelPack, path.dirname(path.resolve(target))));
}

// The atlas can be perfect and still point at a PNG nobody shipped.
const image = json.meta?.image;
if (kind === 'art' && typeof image === 'string') {
  const imagePath = path.resolve(path.dirname(target), image);
  if (!existsSync(imagePath)) {
    problems.push({ level: 'error', message: `meta.image "${image}" is not next to the atlas` });
  } else if (statSync(imagePath).size === 0) {
    problems.push({ level: 'error', message: `"${image}" is empty` });
  }
}

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warning');

console.log(`Checking ${path.relative(ROOT, target)} — ${kind} pack`);
for (const problem of errors) console.log(`  error   ${problem.message}`);
for (const problem of warnings) console.log(`  warning ${problem.message}`);

if (errors.length === 0 && warnings.length === 0) {
  console.log(
    kind === 'art'
      ? '  looks good — every cycle present, frames consistent'
      : '  looks good — every slot defined, every colour and coordinate resolvable',
  );
}
const ok =
  kind === 'art'
    ? 'Usable. Drop the PNG and atlas into web/public/art to install it.'
    : 'Usable. Drop the folder into web/public/packs to install it.';
console.log(
  errors.length > 0
    ? `\n${errors.length} error(s): the app would fall back to its built-in art.`
    : `\n${ok}`,
);
process.exit(errors.length > 0 ? 1 : 0);
