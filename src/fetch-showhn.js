// Pulls recent Show HN launches from the HN Algolia API and writes URLs to urls.txt.
// - Filters out GitHub, PDF, arxiv, raw text, video, and other non-landing-page URLs
// - Deduplicates against any existing entries
// - Keeps newest launches first

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGET = parseInt(process.argv.find(a => a.startsWith('--count='))?.slice(8) || '100', 10);
const URLS_FILE = join(ROOT, 'urls.txt');

const EXCLUDE_HOSTS = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|arxiv\.org|ycombinator\.com|reddit\.com|news\.ycombinator\.com|medium\.com|substack\.com|notion\.site|notion\.so|dev\.to|gist\.github\.com|docs\.google\.com|drive\.google\.com|linkedin\.com|f-droid\.org|npmjs\.com|pypi\.org|crates\.io|rubygems\.org|chromewebstore\.google\.com|apps\.apple\.com|play\.google\.com|paypal\.com|apify\.com|huggingface\.co)$/i;
const EXCLUDE_PATH = /\.(pdf|zip|tar|gz|exe|dmg|mp4|mp3|wav|png|jpg|jpeg|gif|json|xml|txt|csv)(\?|$)|\/\.well-known\/|\/blog\//i;

function isEligible(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (EXCLUDE_HOSTS.test(u.hostname)) return false;
    if (EXCLUDE_PATH.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPage(page) {
  const qs = new URLSearchParams({
    tags: 'show_hn',
    hitsPerPage: '100',
    page: String(page)
  });
  const url = `https://hn.algolia.com/api/v1/search_by_date?${qs.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ai-design-checker/0.1' } });
  if (!res.ok) throw new Error(`HN API ${res.status}`);
  return res.json();
}

function normalize(url) {
  try {
    const u = new URL(url);
    // Strip trailing slash + fragment + common tracking queries for dedup
    u.hash = '';
    for (const p of ['utm_source','utm_medium','utm_campaign','utm_content','ref','source','platform','discount']) u.searchParams.delete(p);
    let norm = u.origin + u.pathname.replace(/\/$/, '');
    const qs = u.searchParams.toString();
    if (qs) norm += '?' + qs;
    return norm.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function main() {
  // Load existing URLs + preserve header comments
  const urls = new Set();
  const normSet = new Set();
  const seenHosts = new Set();
  if (existsSync(URLS_FILE)) {
    const raw = await readFile(URLS_FILE, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      urls.add(trimmed);
      normSet.add(normalize(trimmed));
      try { seenHosts.add(new URL(trimmed).hostname.replace(/^www\./, '')); } catch {}
    }
  }
  const beforeCount = urls.size;
  console.log(`Existing non-duplicate URLs: ${beforeCount}`);

  const picked = [];
  let page = 0;
  const cap = 20; // up to 2000 hits
  while (picked.length < TARGET && page < cap) {
    console.log(`Fetching Show HN page ${page + 1}...`);
    const data = await fetchPage(page);
    if (!data.hits || data.hits.length === 0) break;
    for (const hit of data.hits) {
      if (!hit.url || !isEligible(hit.url)) continue;
      const norm = normalize(hit.url);
      if (normSet.has(norm)) continue;
      let host;
      try { host = new URL(hit.url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (seenHosts.has(host)) continue;
      seenHosts.add(host);
      urls.add(hit.url);
      normSet.add(norm);
      picked.push({ url: hit.url, title: hit.title, created: hit.created_at, points: hit.points });
      if (picked.length >= TARGET) break;
    }
    page++;
    if (!data.hits.length || data.hits.length < 100) break;
  }

  console.log(`Added ${picked.length} new Show HN URLs (${urls.size - beforeCount} after dedup).`);

  // Rewrite urls.txt: keep header comments, then group original + new
  const header = [
    '# One URL per line. Lines starting with # are ignored.',
    '# Fetched from hn.algolia.com search_by_date?tags=show_hn',
    `# Last updated ${new Date().toISOString().slice(0, 10)} with ${urls.size} URLs total.`,
    ''
  ];
  const lines = header.concat([...urls]);
  await writeFile(URLS_FILE, lines.join('\n') + '\n');
  console.log(`Wrote ${urls.size} URLs to ${URLS_FILE}`);

  // Keep a record of what we pulled this run
  const logPath = join(ROOT, 'results', 'fetch-log.json');
  let prev = [];
  if (existsSync(logPath)) {
    try { prev = JSON.parse(await readFile(logPath, 'utf8')); } catch {}
  }
  prev.push({ fetchedAt: new Date().toISOString(), added: picked });
  await writeFile(logPath, JSON.stringify(prev, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
