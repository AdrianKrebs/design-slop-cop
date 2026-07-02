// Capture one curated example crop per pattern for the /patterns reference page.
//
//   node scripts/capture-pattern-examples.mjs
//
// For each pattern we load a hand-picked exemplar site (one that triggers the
// pattern prominently), then crop to the tell:
//   • hero-level tells (fonts, purple, gradients, centering, dark, badge, emoji
//     nav)  → a clean top-of-page viewport clip.
//   • section-level tells (accent stripe, glass, glow, 1·2·3 steps, stat banner,
//     FAQ) → we tag the triggering element in-page and screenshot it with padding.
//
// Output: one web/pattern-examples/<patternId>.jpg per pattern, plus a tiny
// web/pattern-examples.json manifest ({ id: { url, mode, file } }). Re-run any
// time; it's deterministic given the exemplar list. Sites that are down are
// logged and skipped (the page falls back to a placeholder for them).

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VW = 1200, VH = 780;

// pattern id → { url, mode, find? }
//   mode 'hero'    : clip the top viewport.
//   mode 'element' : run find() in the page; it tags the element with
//                    data-slopshot="1" and returns true if found.
const EXEMPLARS = {
  slop_fonts:          { url: 'https://puzzlelair.com/', mode: 'hero' },
  hero_font_mix:       { url: 'https://clevercrow.io', mode: 'hero' },
  purple_accent:       { url: 'https://golemui.com', mode: 'hero' },
  gradients:           { url: 'https://www.absurdlyoptimized.com/recipes/pancakes/', mode: 'hero' },
  center_aligned_hero: { url: 'https://startupwiki.tech/', mode: 'hero' },
  perma_dark_mode:     { url: 'https://selforg-npa.github.io/', mode: 'hero' },
  hero_eyebrow_pill:   { url: 'https://supaslides.app/', mode: 'hero' },
  sidebar_emoji:       { url: 'https://brevio.pro', mode: 'hero' },

  accent_stripe: {
    url: 'https://llm-wiki.net/', mode: 'element',
    find: () => {
      const colored = c => c && c !== 'transparent' && !/rgba?\(\s*0,\s*0,\s*0,\s*0/.test(c);
      for (const el of document.querySelectorAll('div, section, article, li, a')) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 44 || r.height > 700) continue;
        const lw = parseFloat(cs.borderLeftWidth) || 0, tw = parseFloat(cs.borderTopWidth) || 0;
        if ((lw >= 3 && lw <= 12 && colored(cs.borderLeftColor)) || (tw >= 3 && tw <= 12 && colored(cs.borderTopColor))) {
          el.setAttribute('data-slopshot', '1'); return true;
        }
        // stripe drawn as a ::before/::after pseudo bar at the edge
        for (const pe of ['::before', '::after']) {
          const p = getComputedStyle(el, pe);
          if (!p.content || p.content === 'none') continue;
          const pw = parseFloat(p.width) || 0, ph = parseFloat(p.height) || 0;
          if (colored(p.backgroundColor) && ((pw <= 8 && ph >= 30) || (ph <= 8 && pw >= 60))) {
            el.setAttribute('data-slopshot', '1'); return true;
          }
        }
      }
      return false;
    }
  },
  glassmorphism: {
    url: 'https://www.calendarpipe.com', mode: 'element',
    find: () => {
      // Pick the largest genuinely panel-shaped frosted element, not a thin
      // sticky nav bar (which is the usual first backdrop-blur match).
      let best = null, bestArea = 0;
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
        const m = bf.match(/blur\(([\d.]+)px\)/);
        if (!m || parseFloat(m[1]) < 4) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 160 || r.height < 90) continue;
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      }
      if (best) { best.setAttribute('data-slopshot', '1'); return true; }
      return false;
    }
  },
  colored_glows: {
    url: 'https://www.vioevo.com/', mode: 'element',
    find: () => {
      for (const el of document.querySelectorAll('button, a, div, section')) {
        const cs = getComputedStyle(el); const sh = cs.boxShadow || '';
        const m = sh.match(/rgba?\(([^)]+)\)[^,]*?(\d+)px\s+(\d+)px/);
        const r = el.getBoundingClientRect();
        if (m && /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.test(sh)) {
          const [, rr, gg, bb] = sh.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
          const sat = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
          if (sat > 40 && r.width > 80 && r.height > 30) { el.setAttribute('data-slopshot', '1'); return true; }
        }
      }
      return false;
    }
  },
  numbered_steps: {
    url: 'https://margaine.com/hunch', mode: 'element',
    find: () => {
      const nums = [...document.querySelectorAll('div, section, ol, ul')].filter(el => {
        const t = el.textContent || '';
        return /(^|\D)1(\D).*?(^|\D)2(\D).*?(^|\D)3(\D)/s.test(t) && el.getBoundingClientRect().height < 900;
      });
      const el = nums.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
      if (el) { el.setAttribute('data-slopshot', '1'); return true; }
      return false;
    }
  },
  stat_banner_row: {
    url: 'https://golemui.com', mode: 'element',
    find: () => {
      const cand = [...document.querySelectorAll('div, section, ul')].filter(el => {
        const t = el.textContent || '';
        const hits = (t.match(/\d[\d.,]*\s*(\+|%|k|m|x|★|\/5)/gi) || []).length;
        const r = el.getBoundingClientRect();
        return hits >= 2 && r.width > 300 && r.height < 320;
      });
      const el = cand.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
      if (el) { el.setAttribute('data-slopshot', '1'); return true; }
      return false;
    }
  },
  faq_accordion: {
    url: 'https://places.is', mode: 'element',
    find: () => {
      const h = [...document.querySelectorAll('h1,h2,h3,h4,summary,div,span')]
        .find(e => /frequently asked|common questions|faq|questions/i.test((e.textContent || '').trim().slice(0, 40)));
      if (!h) return false;
      let sec = h; for (let i = 0; i < 4 && sec.parentElement; i++) { if (sec.getBoundingClientRect().height > 260) break; sec = sec.parentElement; }
      sec.setAttribute('data-slopshot', '1'); return true;
    }
  },
};

async function settle(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.waitForTimeout(900);
}

async function capture(browser, id, cfg) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await settle(page);
    let buf;
    if (cfg.mode === 'element') {
      const found = await page.evaluate(`(${cfg.find.toString()})()`);
      if (found) {
        const el = await page.$('[data-slopshot="1"]');
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(250);
        buf = await el.screenshot({ type: 'jpeg', quality: 72 });
      } else {
        console.log(`  · ${id}: element not found → hero fallback`);
      }
    }
    if (!buf) buf = await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: VW, height: VH } });
    await ctx.close();
    return buf;
  } catch (e) {
    await ctx.close().catch(() => {});
    console.log(`  ✗ ${id}: ${cfg.url} — ${e.message.split('\n')[0].slice(0, 70)}`);
    return null;
  }
}

// Optional args: capture only the named pattern ids and merge into the existing
// manifest (leaves the rest untouched). No args → capture all.
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const IMG_DIR = join(ROOT, 'web', 'pattern-examples');   // one .jpg per pattern
const MANIFEST = join(ROOT, 'web', 'pattern-examples.json'); // tiny index (no image data)
await mkdir(IMG_DIR, { recursive: true });
let out = {};
if (only.length) { try { out = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch {} }

const browser = await chromium.launch({ headless: true });
for (const [id, cfg] of Object.entries(EXEMPLARS)) {
  if (only.length && !only.includes(id)) continue;
  const buf = await capture(browser, id, cfg);
  const file = buf ? `pattern-examples/${id}.jpg` : null;
  if (buf) await writeFile(join(IMG_DIR, `${id}.jpg`), buf);
  out[id] = { url: cfg.url, mode: cfg.mode, file };
  console.log(`  ✓ ${id.padEnd(20)} ${cfg.mode.padEnd(8)} ${buf ? Math.round(buf.length / 1024) + 'kb' : '—'}  ${cfg.url}`);
}
await browser.close();
await writeFile(MANIFEST, JSON.stringify(out, null, 2) + '\n');
console.log(`\nWrote ${Object.values(out).filter(v => v.file).length}/${Object.keys(out).length} crops to web/pattern-examples/ + manifest`);
