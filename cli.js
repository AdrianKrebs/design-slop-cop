#!/usr/bin/env node
// One-shot CLI: takes a URL, prints a scored verdict.
//
//   node cli.js https://example.com
//   node cli.js https://example.com --json

import { chromium } from 'playwright';
import { buildDetectorSource } from './src/detector.js';
import { analyzePage } from './src/run.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const url = args.find(a => !a.startsWith('--'));

if (!url) {
  console.error('usage: npx ai-design-checker <url> [--json]');
  process.exit(1);
}

const target = /^https?:\/\//i.test(url) ? url : 'https://' + url;
try { new URL(target); } catch { console.error('invalid url:', url); process.exit(1); }

const detectorSource = buildDetectorSource();
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  console.error('Could not launch Chromium. Run: npx playwright install chromium');
  process.exit(2);
}

const result = await analyzePage(browser, target, detectorSource, { screenshotDir: join(tmpdir(), 'ai-design-checker') });
await browser.close();

if (result.error) {
  console.error('error:', result.error);
  process.exit(3);
}

if (jsonOnly) {
  // Strip the heavy raw signals — keep what a consumer would actually script against.
  const { url, slug, score, tier, tierLabel, patternsFlagged, patternsTotal, patterns } = result;
  console.log(JSON.stringify({
    url, slug, score, tier, tierLabel, patternsFlagged, patternsTotal,
    patterns: patterns.map(p => ({ id: p.id, label: p.shortLabel, triggered: p.triggered, evidence: p.evidence }))
  }, null, 2));
  process.exit(0);
}

const tierColor = { Heavy: '\x1b[31m', Mild: '\x1b[33m', Clean: '\x1b[32m' }[result.tierLabel] || '';
const reset = '\x1b[0m';
const dim = '\x1b[2m';
const bold = '\x1b[1m';

console.log();
console.log(`${bold}${result.url}${reset}`);
console.log(`${tierColor}${bold}${result.tierLabel}${reset} · score ${bold}${result.score}${reset}/100 · ${result.patternsFlagged}/${result.patternsTotal} patterns`);
console.log();

const flagged = result.patterns.filter(p => p.triggered);
if (flagged.length) {
  console.log(`${dim}Triggered:${reset}`);
  for (const p of flagged) console.log(`  • ${p.shortLabel}`);
}
const clean = result.patterns.filter(p => !p.triggered);
if (clean.length) {
  console.log();
  console.log(`${dim}Clean: ${clean.map(p => p.shortLabel).join(', ')}${reset}`);
}
console.log();
