// All-caps headings. Either via text-transform: uppercase or already uppercase.

export default {
  id: 'all_caps_headings',
  label: 'All-caps headings',
  shortLabel: 'All caps',
  description: 'Section labels and nav links set in caps.',
  category: 'layout',
  thresholds: {
    minRatio: 0.25,
    minHeadings: 2,           // total H1–H4 on page must be ≥2 to bother computing ratio
    minAllCapsHeadings: 3,    // ≥3 actual all-caps headings — slop has many section labels
    heavyAllCapsCount: 5,     // ≥5 overrides the ratio gate (covers long pages stuffed with section labels)
    upperLetterRatio: 0.85
  },

  extract: function (ctx) {
    const { visible, thresholds: T } = ctx;
    let allCapsHeadings = 0;
    let totalHeadings = 0;
    for (const el of visible) {
      if (!/^H[1-4]$/.test(el.tagName)) continue;
      const txt = (el.textContent || '').trim();
      if (txt.length < 3) continue;
      totalHeadings++;
      const cs = getComputedStyle(el);
      if (cs.textTransform === 'uppercase') { allCapsHeadings++; continue; }
      const letters = txt.replace(/[^A-Za-z]/g, '');
      if (letters.length >= 3) {
        const upper = letters.replace(/[^A-Z]/g, '').length;
        if (upper / letters.length > T.upperLetterRatio) allCapsHeadings++;
      }
    }
    const ratio = totalHeadings ? +(allCapsHeadings / totalHeadings).toFixed(2) : 0;
    return { allCapsHeadings, totalHeadings, ratio };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    if (signal.totalHeadings < T.minHeadings) return { triggered: false };
    // Two paths to trigger:
    //   a) ≥ minAllCapsHeadings (e.g. 3) AND ratio ≥ minRatio (25%) — slop
    //      pages with several section labels and few other H tags
    //   b) ≥ 4 all-caps headings regardless of ratio — long pages stuffed
    //      with all-caps section labels even if absolute H count is huge
    const meetsRatioPath = signal.allCapsHeadings >= T.minAllCapsHeadings && signal.ratio >= T.minRatio;
    const meetsCountPath = signal.allCapsHeadings >= T.heavyAllCapsCount;
    if (!meetsRatioPath && !meetsCountPath) return { triggered: false };
    return {
      triggered: true,
      evidence: { ratio: signal.ratio, allCapsHeadings: signal.allCapsHeadings }
    };
  }
};
