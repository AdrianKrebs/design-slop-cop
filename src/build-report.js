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

const patternMeta = PATTERNS.map(p => ({ id: p.id, shortLabel: p.shortLabel, label: p.label }));
const total = ok.length;

const data = { sites, tierCount, patternCount, patternMeta, total, noImages, cdnBase, generatedAt: new Date().toISOString() };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Design Checker · Show HN submissions scored for AI design patterns</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 11pt Verdana, Geneva, sans-serif;
    background: #ffffff;
    color: #828282;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  a { color: #000; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 1100px; margin: 0 auto; background: #f6f6ef; }

  /* Topbar — HN orange */
  .topbar { background: #ff6600; padding: 2px 4px; }
  .topbar-inner { display: flex; align-items: baseline; gap: 0; flex-wrap: wrap; line-height: 1.4; }
  .topbar a { color: #000; font-weight: 400; font-size: 10.5pt; padding: 0 5px; }
  .topbar a:visited { color: #000; }
  .topbar .sep { color: #000; padding: 0; }
  .topbar .brand a { font-weight: 700; padding-right: 8px; padding-left: 0; }
  .topbar .right { margin-left: auto; }
  .topbar a.topsel { color: #ffffff; }

  /* Subline strip */
  .subline {
    color: #828282;
    font-size: 9pt;
    padding: 6px 4px 4px;
    line-height: 1.6;
  }
  .subline a { color: #000; text-decoration: underline; }
  .subline p { margin: 0 0 6px; }

  /* Inline tier breakdown — clickable filter, severity-colored */
  .subline .tier-link { text-decoration: none; }
  .subline .tier-link b { font-weight: 700; }
  .subline .tier-link:hover { text-decoration: underline; }
  .subline .tier-heavy { color: #c62a0a; }
  .subline .tier-mild  { color: #a86b00; }
  .subline .tier-clean { color: #3d8a3d; }

  /* Pattern frequency — also a filter UI */
  .freq {
    padding: 4px 4px 10px;
    font-size: 9pt;
    color: #828282;
  }
  .freq[open] > .freq-title::-webkit-details-marker,
  .freq[open] > .freq-title::marker { color: #828282; }
  .freq-title { color: #828282; padding: 4px 0 6px; font-size: 9pt; cursor: pointer; list-style: none; user-select: none; }
  .freq-title::before { content: '▾'; color: #000; font-size: 11pt; padding-right: 6px; display: inline-block; transform: translateY(-1px); }
  .freq:not([open]) > .freq-title::before { content: '▸'; }
  .freq-title:hover::before { color: #ff6600; }
  .freq-title::-webkit-details-marker { display: none; }
  .freq-title .clear { color: #ff6600; padding-left: 8px; cursor: pointer; }
  .freq-title .clear:hover { text-decoration: underline; }
  .freq-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    column-gap: 18px;
    row-gap: 1px;
  }
  .freq-row { display: grid; grid-template-columns: 100px 1fr 32px; gap: 8px; align-items: center; line-height: 1.7; cursor: pointer; padding: 1px 4px; border-radius: 2px; }
  .freq-row:hover { background: #ececdf; }
  .freq-row.active { background: #ffe2cc; }
  .freq-row.active .name { color: #c64a00; font-weight: 700; }
  .freq-row .name { color: #444; }
  .freq-row .bar { height: 7px; background: #e5e5dc; }
  .freq-row .bar-fill { height: 100%; background: #9c9c8c; }
  .freq-row.active .bar-fill { background: #c62a0a; }
  .freq-row .pct { text-align: right; color: #828282; font-variant-numeric: tabular-nums; font-size: 9pt; }

  /* Active-pattern banner (replaces search row when pattern is set) */
  .active-banner { padding: 6px 4px; font-size: 9pt; color: #828282; display: flex; align-items: baseline; gap: 8px; min-height: 1.6em; }
  .active-banner .label { color: #828282; }
  .active-banner .pat-name { color: #c64a00; font-weight: 700; }
  .active-banner .clear-btn { color: #828282; cursor: pointer; padding-left: 4px; }
  .active-banner .clear-btn:hover { color: #000; text-decoration: underline; }
  .active-banner .count { color: #828282; margin-left: auto; }

  /* List — HN-style ranked rows */
  .list { padding: 2px 0 22px; }
  .item { display: grid; grid-template-columns: 38px 80px 1fr; gap: 8px; padding: 6px 4px; align-items: flex-start; scroll-margin-top: 8px; }
  .item:hover { background: #f0eee5; }
  .item:target { background: #ffe2cc; box-shadow: inset 3px 0 0 #c62a0a; }
  .item .rank { color: #828282; font-size: 11pt; text-align: right; padding-top: 4px; font-variant-numeric: tabular-nums; }
  .item .rank a { color: #828282; text-decoration: none; }
  .item .rank a:hover { color: #c62a0a; }
  .item .shot { width: 80px; height: 52px; background: #fff; border: 1px solid #d5d5cc; overflow: hidden; display: block; flex-shrink: 0; }
  .item .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .item.no-shot .shot { visibility: hidden; }
  .item .body { line-height: 1.55; min-width: 0; }
  .item .title-line { font-size: 11pt; word-break: break-word; }
  .item .title-line a.t { color: #000; font-weight: 400; }
  .item .title-line a.t:visited { color: #828282; }
  .item .title-line .domain { color: #828282; font-size: 9pt; padding-left: 5px; }
  .item .domain a { color: #828282; }
  .item .subtext { color: #828282; font-size: 9pt; padding-top: 2px; line-height: 1.7; }
  .item .subtext a { color: #828282; }
  .item .subtext a:hover { text-decoration: underline; }
  .item .tier { font-weight: 700; }
  .item .tier-heavy { color: #c62a0a; }
  .item .tier-mild { color: #a86b00; }
  .item .tier-clean { color: #3d8a3d; }
  .item .hn-link { color: #828282; text-decoration: none; }
  .item .hn-link:hover { color: #000; text-decoration: underline; }
  .item .flags { color: #828282; padding-top: 1px; display: block; }
  .item .flag { color: #828282; cursor: pointer; padding: 4px 2px; margin: -4px 0; border-radius: 2px; }
  .item .flag:hover { color: #000; text-decoration: underline; }
  .item .flag.active { color: #828282; }

  /* Sort + filter banner */
  .active-banner .sort { color: #828282; }
  .active-banner .sort .label { color: #828282; }
  .active-banner .sort a { color: #828282; padding: 0 4px; }
  .active-banner .sort a.active { color: #000; text-decoration: underline; }
  .active-banner .sort a:hover { color: #000; }

  .empty { padding: 30px 8px; text-align: center; color: #828282; font-size: 10pt; }

  /* Pagination — HN-style "More" link */
  .more { padding: 12px 4px 16px 50px; font-size: 10pt; }
  .more a { color: #828282; }
  .more a:hover { color: #000; text-decoration: underline; }

  /* Footer */
  .footer { padding: 18px 10px 30px; font-size: 9pt; color: #828282; text-align: center; border-top: 1px solid #e5e5dc; margin-top: 10px; }
  .footer a { color: #828282; text-decoration: underline; }

  @media (max-width: 700px) {
    body { font-size: 10.5pt; }
    .item { grid-template-columns: 26px 60px 1fr; gap: 8px; padding: 6px 8px; }
    .item .shot { width: 60px; height: 40px; }
    .item .title-line { font-size: 10.5pt; line-height: 1.4; }
    .item .subtext { font-size: 8.5pt; line-height: 1.7; }
    .item .hn-link { font-size: 8pt; padding: 0 4px; }
    .freq-row { grid-template-columns: 88px 1fr 30px; line-height: 1.6; }
    .freq-grid { grid-template-columns: 1fr; }
    .topbar a { font-size: 9.5pt; padding: 0 3px; }
    .topbar .right { width: 100%; margin-left: 0; padding-top: 2px; }
    .topbar .filter .filter-count { display: none; }
    .subline { font-size: 8.5pt; padding: 6px 8px 4px; }
    .active-banner { flex-wrap: wrap; row-gap: 4px; padding: 6px 8px; font-size: 8.5pt; }
    .active-banner .sort a { padding: 0 3px; }
    .active-banner .count { margin-left: auto; }
  }
  @media (max-width: 480px) {
    .topbar .filter { font-size: 9pt; padding: 0 2px; }
    .topbar .filter .filter-ai { display: none; }
    .freq-row { grid-template-columns: 80px 1fr 28px; gap: 4px; }
  }
</style>
</head>
<body>
<div class="wrap">

<div class="topbar">
  <div class="topbar-inner">
    <span class="brand"><a href="https://github.com/AdrianKrebs/ai-design-checker" target="_blank">AI Design Checker</a></span>
    <a class="filter" data-tier="" href="#all">All<span class="filter-count"> (${total})</span></a>
    <span class="sep">|</span>
    <a class="filter" data-tier="Heavy" href="#heavy">Heavy<span class="filter-ai"> AI</span><span class="filter-count"> (${tierCount.Heavy})</span></a>
    <span class="sep">|</span>
    <a class="filter" data-tier="Mild" href="#mild">Mild<span class="filter-ai"> AI</span><span class="filter-count"> (${tierCount.Mild})</span></a>
    <span class="sep">|</span>
    <a class="filter" data-tier="Clean" href="#clean">Clean<span class="filter-count"> (${tierCount.Clean})</span></a>
    <span class="right">
      <a href="https://www.adriankrebs.ch/blog/design-slop/" target="_blank">Methodology</a>
      <span class="sep">|</span>
      <a href="https://github.com/AdrianKrebs/ai-design-checker" target="_blank">Github</a>
    </span>
  </div>
</div>

<div class="subline">
  <p>Show HN submissions scored against 16 deterministic AI design patterns &nbsp;·&nbsp;
    <a class="tier-link tier-heavy" data-tier="Heavy" href="#heavy" title="Heavy AI · 5+ patterns flagged · click to filter">Heavy AI <b>${tierCount.Heavy}</b> (${(100 * tierCount.Heavy / total).toFixed(0)}%)</a> ·
    <a class="tier-link tier-mild" data-tier="Mild" href="#mild" title="Mild AI · 2–4 patterns flagged · click to filter">Mild AI <b>${tierCount.Mild}</b> (${(100 * tierCount.Mild / total).toFixed(0)}%)</a> ·
    <a class="tier-link tier-clean" data-tier="Clean" href="#clean" title="Clean · 0–1 patterns flagged · click to filter">Clean <b>${tierCount.Clean}</b> (${(100 * tierCount.Clean / total).toFixed(0)}%)</a>
  </p>
</div>

<details class="freq">
  <summary class="freq-title">Pattern frequency · click to filter</summary>
  <div class="freq-grid" id="freq"></div>
</details>

<div class="active-banner" id="banner"></div>

<div class="list" id="grid"></div>
<div class="more" id="more"></div>

<div class="footer">
  Generated ${new Date().toISOString().slice(0, 10)} · <a href="https://github.com/AdrianKrebs/ai-design-checker" target="_blank">github.com/AdrianKrebs/ai-design-checker</a>
</div>
</div>

<script>
const data = ${JSON.stringify(data)};
const patternLabel = Object.fromEntries(data.patternMeta.map(p => [p.id, p.shortLabel || p.label || p.id]));
const TIER_HASH = { heavy: 'Heavy', mild: 'Mild', clean: 'Clean', all: null, '': null };
const TIER_CLASS = { Heavy: 'tier-heavy', Mild: 'tier-mild', Clean: 'tier-clean' };
const TIER_DISPLAY = { Heavy: 'Heavy AI', Mild: 'Mild AI', Clean: 'Clean' };

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
    return \`<div class="freq-row\${active}" data-pattern="\${escape(p.id)}" title="\${escape(p.label || p.shortLabel)}"><div class="name">\${escape(p.shortLabel)}</div><div class="bar"><div class="bar-fill" style="width:\${w}%"></div></div><div class="pct">\${pct}%</div></div>\`;
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
  const items = [['date','newest'], ['score','score'], ['points','points'], ['flagged','flag count']];
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
  banner.innerHTML = \`\${left}\${sortLinksHTML()}<span class="count">\${sites}</span>\`;
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
      return \`<a class="\${cls}" data-pattern="\${escape(id)}" href="#">\${escape(patternLabel[id] || id)}</a>\`;
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
      <span class="tier \${tierCls}">\${TIER_DISPLAY[s.tier] || s.tier}</span>\${s.flagged.length > 0 ? ' · ' + s.flagged.length + '/' + s.total + ' flagged' : ''}\${pts}\${posted ? ' · ' + posted : ''}\${hnLink}\${pats ? '<span class="flags">' + pats + '</span>' : ''}
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
