// Centered hero set in Inter / generic sans.
// Centered Instrument Serif on its own is fine — flagged separately as
// slop_fonts. Centering only fires when paired with a generic system sans.

const GENERIC_FONTS = [
  'Inter', 'Inter Variable', '-apple-system', 'system-ui', 'ui-sans-serif',
  'Helvetica', 'Helvetica Neue', 'Arial', 'DM Sans', 'Plus Jakarta Sans',
  'Manrope', 'SF Pro Display'
];

export default {
  id: 'center_aligned_hero',
  label: 'Centered hero set in Inter / generic sans',
  shortLabel: 'Centered + Inter',
  description: 'Centered anything is fine. Centered Inter is the tell.',
  category: 'layout',
  thresholds: {
    minAboveFoldRatio: 0.6,
    minFontSize: 14
  },

  extract: function (ctx) {
    const { visible, h1, thresholds: T } = ctx;
    let heroH1Centered = false;
    let heroSample = null;
    if (h1) {
      const cs = getComputedStyle(h1);
      if (cs.textAlign === 'center') {
        heroH1Centered = true;
        heroSample = (h1.textContent || '').trim().slice(0, 80);
      }
    }
    const viewportH = window.innerHeight || 800;
    let aboveFoldCenter = 0, aboveFoldTotal = 0;
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      if (r.top > viewportH) continue;
      if (!/^(P|H1|H2|H3|SPAN|DIV)$/.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      if (fontSize < T.minFontSize) continue;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 5);
      if (!hasText) continue;
      aboveFoldTotal++;
      if (cs.textAlign === 'center') aboveFoldCenter++;
    }
    const aboveFoldCenterRatio = aboveFoldTotal > 0
      ? +(aboveFoldCenter / aboveFoldTotal).toFixed(2)
      : 0;
    return {
      heroH1Centered,
      heroSample,
      aboveFoldCenterRatio,
      aboveFoldTextBlocks: aboveFoldTotal
    };
  },

  score: function (signal, T, ctxFonts) {
    // ctxFonts is passed so we can check the heading font at score time.
    const heading = ctxFonts?.headingFont || '';
    const isGeneric = GENERIC_FONTS.some(f => heading === f || heading.startsWith(f + ' '));
    if (!isGeneric) return { triggered: false };
    if (!signal.heroH1Centered && signal.aboveFoldCenterRatio < T.minAboveFoldRatio) {
      return { triggered: false };
    }
    return {
      triggered: true,
      evidence: {
        headingFont: heading,
        heroH1Centered: signal.heroH1Centered,
        aboveFoldCenterRatio: signal.aboveFoldCenterRatio,
        sample: signal.heroSample
      }
    };
  }
};
