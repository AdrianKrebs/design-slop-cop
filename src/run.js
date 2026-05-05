import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildDetectorSource } from './detector.js';
import { scoreReport } from './score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function slugFromUrl(u) {
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/$/, '').replace(/\//g, '_') || '';
    return (host + path).replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
  } catch {
    return u.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
  }
}

async function loadUrls() {
  const urlsArg = process.argv.find(a => a.startsWith('--urls='));
  const singleUrl = process.argv.find(a => a.startsWith('--url='));
  if (singleUrl) return [singleUrl.slice(6)];
  const file = urlsArg ? urlsArg.slice(7) : join(ROOT, 'urls.txt');
  const raw = await readFile(file, 'utf8');
  return raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

export { slugFromUrl };

export async function analyzePage(browser, url, detectorSource, opts = {}) {
  const screenshotDir = opts.screenshotDir || join(ROOT, 'results', 'screenshots');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const started = Date.now();
  let loadError = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) {
    loadError = e.message;
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); loadError = null; } catch (e2) { loadError = e2.message; }
  }
  if (loadError) {
    await context.close();
    return { url, error: loadError, elapsedMs: Date.now() - started };
  }
  // Let animations, fonts, deferred imagery settle
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.waitForTimeout(1500);
  // Disable smooth-scroll so we can reliably reset to top for the screenshot
  try {
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
  } catch {}
  // Scroll to trigger lazy-loaded sections (but return to top)
  try {
    await page.evaluate(async () => {
      await new Promise(res => {
        let y = 0;
        const step = 400;
        const id = setInterval(() => {
          window.scrollTo(0, y);
          y += step;
          if (y > document.documentElement.scrollHeight) { clearInterval(id); res(); }
        }, 100);
      });
    });
  } catch {}
  await page.waitForTimeout(400);
  try { await page.evaluate(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }); } catch {}
  await page.waitForTimeout(500);

  let raw;
  try {
    raw = await page.evaluate(detectorSource);
  } catch (e) {
    await context.close();
    return { url, error: 'detector failed: ' + e.message, elapsedMs: Date.now() - started };
  }
  const slug = slugFromUrl(url);
  const shotPath = join(screenshotDir, slug + '.png');
  try {
    await mkdir(screenshotDir, { recursive: true });
    // Full-page screenshot so labelers can scroll the whole site, not just the hero.
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch {}
  await context.close();

  const scored = scoreReport(raw);
  return {
    url,
    slug,
    elapsedMs: Date.now() - started,
    screenshot: 'screenshots/' + slug + '.png',
    raw,
    ...scored
  };
}

async function main() {
  let urls = await loadUrls();
  const skipExisting = process.argv.includes('--skip-existing');
  const existingSlugs = new Set();
  if (skipExisting) {
    const { readdir } = await import('node:fs/promises');
    try {
      const files = await readdir(join(ROOT, 'results', 'raw'));
      for (const f of files) if (f.endsWith('.json')) existingSlugs.add(f.slice(0, -5));
    } catch {}
    const before = urls.length;
    urls = urls.filter(u => !existingSlugs.has(slugFromUrl(u)));
    console.log(`Skipping ${before - urls.length} URLs that already have cached results.`);
  }
  const detectorSource = buildDetectorSource();
  const concArg = process.argv.find(a => a.startsWith('--concurrency='));
  const concurrency = Math.max(1, parseInt(concArg?.slice('--concurrency='.length) || '1', 10));
  console.log(`Analyzing ${urls.length} URLs (concurrency ${concurrency})...`);
  const browser = await chromium.launch({ headless: true });
  const all = new Array(urls.length);
  let nextIdx = 0;
  let doneCount = 0;

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= urls.length) return;
      const url = urls[i];
      let result;
      try {
        result = await analyzePage(browser, url, detectorSource);
      } catch (e) {
        result = { url, error: 'fatal: ' + e.message };
      }
      doneCount++;
      const status = result.error
        ? `ERROR (${result.error.split('\n')[0].slice(0, 80)})`
        : `${result.tierLabel} · ${result.patternsFlagged}/${result.patternsTotal} patterns [${result.elapsedMs}ms]`;
      console.log(`[${doneCount}/${urls.length}] ${url} ... ${status}`);
      all[i] = result;
      if (!result.error) {
        await writeFile(
          join(ROOT, 'results', 'raw', result.slug + '.json'),
          JSON.stringify(result, null, 2)
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.close();
  // If we skipped existing, merge in their cached results so all-results.json is complete.
  let final = all;
  if (skipExisting && existingSlugs.size > 0) {
    const merged = [...all];
    const seen = new Set(all.map(r => r.slug));
    for (const slug of existingSlugs) {
      if (seen.has(slug)) continue;
      try {
        const cached = JSON.parse(await readFile(join(ROOT, 'results', 'raw', slug + '.json'), 'utf8'));
        merged.push(cached);
      } catch {}
    }
    final = merged;
  }
  await writeFile(
    join(ROOT, 'results', 'all-results.json'),
    JSON.stringify(final, null, 2)
  );
  console.log(`\nWrote results/all-results.json (${final.length} entries)`);
}

// Run main() only when invoked as a script, not when imported.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(e => { console.error(e); process.exit(1); });
}
