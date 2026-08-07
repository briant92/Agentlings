// Renders a level pack to a PNG, and says whether the crew can be seen on it.
//   npm run pack:render -- path/to/PACK.json [out.png] [--scale 2]
//
// The checker answers "will this load". This answers "does it read" — and it
// is the only way an agentling authoring a world can look at what it drew,
// because the app's own renderer needs a browser and a sandbox has none.
//
// Same interpreter as the app: `drawScene` from shared, walked through a
// surface that writes pixels instead of canvas calls. A renderer that could
// disagree with the app would be worse than no renderer, because it would be
// believed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  anchorsOf,
  drawScene,
  EXIT_X,
  MAX_STATIONS,
  paintOf,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  validateLevelPack,
  type LevelPack,
} from '@agentlings/shared';
import { COLOR_POOL } from '../server/src/levels';
import {
  bufferSurface,
  drawStandIn,
  encodePng,
  relLuminance,
  separationAt,
} from '../server/src/raster';

const args = process.argv.slice(2);
const scaleFlag = args.indexOf('--scale');
const scale = scaleFlag >= 0 ? Number(args[scaleFlag + 1]) || 1 : 1;
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !(scaleFlag >= 0 && i === scaleFlag + 1),
);
const target = positional[0];

if (!target || !existsSync(target)) {
  console.error('Usage: npm run pack:render -- path/to/PACK.json [out.png] [--scale 2]');
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
// PACK.json wraps the pack in `{ slug, pack }`; an installed pack.json is the
// pack itself. Both are worth rendering, and the difference is one field.
const pack = (
  parsed.pack && typeof parsed.pack === 'object' ? parsed.pack : parsed
) as unknown as LevelPack;

const errors = validateLevelPack(pack).filter((p) => p.level === 'error');
if (errors.length > 0) {
  console.error(`Cannot render ${target} — it is not a valid pack:`);
  for (const e of errors) console.error(`  ${e.message}`);
  process.exit(1);
}

const out = positional[1] ?? target.replace(/\.json$/i, '.png');
const anchors = anchorsOf(pack);
const { surface, raster } = bufferSurface(
  anchors.worldWidth,
  anchors.viewH,
  scale,
  paintOf(pack.theme, 'void'),
);

drawScene(surface, pack, pack.theme, anchors);

// Where the crew actually stand: the hatch, the signposts, the door. Measured
// before the stand-ins are drawn — the question is what the pack puts behind
// an agentling, and a block already painted there would answer with its own
// colour.
const positions = [
  SPAWN_X,
  ...Array.from({ length: MAX_STATIONS }, (_, i) => STATION_BASE_X + i * STATION_SPACING),
  EXIT_X,
];
const separations = separationAt(raster, positions, anchors.groundY, COLOR_POOL, scale);

const rim = pack.rim ? paintOf(pack.theme, pack.rim) : undefined;
for (const [i, at] of positions.entries()) {
  drawStandIn(surface, at, anchors.groundY, COLOR_POOL[i % COLOR_POOL.length], rim);
}

writeFileSync(out, encodePng(raster));

const worst = separations.reduce((a, b) => (b.separation < a.separation ? b : a));
// How the rim fares against the same background. A gown that vanishes is only
// a fault when nothing else separates it — the rim is the device that is
// supposed to survive exactly this, so a verdict that ignores it tells a pack
// with a good rim to go and set one.
const rimLuminance = rim === undefined ? undefined : relLuminance(rim);
const rimSeparation =
  rimLuminance === undefined ? 0 : Math.abs(rimLuminance - worst.behind);
const vanishing = COLOR_POOL.filter(
  (g) => Math.abs(relLuminance(g) - worst.behind) < 5,
);

console.log(`Rendered ${path.basename(target)} → ${out}  (${raster.w}×${raster.h})`);
console.log(
  `  ${pack.name} · viewH ${pack.viewH} · groundY ${pack.groundY} · rim ${pack.rim ?? '(none)'}`,
);
console.log('');
console.log('  Crew legibility — luminance of the scene behind each standing place (0–100):');
for (const s of separations) {
  const flag = s.separation < 5 ? '  <- a gown vanishes' : s.separation < 10 ? '  <- thin' : '';
  console.log(
    `    x ${String(s.at).padStart(4)}   behind ${s.behind.toFixed(1).padStart(5)}` +
      `   nearest gown ${s.separation.toFixed(1).padStart(5)}${flag}`,
  );
}
console.log('');
if (vanishing.length === 0) {
  console.log(`  Worst separation ${worst.separation.toFixed(1)} — every gown reads on its own.`);
} else {
  const names = vanishing.map((g) => `#${g.toString(16).padStart(6, '0')}`).join(', ');
  console.log(
    `  ${vanishing.length} of ${COLOR_POOL.length} crew colours vanish into this` +
      ` background at x ${worst.at} (${names}).`,
  );
  if (rimSeparation >= 10) {
    console.log(
      `  The rim carries them: \`${pack.rim}\` separates ${rimSeparation.toFixed(1)} from the same` +
        ' spot, which is exactly the job it exists for. Worth knowing, not worth fixing.',
    );
  } else if (pack.rim) {
    console.log(
      `  And the rim cannot carry them: \`${pack.rim}\` separates only` +
        ` ${rimSeparation.toFixed(1)} here. Pick a rim slot that contrasts with this background,` +
        ' or change what the pack draws behind that spot.',
    );
  }
}
if (!pack.rim) {
  console.log('  No `rim` set. Set one: it is the only thing that survives a busy backdrop.');
} else if (rimSeparation < 10 && vanishing.length === 0) {
  console.log(
    `  The rim is nearly invisible here (\`${pack.rim}\` separates ${rimSeparation.toFixed(1)}),` +
      ' which costs nothing while the gowns themselves separate — but it is the only guard left' +
      ' if the background ever changes.',
  );
}
if (pack.ambient?.length) {
  console.log(
    `  Note: ${pack.ambient.length} ambient effect(s) are not in this picture — they are animated,` +
      ' and this is a still.',
  );
}
