// Cross-references results/all-results.json with results/hn-index.json and
// emits three lists by tier: results/index/{heavy,mild,clean}.{txt,json}.
// txt files: one HN id per line.
// json files: { id, url, title, score, patternsFlagged, points }[]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'results', 'index');

await mkdir(OUT_DIR, { recursive: true });

const all = JSON.parse(await readFile(join(ROOT, 'results', 'all-results.json'), 'utf8'));
const hnIndex = JSON.parse(await readFile(join(ROOT, 'results', 'hn-index.json'), 'utf8'));

const buckets = { Heavy: [], Mild: [], Clean: [] };
let unmapped = 0;
for (const r of all) {
  if (r.error) continue;
  const meta = hnIndex[r.url];
  if (!meta) { unmapped++; continue; }
  const tier = r.tierLabel || r.tier;
  if (!buckets[tier]) continue;
  buckets[tier].push({
    id: meta.id,
    url: r.url,
    title: meta.title,
    score: r.score,
    patternsFlagged: r.patternsFlagged,
    points: meta.points,
    flagged: r.patterns.filter(p => p.triggered).map(p => p.id)
  });
}

// Sort: heaviest-first within each tier
for (const tier of Object.keys(buckets)) {
  buckets[tier].sort((a, b) => b.patternsFlagged - a.patternsFlagged || b.score - a.score);
}

for (const [tier, items] of Object.entries(buckets)) {
  const slug = tier.toLowerCase();
  await writeFile(join(OUT_DIR, slug + '.txt'), items.map(i => i.id).join('\n') + '\n');
  await writeFile(join(OUT_DIR, slug + '.json'), JSON.stringify(items, null, 2));
}

console.log('Heavy:', buckets.Heavy.length);
console.log('Mild: ', buckets.Mild.length);
console.log('Clean:', buckets.Clean.length);
console.log('(unmapped:', unmapped, ')');
console.log('Wrote', OUT_DIR + '/{heavy,mild,clean}.{txt,json}');
