// Templated display fonts — Space Grotesk, Instrument Serif, Geist, Syne
// and friends. These fonts are fine in isolation; the tell is that they
// show up as defaults across shadcn / v0 / Vercel-template starter pages
// without intentional pairing. Reads the font analysis on ctx.fonts.

const TEMPLATED_HEADING_FONTS = [
  'Space Grotesk', 'Instrument Serif', 'Fraunces',
  'Bricolage Grotesque', 'Sora', 'Young Serif',
  'Bodoni', 'Geist', 'Syne'
];

export default {
  // Pattern id unchanged for backwards compat with dataset/labels.jsonl.
  id: 'slop_fonts',
  label: 'Templated display fonts',
  shortLabel: 'Templated font',
  description: 'Default-stack display fonts (Space Grotesk, Instrument Serif, Geist, Syne, Fraunces). Fine in isolation — a tell when used as the page default without intentional pairing.',
  category: 'fonts',
  thresholds: {
    minTotalPct: 3 // require ≥3% coverage if not used as heading
  },

  extract: function (ctx) {
    return {
      detected: ctx.fonts.slopFontsDetected,
      headingFont: ctx.fonts.headingFont
    };
  },

  score: function (signal, T) {
    if (!signal || !signal.detected || !signal.detected.length) return { triggered: false };
    const totalPct = signal.detected.reduce((a, b) => a + b.pct, 0);
    const heading = signal.headingFont;
    const headingSlop = heading && TEMPLATED_HEADING_FONTS.some(f => heading === f || heading.startsWith(f + ' '));
    if (totalPct < T.minTotalPct && !headingSlop) return { triggered: false };
    return {
      triggered: true,
      evidence: {
        fonts: signal.detected.map(x => `${x.name} (${x.pct}%)`),
        heading
      }
    };
  }
};
