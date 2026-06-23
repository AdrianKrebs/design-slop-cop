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
}).sort((a, b) => {
  const ta = a.postedAt ? new Date(a.postedAt).getTime() : 0;
  const tb = b.postedAt ? new Date(b.postedAt).getTime() : 0;
  return tb - ta || b.score - a.score;
});

const patternMeta = PATTERNS.map(p => ({ id: p.id, shortLabel: p.shortLabel, label: p.label, description: p.description }));
const total = ok.length;

const data = { sites, tierCount, patternCount, patternMeta, total, noImages, cdnBase, generatedAt: new Date().toISOString() };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/icon.png">
<title>Design Slop Cop · Show HN submissions scored for AI design patterns</title>
<style>
  /* GOV.UK Design System styling — Arial, black masthead, blue underlined
     links, flat square panels, #b1b4b6 hairlines, yellow focus, tier colours. */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.5 arial, "Helvetica Neue", Helvetica, sans-serif;
    background: #ffffff;
    color: #0b0c0c;
  }
  a { color: #1d70b8; text-decoration: underline; text-underline-offset: 0.15em; text-decoration-thickness: 1px; }
  a:visited { color: #4c2c92; }
  a:hover { color: #003078; text-decoration-thickness: 3px; }
  a:focus { outline: 3px solid transparent; color: #0b0c0c; background: #fd0; box-shadow: 0 -2px #fd0, 0 4px #0b0c0c; text-decoration: none; }
  .wrap { max-width: 1100px; margin: 0 auto; background: #fff; }

  /* Topbar — HN orange masthead (Show HN identity); the rest stays GOV.UK */
  .topbar { background: #ff6600; }
  .topbar-inner { display: flex; align-items: baseline; gap: 0; flex-wrap: wrap; line-height: 1.5; max-width: 1100px; margin: 0 auto; padding: 12px 16px; }
  .topbar a { color: #0b0c0c; font-weight: 400; font-size: 16px; padding: 0 7px; text-decoration: none; }
  .topbar a:visited { color: #0b0c0c; }
  .topbar a:hover { color: #0b0c0c; text-decoration: underline; text-decoration-thickness: 3px; }
  .topbar a:focus { color: #0b0c0c; background: #fd0; box-shadow: 0 -2px #fd0, 0 4px #0b0c0c; text-decoration: none; }
  .topbar .sep { color: rgba(0,0,0,.4); padding: 0; }
  .topbar .brand a { font-weight: 700; font-size: 17px; padding-right: 10px; padding-left: 0; }
  .topbar .right { margin-left: auto; }
  .topbar a.topsel { color: #fff; font-weight: 700; text-decoration: underline; text-decoration-thickness: 3px; }

  /* Subline strip */
  .subline {
    color: #505a5f;
    font-size: 14px;
    padding: 10px 16px 6px;
    line-height: 1.55;
  }
  .subline a { color: #1d70b8; }
  .subline p { margin: 0 0 6px; }

  /* Inline tier breakdown — clickable filter, severity-colored */
  .subline .tier-link { text-decoration: none; }
  .subline .tier-link b { font-weight: 700; }
  .subline .tier-link:hover { text-decoration: underline; text-decoration-thickness: 3px; }
  .subline .tier-heavy { color: #942514; }
  .subline .tier-mild  { color: #594d00; }
  .subline .tier-clean { color: #005a30; }

  /* Pattern frequency — also a filter UI */
  .freq {
    padding: 6px 16px 12px;
    font-size: 14px;
    color: #505a5f;
  }
  .freq[open] > .freq-title::-webkit-details-marker,
  .freq[open] > .freq-title::marker { color: #505a5f; }
  .freq-title { color: #0b0c0c; padding: 6px 0 8px; font-size: 14px; cursor: pointer; list-style: none; user-select: none; }
  .freq-title::before { content: '▾'; color: #0b0c0c; font-size: 14px; padding-right: 6px; display: inline-block; transform: translateY(-1px); }
  .freq:not([open]) > .freq-title::before { content: '▸'; }
  .freq-title:hover { color: #1d70b8; }
  .freq-title:hover::before { color: #1d70b8; }
  .freq-title::-webkit-details-marker { display: none; }
  .freq-title .clear { color: #1d70b8; padding-left: 8px; cursor: pointer; text-decoration: underline; }
  .freq-title .clear:hover { text-decoration-thickness: 3px; }
  .freq-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    column-gap: 18px;
    row-gap: 1px;
  }
  .freq-row { display: grid; grid-template-columns: 100px 1fr 32px; gap: 8px; align-items: center; line-height: 1.7; cursor: pointer; padding: 2px 4px; }
  .freq-row:hover { background: #f3f2f1; }
  .freq-row.active { background: #f3f2f1; }
  .freq-row.active .name { color: #1d70b8; font-weight: 700; }
  .freq-row .name { color: #0b0c0c; }
  .freq-row .bar { height: 7px; background: #e8e8e8; }
  .freq-row .bar-fill { height: 100%; background: #505a5f; }
  .freq-row.active .bar-fill { background: #1d70b8; }
  .freq-row .pct { text-align: right; color: #505a5f; font-variant-numeric: tabular-nums; font-size: 13px; }

  /* Active-pattern banner (replaces search row when pattern is set) */
  .active-banner { padding: 8px 16px; font-size: 14px; color: #505a5f; display: flex; align-items: baseline; gap: 8px; min-height: 1.6em; }
  .active-banner .label { color: #505a5f; }
  .active-banner .pat-name { color: #1d70b8; font-weight: 700; }
  .active-banner .clear-btn { color: #1d70b8; cursor: pointer; padding-left: 4px; text-decoration: underline; }
  .active-banner .clear-btn:hover { text-decoration-thickness: 3px; }
  .active-banner .count { color: #505a5f; margin-left: auto; }

  /* List — ranked rows */
  .list { padding: 4px 0 24px; }
  .item { display: grid; grid-template-columns: auto 70px 1fr; gap: 8px; padding: 10px 16px; align-items: flex-start; scroll-margin-top: 8px; border-bottom: 1px solid #b1b4b6; }
  .item:hover { background: #f3f2f1; }
  .item:target { background: #f3f2f1; box-shadow: inset 4px 0 0 #1d70b8; }
  .item .rank { color: #505a5f; font-size: 16px; text-align: right; padding-top: 2px; font-variant-numeric: tabular-nums; }
  .item .rank a { color: #505a5f; text-decoration: none; }
  .item .rank a:hover { color: #1d70b8; }
  .item .shot { width: 70px; height: 46px; background: #fff; border: 1px solid #b1b4b6; overflow: hidden; display: block; flex-shrink: 0; }
  .item .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .item.no-shot .shot { visibility: hidden; }
  .item .body { line-height: 1.5; min-width: 0; }
  .item .title-line { font-size: 16px; word-break: break-word; }
  .item .title-line a.t { color: #1d70b8; font-weight: 700; }
  .item .title-line a.t:visited { color: #4c2c92; }
  .item .title-line .domain { color: #505a5f; font-size: 13px; padding-left: 6px; }
  .item .domain a { color: #505a5f; }
  .item .subtext { color: #505a5f; font-size: 13px; padding-top: 3px; line-height: 1.7; }
  .item .subtext a { color: #1d70b8; }
  .item .subtext a:hover { text-decoration-thickness: 3px; }
  .item .tier { font-weight: 700; }
  .item .tier-heavy { color: #942514; }
  .item .tier-mild { color: #594d00; }
  .item .tier-clean { color: #005a30; }
  .item .hn-link { color: #1d70b8; text-decoration: underline; }
  .item .hn-link:hover { text-decoration-thickness: 3px; }
  .item .flags { color: #505a5f; padding-top: 2px; display: block; }
  .item .flag { color: #505a5f; cursor: pointer; padding: 4px 2px; margin: -4px 0; text-decoration: underline; }
  .item .flag:hover { color: #0b0c0c; text-decoration-thickness: 3px; }
  .item .flag.active { color: #942514; font-weight: 700; }

  /* Sort + filter banner */
  .active-banner .sort { color: #505a5f; }
  .active-banner .sort .label { color: #505a5f; }
  .active-banner .sort a { color: #1d70b8; padding: 0 4px; }
  .active-banner .sort a.active { color: #0b0c0c; font-weight: 700; text-decoration: underline; }
  .active-banner .sort a:hover { text-decoration-thickness: 3px; }

  .empty { padding: 30px 16px; text-align: center; color: #505a5f; font-size: 16px; }

  /* Pagination — "More" link */
  .more { padding: 14px 16px 18px 46px; font-size: 16px; }
  .more a { color: #1d70b8; }
  .more a:hover { text-decoration-thickness: 3px; }

  /* Footer */
  .footer { padding: 20px 16px 32px; font-size: 14px; color: #505a5f; text-align: center; border-top: 1px solid #b1b4b6; margin-top: 12px; }
  .footer a { color: #1d70b8; }

  @media (max-width: 700px) {
    body { font-size: 14px; }
    .item { grid-template-columns: 26px 60px 1fr; gap: 8px; padding: 8px 12px; }
    .item .shot { width: 60px; height: 40px; }
    .item .title-line { font-size: 15px; line-height: 1.4; }
    .item .subtext { font-size: 12px; line-height: 1.7; }
    .item .hn-link { font-size: 12px; padding: 0 4px; }
    .freq-row { grid-template-columns: 88px 1fr 30px; line-height: 1.6; }
    .freq-grid { grid-template-columns: 1fr; }
    .topbar a { font-size: 14px; padding: 0 4px; }
    .topbar .right { width: 100%; margin-left: 0; padding-top: 2px; }
    .topbar .filter .filter-count { display: none; }
    .subline { font-size: 13px; padding: 8px 12px 4px; }
    .active-banner { flex-wrap: wrap; row-gap: 4px; padding: 8px 12px; font-size: 13px; }
    .active-banner .sort a { padding: 0 3px; }
    .active-banner .count { margin-left: auto; }
  }
  @media (max-width: 480px) {
    .topbar .filter { font-size: 13px; padding: 0 2px; }
    .freq-row { grid-template-columns: 80px 1fr 28px; gap: 4px; }
  }

  /* ── GOV.UK finder layout: left facet sidebar + results column ── */
  .container { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
  .page-title { font-size: 32px; font-weight: 700; line-height: 1.09; color: #0b0c0c; margin: 28px 0 22px; }
  .finder { display: grid; grid-template-columns: 1fr 2.3fr; gap: 40px; align-items: start; }
  @media (max-width: 700px) { .finder { grid-template-columns: 1fr; gap: 16px; } }

  .finder-side { font-size: 16px; }
  .facet { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #b1b4b6; }
  .facet-h { font-size: 16px; font-weight: 700; color: #0b0c0c; margin: 0 0 8px; }
  .facet-list { list-style: none; margin: 0; padding: 0; }
  .facet-list li { padding: 3px 0; line-height: 1.4; }
  .facet-list .filter { color: #1d70b8; text-decoration: underline; text-underline-offset: 0.15em; font-size: 16px; }
  .facet-list .filter:hover { text-decoration-thickness: 3px; }
  .facet-list .filter.topsel { color: #0b0c0c; font-weight: 700; text-decoration: none; }
  .facet-list .fc { color: #505a5f; }

  /* pattern frequency becomes the "Pattern" facet in the sidebar */
  .finder-side .freq { padding: 0; border-bottom: 0; }
  .finder-side .freq-grid { grid-template-columns: 1fr; column-gap: 0; row-gap: 0; }
  .finder-side .freq-row { grid-template-columns: minmax(0,1fr) 44px 32px; gap: 6px; padding: 3px 0; }

  .finder-results { min-width: 0; }
  .intro { color: #505a5f; font-size: 16px; line-height: 1.5; margin: 0 0 14px; }

  /* results header — GOV.UK "N results" count + Sort by row */
  .active-banner { flex-wrap: wrap; align-items: baseline; gap: 6px 10px; padding: 0 0 12px; margin-bottom: 0; border-bottom: 1px solid #b1b4b6; min-height: 0; }
  .active-banner .count { order: -1; width: 100%; margin-left: 0; font-weight: 700; font-size: 19px; color: #0b0c0c; }
  .active-banner .sort { font-size: 16px; }
  .active-banner .pat-name { color: #1d70b8; }

  /* document-list items */
  .list { padding: 0 0 24px; }
  .item { padding: 16px 0; gap: 12px; }
  .item:hover { background: transparent; }
  .item:target { background: #f3f2f1; box-shadow: inset 4px 0 0 #1d70b8; }
  .item .title-line a.t { font-size: 19px; }
  .item .subtext { font-size: 14px; }
  .more { padding: 16px 0 8px; }

  /* Severity as a tinted GOV.UK-style badge, not just coloured text. */
  .item .subtext .tier { display: inline-block; font-weight: 700; font-size: 11px; letter-spacing: .03em; text-transform: uppercase; padding: 2px 7px 1px; }
  .item .subtext .tier-heavy { color: #942514; background: #f6d7d2; }
  .item .subtext .tier-mild  { color: #594d00; background: #fff7bf; }
  .item .subtext .tier-clean { color: #005a30; background: #cce2d8; }
  /* Flagged patterns: quiet grey tags (still click-to-filter), not a wall of links. */
  .item .subtext .flag { color: #505a5f; text-decoration: none; }
  .item .subtext .flag:hover { color: #0b0c0c; text-decoration: underline; }
  .item .subtext .flag.active { color: #942514; font-weight: 700; }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-inner">
    <span class="brand"><a href="/" title="Back to the checker">Design Slop Cop</a></span>
    <span class="right">
      <a href="https://www.adriankrebs.ch/blog/design-slop/" target="_blank">Methodology</a>
      <span class="sep">|</span>
      <a href="https://github.com/AdrianKrebs/design-slop-cop" target="_blank">Github</a>
    </span>
  </div>
</div>
<div class="wrap">

<div class="container">
  <h1 class="page-title">Show HN, scored for AI design patterns</h1>

  <div class="finder">
    <aside class="finder-side">
      <div class="facet">
        <h2 class="facet-h">Slop level</h2>
        <ul class="facet-list">
          <li><a class="filter" data-tier="" href="#all">All <span class="fc">${total}</span></a></li>
          <li><a class="filter" data-tier="Heavy" href="#heavy">High <span class="fc">${tierCount.Heavy} (${(100 * tierCount.Heavy / total).toFixed(0)}%)</span></a></li>
          <li><a class="filter" data-tier="Mild" href="#mild">Medium <span class="fc">${tierCount.Mild} (${(100 * tierCount.Mild / total).toFixed(0)}%)</span></a></li>
          <li><a class="filter" data-tier="Clean" href="#clean">Low <span class="fc">${tierCount.Clean} (${(100 * tierCount.Clean / total).toFixed(0)}%)</span></a></li>
        </ul>
      </div>
      <details class="freq facet">
        <summary class="freq-title">Pattern</summary>
        <div class="freq-grid" id="freq"></div>
      </details>
    </aside>

    <section class="finder-results">
      <div class="active-banner" id="banner"></div>
      <div class="list" id="grid"></div>
      <div class="more" id="more"></div>
    </section>
  </div>

  <div class="footer">
    Generated ${new Date().toISOString().slice(0, 10)} · <a href="https://github.com/AdrianKrebs/design-slop-cop" target="_blank">github.com/AdrianKrebs/design-slop-cop</a>
  </div>
</div>

<script>
const data = ${JSON.stringify(data)};
const patternLabel = Object.fromEntries(data.patternMeta.map(p => [p.id, p.shortLabel || p.label || p.id]));
// One-line plain definition per pattern, shown as a hover tooltip.
const patternDesc = Object.fromEntries(data.patternMeta.map(p => [p.id, p.description || '']));
const TIER_HASH = { heavy: 'Heavy', mild: 'Mild', clean: 'Clean', all: null, '': null };
const TIER_CLASS = { Heavy: 'tier-heavy', Mild: 'tier-mild', Clean: 'tier-clean' };
const TIER_DISPLAY = { Heavy: 'High', Mild: 'Medium', Clean: 'Low' };

const SORT_KEYS = new Set(['date', 'score', 'points', 'flagged']);
const PAGE_SIZE = 30;
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  // Site permalink (#site-<slug>) — keep the native anchor scroll, force All view
  if (h.startsWith('site-')) return { tier: null, pattern: null, sort: 'date', page: 1 };
  const [tierPart, queryPart] = h.split('?');
  const tk = tierPart.toLowerCase();
  const tier = tk in TIER_HASH ? TIER_HASH[tk] : null;
  const params = new URLSearchParams(queryPart || '');
  const p = params.get('p') || null;
  const s = params.get('sort');
  const pg = parseInt(params.get('page') || '1', 10);
  return { tier, pattern: p, sort: SORT_KEYS.has(s) ? s : 'date', page: Number.isFinite(pg) && pg >= 1 ? pg : 1 };
}
function buildHash(tier, pattern, sort, page) {
  const base = tier ? tier.toLowerCase() : 'all';
  const params = new URLSearchParams();
  if (pattern) params.set('p', pattern);
  if (sort && sort !== 'date') params.set('sort', sort);
  if (page && page > 1) params.set('page', String(page));
  const q = params.toString();
  return '#' + base + (q ? '?' + q : '');
}
let { tier: activeTier, pattern: activePattern, sort: activeSort, page: activePage } = parseHash();
function stripShowHN(t) { return String(t || '').replace(/^Show HN[:：]\\s*/i, ''); }

function renderFreq() {
  const max = Math.max(...Object.values(data.patternCount), 1);
  const sorted = data.patternMeta
    .map(p => ({ ...p, count: data.patternCount[p.id] || 0 }))
    .sort((a, b) => b.count - a.count);
  document.getElementById('freq').innerHTML = sorted.map(p => {
    const pct = (100 * p.count / data.total).toFixed(0);
    const w = (100 * p.count / max).toFixed(1);
    const active = p.id === activePattern ? ' active' : '';
    return \`<div class="freq-row\${active}" data-pattern="\${escape(p.id)}" title="\${escape(patternDesc[p.id] || p.shortLabel)}"><div class="name">\${escape(p.shortLabel)}</div><div class="bar"><div class="bar-fill" style="width:\${w}%"></div></div><div class="pct">\${pct}%</div></div>\`;
  }).join('');
}

function syncTopbar() {
  document.querySelectorAll('.filter').forEach(a => {
    const t = a.dataset.tier;
    const isActive = (t === '' && !activeTier) || (t === activeTier);
    a.classList.toggle('topsel', isActive);
  });
}

function sortLinksHTML() {
  const items = [['date','newest'], ['score','score'], ['points','points'], ['flagged','pattern count']];
  const links = items.map(([k, label]) => {
    const cls = k === activeSort ? 'active' : '';
    return \`<a class="\${cls}" data-sort="\${k}" href="#">\${label}</a>\`;
  }).join('<span style="color:#ccc;">|</span>');
  return \`<span class="sort"><span class="label">sort by:</span>\${links}</span>\`;
}
function renderBanner(filteredCount) {
  const banner = document.getElementById('banner');
  const sites = filteredCount === 1 ? '1 site' : filteredCount + ' sites';
  let left = '';
  if (activePattern) {
    const label = patternLabel[activePattern] || activePattern;
    left = \`<span class="label">filtering by pattern:</span> <span class="pat-name">\${escape(label)}</span> <a class="clear-btn" href="#" id="clear-pattern">× clear</a>\`;
  }
  // Counts live in the sidebar tier facet now; the results header is just the
  // sort row (+ the active-pattern chip when a pattern filter is on).
  banner.innerHTML = \`\${left}\${sortLinksHTML()}\`;
  if (activePattern) {
    document.getElementById('clear-pattern').addEventListener('click', e => {
      e.preventDefault();
      setFilter(activeTier, null, activeSort);
    });
  }
  banner.querySelectorAll('.sort a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      setFilter(activeTier, activePattern, a.dataset.sort);
    });
  });
}

function domainOf(url) {
  try { return new URL(url).host.replace(/^www\\./, ''); } catch { return ''; }
}

function sortSites(sites) {
  const arr = sites.slice();
  if (activeSort === 'score') {
    arr.sort((a, b) => b.score - a.score || b.flagged.length - a.flagged.length || timestampOf(b) - timestampOf(a));
  } else if (activeSort === 'points') {
    arr.sort((a, b) => (b.points || 0) - (a.points || 0) || b.score - a.score);
  } else if (activeSort === 'flagged') {
    arr.sort((a, b) => b.flagged.length - a.flagged.length || b.score - a.score);
  }
  // 'date' = server-default sort, already date desc
  return arr;
}
function timestampOf(s) { return s.postedAt ? new Date(s.postedAt).getTime() : 0; }

function renderGrid() {
  const filtered = sortSites(data.sites.filter(s => {
    if (activeTier && s.tier !== activeTier) return false;
    if (activePattern && !s.flagged.includes(activePattern)) return false;
    return true;
  }));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (activePage > totalPages) activePage = totalPages;
  const startIdx = (activePage - 1) * PAGE_SIZE;
  const pageSlice = filtered.slice(startIdx, startIdx + PAGE_SIZE);
  renderBanner(filtered.length);
  renderMore(activePage, totalPages, filtered.length);
  if (!filtered.length) {
    document.getElementById('grid').innerHTML = '<div class="empty">no sites match.</div>';
    return;
  }
  const shotBase = data.cdnBase || 'screenshots';
  document.getElementById('grid').innerHTML = pageSlice.map((s, i) => {
    const absoluteRank = startIdx + i + 1;
    const tierCls = TIER_CLASS[s.tier] || '';
    const domain = domainOf(s.url);
    const hnLink = s.hnId
      ? \` · <a class="hn-link" href="https://news.ycombinator.com/item?id=\${s.hnId}" target="_blank" rel="noopener" title="open the Show HN submission on news.ycombinator.com">discuss</a>\`
      : '';
    const posted = s.postedAt ? formatDate(s.postedAt) : '';
    const pts = (s.points != null) ? \` · \${s.points} point\${s.points === 1 ? '' : 's'}\` : '';
    const pats = s.flagged.map(id => {
      const cls = id === activePattern ? 'flag active' : 'flag';
      return \`<a class="\${cls}" data-pattern="\${escape(id)}" href="#" title="\${escape(patternDesc[id] || patternLabel[id] || id)}">\${escape(patternLabel[id] || id)}</a>\`;
    }).join(' · ');
    const shot = data.noImages
      ? '<span class="shot"></span>'
      : \`<a class="shot" href="\${escape(s.url)}" target="_blank" rel="noopener"><img loading="lazy" src="\${shotBase}/\${escape(s.slug)}.png" alt=""></a>\`;
    const anchorId = 'site-' + s.slug;
    return \`
<div class="item" id="\${escape(anchorId)}">
  <div class="rank"><a href="#\${escape(anchorId)}" title="permalink to this entry">\${absoluteRank}.</a></div>
  \${shot}
  <div class="body">
    <div class="title-line">
      <a class="t" href="\${escape(s.url)}" target="_blank" rel="noopener">\${escape(stripShowHN(s.title))}</a>
      <span class="domain">(\${escape(domain)})</span>
    </div>
    <div class="subtext">
      <span class="tier \${tierCls}">\${TIER_DISPLAY[s.tier] || s.tier}</span> · \${s.flagged.length}/\${s.total} patterns\${pts}\${posted ? ' · ' + posted : ''}\${hnLink}\${pats ? '<span class="flags">' + pats + '</span>' : ''}
    </div>
  </div>
</div>\`;
  }).join('');
}

function renderMore(page, totalPages, totalCount) {
  const more = document.getElementById('more');
  if (!more) return;
  if (page >= totalPages || totalCount === 0) {
    more.innerHTML = '';
    return;
  }
  const nextHash = buildHash(activeTier, activePattern, activeSort, page + 1);
  more.innerHTML = \`<a href="\${nextHash}" id="more-link">More</a>\`;
  document.getElementById('more-link').addEventListener('click', e => {
    e.preventDefault();
    setFilter(activeTier, activePattern, activeSort, page + 1, /*scrollTop*/ true);
  });
}

function setFilter(tier, pattern, sort, page, scrollTop) {
  const filtersChanged = (tier !== activeTier) || (pattern !== activePattern) || (sort && sort !== activeSort);
  activeTier = tier;
  activePattern = pattern;
  if (sort) activeSort = sort;
  // Reset to page 1 when the filter or sort changes; otherwise honor the requested page
  activePage = filtersChanged ? 1 : (page || 1);
  const newHash = buildHash(activeTier, activePattern, activeSort, activePage);
  if (location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }
  syncTopbar();
  renderFreq();
  renderGrid();
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' });
}

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (hours < 1) return 'just now';
  if (hours < 24) return hours + 'h ago';
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
}

document.querySelectorAll('.filter, .tier-link').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    setFilter(a.dataset.tier || null, activePattern, activeSort);
  });
});

document.getElementById('freq').addEventListener('click', e => {
  const row = e.target.closest('.freq-row');
  if (!row) return;
  const p = row.dataset.pattern;
  setFilter(activeTier, p === activePattern ? null : p, activeSort);
});

document.getElementById('grid').addEventListener('click', e => {
  const flag = e.target.closest('.flag');
  if (!flag) return;
  e.preventDefault();
  const p = flag.dataset.pattern;
  setFilter(activeTier, p === activePattern ? null : p, activeSort);
});

window.addEventListener('hashchange', () => {
  // Native anchor scroll for #site-<slug> — let browser handle it
  if (location.hash.startsWith('#site-')) return;
  const parsed = parseHash();
  activeTier = parsed.tier;
  activePattern = parsed.pattern;
  activeSort = parsed.sort;
  activePage = parsed.page;
  syncTopbar();
  renderFreq();
  renderGrid();
});

// Default freq to open on desktop, closed on mobile
const freqDetails = document.querySelector('details.freq');
if (freqDetails) {
  freqDetails.open = window.matchMedia('(min-width: 701px)').matches;
}

renderFreq();
syncTopbar();
renderGrid();

// If page loaded with #site-<slug>, scroll to it now that the DOM is built
if (location.hash.startsWith('#site-')) {
  const target = document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView({ block: 'center' });
}
</script>
</body>
</html>
`;

await writeFile(outPath, html);
console.log(`Wrote ${outPath} · ${total} sites · Heavy ${tierCount.Heavy} · Mild ${tierCount.Mild} · Clean ${tierCount.Clean}${noImages ? ' · no images' : ''}`);
