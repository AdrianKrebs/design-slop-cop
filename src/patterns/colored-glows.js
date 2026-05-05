// Colored box-shadows / glows. Saturated, non-grey shadow colors with
// large blur radius are a common AI-design tell.

export default {
  id: 'colored_glows',
  label: 'Large colored glows / colored box-shadows',
  shortLabel: 'Colored glow',
  description: 'Saturated box-shadow glow on buttons and cards.',
  category: 'colors',
  thresholds: {
    minBlurPx: 15,
    minTriggerCount: 2
  },

  extract: function (ctx) {
    const { visible, parseColor, rgbToHsl, thresholds: T } = ctx;
    let count = 0;
    const samples = [];
    for (const el of visible) {
      const cs = getComputedStyle(el);
      const shadow = cs.boxShadow || '';
      if (shadow === 'none' || !shadow) continue;
      const matches = shadow.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || [];
      const blurMatch = shadow.match(/(?:-?\d+px\s+){2}(\d+)px/);
      const blur = blurMatch ? parseInt(blurMatch[1]) : 0;
      if (blur < T.minBlurPx) continue;
      for (const cm of matches) {
        let col = null;
        if (cm.startsWith('#')) {
          const norm = cm.length === 4 ? '#' + cm.slice(1).split('').map(c => c + c).join('') : cm;
          col = {
            r: parseInt(norm.slice(1, 3), 16),
            g: parseInt(norm.slice(3, 5), 16),
            b: parseInt(norm.slice(5, 7), 16),
            a: 1
          };
        } else {
          col = parseColor(cm);
        }
        if (!col || col.a < 0.1) continue;
        const hsl = rgbToHsl(col);
        if (hsl.s > 0.3 && hsl.l > 0.2 && hsl.l < 0.9) {
          count++;
          if (samples.length < 3) samples.push({ shadow: shadow.slice(0, 120) });
          break;
        }
      }
    }
    return { count, samples };
  },

  score: function (signal, T) {
    if (!signal || signal.count < T.minTriggerCount) return { triggered: false };
    return {
      triggered: true,
      evidence: { count: signal.count, samples: signal.samples }
    };
  }
};
