// Dumps tier-grouped HN ID lists. Output:
//   results/tier-heavy.txt, tier-mild.txt, tier-clean.txt — one HN id per line
//   results/tier-heavy.json, tier-mild.json, tier-clean.json — entries with id, title, url, score, flagged, slug
// Run: node src/dump-tiers.js

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const all = JSON.parse(await readFile(join(ROOT, 'results', 'all-results.json'), 'utf8'));
let hnIndex = {};
try {
  hnIndex = JSON.parse(await readFile(join(ROOT, 'results', 'hn-index.json'), 'utf8'));
} catch {}

const ok = all.filter(r => !r.error);
const tiers = { Heavy: [], Mild: [], Clean: [] };

for (const r of ok) {
  const tier = r.tierLabel || r.tier;
  if (!tiers[tier]) continue;
  const meta = hnIndex[r.url] || null;
  tiers[tier].push({
    id: meta?.id || null,
    title: meta?.title || r.url,
    url: r.url,
    score: r.score,
    flagged: (r.patterns || []).filter(p => p.triggered).map(p => p.id),
    flaggedCount: (r.patterns || []).filter(p => p.triggered).length,
    slug: r.slug,
    points: meta?.points || null,
    postedAt: meta?.createdAt || null
  });
}

// Sort each tier by score desc, then by flagged count desc.
for (const t of Object.keys(tiers)) {
  tiers[t].sort((a, b) => b.score - a.score || b.flaggedCount - a.flaggedCount);
}

const tierFiles = { Heavy: 'tier-heavy', Mild: 'tier-mild', Clean: 'tier-clean' };
for (const [tier, base] of Object.entries(tierFiles)) {
  const entries = tiers[tier];
  const ids = entries.filter(e => e.id != null).map(e => e.id);
  await writeFile(join(ROOT, 'results', `${base}.json`), JSON.stringify(entries, null, 2));
  await writeFile(join(ROOT, 'results', `${base}.txt`), ids.join('\n') + '\n');
  console.log(`${tier}: ${entries.length} sites · ${ids.length} with HN ids · ${base}.{json,txt}`);
}
