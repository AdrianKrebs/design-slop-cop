// Node-side scoring. Reads detector output (signals per pattern + shared
// fonts/meta), runs each pattern's score(), classifies into Heavy / Mild /
// Clean tiers based on number of patterns triggered.
//
// All patterns are weighted equally. Score is the simple percentage of
// patterns triggered. Tier is the count bucket.

import { PATTERNS } from './patterns/index.js';

const TIER_THRESHOLDS = {
  heavy: 4, // 4+ patterns triggered → Heavy (Slop)
  mild:  2  // 2–3 patterns triggered → Mild (Medium)
  //       <2 patterns → Clean
};

function tierFor(patternsFlagged) {
  if (patternsFlagged >= TIER_THRESHOLDS.heavy) return 'Heavy';
  if (patternsFlagged >= TIER_THRESHOLDS.mild) return 'Mild';
  return 'Clean';
}

// `report` shape from the detector:
//   {
//     meta: { url, title, bodyBg, isDarkMode, ... },
//     fonts: { topFonts, slopFontsDetected, headingFont, ... },
//     signals: { [pattern_id]: <raw signal>, ... }
//   }
export function scoreReport(report) {
  const out = [];
  let flagged = 0;

  for (const p of PATTERNS) {
    const signal = report.signals?.[p.id];
    // Some pattern scorers want shared context (e.g. centered-hero checks
    // ctxFonts.headingFont). Pass it as last arg; the rest ignore it.
    const res = p.score(signal, p.thresholds || {}, report.fonts || {});
    const triggered = !!res?.triggered;
    if (triggered) flagged++;
    out.push({
      id: p.id,
      label: p.label,
      shortLabel: p.shortLabel,
      description: p.description,
      category: p.category,
      triggered,
      evidence: res?.evidence || null
    });
  }

  const tier = tierFor(flagged);
  return {
    score: PATTERNS.length ? Math.round(100 * flagged / PATTERNS.length) : 0,
    tier: tier.toLowerCase(),
    tierLabel: tier,
    patternsFlagged: flagged,
    patternsTotal: PATTERNS.length,
    patterns: out
  };
}
