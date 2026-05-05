// Glassmorphism — translucent backdrop-blur cards or panels.
// Excludes sticky nav/footer bars; those frosted headers are common in
// non-slop design (Linear, Vercel, GitHub).

export default {
  id: 'glassmorphism',
  label: 'Glassmorphism',
  shortLabel: 'Glass',
  description: 'Backdrop-blur on floating panels.',
  category: 'css',
  thresholds: {
    minBlurPx: 2,
    maxBgAlpha: 0.9,                 // above this is effectively opaque (was 0.95)
    cardWidthMin: 150,
    cardWidthMax: 820,
    cardHeightMin: 40,
    cardHeightMax: 900,              // reject very tall sidebars / dialogs
    fullWidthRatio: 0.85,
    stickyEdgePx: 20
  },

  extract: function (ctx) {
    const { visible, parseColor, thresholds: T } = ctx;
    const VIEWPORT_W = window.innerWidth || 1440;
    let count = 0;
    const samples = [];
    for (const el of visible) {
      const cs = getComputedStyle(el);
      const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
      const m = bf.match(/blur\(([\d.]+)px\)/);
      if (!m) continue;
      const blurPx = parseFloat(m[1]);
      if (blurPx < T.minBlurPx) continue;
      const bg = parseColor(cs.backgroundColor);
      if (!bg || bg.a >= T.maxBgAlpha) continue;
      const r = el.getBoundingClientRect();
      const pos = cs.position;
      const isStickyTop = (pos === 'sticky' || pos === 'fixed') && parseFloat(cs.top || '99') <= T.stickyEdgePx;
      const isStickyBottom = (pos === 'sticky' || pos === 'fixed') && parseFloat(cs.bottom || '99') <= T.stickyEdgePx;
      const isFullWidthish = r.width >= VIEWPORT_W * T.fullWidthRatio;
      // Skip frosted nav / footer bars
      if ((isStickyTop || isStickyBottom) && isFullWidthish) continue;
      // Card or panel shape only
      if (r.width < T.cardWidthMin || r.width > T.cardWidthMax) continue;
      if (r.height < T.cardHeightMin || r.height > T.cardHeightMax) continue;
      count++;
      if (samples.length < 3) {
        samples.push({
          blur: blurPx,
          bg: cs.backgroundColor,
          width: Math.round(r.width),
          height: Math.round(r.height)
        });
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
