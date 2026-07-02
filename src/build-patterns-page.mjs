// Generates web/patterns.html — the reference page for the 14 patterns, one
// example crop each. The page is data-driven: the pattern list is emitted as a
// JSON config embedded in the page and rendered client-side (same approach as
// the gallery's report.html), so entries are easy to edit or extend. Example
// crops are served as separate files from /pattern-examples/<id>.jpg (kept out
// of the HTML). Rebuild after re-capturing examples:
//
//   node scripts/capture-pattern-examples.mjs   # → web/pattern-examples.json
//   node src/build-patterns-page.mjs            # → web/patterns.html

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PATTERNS } from './patterns/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/AdrianKrebs/design-slop-cop';

// Manifest maps pattern id → { url, mode, file }. Images live as separate files
// under web/pattern-examples/, served at /pattern-examples/<id>.jpg.
let examples = {};
try { examples = JSON.parse(await readFile(join(ROOT, 'web', 'pattern-examples.json'), 'utf8')); } catch {}

// Corpus frequency: what share of scanned sites trip each pattern.
let freq = {}, total = 0;
try {
  const all = JSON.parse(await readFile(join(ROOT, 'results', 'all-results.json'), 'utf8'));
  const ok = all.filter(r => !r.error);
  total = ok.length;
  for (const r of ok) for (const p of r.patterns || []) if (p.triggered) freq[p.id] = (freq[p.id] || 0) + 1;
} catch {}

// The config the page renders from. Editing/reordering here (or in the pattern
// modules this is derived from) is all it takes to change the page.
const patterns = PATTERNS.map(p => {
  const ex = examples[p.id] || {};
  return {
    id: p.id,
    name: p.shortLabel || p.label || p.id,
    desc: p.description || '',
    pct: total ? Math.round(100 * (freq[p.id] || 0) / total) : null,
    exampleUrl: ex.url || null,
    exampleHost: ex.url ? ex.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : null,
    img: ex.file ? '/' + ex.file : null,
  };
});

// Prefilled "Submit a new pattern" GitHub issue.
const issueBody = [
  '**Pattern name:**',
  '',
  '**The tell — what makes it read as AI-generated:**',
  '',
  '**Example URL(s) where it shows up:**',
  '',
  '**How to detect it (DOM / computed-style signal):**',
  '',
].join('\n');
const submitUrl = `${REPO}/issues/new?labels=pattern-suggestion&title=${encodeURIComponent('New pattern: ')}&body=${encodeURIComponent(issueBody)}`;

const data = { patterns, submitUrl, repo: REPO, generatedAt: new Date().toISOString() };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%F0%9F%9A%A8</text></svg>">
<title>The 14 patterns · Design Slop Cop</title>
<meta name="description" content="The 14 deterministic AI design patterns Design Slop Cop looks for — each with a plain-language definition and a real example.">
<style>
  :root {
    --font: arial, "Helvetica Neue", Helvetica, sans-serif;
    --text: #0b0c0c; --muted: #505a5f; --bg: #ffffff; --panel: #f3f2f1;
    --border: #b1b4b6; --link: #1d70b8; --link-hover: #003078; --focus: #fd0;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 400 18px/1.5 var(--font); }
  a { color: var(--link); text-decoration: underline; text-underline-offset: 0.15em; text-decoration-thickness: 1px; }
  a:hover { color: var(--link-hover); text-decoration-thickness: 3px; }
  a:focus { outline: 3px solid transparent; color: #0b0c0c; background: var(--focus); box-shadow: 0 -2px var(--focus), 0 4px #0b0c0c; text-decoration: none; }

  .topbar { background: var(--text); }
  .topbar .inner { max-width: 900px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: baseline; gap: 16px; }
  .topbar b { color: #fff; font-weight: 700; font-size: 17px; }
  .topbar b a { color: #fff; text-decoration: none; }
  .topbar nav { margin-left: auto; display: flex; gap: 16px; }
  .topbar nav a { color: #fff; font-size: 16px; text-decoration: underline; text-underline-offset: 0.15em; text-decoration-thickness: 1px; }
  .topbar nav a.sel { text-decoration-thickness: 3px; }
  .topbar nav a:hover { text-decoration-thickness: 3px; }
  .topbar nav a:focus { color: var(--text); background: var(--focus); box-shadow: 0 -2px var(--focus), 0 4px var(--text); text-decoration: none; outline: 3px solid transparent; }

  .wrap { max-width: 900px; margin: 0 auto; padding: 0 24px 56px; }
  h1 { font-size: clamp(30px, 5vw, 44px); font-weight: 700; line-height: 1.09; margin: 44px 0 14px; }
  .lede { font-size: 19px; line-height: 1.5; margin: 0 0 8px; max-width: 640px; color: var(--text); }
  .lede.muted { color: var(--muted); font-size: 16px; margin-bottom: 20px; }
  .submit-top { font-size: 16px; margin: 0 0 34px; }

  .pat { display: grid; grid-template-columns: 34px 1fr 320px; gap: 20px; align-items: start; padding: 26px 0; border-top: 1px solid var(--border); }
  .pat:first-of-type { border-top: 0; }
  .num { font-size: 20px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; padding-top: 2px; }
  .pat-body { min-width: 0; }
  .pat-name { font-size: 21px; font-weight: 700; margin: 0 0 8px; line-height: 1.2; }
  .pat-desc { margin: 0 0 10px; font-size: 17px; line-height: 1.45; }
  .freq { display: inline-block; font-size: 14px; color: var(--muted); background: var(--panel); padding: 2px 9px; margin-bottom: 10px; }
  .freq b { color: var(--text); }
  .pat-links { font-size: 15px; margin-bottom: 6px; }
  .src { font-size: 13px; color: var(--muted); }
  .src a { color: var(--link); }

  .shot { display: block; border: 1px solid var(--border); background: var(--panel); overflow: hidden; max-height: 240px; cursor: zoom-in; }
  .shot img { width: 100%; display: block; }
  .shot.empty { display: flex; align-items: center; justify-content: center; min-height: 120px; color: var(--muted); font-size: 13px; cursor: default; }

  @media (max-width: 720px) {
    .pat { grid-template-columns: 26px 1fr; gap: 12px; }
    .shot { grid-column: 1 / -1; max-height: none; }
  }

  footer { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 20px; color: var(--muted); font-size: 15px; }

  .zoom { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: none; align-items: flex-start; justify-content: center; z-index: 99; cursor: zoom-out; padding: 28px; overflow: auto; }
  .zoom.open { display: flex; }
  .zoom img { max-width: 100%; border: 2px solid #fff; }
</style>
</head>
<body>
<div class="topbar"><div class="inner"><b><a href="/">Design Slop Cop</a></b><nav><a href="/">Scan</a><a href="/show">Gallery</a><a class="sel" href="/patterns">Patterns</a></nav></div></div>

<div class="wrap">
  <h1>The 14 patterns</h1>
  <p class="lede">These are the deterministic tells Design Slop Cop looks for — the visual habits of the modern AI-era landing page.</p>
  <p class="lede muted">Each is checked in a real browser against the page's DOM and computed styles. Great human-designed sites trip these too: the aesthetic is now near-universal, which is rather the point.</p>
  <p class="submit-top">Spotted a tell we miss? <a id="submit-top" href="#" target="_blank" rel="noopener">Submit a new pattern →</a></p>

  <div id="list"></div>

  <footer>
    <a href="/">Scan a site</a> · <a href="/show">Browse the gallery</a> · <a id="submit-foot" href="#" target="_blank" rel="noopener">Submit a new pattern</a> · <a href="${REPO}" target="_blank" rel="noopener">Source on GitHub</a>
  </footer>
</div>

<div class="zoom" id="zoom"><img id="zoomImg" alt=""></div>
<script>
  const DATA = ${JSON.stringify(data)};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.getElementById('submit-top').href = DATA.submitUrl;
  document.getElementById('submit-foot').href = DATA.submitUrl;

  document.getElementById('list').innerHTML = DATA.patterns.map((p, i) => {
    const img = p.img
      ? '<a class="shot" href="' + esc(p.exampleUrl) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + p.img + '" alt="Example of ' + esc(p.name) + (p.exampleHost ? ' on ' + esc(p.exampleHost) : '') + '"></a>'
      : '<div class="shot empty">example coming soon</div>';
    const src = p.exampleUrl ? '<div class="src">example: <a href="' + esc(p.exampleUrl) + '" target="_blank" rel="noopener">' + esc(p.exampleHost) + '</a></div>' : '';
    const freq = p.pct != null ? '<span class="freq">Seen on <b>' + p.pct + '%</b> of scanned Show HN sites</span>' : '';
    return '<section class="pat" id="' + esc(p.id) + '">' +
      '<div class="num">' + (i + 1) + '</div>' +
      '<div class="pat-body">' +
        '<h2 class="pat-name">' + esc(p.name) + '</h2>' +
        '<p class="pat-desc">' + esc(p.desc) + '</p>' +
        freq +
        '<div class="pat-links"><a href="/show#all?p=' + esc(p.id) + '">See flagged sites in the gallery →</a></div>' +
        src +
      '</div>' +
      img +
    '</section>';
  }).join('');

  // Re-scroll to a deep-linked anchor now that the list is rendered.
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }

  const zoom = document.getElementById('zoom'), zoomImg = document.getElementById('zoomImg');
  document.addEventListener('click', e => {
    const a = e.target.closest('.shot');
    if (a && a.querySelector('img')) { e.preventDefault(); zoomImg.src = a.querySelector('img').src; zoom.classList.add('open'); }
    else if (e.target.closest('#zoom')) { zoom.classList.remove('open'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') zoom.classList.remove('open'); });
</script>
</body>
</html>`;

await writeFile(join(ROOT, 'web', 'patterns.html'), html);
const captured = patterns.filter(p => p.img).length;
console.log(`Wrote web/patterns.html · ${patterns.length} patterns · ${captured} example images`);
