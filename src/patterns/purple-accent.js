// "VibeCode Purple" accent. Indigo / violet on backgrounds, borders,
// gradient stops. Common shadcn / tailwind default.

export default {
  id: 'purple_accent',
  label: 'VibeCode Purple accent',
  shortLabel: 'Vibe purple',
  description: 'Indigo or violet accent on CTAs and links.',
  category: 'colors',
  thresholds: {
    minFilledAccent: 1
  },

  extract: function (ctx) {
    const { visible, parseColor, isPurple } = ctx;
    let elementCount = 0;
    let filledAccentCount = 0;
    const samples = [];
    for (const el of visible) {
      const cs = getComputedStyle(el);
      const bg = parseColor(cs.backgroundColor);
      const borderColor = parseColor(cs.borderColor);
      const bgImg = cs.backgroundImage || '';
      let isP = false;
      let bgGradientPurple = false;
      if (isPurple(bg)) isP = true;
      if (isPurple(borderColor) && parseFloat(cs.borderWidth) > 0) isP = true;
      if (bgImg.includes('gradient')) {
        // parseColor handles both rgba(...) and #hex via the canvas, so a
        // single regex covering both forms is enough.
        const colorMatches = bgImg.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || [];
        for (const cm of colorMatches) {
          if (isPurple(parseColor(cm))) { bgGradientPurple = true; break; }
        }
        if (bgGradientPurple) isP = true;
      }
      if (!isP) continue;
      elementCount++;
      if (samples.length < 4) {
        samples.push({ tag: el.tagName.toLowerCase(), bg: cs.backgroundColor, color: cs.color });
      }

      // "Filled accent": a CTA-like element actually painted purple. Outline /
      // ghost / link-text-only purples don't qualify — those don't make a site
      // feel "VibeCode purple" the way a solid violet button does.
      const className = (el.className || '') + '';
      const isCta = /^(A|BUTTON)$/.test(el.tagName) || /btn|button|cta/i.test(className);
      if (!isCta) continue;
      if (/outline|ghost/i.test(className)) continue;
      const filledBg = bg && bg.a >= 0.5 && isPurple(bg);
      // Gradient-on-CTA counts as filled only if backgroundColor is also (near-)
      // transparent — i.e. the gradient IS the fill, not a stroke / mask trick.
      // Outline-style gradient buttons set backgroundColor to white/page color.
      const filledGradient = bgGradientPurple && (!bg || bg.a < 0.1);
      if (filledBg || filledGradient) filledAccentCount++;
    }
    return {
      elementCount,
      filledAccentCount,
      samples
    };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    // Only fire when purple shows up as a real filled accent on a CTA. Pure
    // decorative purple (illustrations, stamps, hand-drawn art) and
    // outline-only purple buttons don't qualify.
    if (signal.filledAccentCount < T.minFilledAccent) return { triggered: false };
    return {
      triggered: true,
      evidence: {
        elementsWithPurple: signal.elementCount,
        purpleOnButtonsOrLinks: signal.filledAccentCount,
        samples: signal.samples.slice(0, 2)
      }
    };
  }
};
