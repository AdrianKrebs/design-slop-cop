// Production web server for the public Design Slop Cop.
//
//   node web/server.mjs        # serves http://localhost:8080/
//
// Designed to survive a traffic spike (e.g. the HN front page) on a small
// pool of machines:
//   • One shared headless Chromium, reused across scans.
//   • A bounded concurrency semaphore — only N scans run at once; the rest
//     queue briefly, then 429 if the queue is saturated. This protects RAM.
//   • An in-memory LRU cache keyed by URL — repeat scans (everyone pasting the
//     same trending URL) are served instantly and don't launch a browser.
//   • Screenshots are returned inline as data URLs and cached, so the server
//     holds no disk state and any machine can serve any request.
//   • SSRF guard — refuses localhost / private-network / non-http targets.
//   • A crude per-IP rate limit.
//
// Routes:
//   GET  /                  → public/index.html
//   GET  /healthz           → 200 ok            (Fly health checks)
//   POST /api/scan { url }  → scored JSON (+ inline screenshot data URL)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { chromium } from 'playwright';
import { buildDetectorSource } from '../src/detector.js';
import { analyzePage } from '../src/run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const INDEX_HTML = join(PUBLIC, 'index.html');
// Pre-built, self-contained gallery of classified Show HN sites (screenshots
// served from the CDN). Rebuild with `node src/build-report.js --cdn-base=… --out=web/report.html`.
const REPORT_HTML = join(__dirname, 'report.html');

// Bundled list of classified Show HN URLs, for the "try a random site" button.
let SHOWHN_URLS = [];
try { SHOWHN_URLS = JSON.parse(readFileSync(join(__dirname, 'showhn-urls.json'), 'utf8')); } catch {}

const PORT = Number(process.env.PORT) || 8080;
// How many scans may run concurrently *per machine*. Each headless Chromium
// page needs ~0.5–1 GB; keep this in line with the machine's RAM. Fly brings
// more machines online via the concurrency limits in fly.toml.
const SCAN_CONCURRENCY = Number(process.env.SCAN_CONCURRENCY) || 2;
// Reject new work once this many scans are waiting for a slot.
const MAX_QUEUE = Number(process.env.MAX_QUEUE) || 12;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 60 * 60 * 1000; // 1h
const CACHE_MAX = Number(process.env.CACHE_MAX) || 500;
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 12;

const JSON_MIME = 'application/json; charset=utf-8';

// ── shared browser singleton (re-launched if it dies) ───────────────────────
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browserPromise;
}

const detectorSource = buildDetectorSource();

// ── bounded concurrency ─────────────────────────────────────────────────────
let active = 0;
let queued = 0;
const waiters = [];
function acquire() {
  if (active < SCAN_CONCURRENCY) { active++; return Promise.resolve(true); }
  if (queued >= MAX_QUEUE) return Promise.resolve(false); // saturated → caller 429s
  queued++;
  return new Promise(res => waiters.push(res));
}
function release() {
  const next = waiters.shift();
  if (next) { queued--; next(true); } // hand the slot straight to a waiter
  else active--;
}

// ── tiny LRU with TTL ───────────────────────────────────────────────────────
const cache = new Map(); // url → { at, payload }
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  cache.delete(key); cache.set(key, e); // bump recency
  return e.payload;
}
function cacheSet(key, payload) {
  cache.set(key, { at: Date.now(), payload });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// ── crude per-IP rate limit (sliding window) ────────────────────────────────
const hits = new Map(); // ip → number[] timestamps
function rateOk(ip) {
  const now = Date.now();
  const win = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (win.length >= RATE_PER_MIN) { hits.set(ip, win); return false; }
  win.push(now); hits.set(ip, win);
  if (hits.size > 5000) hits.clear(); // bound memory
  return true;
}

// ── SSRF guard: only public http(s) hosts ───────────────────────────────────
function isPrivateIp(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 ||
         a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224;
}
async function assertPublicUrl(target) {
  let u;
  try { u = new URL(target); } catch { throw new Error('invalid url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http/https urls are allowed');
  const host = u.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('refusing to scan internal host');
  const { address } = await lookup(host).catch(() => ({ address: null }));
  if (!address || isPrivateIp(address)) throw new Error('refusing to scan private address');
  return u.href;
}

function normalizeUrl(raw) {
  let t = (raw || '').trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try { return new URL(t).href; } catch { return null; }
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  const xff = req.headers['fly-client-ip'] || req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

async function runScan(target) {
  const browser = await getBrowser();
  const result = await analyzePage(browser, target, detectorSource, { screenshotBuffer: true });
  if (result.error) return { error: result.error };
  const shot = result.screenshotBuffer
    ? 'data:image/png;base64,' + result.screenshotBuffer.toString('base64')
    : null;
  return {
    url: result.url,
    slug: result.slug,
    elapsedMs: result.elapsedMs,
    screenshot: shot,
    score: result.score,
    tier: result.tier,
    tierLabel: result.tierLabel,
    patternsFlagged: result.patternsFlagged,
    patternsTotal: result.patternsTotal,
    patterns: result.patterns
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');

    if (req.method === 'GET' && url.pathname === '/api/random') {
      if (!SHOWHN_URLS.length) return send(res, 503, JSON_MIME, JSON.stringify({ error: 'no sample available' }));
      const pick = SHOWHN_URLS[Math.floor(Math.random() * SHOWHN_URLS.length)];
      return send(res, 200, JSON_MIME, JSON.stringify({ url: pick }));
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(INDEX_HTML).catch(() => null);
      if (!html) return send(res, 500, 'text/plain', 'missing index.html');
      return send(res, 200, 'text/html; charset=utf-8', html);
    }

    if (req.method === 'GET' && (url.pathname === '/show' || url.pathname === '/show/')) {
      const html = await readFile(REPORT_HTML).catch(() => null);
      if (!html) return send(res, 404, 'text/plain', 'report not built — run build-report.js');
      return send(res, 200, 'text/html; charset=utf-8', html);
    }

    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const ip = clientIp(req);
      if (!rateOk(ip)) return send(res, 429, JSON_MIME, JSON.stringify({ error: 'rate limit — slow down a moment' }));

      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return send(res, 400, JSON_MIME, '{"error":"invalid json"}'); }
      const target = normalizeUrl(payload.url);
      if (!target) return send(res, 400, JSON_MIME, '{"error":"url required"}');

      let safe;
      try { safe = await assertPublicUrl(target); }
      catch (e) { return send(res, 400, JSON_MIME, JSON.stringify({ error: e.message })); }

      const cached = cacheGet(safe);
      if (cached) return send(res, 200, JSON_MIME, JSON.stringify({ ...cached, cached: true }));

      const got = await acquire();
      if (!got) return send(res, 503, JSON_MIME, JSON.stringify({ error: 'busy — too many scans in flight, try again shortly' }));
      try {
        console.log(`[scan] ${safe} (active=${active} queued=${queued})`);
        const out = await runScan(safe);
        if (out.error) return send(res, 502, JSON_MIME, JSON.stringify({ error: out.error, url: safe }));
        cacheSet(safe, out);
        return send(res, 200, JSON_MIME, JSON.stringify(out));
      } finally {
        release();
      }
    }

    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    console.error('server error:', e);
    if (!res.headersSent) send(res, 500, 'text/plain', 'server error');
  }
});

server.listen(PORT, () => console.log(`Design Slop Cop listening on http://localhost:${PORT}/  (concurrency ${SCAN_CONCURRENCY})`));

async function shutdown() {
  try { if (browserPromise) (await browserPromise).close(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
