// Checks an art pack before it goes anywhere near the app.
//   npm run art:check                 — checks the pack currently installed
//   npm run art:check -- path/to.json — checks a candidate pack
//
// Run this on anything a supplier, a free pack or a commission hands over:
// it answers "will this work" without opening the app.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTLING_PACK, validatePack } from '@agentlings/shared';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2] ?? path.join(ROOT, 'web', 'public', 'art', 'agentling.json');

if (!existsSync(target)) {
  console.error(`No atlas at ${target}`);
  process.exit(1);
}

const atlas = JSON.parse(readFileSync(target, 'utf8')) as { meta?: { image?: string } };
const problems = validatePack(atlas, AGENTLING_PACK);

// The atlas can be perfect and still point at a PNG nobody shipped.
const image = atlas.meta?.image;
if (typeof image === 'string') {
  const imagePath = path.resolve(path.dirname(target), image);
  if (!existsSync(imagePath)) {
    problems.push({ level: 'error', message: `meta.image "${image}" is not next to the atlas` });
  } else if (statSync(imagePath).size === 0) {
    problems.push({ level: 'error', message: `"${image}" is empty` });
  }
}

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warning');

console.log(`Checking ${path.relative(ROOT, target)}`);
for (const problem of errors) console.log(`  error   ${problem.message}`);
for (const problem of warnings) console.log(`  warning ${problem.message}`);

if (errors.length === 0 && warnings.length === 0) console.log('  looks good — every cycle present, frames consistent');
console.log(
  errors.length > 0
    ? `\n${errors.length} error(s): the app would fall back to its built-in art.`
    : '\nUsable. Drop the PNG and atlas into web/public/art to install it.',
);
process.exit(errors.length > 0 ? 1 : 0);
