import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One-off: put crew tints that predate the DB32 ramp back onto it.
 *
 * A tint used to be a label colour and nothing else, so being off the palette
 * cost nothing. It stopped being free once the sprite itself is painted in it:
 * a tint is snapped to the nearest palette entry before it reaches the art, and
 * Pip's mint green (#7bd88f) sits 1% closer to `steel` than to `limeLight`
 * under the perceptual weighting — so a green agentling was drawn grey while
 * their name label stayed green.
 *
 * Fixing the seed alone would have been correct and inert: hq migrated long
 * ago, and the value is already written to disk. Same trap as the ledger's
 * `hasRepo` and `recipeKey` backfills.
 *
 * A row is rewritten only when it still holds the exact colour the old seed
 * wrote. That is an identification, not a guess — a tint someone changed on
 * purpose is left alone, and running this twice does nothing the second time.
 *
 *   node scripts/backfill-roster-palette.mjs [--write] [--all]
 *
 * Without --all only Pip is moved, because Pip's is the only snap that lands
 * on the wrong colour: Moss and Bea already snap within their own hue, so
 * rewriting them would change how they look to fix nothing.
 */

const ROOT = path.join(process.cwd(), '.agentlings');
const write = process.argv.includes('--write');
const all = process.argv.includes('--all');

/** old hand-written tint → the colour the current seed gives that hire. */
const MOVES = [
  { name: 'Pip', from: 0x7bd88f, to: 0x99e550, always: true },
  { name: 'Dot', from: 0x6fb7ff, to: 0x639bff, always: false },
  { name: 'Moss', from: 0xffb86c, to: 0xd9a066, always: false },
  { name: 'Bea', from: 0xff8fa3, to: 0xd95763, always: false },
];

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const levelsDir = path.join(ROOT, 'levels');

if (!existsSync(levelsDir)) {
  console.error(`no levels at ${levelsDir}`);
  process.exit(1);
}

const wanted = MOVES.filter((m) => all || m.always);
let changed = 0;
let files = 0;

for (const level of readdirSync(levelsDir)) {
  const file = path.join(levelsDir, level, 'roster.json');
  if (!existsSync(file)) continue;

  let crew;
  try {
    crew = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.warn(`  [${level}] unreadable roster, skipped`);
    continue;
  }
  if (!Array.isArray(crew)) continue;

  let touched = false;
  for (const member of crew) {
    const move = wanted.find((m) => m.from === member.color);
    if (!move) continue;
    console.log(
      `  [${level}] ${member.name} (${member.id}) ${hex(move.from)} → ${hex(move.to)}`,
    );
    member.color = move.to;
    touched = true;
    changed++;
  }

  if (touched) {
    files++;
    if (write) {
      copyFileSync(file, `${file}.bak`);
      writeFileSync(file, `${JSON.stringify(crew, null, 2)}\n`);
    }
  }
}

console.log(
  changed === 0
    ? 'nothing to move — every crew tint is already on the ramp'
    : `${changed} tint(s) in ${files} roster(s)${write ? ' rewritten (.bak kept)' : ' — dry run, pass --write'}`,
);
