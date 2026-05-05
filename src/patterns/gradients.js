// Gradient-heavy backgrounds + gradient text on hero.
// Two sub-signals:
//   1. Hero H1 with `background-clip: text` over a gradient (one element)
//   2. ≥5 elements with a CSS gradient background

export default {
  id: 'gradients',
  label: 'Gradient-heavy backgrounds / gradient text on hero',
  shortLabel: 'Gradients',
  description: "Can't pick a color, so pick two and fade them.",
  category: 'colors',
  thresholds: {
    minBgGradients: 4
  },

  extract: function (ctx) {
    const { visible, h1 } = ctx;

    // A gradient string is "visible" only if it has at least one non-transparent
    // color stop. Skips no-op fallback gradients like
    //   linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))
    // commonly stacked under SVG icons (e.g. HN's vote arrows).
    function hasVisibleStop(bgImg) {
      const rgbaRe = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?\s*\)/g;
      let m;
      while ((m = rgbaRe.exec(bgImg)) !== null) {
        const alpha = m[1] === undefined ? 1 : parseFloat(m[1]);
        if (alpha > 0.05) return true;
      }
      const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
      while ((m = hexRe.exec(bgImg)) !== null) {
        const h = m[1];
        if (h.length === 3 || h.length === 6) return true;
        if (h.length === 4) { if (parseInt(h.slice(3, 4), 16) > 0) return true; }
        if (h.length === 8) { if (parseInt(h.slice(6, 8), 16) > 12) return true; }
      }
      return /\b(red|blue|green|yellow|orange|purple|violet|indigo|cyan|magenta|pink|black|white|gray|grey|brown|teal|navy|aqua|lime|silver|gold|maroon|olive|fuchsia|coral|crimson|salmon|tomato|currentcolor)\b/i.test(bgImg);
    }

    let bgElements = 0;
    let textElements = 0;
    let conic = 0;
    for (const el of visible) {
      const cs = getComputedStyle(el);
      const bgImg = cs.backgroundImage || '';
      if (/gradient\(/.test(bgImg) && hasVisibleStop(bgImg)) {
        bgElements++;
        if (/conic-gradient/.test(bgImg)) conic++;
      }
      if ((cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')
          && /gradient\(/.test(bgImg) && hasVisibleStop(bgImg)) {
        textElements++;
      }
    }

    // Big centered hero with gradient text — strong signal on its own.
    let bigHeroGradientText = false;
    if (h1) {
      const cs = getComputedStyle(h1);
      const fontSize = parseFloat(cs.fontSize);
      const heroBg = cs.backgroundImage || '';
      if (fontSize >= 40 && cs.textAlign === 'center'
          && (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')
          && /gradient\(/.test(heroBg) && hasVisibleStop(heroBg)) {
        bigHeroGradientText = true;
      }
    }

    return {
      bgElements,
      textElements,
      conic,
      bigHeroGradientText,
      ratio: visible.length ? +(bgElements / visible.length).toFixed(3) : 0
    };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    // Trigger if hero has gradient text OR there are 5+ gradient backgrounds.
    const triggered = signal.bigHeroGradientText
      || signal.textElements > 0
      || signal.bgElements >= T.minBgGradients;
    if (!triggered) return { triggered: false };
    return {
      triggered: true,
      evidence: {
        gradientBackgrounds: signal.bgElements,
        gradientText: signal.textElements,
        conicGradients: signal.conic,
        heroHasGradientText: signal.bigHeroGradientText
      }
    };
  }
};
