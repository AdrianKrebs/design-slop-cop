// Ad-hoc scan server. Paste a URL, run the detector live, render results.
//
//   node tools/scan/server.mjs        # serves http://localhost:7788/
//
// Routes:
//   GET  /                       → public/index.html
//   GET  /screenshots/:file      → results/screenshots/*
//   POST /api/scan { url }       → runs detector, returns scored JSON

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildDetectorSource } from '../../src/detector.js';
import { analyzePage } from '../../src/run.js';
import { MIME, send, readBody, serveFile } from '../_lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SHOTS = join(ROOT, 'results', 'screenshots');
const PUBLIC = join(__dirname, 'public');

await mkdir(SHOTS, { recursive: true });

const PORT = process.env.PORT || 7788;

// Lazy browser singleton — first scan launches Chromium, then we reuse it.
// We re-launch if the previous instance died so a single crash doesn't wedge
// the server.
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = chromium.launch({ headless: true });
  return browserPromise;
}

const detectorSource = buildDetectorSource();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return serveFile(join(PUBLIC, 'index.html'), res);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/screenshots/')) {
      const file = url.pathname.replace('/screenshots/', '');
      const path = join(SHOTS, file);
      if (!path.startsWith(SHOTS)) return send(res, 404, 'text/plain', 'not found');
      return serveFile(path, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const raw = await readBody(req);
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(res, 400, MIME['.json'], '{"error":"invalid json"}'); }
      let target = (payload.url || '').trim();
      if (!target) return send(res, 400, MIME['.json'], '{"error":"url required"}');
      if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
      try { new URL(target); } catch { return send(res, 400, MIME['.json'], '{"error":"invalid url"}'); }

      console.log(`[scan] ${target}`);
      const browser = await getBrowser();
      const result = await analyzePage(browser, target, detectorSource, { screenshotDir: SHOTS });
      if (result.error) {
        return send(res, 502, MIME['.json'], JSON.stringify({ error: result.error, url: target }));
      }
      // Strip the heavy `raw` payload — the score and patterns array carry
      // everything the UI needs.
      const slim = {
        url: result.url,
        slug: result.slug,
        elapsedMs: result.elapsedMs,
        screenshot: result.screenshot,
        score: result.score,
        tier: result.tier,
        tierLabel: result.tierLabel,
        patternsFlagged: result.patternsFlagged,
        patternsTotal: result.patternsTotal,
        patterns: result.patterns
      };
      return send(res, 200, MIME['.json'], JSON.stringify(slim));
    }

    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    console.error('server error:', e);
    if (!res.headersSent) send(res, 500, 'text/plain', 'server error');
  }
});

server.listen(PORT, () => {
  console.log(`Scan UI listening on http://localhost:${PORT}/`);
});

process.on('SIGINT', async () => {
  if (browserPromise) {
    try { (await browserPromise).close(); } catch {}
  }
  process.exit(0);
});
