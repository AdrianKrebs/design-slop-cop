// Map every URL in urls.txt back to its HN post id by re-querying the
// Algolia HN API. Writes results/hn-index.json :: { url → { id, title } }.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PAGES_TO_FETCH = parseInt(process.argv.find(a => a.startsWith('--pages='))?.slice(8) || '10', 10);

const urls = (await readFile(join(ROOT, 'urls.txt'), 'utf8'))
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const wanted = new Set(urls);

const map = {};
// Algolia caps a single search_by_date query at ~1000 results, so to reach
// older Show HN posts we walk backwards in time using `created_at_i` cursor.
let cursorTs = Math.floor(Date.now() / 1000); // start at "now"
let totalPages = 0;
while (totalPages < 60) {
  const filters = `created_at_i<${cursorTs}`;
  const qs = new URLSearchParams({ tags: 'show_hn', hitsPerPage: '100', numericFilters: filters });
  const url = `https://hn.algolia.com/api/v1/search_by_date?${qs.toString()}`;
  process.stdout.write(`HN page ${totalPages + 1} (before ts ${cursorTs})... `);
  const res = await fetch(url, { headers: { 'User-Agent': 'ai-design-checker/0.1' } });
  if (!res.ok) { console.log(`HTTP ${res.status}, stopping`); break; }
  const data = await res.json();
  const hits = data.hits || [];
  if (!hits.length) { console.log('no more hits'); break; }
  let added = 0;
  let oldestTs = cursorTs;
  for (const hit of hits) {
    if (hit.created_at_i && hit.created_at_i < oldestTs) oldestTs = hit.created_at_i;
    if (!hit.url || !hit.objectID) continue;
    if (!wanted.has(hit.url)) continue;
    if (!map[hit.url]) {
      map[hit.url] = {
        id: hit.objectID,
        title: hit.title,
        points: hit.points,
        author: hit.author,
        createdAt: hit.created_at || (hit.created_at_i ? new Date(hit.created_at_i * 1000).toISOString() : null)
      };
      added++;
    }
  }
  console.log(`+${added} matched (${Object.keys(map).length} total)`);
  if (oldestTs >= cursorTs) break; // would loop
  cursorTs = oldestTs;
  totalPages++;
  if (Object.keys(map).length >= wanted.size) break;
  await new Promise(r => setTimeout(r, 150));
}

await writeFile(join(ROOT, 'results', 'hn-index.json'), JSON.stringify(map, null, 2));
console.log(`Wrote results/hn-index.json — ${Object.keys(map).length}/${urls.length} URLs mapped to HN post ids`);
