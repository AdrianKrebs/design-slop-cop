// Test drive for the hero_font_mix pattern.
//   node scripts/eval-hero-font-mix.mjs [--count=50] [--concurrency=4]
//
// Pulls the latest N eligible Show HN launches, scans each with the live
// detector, records the hero_font_mix verdict + a hero (viewport) screenshot,
// and writes results/hero-eval/index.html — a GOV.UK-styled labeling page
// where you mark each site "mix / no mix" and it shows the live error rate
// (precision / recall / accuracy) against the detector's prediction.

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildDetectorSource } from '../src/detector.js';
import { analyzePage, slugFromUrl } from '../src/run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'results', 'hero-eval');

const COUNT = parseInt(process.argv.find(a => a.startsWith('--count='))?.slice(8) || '50', 10);
const CONC = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.slice(14) || '4', 10);
const PATTERN_ID = 'hero_font_mix';

const EXCLUDE_HOSTS = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|arxiv\.org|ycombinator\.com|reddit\.com|news\.ycombinator\.com|medium\.com|substack\.com|dev\.to|gist\.github\.com|docs\.google\.com|drive\.google\.com|linkedin\.com|f-droid\.org|npmjs\.com|pypi\.org|crates\.io|rubygems\.org|chromewebstore\.google\.com|apps\.apple\.com|play\.google\.com|paypal\.com|apify\.com|huggingface\.co)$/i;
const EXCLUDE_PATH = /\.(pdf|zip|tar|gz|exe|dmg|mp4|mp3|wav|png|jpg|jpeg|gif|json|xml|txt|csv)(\?|$)|\/\.well-known\//i;

function eligible(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (EXCLUDE_HOSTS.test(u.hostname)) return false;
    if (EXCLUDE_PATH.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

async function fetchLatest(target) {
  const picked = [];
  const seen = new Set();
  let page = 0;
  while (picked.length < target && page < 10) {
    const qs = new URLSearchParams({ tags: 'show_hn', hitsPerPage: '100', page: String(page) });
    const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${qs}`, { headers: { 'User-Agent': 'design-slop-cop/0.1' } });
    if (!res.ok) throw new Error('HN API ' + res.status);
    const data = await res.json();
    if (!data.hits?.length) break;
    for (const hit of data.hits) {
      if (!hit.url || !eligible(hit.url)) continue;
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      picked.push({ url: hit.url, title: hit.title, hnId: hit.objectID, points: hit.points, created: hit.created_at });
      if (picked.length >= target) break;
    }
    page++;
  }
  return picked;
}

async function main() {
  const reuse = process.argv.includes('--reuse');
  let launches;
  if (reuse && existsSync(join(OUT_DIR, 'data.json'))) {
    const prev = JSON.parse(await readFile(join(OUT_DIR, 'data.json'), 'utf8'));
    launches = prev.map(p => ({ url: p.url, title: p.title, hnId: p.hnId, points: p.points, created: p.created }));
    console.log(`Reusing the same ${launches.length} URLs from the previous run…`);
  } else {
    console.log(`Fetching latest ${COUNT} eligible Show HN launches…`);
    launches = await fetchLatest(COUNT);
  }
  console.log(`Scanning ${launches.length} (concurrency ${CONC})…`);

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const detectorSource = buildDetectorSource();
  const browser = await chromium.launch({ headless: true });
  const out = new Array(launches.length);
  let next = 0, done = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= launches.length) return;
      const L = launches[i];
      const slug = slugFromUrl(L.url);
      let rec = { ...L, slug, predicted: false, evidence: null, score: null, tier: null, shot: null, error: null };
      try {
        const r = await analyzePage(browser, L.url, detectorSource, { screenshotBuffer: true, fullPage: false });
        if (r.error) {
          rec.error = r.error.split('\n')[0].slice(0, 120);
        } else {
          const p = r.patterns.find(x => x.id === PATTERN_ID);
          rec.predicted = !!(p && p.triggered);
          rec.evidence = p ? p.evidence : null;
          rec.score = r.score; rec.tier = r.tierLabel;
          if (r.screenshotBuffer) {
            await writeFile(join(OUT_DIR, slug + '.png'), r.screenshotBuffer);
            rec.shot = slug + '.png';
          }
        }
      } catch (e) {
        rec.error = ('' + e.message).slice(0, 120);
      }
      out[i] = rec;
      done++;
      console.log(`[${done}/${launches.length}] ${rec.predicted ? 'MIX ' : '    '} ${L.url}${rec.error ? '  (error: ' + rec.error + ')' : ''}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();

  const flaggedN = out.filter(r => r.predicted).length;
  await writeFile(join(OUT_DIR, 'data.json'), JSON.stringify(out, null, 2));
  await writeFile(join(OUT_DIR, 'index.html'), renderPage(out));
  console.log(`\nDetector flagged ${flaggedN}/${out.length} as hero font mix.`);
  console.log(`Wrote ${join(OUT_DIR, 'index.html')} — open it to label and see the error rate.`);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderPage(rows) {
  const data = rows.map(r => ({
    slug: r.slug, url: r.url, title: r.title, hnId: r.hnId, predicted: r.predicted,
    evidence: r.evidence, score: r.score, tier: r.tier, shot: r.shot, error: r.error
  }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hero font mix — manual eval</title>
<style>
  :root{ --text:#0b0c0c; --muted:#505a5f; --border:#b1b4b6; --link:#1d70b8; --link-hover:#003078; --green:#00703c; --heavy:#942514; --heavy-bg:#f6d7d2; --clean:#005a30; --clean-bg:#cce2d8; --focus:#fd0; --panel:#f3f2f1; }
  *{box-sizing:border-box} body{margin:0;background:#fff;color:var(--text);font:16px/1.5 arial,"Helvetica Neue",Helvetica,sans-serif}
  a{color:var(--link);text-underline-offset:.15em} a:hover{color:var(--link-hover);text-decoration-thickness:3px}
  .topbar{background:#ff6600;padding:10px 16px}.topbar b{font-weight:700;font-size:17px;color:#0b0c0c}
  .wrap{max-width:980px;margin:0 auto;padding:0 16px 80px}
  h1{font-size:32px;font-weight:700;line-height:1.09;margin:26px 0 6px}
  .lede{color:var(--muted);margin:0 0 18px;max-width:640px}
  .summary{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--border);padding:12px 0;margin-bottom:8px;z-index:5}
  .summary .big{font-size:19px;font-weight:700}
  .stat{display:inline-block;margin-right:18px;font-size:15px}.stat b{font-variant-numeric:tabular-nums}
  .muted{color:var(--muted)}
  .item{display:grid;grid-template-columns:300px 1fr;gap:18px;padding:18px 0;border-bottom:1px solid var(--border);align-items:start}
  @media(max-width:680px){.item{grid-template-columns:1fr}}
  .shot{border:1px solid var(--border);max-height:230px;overflow:hidden}.shot img{width:100%;display:block}
  .shot.empty{display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px}
  .title-line{font-size:19px;font-weight:700}.title-line a{color:var(--link)}
  .domain{color:var(--muted);font-size:14px;font-weight:400}
  .pred{display:inline-block;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.02em;padding:2px 8px 1px;margin-top:6px}
  .pred.yes{color:var(--heavy);background:var(--heavy-bg)}.pred.no{color:var(--muted);background:var(--panel)}
  .ev{color:var(--muted);font-size:14px;margin:6px 0 0}
  .ev code{background:var(--panel);padding:1px 4px}
  .ask{margin-top:12px;font-size:14px}
  .btns{margin-top:6px;display:flex;gap:8px;flex-wrap:wrap}
  .btns button{font:600 15px arial;padding:7px 14px;border:2px solid var(--border);background:#fff;color:var(--text);cursor:pointer}
  .btns button:hover{border-color:#0b0c0c}
  .btns button.sel-yes{background:var(--heavy);border-color:var(--heavy);color:#fff}
  .btns button.sel-no{background:var(--green);border-color:var(--green);color:#fff}
  .verdict{margin-top:8px;font-size:14px;font-weight:700}
  .ok{color:var(--green)}.bad{color:var(--heavy)}
  .err{color:var(--heavy);font-size:14px}
</style></head><body>
<div class="topbar"><b>Design Slop Cop · hero font mix eval</b></div>
<div class="wrap">
  <h1>Hero font mix — manual labeling</h1>
  <p class="lede">For each of the latest Show HN launches, the detector guessed whether the hero heading mixes two fonts (or a roman→italic switch). Mark the ground truth and the error rate updates live. Your labels are saved in this browser.</p>
  <div class="summary" id="summary"></div>
  <div id="list"></div>
</div>
<script>
const DATA = ${JSON.stringify(data)};
const KEY = 'hero-font-mix-labels-v1';
const labels = JSON.parse(localStorage.getItem(KEY) || '{}'); // slug -> true/false
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function host(u){try{return new URL(u).hostname.replace(/^www\\./,'')}catch{return u}}

function setLabel(slug,val){ labels[slug]=val; localStorage.setItem(KEY,JSON.stringify(labels)); render(); }

function render(){
  const list=document.getElementById('list');
  list.innerHTML = DATA.map(d=>{
    const lab = labels[d.slug];
    const ev = d.evidence;
    const evHtml = d.predicted && ev
      ? '<div class="ev">hero: <code>'+esc(ev.hero)+'</code> · '+esc(ev.kind||'')+(ev.families?(' · '+esc(ev.families.join(' + '))):'')+'</div>'
      : '';
    let verdict='';
    if(lab!==undefined){
      const correct = (lab===d.predicted);
      verdict='<div class="verdict '+(correct?'ok':'bad')+'">'+(correct?'✓ detector correct':'✗ detector wrong ('+(d.predicted?'false positive':'false negative')+')')+'</div>';
    }
    const shot = d.shot ? '<div class="shot"><img loading="lazy" src="./'+esc(d.shot)+'" alt=""></div>'
                        : '<div class="shot empty">'+(d.error?'failed to load':'no screenshot')+'</div>';
    return '<div class="item">'+shot+'<div><div class="title-line"><a href="'+esc(d.url)+'" target="_blank" rel="noopener">'+esc(d.title||host(d.url))+'</a> <span class="domain">('+esc(host(d.url))+')</span></div>'
      + (d.error ? '<div class="err">scan error: '+esc(d.error)+'</div>' : '<span class="pred '+(d.predicted?'yes':'no')+'">detector: '+(d.predicted?'font mix':'no mix')+'</span>'+evHtml)
      + (d.error ? '' :
         '<div class="ask"><b>Does the hero actually mix two fonts / a roman→italic word?</b></div>'
         + '<div class="btns">'
         + '<button class="'+(lab===true?'sel-yes':'')+'" onclick="setLabel(\\''+d.slug+'\\',true)">Yes — mix</button>'
         + '<button class="'+(lab===false?'sel-no':'')+'" onclick="setLabel(\\''+d.slug+'\\',false)">No mix</button>'
         + '</div>'+verdict)
      + '</div></div>';
  }).join('');
  renderSummary();
}

function renderSummary(){
  const labelable = DATA.filter(d=>!d.error);
  let tp=0,fp=0,fn=0,tn=0,labeled=0;
  for(const d of labelable){
    const t=labels[d.slug]; if(t===undefined) continue; labeled++;
    if(d.predicted&&t)tp++; else if(d.predicted&&!t)fp++; else if(!d.predicted&&t)fn++; else tn++;
  }
  const flagged = labelable.filter(d=>d.predicted).length;
  const prec = (tp+fp)?(100*tp/(tp+fp)).toFixed(0)+'%':'–';
  const rec = (tp+fn)?(100*tp/(tp+fn)).toFixed(0)+'%':'–';
  const acc = labeled?(100*(tp+tn)/labeled).toFixed(0)+'%':'–';
  const errRate = labeled?(100*(fp+fn)/labeled).toFixed(0)+'%':'–';
  document.getElementById('summary').innerHTML =
    '<div class="big">'+labeled+' / '+labelable.length+' labeled · detector flagged '+flagged+'</div>'
    + '<div style="margin-top:6px">'
    + '<span class="stat">Error rate <b>'+errRate+'</b></span>'
    + '<span class="stat">Accuracy <b>'+acc+'</b></span>'
    + '<span class="stat">Precision <b>'+prec+'</b> <span class="muted">(TP '+tp+' / FP '+fp+')</span></span>'
    + '<span class="stat">Recall <b>'+rec+'</b> <span class="muted">(FN '+fn+')</span></span>'
    + '<span class="stat muted">TN '+tn+'</span>'
    + '</div>';
}
render();
</script>
</body></html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
