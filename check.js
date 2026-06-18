#!/usr/bin/env node
// One-shot CLI: takes a URL, prints a scored verdict.
//
//   node check.js https://example.com
//   node check.js https://example.com --json
//   node check.js https://example.com --pattern=gradients   # debug one pattern

import { chromium } from 'playwright';
import { buildDetectorSource } from './src/detector.js';
import { analyzePage } from './src/run.js';
import { PATTERNS } from './src/patterns/index.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const patternId = args.find(a => a.startsWith('--pattern='))?.slice('--pattern='.length);
const url = args.find(a => !a.startsWith('--'));

if (!url) {
  console.error('usage: npx design-slop-cop <url> [--json] [--pattern=<id>]');
  process.exit(1);
}

if (patternId && !PATTERNS.some(p => p.id === patternId)) {
  console.error(`unknown pattern: ${patternId}\nvalid ids: ${PATTERNS.map(p => p.id).join(', ')}`);
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

const result = await analyzePage(browser, target, detectorSource, { screenshotDir: join(tmpdir(), 'design-slop-cop') });
await browser.close();

if (result.error) {
  console.error('error:', result.error);
  process.exit(3);
}

// --pattern=<id>: focus on a single pattern — show its raw signal (what
// extract() returned) and its verdict + evidence (what score() returned).
// This is the fast feedback loop when authoring or debugging one pattern.
if (patternId) {
  const scored = result.patterns.find(p => p.id === patternId);
  const rawSignal = result.raw?.signals?.[patternId] ?? null;
  if (jsonOnly) {
    console.log(JSON.stringify({
      url: result.url, pattern: patternId,
      triggered: scored.triggered, evidence: scored.evidence, signal: rawSignal
    }, null, 2));
    process.exit(0);
  }
  const reset = '\x1b[0m', bold = '\x1b[1m', dim = '\x1b[2m';
  const mark = scored.triggered ? '\x1b[31m● triggered' : '\x1b[32m○ not triggered';
  console.log();
  console.log(`${bold}${scored.label}${reset} ${dim}(${patternId})${reset}`);
  console.log(`${mark}${reset}  on ${result.url}`);
  console.log();
  console.log(`${dim}signal (from extract):${reset}`);
  console.log(JSON.stringify(rawSignal, null, 2));
  console.log();
  console.log(`${dim}evidence (from score):${reset}`);
  console.log(JSON.stringify(scored.evidence ?? null, null, 2));
  console.log();
  process.exit(0);
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
const tierName = { Heavy: 'Heavy', Mild: 'Some', Clean: 'Clean' }[result.tierLabel] || result.tierLabel;
const reset = '\x1b[0m';
const dim = '\x1b[2m';
const bold = '\x1b[1m';

console.log();
console.log(`${bold}${result.url}${reset}`);
console.log(`${tierColor}${bold}${tierName}${reset} · score ${bold}${result.score}${reset}/100 · ${result.patternsFlagged}/${result.patternsTotal} patterns`);
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
