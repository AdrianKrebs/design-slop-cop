// Compute per-pattern precision / recall / F1 from human labels in
// dataset/labels.jsonl against detector output in results/raw/*.json.
//
// Usage:
//   node tools/eval.mjs                # full report
//   node tools/eval.mjs --pattern=icon_card_grid   # one pattern, with FP/FN URLs

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS } from '../src/patterns/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LABELS_PATH = join(ROOT, 'dataset', 'labels.jsonl');
const RAW = join(ROOT, 'results', 'raw');

if (!existsSync(LABELS_PATH)) {
  console.error('No labels found at', LABELS_PATH);
  console.error('Run the labeling tool first: npm run label');
  process.exit(1);
}

const onlyPattern = (process.argv.find(a => a.startsWith('--pattern=')) || '').slice('--pattern='.length) || null;

// Latest label record per slug wins.
const labels = new Map();
const text = await readFile(LABELS_PATH, 'utf8');
for (const line of text.split('\n')) {
  const t = line.trim();
  if (!t) continue;
  try {
    const rec = JSON.parse(t);
    if (rec.slug) labels.set(rec.slug, rec);
  } catch {}
}
console.log(`Loaded ${labels.size} labeled site(s).`);

// Pull detector verdict for each labeled site.
const stats = new Map(); // pattern_id -> { tp, fp, fn, tn, fpUrls, fnUrls }
for (const p of PATTERNS) {
  stats.set(p.id, { tp: 0, fp: 0, fn: 0, tn: 0, fpUrls: [], fnUrls: [] });
}

let labeledSites = 0;
for (const [slug, rec] of labels) {
  const file = join(RAW, slug + '.json');
  if (!existsSync(file)) continue;
  const raw = JSON.parse(await readFile(file, 'utf8'));
  labeledSites++;
  const detTriggered = new Map();
  for (const p of raw.patterns || []) detTriggered.set(p.id, !!p.triggered);

  for (const p of PATTERNS) {
    const userLabel = rec.labels?.[p.id];
    if (!userLabel || userLabel === 'skip') continue;
    const present = userLabel === 'present';
    const triggered = !!detTriggered.get(p.id);
    const s = stats.get(p.id);
    if (triggered && present) s.tp++;
    else if (triggered && !present) { s.fp++; s.fpUrls.push(rec.url); }
    else if (!triggered && present) { s.fn++; s.fnUrls.push(rec.url); }
    else s.tn++;
  }
}

if (!labeledSites) {
  console.error('No labeled sites match available raw results. Did you delete results/raw?');
  process.exit(1);
}

function fmt(n) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return '   - ';
  return (n * 100).toFixed(1).padStart(5) + '%';
}

console.log(`\n${labeledSites} site${labeledSites === 1 ? '' : 's'} with usable labels.\n`);
console.log('Pattern'.padEnd(28) + ' ' +
  'TP'.padStart(4) + ' ' + 'FP'.padStart(4) + ' ' +
  'FN'.padStart(4) + ' ' + 'TN'.padStart(4) + '   ' +
  'Prec.'.padStart(6) + '  ' + 'Recall'.padStart(6) + '  ' + 'F1'.padStart(6));
console.log('-'.repeat(80));

const filtered = onlyPattern ? PATTERNS.filter(p => p.id === onlyPattern) : PATTERNS;

for (const p of filtered) {
  const s = stats.get(p.id);
  const precision = s.tp / (s.tp + s.fp);
  const recall = s.tp / (s.tp + s.fn);
  const f1 = 2 * precision * recall / (precision + recall);
  const label = (p.shortLabel || p.id).slice(0, 26).padEnd(28);
  console.log(`${label}` +
    ` ${String(s.tp).padStart(4)}` +
    ` ${String(s.fp).padStart(4)}` +
    ` ${String(s.fn).padStart(4)}` +
    ` ${String(s.tn).padStart(4)}` +
    `   ${fmt(precision)}  ${fmt(recall)}  ${fmt(f1)}`);
}

if (onlyPattern && stats.has(onlyPattern)) {
  const s = stats.get(onlyPattern);
  if (s.fpUrls.length) {
    console.log(`\nFalse positives (detector said triggered, human said no):`);
    for (const u of s.fpUrls.slice(0, 25)) console.log('  ' + u);
    if (s.fpUrls.length > 25) console.log(`  …and ${s.fpUrls.length - 25} more`);
  }
  if (s.fnUrls.length) {
    console.log(`\nFalse negatives (detector missed, human said yes):`);
    for (const u of s.fnUrls.slice(0, 25)) console.log('  ' + u);
    if (s.fnUrls.length > 25) console.log(`  …and ${s.fnUrls.length - 25} more`);
  }
}

console.log('\nLegend: TP/FP/FN/TN = true/false × positive/negative.');
console.log(`Run \`node tools/eval.mjs --pattern=<id>\` to see FP/FN URLs for a specific pattern.`);
