// Generates a self-contained results/index.html — tier filter tabs, stats
// banner, pattern frequency, site cards with screenshots. Open the file
// locally for browsing or for taking screenshots.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PATTERNS } from './patterns/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// CLI flags:
//   --no-images       omit the <img> thumbnails (keeps the file tiny)
//   --out=<path>      write the html to a custom path (default results/index.html)
//   --cdn-base=<url>  use this base URL for screenshot src instead of the local
//                     "screenshots/" path. e.g. https://kadoa.b-cdn.net/ai-design-checker
const noImages = process.argv.includes('--no-images');
const outArg = process.argv.find(a => a.startsWith('--out='));
const outPath = outArg ? outArg.slice('--out='.length) : join(ROOT, 'results', 'index.html');
const cdnArg = process.argv.find(a => a.startsWith('--cdn-base='));
const cdnBase = cdnArg ? cdnArg.slice('--cdn-base='.length).replace(/\/+$/, '') : null;

const all = JSON.parse(await readFile(join(ROOT, 'results', 'all-results.json'), 'utf8'));
let hnIndex = {};
try {
  hnIndex = JSON.parse(await readFile(join(ROOT, 'results', 'hn-index.json'), 'utf8'));
} catch {}

const ok = all.filter(r => !r.error);
const tierCount = { Heavy: 0, Mild: 0, Clean: 0 };
const patternCount = {};
for (const r of ok) {
  tierCount[r.tierLabel || r.tier] = (tierCount[r.tierLabel || r.tier] || 0) + 1;
  for (const p of r.patterns || []) {
    if (p.triggered) patternCount[p.id] = (patternCount[p.id] || 0) + 1;
  }
}

// Slim the per-site payload — strip raw signals, keep what the UI renders.
const sites = ok.map(r => {
  const meta = hnIndex[r.url] || null;
  return {
    url: r.url,
    slug: r.slug,
    title: meta?.title || r.url,
    hnId: meta?.id || null,
    points: meta?.points || null,
    postedAt: meta?.createdAt || null,
    score: r.score,
    tier: r.tierLabel || r.tier,
    flagged: (r.patterns || []).filter(p => p.triggered).map(p => p.id),
    total: r.patternsTotal
  };
}).sort((a, b) => b.score - a.score || b.flagged.length - a.flagged.length);

const patternMeta = PATTERNS.map(p => ({ id: p.id, shortLabel: p.shortLabel, label: p.label }));
const total = ok.length;

const data = { sites, tierCount, patternCount, patternMeta, total, noImages, cdnBase, generatedAt: new Date().toISOString() };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI Design Checker - Results</title>
<style>
  * { box-sizing: border-box; }
  body { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #111; background: #fafafa; }
  header { padding: 18px 24px; background: #fff; border-bottom: 1px solid #ddd; }
  header h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
  header .sub { color: #666; font-size: 12px; }
  header .sub a { color: #1a4dba; }

  .stats { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; padding: 18px 24px; background: #fff; border-bottom: 1px solid #eee; }
  @media (max-width: 760px) { .stats { grid-template-columns: 1fr; } }

  .tiers { display: flex; gap: 8px; align-items: stretch; }
  .tier-card { flex: 1; padding: 14px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: border-color 0.1s; }
  .tier-card.active { border-color: #111; }
  .tier-card.heavy { background: #fdecec; }
  .tier-card.mild  { background: #fff3c4; }
  .tier-card.clean { background: #e6f3e1; }
  .tier-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
  .tier-card .count { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 2px 0; }
  .tier-card .pct { font-size: 12px; opacity: 0.8; }

  .freq { font-size: 12px; }
  .freq-row { display: grid; grid-template-columns: 130px 1fr 40px; align-items: center; gap: 8px; margin-bottom: 4px; }
  .freq-row .name { color: #444; }
  .freq-row .bar { height: 14px; background: #e5e5e5; border-radius: 2px; overflow: hidden; }
  .freq-row .bar-fill { height: 100%; background: #888; }
  .freq-row .pct { color: #666; font-variant-numeric: tabular-nums; text-align: right; }

  .toolbar { padding: 12px 24px; background: #fff; border-bottom: 1px solid #eee; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .toolbar input { flex: 1; min-width: 200px; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
  .toolbar .count-out { color: #666; font-size: 12px; font-variant-numeric: tabular-nums; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 14px 24px 40px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; }
  .card .shot { width: 100%; aspect-ratio: 16 / 9; background: #f0f0f0; overflow: hidden; }
  .card .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .card .body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .card .head { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; }
  .card .title { font-size: 13px; font-weight: 600; line-height: 1.3; flex: 1; min-width: 0; word-wrap: break-word; }
  .card .tier-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
  .card .tier-badge.heavy { background: #c6310f; color: white; }
  .card .tier-badge.mild  { background: #c08c1a; color: white; }
  .card .tier-badge.clean { background: #2c7a3a; color: white; }
  .card .url { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.3; }
  .card .url a { color: #666; text-decoration: none; }
  .card .url a:hover { text-decoration: underline; }
  .card .score-row { display: flex; gap: 8px; align-items: center; font-size: 11px; color: #666; }
  .card .score-num { font-weight: 700; color: #111; font-variant-numeric: tabular-nums; }
  .card .hn-link { margin-left: auto; }
  .card .patterns { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .card .pat { font-size: 10px; padding: 1px 5px; border-radius: 2px; background: #fdecec; color: #8b1a1a; white-space: nowrap; }

  .empty { padding: 40px; text-align: center; color: #999; grid-column: 1 / -1; }
</style>
</head>
<body>

<header>
  <h1>AI Design Checker - Results</h1>
  <div class="sub">${total} Show HN submissions scored against 16 deterministic AI design patterns. <a href="https://github.com/AdrianKrebs/ai-design-checker">Source</a> · <a href="https://www.adriankrebs.ch/blog/design-slop/">Background</a></div>
</header>

<section class="stats">
  <div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-bottom:8px;">Tier · click to filter</div>
    <div class="tiers" id="tiers">
      <div class="tier-card heavy" data-tier="Heavy">
        <div class="label">Heavy · 5+ patterns</div>
        <div class="count">${tierCount.Heavy}</div>
        <div class="pct">${(100 * tierCount.Heavy / total).toFixed(1)}%</div>
      </div>
      <div class="tier-card mild" data-tier="Mild">
        <div class="label">Mild · 2–4</div>
        <div class="count">${tierCount.Mild}</div>
        <div class="pct">${(100 * tierCount.Mild / total).toFixed(1)}%</div>
      </div>
      <div class="tier-card clean" data-tier="Clean">
        <div class="label">Clean · 0–1</div>
        <div class="count">${tierCount.Clean}</div>
        <div class="pct">${(100 * tierCount.Clean / total).toFixed(1)}%</div>
      </div>
    </div>
  </div>
  <div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-bottom:8px;">Pattern frequency</div>
    <div class="freq" id="freq"></div>
  </div>
</section>

<section class="toolbar">
  <input type="text" id="search" placeholder="filter by url, title, or pattern…" autocomplete="off">
  <span class="count-out" id="count-out"></span>
</section>

<section class="grid" id="grid"></section>

<script>
const data = ${JSON.stringify(data)};
const patternLabel = Object.fromEntries(data.patternMeta.map(p => [p.id, p.shortLabel || p.label || p.id]));
let activeTier = null;  // null = All, otherwise 'Heavy' | 'Mild' | 'Clean'
let query = '';

function renderFreq() {
  const max = Math.max(...Object.values(data.patternCount), 1);
  const sorted = data.patternMeta
    .map(p => ({ ...p, count: data.patternCount[p.id] || 0 }))
    .sort((a, b) => b.count - a.count);
  document.getElementById('freq').innerHTML = sorted.map(p => {
    const pct = (100 * p.count / data.total).toFixed(1);
    const w = (100 * p.count / max).toFixed(1);
    return \`<div class="freq-row"><div class="name">\${p.shortLabel}</div><div class="bar"><div class="bar-fill" style="width:\${w}%"></div></div><div class="pct">\${pct}%</div></div>\`;
  }).join('');
}

function renderGrid() {
  const filtered = data.sites.filter(s => {
    if (activeTier && s.tier !== activeTier) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    if (s.url.toLowerCase().includes(q)) return true;
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.flagged.some(id => (patternLabel[id] || id).toLowerCase().includes(q))) return true;
    return false;
  });
  document.getElementById('count-out').textContent = filtered.length + ' / ' + data.sites.length + ' sites';
  if (!filtered.length) {
    document.getElementById('grid').innerHTML = '<div class="empty">No sites match.</div>';
    return;
  }
  document.getElementById('grid').innerHTML = filtered.map(s => {
    const tierClass = s.tier.toLowerCase();
    const hnLink = s.hnId
      ? \`<a class="hn-link" href="https://news.ycombinator.com/item?id=\${s.hnId}" target="_blank" rel="noopener" title="HN discussion">HN ↗</a>\`
      : '';
    const posted = s.postedAt ? formatDate(s.postedAt) : '';
    const pats = s.flagged.map(id => \`<span class="pat">\${escape(patternLabel[id] || id)}</span>\`).join('');
    const shotBase = data.cdnBase || 'screenshots';
    const shot = data.noImages
      ? ''
      : \`<a class="shot" href="\${escape(s.url)}" target="_blank" rel="noopener"><img loading="lazy" src="\${shotBase}/\${escape(s.slug)}.png" alt=""></a>\`;
    return \`
<div class="card">
  \${shot}
  <div class="body">
    <div class="head">
      <div class="title">\${escape(s.title)}</div>
      <span class="tier-badge \${tierClass}">\${s.tier}</span>
    </div>
    <div class="url"><a href="\${escape(s.url)}" target="_blank" rel="noopener">\${escape(s.url)}</a></div>
    <div class="score-row">
      <span class="score-num">\${s.score}</span> / 100 ·
      <span>\${s.flagged.length}/\${s.total} patterns</span>
      \${posted ? '· <span title="Posted on HN">' + posted + '</span>' : ''}
      \${hnLink}
    </div>
    \${pats ? '<div class="patterns">' + pats + '</div>' : ''}
  </div>
</div>\`;
  }).join('');
}

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // "Apr 19" if same year as now, else "Apr 19, 2025"
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return months[d.getMonth()] + ' ' + d.getDate() + (sameYear ? '' : ', ' + d.getFullYear());
}

document.getElementById('tiers').addEventListener('click', e => {
  const card = e.target.closest('.tier-card');
  if (!card) return;
  const tier = card.dataset.tier;
  activeTier = (activeTier === tier) ? null : tier;
  document.querySelectorAll('.tier-card').forEach(c => c.classList.toggle('active', c.dataset.tier === activeTier));
  renderGrid();
});

document.getElementById('search').addEventListener('input', e => {
  query = e.target.value.trim();
  renderGrid();
});

renderFreq();
renderGrid();
</script>
</body>
</html>
`;

await writeFile(outPath, html);
console.log(`Wrote ${outPath} · ${total} sites · Heavy ${tierCount.Heavy} · Mild ${tierCount.Mild} · Clean ${tierCount.Clean}${noImages ? ' · no images' : ''}`);
