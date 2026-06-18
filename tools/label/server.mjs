// Tiny Node http server for the labeling UI. No deps.
//
//   node tools/label/server.mjs        # serves http://localhost:7777/
//
// Routes:
//   GET  /                       → public/index.html
//   GET  /screenshots/:file      → results/screenshots/*
//   GET  /api/sites              → list of slugs + label status
//   GET  /api/site/:slug         → that site's full scored JSON
//   POST /api/labels             → append one label record to dataset/labels.jsonl

import { createServer } from 'node:http';
import { readFile, readdir, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIME, send, readBody, serveFile } from '../_lib/http.mjs';
import { slugFromUrl } from '../../src/run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const RAW = join(ROOT, 'results', 'raw');
const SHOTS = join(ROOT, 'results', 'screenshots');
const PUBLIC = join(__dirname, 'public');
const LABELS = join(ROOT, 'dataset', 'labels.jsonl');

await mkdir(dirname(LABELS), { recursive: true });

const PORT = process.env.PORT || 7777;

async function readLabelsBySlug() {
  const map = new Map(); // slug → most recent record
  if (!existsSync(LABELS)) return map;
  const text = await readFile(LABELS, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t);
      if (rec.slug) map.set(rec.slug, rec);
    } catch {}
  }
  return map;
}

async function listSites() {
  const files = await readdir(RAW);
  const slugs = files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  const labeled = await readLabelsBySlug();
  return slugs.map(slug => ({ slug, labeled: labeled.has(slug) }));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return serveFile(join(PUBLIC, 'index.html'), res);
    }
    if (req.method === 'GET' && path.startsWith('/screenshots/')) {
      return serveFile(join(SHOTS, path.slice('/screenshots/'.length)), res);
    }
    if (req.method === 'GET' && path === '/api/sites') {
      let sites = await listSites();
      // ?focus=<path-to-urls-file> filters to slugs derived from those URLs.
      const focus = url.searchParams.get('focus');
      if (focus) {
        try {
          const raw = await readFile(focus, 'utf8');
          const focusSlugs = new Set();
          for (const line of raw.split('\n')) {
            const u = line.trim();
            if (!u || u.startsWith('#')) continue;
            focusSlugs.add(slugFromUrl(u));
          }
          sites = sites.filter(s => focusSlugs.has(s.slug));
        } catch {
          // unreadable focus file → fall through with the full list
        }
      }
      return send(res, 200, MIME['.json'], JSON.stringify(sites));
    }
    if (req.method === 'GET' && path.startsWith('/api/site/')) {
      const slug = decodeURIComponent(path.slice('/api/site/'.length));
      const labels = await readLabelsBySlug();
      const data = await readFile(join(RAW, slug + '.json'), 'utf8').catch(() => null);
      if (!data) return send(res, 404, 'text/plain', 'not found');
      const out = JSON.parse(data);
      out.previousLabels = labels.get(slug) || null;
      return send(res, 200, MIME['.json'], JSON.stringify(out));
    }
    if (req.method === 'POST' && path === '/api/labels') {
      const body = await readBody(req);
      const rec = JSON.parse(body);
      if (!rec.slug) return send(res, 400, 'text/plain', 'missing slug');
      rec.timestamp = new Date().toISOString();
      await appendFile(LABELS, JSON.stringify(rec) + '\n');
      return send(res, 200, MIME['.json'], JSON.stringify({ ok: true }));
    }
    res.writeHead(404).end('not found');
  } catch (e) {
    res.writeHead(500).end('error: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`Labeling UI: http://localhost:${PORT}/`);
  console.log(`Saving to:   ${LABELS}`);
});
