// Mixed fonts/colors in the hero heading. The tell is the "fancy emphasized
// word" cliché — a large hero headline that sets one word apart by switching
// typeface, slanting it, or recoloring it (often a gradient), e.g.
// "Stop being a *fraud*." where "fraud." is a serif italic in a purple
// gradient. Fires when the biggest heading near the top of the page mixes any
// of: two font families, a roman + italic, or two text colors (a solid accent
// or a gradient-painted word next to plain text).

export default {
  id: 'hero_font_mix',
  label: 'Two fonts/colors mixed in the hero',
  shortLabel: 'Hero font mix',
  description: 'Hero headline sets one word apart with a second typeface, an italic, or a different colour/gradient, like the italic "fraud." in "Stop being a fraud."',
  category: 'fonts',
  thresholds: {
    minFontSize: 32,   // a real hero headline, not body copy
    maxTextLen: 140    // a headline, not a paragraph/section wrapper
  },

  extract: function (ctx) {
    var T = ctx.thresholds;
    var MAXTOP = window.innerHeight || 900;

    // Per-run paint token: a gradient-clipped word, or a quantized solid colour.
    function paintOf(cs) {
      var clip = cs.webkitBackgroundClip || cs.backgroundClip || '';
      if (clip === 'text' && /gradient/.test(cs.backgroundImage || '')) return { paint: 'grad', disp: 'gradient' };
      var m = (cs.color || '').match(/rgba?\(([^)]+)\)/);
      if (m) {
        var p = m[1].split(',').map(function (x) { return parseFloat(x); });
        var a = p.length > 3 ? p[3] : 1;
        if (a >= 0.1) return {
          paint: 'c' + Math.round(p[0] / 24) + '_' + Math.round(p[1] / 24) + '_' + Math.round(p[2] / 24),
          disp: 'rgb(' + Math.round(p[0]) + ',' + Math.round(p[1]) + ',' + Math.round(p[2]) + ')'
        };
      }
      return { paint: null, disp: null };
    }

    // Candidate hero headings: large font, near top, headline-length text.
    var cands = [];
    for (var i = 0; i < ctx.visible.length; i++) {
      var el = ctx.visible[i];
      var cs = getComputedStyle(el);
      var size = parseFloat(cs.fontSize) || 0;
      if (size < T.minFontSize) continue;
      var r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > MAXTOP || r.width === 0) continue;
      var txt = (el.textContent || '').trim();
      if (txt.length < 2 || txt.length > T.maxTextLen) continue;
      // A real heading: has its own text, or wraps only inline runs.
      var hasDirect = false, onlyInline = true;
      for (var c = 0; c < el.childNodes.length; c++) {
        var n = el.childNodes[c];
        if (n.nodeType === 3 && n.textContent.trim().length >= 2) hasDirect = true;
        if (n.nodeType === 1 && !/^(SPAN|EM|I|B|STRONG|MARK|A|U|SMALL)$/.test(n.tagName)) onlyInline = false;
      }
      if (!hasDirect && !onlyInline) continue;
      cands.push({ el: el, size: size, top: r.top, txt: txt });
    }
    if (!cands.length) return { hero: false };
    // Biggest first; on a tie prefer the LONGER heading (the parent that holds
    // the whole headline) over an inline emphasized fragment of the same size.
    cands.sort(function (a, b) { return b.size - a.size || b.txt.length - a.txt.length || a.top - b.top; });

    // One run per text node in the chosen heading's subtree — so an inline
    // emphasized word (different family / italic / colour / gradient) is seen
    // alongside the rest of the headline.
    var hero = cands[0];
    var runs = [];
    (function visit(el) {
      for (var c = 0; c < el.childNodes.length; c++) {
        var n = el.childNodes[c];
        if (n.nodeType === 3) {
          var t = n.textContent.trim();
          if (t.length >= 2) {
            var cs = getComputedStyle(el);
            var fam = (cs.fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
            if (!fam || /awesome|material icons|icon/i.test(fam)) continue;
            var st = (cs.fontStyle || '');
            var pt = paintOf(cs);
            runs.push({ fam: fam, style: (st.indexOf('italic') === 0 || st.indexOf('oblique') === 0) ? 'italic' : 'normal', paint: pt.paint, disp: pt.disp });
          }
        } else if (n.nodeType === 1) {
          visit(n);
        }
      }
    })(hero.el);

    var fams = [], styles = [], paints = [], colors = [];
    for (var k = 0; k < runs.length; k++) {
      if (fams.indexOf(runs[k].fam) < 0) fams.push(runs[k].fam);
      if (styles.indexOf(runs[k].style) < 0) styles.push(runs[k].style);
      if (runs[k].paint && paints.indexOf(runs[k].paint) < 0) { paints.push(runs[k].paint); colors.push(runs[k].disp); }
    }
    return {
      hero: true,
      heroText: hero.txt.slice(0, 80),
      fontSize: Math.round(hero.size),
      top: Math.round(hero.top),
      families: fams,
      styles: styles,
      colors: colors,
      colorCount: paints.length,
      runCount: runs.length
    };
  },

  score: function (signal, T) {
    if (!signal || !signal.hero) return { triggered: false };
    if (signal.runCount < 2) return { triggered: false };
    var twoFamilies = signal.families.length >= 2;
    var styleMix = signal.styles.indexOf('italic') >= 0 && signal.styles.indexOf('normal') >= 0;
    var colorMix = (signal.colorCount || 0) >= 2;
    if (!twoFamilies && !styleMix && !colorMix) return { triggered: false };
    var kinds = [];
    if (twoFamilies) kinds.push('two typefaces');
    if (styleMix) kinds.push('roman + italic');
    if (colorMix) kinds.push('two colours');
    return {
      triggered: true,
      evidence: {
        hero: signal.heroText,
        fontSize: signal.fontSize,
        families: signal.families,
        colors: signal.colors,
        kind: kinds.join(' + ')
      }
    };
  }
};
