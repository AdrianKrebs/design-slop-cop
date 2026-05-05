// Stat banner row. "10K+ users · 99.9% uptime · 4.9★" pattern: 3–6 sibling
// cards each containing a prominent number. Common AI trust-padding.

export default {
  id: 'stat_banner_row',
  label: 'Stat banner row (10K+ users · 99.9% uptime …)',
  shortLabel: 'Stat banner',
  description: '"10K+ users · 99.9% uptime · 4.9★". Padding as social proof.',
  category: 'layout',
  thresholds: {
    minKids: 3, maxKids: 6,
    minRowWidth: 300,
    minBigFontSize: 22,
    maxBigTextLen: 10
  },

  extract: function (ctx) {
    const { visible, isVisible, thresholds: T } = ctx;
    let count = 0;
    const samples = [];
    const numericRegex = /\d[\d,.]*\s*(?:k|m|b|%|x|\+)?/i;
    // Pure ordinals like "01", "02", "03" or "1", "2", "3" are step markers,
    // not stats. We only consider single small integers as ordinals; a stat
    // like "100K+" or "9.9M" easily clears that.
    const pureOrdinalRegex = /^0?[1-9]$|^1[0-2]$/;
    // Currency-prefixed values are pricing tiers, not stats.
    const priceRegex = /^[$€£¥₹]|US\$|EUR|GBP/i;
    for (const el of visible) {
      const kids = Array.from(el.children).filter(isVisible);
      if (kids.length < T.minKids || kids.length > T.maxKids) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < T.minRowWidth) continue;
      const stats = kids.map(k => {
        let maxFs = 0, bigText = '';
        for (const d of k.querySelectorAll('*')) {
          if (d.children.length > 0) continue;
          const t = (d.textContent || '').trim();
          if (!t || t.length > 12) continue;
          const fs = parseFloat(getComputedStyle(d).fontSize) || 0;
          if (fs > maxFs) { maxFs = fs; bigText = t; }
        }
        return { maxFs, bigText };
      });
      // Reject if the "stats" are actually a sequential ordinal run (01,02,03…).
      const allOrdinals = stats.every(s => pureOrdinalRegex.test(s.bigText));
      if (allOrdinals) continue;
      // Reject if the values look like prices ($0, $9, US$29, £49…).
      const anyPrice = stats.some(s => priceRegex.test(s.bigText));
      if (anyPrice) continue;
      const allStats = stats.every(s =>
        s.maxFs >= T.minBigFontSize &&
        s.bigText.length <= T.maxBigTextLen &&
        numericRegex.test(s.bigText) &&
        !pureOrdinalRegex.test(s.bigText)
      );
      if (!allStats) continue;
      count++;
      if (samples.length < 2) {
        samples.push({ cards: kids.length, values: stats.map(s => s.bigText) });
      }
    }
    return { count, samples };
  },

  score: function (signal) {
    if (!signal || signal.count < 1) return { triggered: false };
    return {
      triggered: true,
      evidence: { count: signal.count, samples: signal.samples }
    };
  }
};
