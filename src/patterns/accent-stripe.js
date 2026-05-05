// Accent stripe on cards (top or left edge). Catches several implementations:
//   a) border-left: Npx solid <accent> with other sides ~0
//   b) border-top:  Npx solid <accent>
//   c) ::before / ::after pseudo positioned left, full-height, narrow width
//   d) ::before / ::after pseudo positioned top,  full-width,  narrow height

export default {
  id: 'accent_stripe',
  label: 'Accent stripe on cards (top or left edge)',
  shortLabel: 'Accent stripe',
  description: 'Colored accent stripe on cards, on the top or left edge.',
  category: 'layout',
  thresholds: {
    minBorderPx: 2,
    minDimW: 40,
    minDimH: 20,
    stripeMinPx: 2,
    stripeMaxPx: 10,
    fullEdgeRatio: 0.6,
    minSaturation: 0.2,        // accent must actually be a *color*, not grey/black
    excludedTags: 'BLOCKQUOTE,FOOTER,BUTTON,HR,TABLE,TD,TH,TR,THEAD,TBODY'
  },

  extract: function (ctx) {
    const { visible, parseColor, rgbToHsl, thresholds: T } = ctx;
    const skipTags = new Set(T.excludedTags.split(','));
    // Treat near-neutral border colors (grey/black/white tints) as
    // non-accents — Markdown blockquotes, footer rules, and table dividers
    // are usually a desaturated grey.
    function isAccentColor(c) {
      if (!c || c.a < 0.3) return false;
      return rgbToHsl(c).s >= T.minSaturation;
    }
    // Real "accent stripe on a card" has a heading inside (it's a feature
    // card with title+blurb). Markdown callouts, code blocks, stat cells,
    // and quote divs have a colored border but no heading — those are not
    // the slop pattern we want to flag.
    function hasHeadingChild(el) {
      if (el.querySelector('h1, h2, h3, h4, h5, h6')) return true;
      if (el.querySelector('[class*="title" i], [class*="heading" i]')) return true;
      // Prominent text leaf: ≥16px, weight ≥500, short
      const leaves = el.querySelectorAll('div, span, p, strong, b');
      let checked = 0;
      for (const l of leaves) {
        if (++checked > 20) break;
        if (l.children.length > 0) continue;
        const t = (l.textContent || '').trim();
        if (t.length < 2 || t.length > 60) continue;
        const ls = getComputedStyle(l);
        if ((parseFloat(ls.fontSize) || 0) >= 16 && (parseInt(ls.fontWeight) || 400) >= 500) return true;
      }
      return false;
    }
    let count = 0;
    const samples = [];
    for (const el of visible) {
      if (skipTags.has(el.tagName)) continue;
      // Skip accent stripes inside footer/blockquote ancestors too.
      if (el.closest('blockquote, footer, [role=contentinfo]')) continue;
      const cs = getComputedStyle(el);
      const lw = parseFloat(cs.borderLeftWidth) || 0;
      const tw = parseFloat(cs.borderTopWidth) || 0;
      const rw = parseFloat(cs.borderRightWidth) || 0;
      const bw = parseFloat(cs.borderBottomWidth) || 0;
      let matched = false;
      let evidence = null;
      const r = el.getBoundingClientRect();
      const elW = r.width, elH = r.height;
      if (elW < T.minDimW || elH < T.minDimH) {
        // skip tiny elements
      } else if (lw >= T.minBorderPx && lw > tw + 1 && lw > rw + 1 && lw > bw + 1) {
        const bc = parseColor(cs.borderLeftColor);
        if (isAccentColor(bc)) {
          matched = true;
          evidence = { kind: 'border-left', width: lw, color: cs.borderLeftColor };
        }
      } else if (tw >= T.minBorderPx && tw > lw + 1 && tw > rw + 1 && tw > bw + 1) {
        const bc = parseColor(cs.borderTopColor);
        if (isAccentColor(bc)) {
          matched = true;
          evidence = { kind: 'border-top', width: tw, color: cs.borderTopColor };
        }
      } else {
        for (const pseudo of ['::before', '::after']) {
          if (matched) break;
          const ps = getComputedStyle(el, pseudo);
          const content = ps.content;
          if (!content || content === 'none' || content === 'normal') continue;
          const pos = ps.position;
          if (pos !== 'absolute' && pos !== 'fixed') continue;
          const leftVal = parseFloat(ps.left);
          const topVal = parseFloat(ps.top);
          const widthVal = parseFloat(ps.width);
          const heightVal = ps.height;
          const psBg = parseColor(ps.backgroundColor);
          const bgOK = isAccentColor(psBg);
          const widthIsPct = /%/.test(ps.width);
          const heightIsPct = /%/.test(heightVal);

          const leftStripe = bgOK
            && !isNaN(widthVal) && widthVal >= T.stripeMinPx && widthVal <= T.stripeMaxPx
            && Math.abs(leftVal) <= 4
            && (isNaN(topVal) || Math.abs(topVal) <= 4)
            && ((parseFloat(heightVal) >= elH * T.fullEdgeRatio) || (heightIsPct && parseFloat(heightVal) >= 60));

          const hVal = parseFloat(heightVal);
          const topStripe = bgOK
            && !isNaN(hVal) && hVal >= T.stripeMinPx && hVal <= T.stripeMaxPx
            && Math.abs(topVal) <= 4
            && (isNaN(leftVal) || Math.abs(leftVal) <= 4)
            && ((widthVal >= elW * T.fullEdgeRatio) || (widthIsPct && widthVal >= 60));

          if (leftStripe) {
            matched = true;
            evidence = { kind: 'pseudo-left-stripe', pseudo, width: widthVal, height: heightVal, color: ps.backgroundColor };
          } else if (topStripe) {
            matched = true;
            evidence = { kind: 'pseudo-top-stripe', pseudo, width: ps.width, height: hVal, color: ps.backgroundColor };
          }
        }
      }
      // Real accent-stripe cards have a heading inside. This filters out
      // markdown blockquotes/callouts, code blocks, stat dividers, etc.
      if (matched && !hasHeadingChild(el)) matched = false;
      if (matched) {
        count++;
        if (samples.length < 3) {
          samples.push({
            tag: el.tagName.toLowerCase(),
            sample: (el.textContent || '').trim().slice(0, 60),
            ...evidence
          });
        }
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
