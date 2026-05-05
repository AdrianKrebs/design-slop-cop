// Re-apply scoreReport() to every cached raw result without re-fetching.
// Use this after tweaking pattern thresholds or score() logic when the
// in-page extract output is unchanged. Much faster than re-running the
// browser analyzer over the whole URL list.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { scoreReport } from './score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW = join(ROOT, 'results', 'raw');
const ALL = join(ROOT, 'results', 'all-results.json');

const files = (await readdir(RAW)).filter(f => f.endsWith('.json'));
console.log(`Rescoring ${files.length} cached results...`);

const merged = [];
let changed = 0;
for (const f of files) {
  const cached = JSON.parse(await readFile(join(RAW, f), 'utf8'));
  if (!cached.raw) {
    merged.push(cached);
    continue;
  }
  const scored = scoreReport(cached.raw);
  const next = { ...cached, ...scored };
  if (cached.score !== next.score || cached.patternsFlagged !== next.patternsFlagged) changed++;
  await writeFile(join(RAW, f), JSON.stringify(next, null, 2));
  merged.push(next);
}

await writeFile(ALL, JSON.stringify(merged, null, 2));
console.log(`Wrote ${merged.length} entries to results/all-results.json (${changed} changed)`);
