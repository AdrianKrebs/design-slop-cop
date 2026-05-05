// Upload every PNG in results/screenshots/ to BunnyCDN storage.
// Files are mirrored at <CDN_BASE>/<PREFIX>/<slug>.png so the report HTML
// can render thumbnails when hosted somewhere that doesn't ship the local
// screenshots directory (e.g. adriankrebs.ch).
//
// Reads from environment:
//   BUNNY_STORAGE_KEY (or BUNNY_API_KEY) — required
//   BUNNY_STORAGE_HOST — default ny.storage.bunnycdn.com
//   BUNNY_STORAGE_ZONE — required
//   BUNNY_CDN_BASE    — required, e.g. https://kadoa.b-cdn.net
//   BUNNY_PREFIX      — default ai-design-checker
//
// Flags:
//   --dry-run       list files that would upload, no network calls
//   --concurrency=N parallel uploads (default 8)

import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS_DIR = join(ROOT, 'results', 'screenshots');

const STORAGE_KEY = process.env.BUNNY_STORAGE_KEY || process.env.BUNNY_API_KEY;
const STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'ny.storage.bunnycdn.com';
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const CDN_BASE = process.env.BUNNY_CDN_BASE;
const PREFIX = process.env.BUNNY_PREFIX || 'ai-design-checker';

const dryRun = process.argv.includes('--dry-run');
const concArg = process.argv.find(a => a.startsWith('--concurrency='));
const concurrency = Math.max(1, parseInt(concArg?.slice('--concurrency='.length) || '8', 10));

if (!dryRun && !STORAGE_KEY) { console.error('BUNNY_STORAGE_KEY (or BUNNY_API_KEY) not set'); process.exit(1); }
if (!STORAGE_ZONE) { console.error('BUNNY_STORAGE_ZONE not set'); process.exit(1); }
if (!CDN_BASE) { console.error('BUNNY_CDN_BASE not set (e.g. https://your-zone.b-cdn.net)'); process.exit(1); }

async function uploadOne(localPath, remotePath) {
  const url = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${remotePath}`;
  const buffer = await readFile(localPath);
  const ext = extname(localPath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: STORAGE_KEY, 'Content-Type': contentType },
    body: buffer
  });
  return res.ok;
}

const entries = (await readdir(SHOTS_DIR)).filter(f => f.endsWith('.png'));
const files = await Promise.all(entries.map(async name => {
  const path = join(SHOTS_DIR, name);
  const s = await stat(path);
  return { name, path, size: s.size };
}));

const totalBytes = files.reduce((s, f) => s + f.size, 0);
console.log(`Found ${files.length} PNGs in results/screenshots (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Target: ${CDN_BASE}/${PREFIX}/<slug>.png · concurrency ${concurrency}${dryRun ? ' · DRY RUN' : ''}`);

let next = 0, uploaded = 0, failed = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= files.length) return;
    const f = files[i];
    const remotePath = `${PREFIX}/${f.name}`;
    if (dryRun) {
      console.log(`  [DRY] ${f.name} (${(f.size / 1024).toFixed(0)} KB) -> ${CDN_BASE}/${remotePath}`);
      continue;
    }
    try {
      const ok = await uploadOne(f.path, remotePath);
      if (ok) { uploaded++; if (uploaded % 50 === 0) console.log(`  ${uploaded}/${files.length} uploaded`); }
      else { failed++; console.error(`  FAIL ${f.name}`); }
    } catch (e) {
      failed++;
      console.error(`  FAIL ${f.name}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
