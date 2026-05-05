// Hero eyebrow pill / label. Small badge or label above the H1.
// Examples: "INTRODUCING", "PRECISION HEALTH INTELLIGENCE", "Mint for AI usage",
// "New · AI-powered", "✨ AI-powered", small uppercase tracker labels.
// We accept three shapes: pill-shaped (round radius), boxed (filled or
// bordered with any radius), and small-caps eyebrow text (uppercase with
// letter-spacing — no bg required).

export default {
  id: 'hero_eyebrow_pill',
  label: 'Hero eyebrow pill (badge above the H1)',
  shortLabel: 'Eyebrow pill',
  description: 'Pill badge floating above the H1. "INTRODUCING", "PRECISION HEALTH INTELLIGENCE", "Mint for AI usage".',
  category: 'layout',
  thresholds: {
    abovePillPx: 220,
    pillMinW: 40, pillMaxW: 600,
    pillMinH: 16, pillMaxH: 56,
    minTextLen: 3, maxTextLen: 80,
    // Faint "ghost pills" with tinted bg / hairline border are common in
    // slop hero sections. The CSS 0.08 alpha round-trips through canvas as
    // ≈ 0.0784, so check at 0.05 to be safe.
    minBgAlpha: 0.05,
    minBorderW: 1,
    minBorderAlpha: 0.15
  },

  extract: function (ctx) {
    const { visible, h1, parseColor, thresholds: T } = ctx;
    if (!h1) return { detected: false, samples: [] };
    const h1Rect = h1.getBoundingClientRect();
    const h1CenterX = (h1Rect.left + h1Rect.right) / 2;
    const samples = [];

    for (const el of visible) {
      if (el === h1 || el.contains(h1) || h1.contains(el)) continue;

      // Skip nav / header chrome — eyebrow lives in the hero, not the global nav.
      if (el.closest('nav, [role=navigation]')) continue;
      // Skip clickable nav-style elements that happen to be pill-shaped buttons.
      const tag = el.tagName;
      if (tag === 'A' || tag === 'BUTTON') continue;
      if (el.closest('a, button')) continue;

      const r = el.getBoundingClientRect();
      if (r.bottom > h1Rect.top + 10) continue;       // must sit above H1
      if (r.bottom < h1Rect.top - T.abovePillPx) continue;
      if (r.width < T.pillMinW || r.width > T.pillMaxW) continue;
      if (r.height < T.pillMinH || r.height > T.pillMaxH) continue;

      // Horizontally aligned with the H1. Three accepted cases:
      //   - candidate's center sits within H1's horizontal range (centered hero)
      //   - candidate's left edge aligns with H1's left within 60px (left-aligned hero)
      //   - candidate horizontally overlaps H1 substantially
      const candCenterX = (r.left + r.right) / 2;
      const centerInside = candCenterX >= h1Rect.left && candCenterX <= h1Rect.right;
      const leftAligned = Math.abs(r.left - h1Rect.left) <= 60;
      const overlap = Math.max(0, Math.min(r.right, h1Rect.right) - Math.max(r.left, h1Rect.left));
      const overlapsH1 = overlap >= Math.min(r.width, h1Rect.width) * 0.5;
      if (!centerInside && !leftAligned && !overlapsH1) continue;

      const text = (el.textContent || '').trim();
      if (!text || text.length < T.minTextLen || text.length > T.maxTextLen) continue;
      // Skip if the text content has internal newlines or many words — pills
      // are short single labels.
      if (text.split(/\s+/).length > 6) continue;

      const cs = getComputedStyle(el);
      const br = parseFloat(cs.borderTopLeftRadius) || 0;

      const bg = parseColor(cs.backgroundColor);
      const hasFill = bg && bg.a >= T.minBgAlpha;
      const borderW = parseFloat(cs.borderTopWidth) || 0;
      const borderColor = parseColor(cs.borderTopColor);
      const hasBorder = borderW >= T.minBorderW && borderColor && borderColor.a > T.minBorderAlpha;

      // Three eyebrow shapes — any one qualifies:
      //  a) Pill-shaped (round radius) with bg or border
      //  b) Boxed badge: any radius, has bg-fill or border
      //  c) Small-caps eyebrow text: uppercase + letter-spacing > 0, no bg
      //     required (this is the "AGENTS · LIVE NOW" style)
      const isPillShape = br >= 999 || br >= r.height / 2 - 1;
      const isPill = isPillShape && (hasFill || hasBorder);
      const isBoxed = !isPillShape && br >= 4 && (hasFill || hasBorder);
      const letterSpacing = parseFloat(cs.letterSpacing) || 0;
      const isUppercase = cs.textTransform === 'uppercase' ||
        (text.replace(/[^A-Za-z]/g, '').length >= 3 &&
         text.replace(/[^A-Za-z]/g, '').replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length > 0.85);
      const isSmallCapsEyebrow = isUppercase && letterSpacing >= 0.5;
      if (!isPill && !isBoxed && !isSmallCapsEyebrow) continue;

      samples.push({
        text: text.slice(0, 60),
        kind: isPill ? 'pill' : isBoxed ? 'boxed' : 'smallcaps',
        bg: cs.backgroundColor,
        radius: br,
        width: Math.round(r.width),
        height: Math.round(r.height),
        textTransform: cs.textTransform,
        letterSpacing
      });
      if (samples.length >= 2) break;
    }
    return { detected: samples.length > 0, samples };
  },

  score: function (signal) {
    if (!signal || !signal.detected) return { triggered: false };
    return {
      triggered: true,
      evidence: { samples: signal.samples }
    };
  }
};
