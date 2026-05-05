// Detector orchestrator. Assembles the page-side script from the pattern
// registry, runs once per page, returns { meta, fonts, signals }.
//
// The page-side script is a self-contained IIFE built by serializing
// shared helpers (lib/*) and each pattern's extract() function. Each
// extract receives a `ctx` containing helpers + computed shared signals
// (visible elements, body bg, fonts) plus the pattern's own thresholds.

import { createColorHelpers } from './lib/color.js';
import { createVisibilityHelpers } from './lib/visibility.js';
import { countEmoji } from './lib/emoji.js';
import { isSlopFont, SLOP_FONT_PREFIXES } from './lib/slop-fonts.js';
import { PATTERNS } from './patterns/index.js';

export function buildDetectorSource() {
  const patternCalls = PATTERNS.map(p => {
    const thresholds = JSON.stringify(p.thresholds || {});
    return `signals[${JSON.stringify(p.id)}] = (${p.extract.toString()})({
      ...ctxBase,
      thresholds: ${thresholds}
    });`;
  }).join('\n    ');

  return `(() => {
    // ── shared helpers ────────────────────────────────────────────────
    ${createColorHelpers.toString()}
    ${createVisibilityHelpers.toString()}
    ${countEmoji.toString()}
    ${isSlopFont.toString()}
    const SLOP_FONT_PREFIXES = ${JSON.stringify(SLOP_FONT_PREFIXES)};

    const colors = createColorHelpers();
    const visHelpers = createVisibilityHelpers(colors.parseColor);

    // ── shared signals (computed once) ────────────────────────────────
    const all = Array.from(document.querySelectorAll('*'));
    const visible = all.filter(visHelpers.isVisible);
    const bodyBg = visHelpers.effectiveBg(document.body);
    const bodyLuminance = colors.relativeLuminance(bodyBg);
    const isDarkMode = bodyLuminance < 0.2;
    const h1 = document.querySelector('h1');

    // Font usage by character count, separately for headings.
    const fontCharCounts = new Map();
    const headingFontChars = new Map();
    let totalTextChars = 0;
    for (const el of visible) {
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      const fam = (cs.fontFamily || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      if (!fam) continue;
      const txt = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      const chars = txt.length;
      fontCharCounts.set(fam, (fontCharCounts.get(fam) || 0) + chars);
      totalTextChars += chars;
      if (/^H[1-3]$/.test(el.tagName)) {
        headingFontChars.set(fam, (headingFontChars.get(fam) || 0) + chars);
      }
    }
    const sortedFonts = [...fontCharCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topFonts = sortedFonts.slice(0, 6).map(([name, chars]) => ({
      name, chars, pct: totalTextChars ? +(100 * chars / totalTextChars).toFixed(1) : 0
    }));
    const slopFontsDetected = sortedFonts
      .filter(([name]) => isSlopFont(name))
      .map(([name, chars]) => ({ name, chars, pct: totalTextChars ? +(100 * chars / totalTextChars).toFixed(1) : 0 }));
    const headingFont = ([...headingFontChars.entries()].sort((a, b) => b[1] - a[1])[0] || [null])[0];

    // ── ctx passed to each pattern extract ────────────────────────────
    const ctxBase = {
      // helpers
      parseColor: colors.parseColor,
      rgbToHsl: colors.rgbToHsl,
      relativeLuminance: colors.relativeLuminance,
      contrastRatio: colors.contrastRatio,
      isPurple: colors.isPurple,
      isVisible: visHelpers.isVisible,
      effectiveBg: visHelpers.effectiveBg,
      countEmoji,
      // computed signals
      visible,
      bodyBg,
      bodyLuminance,
      isDarkMode,
      h1,
      fonts: { topFonts, slopFontsDetected, headingFont, totalTextChars }
    };

    // ── run patterns ──────────────────────────────────────────────────
    const signals = {};
    ${patternCalls}

    return {
      meta: {
        url: location.href,
        title: document.title,
        bodyBg: 'rgb(' + (bodyBg.r|0) + ',' + (bodyBg.g|0) + ',' + (bodyBg.b|0) + ')',
        bodyLuminance: +bodyLuminance.toFixed(3),
        isDarkMode,
        visibleElements: visible.length,
        textChars: totalTextChars
      },
      fonts: {
        topFonts,
        slopFontsDetected,
        headingFont,
        hasSlopFonts: slopFontsDetected.length > 0
      },
      signals
    };
  })();`;
}
