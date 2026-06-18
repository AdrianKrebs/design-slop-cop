// "Perma dark mode look". Dark background with medium-grey body text.
// Detected via WCAG contrast: % of body text below AAA (7:1) on a dark surface.
//
// Two paths to trigger:
//   1. Body bg is dark AND ≥ pctBelowAAATrigger% of body text is < 7:1 contrast.
//   2. Body bg is light, BUT the dominant above-fold surface is dark and a
//      majority of body text on it is low-contrast. Catches "light-mode site
//      with a dark hero / dark sections" pages.

export default {
  id: 'perma_dark_mode',
  label: 'Perma dark mode look (dark bg + muted grey text)',
  shortLabel: 'Perma dark',
  description: 'Dark bg, medium-grey body text, all-caps section labels.',
  category: 'colors',
  thresholds: {
    bodyMinFs: 12,
    bodyMaxFs: 20,
    bodyMaxWeight: 600,
    pctBelowAAATrigger: 12,
    darkSurfaceLuminance: 0.2,             // anything below counts as a "dark surface"
    fallbackDarkSurfaceRatio: 0.35,        // ≥35% of above-fold viewport is on dark surfaces
    fallbackPctBelowAAATrigger: 20,
    minBodySamples: 5,                     // smaller pages still count if they have a few text leaves
    darkTemplateMinSamples: 20,            // for the "dark template + white text" path
    darkTemplateSurfaceRatio: 0.7          // ≥70% of body text on dark surfaces
  },

  extract: function (ctx) {
    const { visible, parseColor, effectiveBg, relativeLuminance, contrastRatio, isDarkMode, thresholds: T } = ctx;

    // Walk visible body-text leaves; record contrast ratio + whether the
    // backing surface is dark.
    let bodyTextSamples = 0;
    let lowContrastBody = 0;
    let lowContrastOnDark = 0;
    let bodyTextOnDark = 0;
    const samples = [];

    for (const el of visible) {
      // Skip code blocks — intentionally styled dark with monospace greys
      // and not body text. Counting them inflates the low-contrast ratio on
      // any landing page that shows code samples.
      if (el.closest('pre, code, [class*="codeblock" i], [class*="hljs" i], [class*="prism" i], [class*="shiki" i]')) continue;
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize) || 0;
      const weight = parseInt(cs.fontWeight) || 400;
      if (fontSize < T.bodyMinFs || fontSize > T.bodyMaxFs) continue;
      if (weight >= T.bodyMaxWeight) continue;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 3);
      if (!hasText) continue;
      const color = parseColor(cs.color);
      if (!color) continue;
      const bg = effectiveBg(el);
      const bgLum = relativeLuminance(bg);
      const cr = contrastRatio(color, bg);
      bodyTextSamples++;
      if (cr < 7) lowContrastBody++;
      if (bgLum < T.darkSurfaceLuminance) {
        bodyTextOnDark++;
        if (cr < 7) lowContrastOnDark++;
      }
      if (samples.length < 3 && cr < 4.5) {
        samples.push({
          ratio: +cr.toFixed(2),
          color: cs.color,
          bg: 'rgb(' + (bg.r | 0) + ',' + (bg.g | 0) + ',' + (bg.b | 0) + ')',
          sample: (el.textContent || '').trim().slice(0, 60)
        });
      }
    }

    const pctBelowAAA = bodyTextSamples ? +(100 * lowContrastBody / bodyTextSamples).toFixed(1) : 0;
    const darkSurfaceTextRatio = bodyTextSamples ? +(bodyTextOnDark / bodyTextSamples).toFixed(2) : 0;
    const pctBelowAAAOnDark = bodyTextOnDark ? +(100 * lowContrastOnDark / bodyTextOnDark).toFixed(1) : 0;

    return {
      isDarkMode,
      bodyTextSamples,
      lowContrastCount: lowContrastBody,
      pctBelowAAA,
      bodyTextOnDark,
      darkSurfaceTextRatio,
      pctBelowAAAOnDark,
      samples
    };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    if (signal.bodyTextSamples < T.minBodySamples) return { triggered: false };
    // Path A: body bg is dark + enough low-contrast (muted-grey) text on it
    if (signal.isDarkMode && signal.pctBelowAAA >= T.pctBelowAAATrigger) {
      return {
        triggered: true,
        evidence: { mode: 'dark-body-muted', pctBelowAAA: signal.pctBelowAAA, sampleCount: signal.bodyTextSamples, examples: signal.samples }
      };
    }
    // Path B: body bg is light but a meaningful chunk of text sits on dark
    //         surfaces with low contrast (dark hero / dark sections aesthetic)
    if (!signal.isDarkMode
        && signal.darkSurfaceTextRatio >= T.fallbackDarkSurfaceRatio
        && signal.pctBelowAAAOnDark >= T.fallbackPctBelowAAATrigger) {
      return {
        triggered: true,
        evidence: { mode: 'dark-section', darkSurfaceTextRatio: signal.darkSurfaceTextRatio, pctBelowAAAOnDark: signal.pctBelowAAAOnDark, sampleCount: signal.bodyTextSamples, examples: signal.samples }
      };
    }
    // Path C: dark-template look. Body bg is dark and most text sits on dark
    //         surfaces — even if contrast is high (white-on-black). Many AI
    //         starter sites have this aesthetic without the muted-grey text.
    if (signal.isDarkMode
        && signal.bodyTextSamples >= T.darkTemplateMinSamples
        && signal.darkSurfaceTextRatio >= T.darkTemplateSurfaceRatio) {
      return {
        triggered: true,
        evidence: { mode: 'dark-template', darkSurfaceTextRatio: signal.darkSurfaceTextRatio, sampleCount: signal.bodyTextSamples }
      };
    }
    return { triggered: false };
  }
};
