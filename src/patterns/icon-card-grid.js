// Templated feature card grid. 3–6 same-shape cards under the hero, each with
// a recognisable "icon" (svg / img / emoji glyph / styled badge) and a heading.

export default {
  id: 'icon_card_grid',
  label: 'Templated feature grid (icon + title + blurb cards)',
  shortLabel: 'Icon cards',
  description: 'Three or six identical icon-topped cards under the hero.',
  category: 'layout',
  thresholds: {
    // 3x3 grids show up as a single container with 9 children, so the upper
    // bound has to allow that case.
    minKids: 3, maxKids: 12,
    minCardW: 120, maxCardW: 560,
    minCardH: 60,
    widthTolerance: 0.12,
    // Skip cards inside obvious nav / footer regions.
    excludeAncestorSelector: 'header, footer, nav, [role=navigation], [role=contentinfo], [class*="footer" i], [class*="nav" i]'
  },

  extract: function (ctx) {
    const { visible, isVisible, countEmoji, thresholds: T } = ctx;
    let count = 0;
    const samples = [];
    const counted = new Set();

    // The slop signature is one of:
    //   a) Emoji glyph leading the card (low-effort AI dashboards)
    //   b) An icon (SVG/IMG) sitting inside a *styled badge container* —
    //      shadcn-style coloured square/circle wrapping the icon. A naked
    //      SVG with no styled wrapper does NOT count — that's a tasteful
    //      custom-icon-library choice, not the templated tell.
    //   c) A numbered or shaped badge element on its own (no inner icon
    //      needed — covers the "1/2/3" coloured-circle case).
    //
    // We deliberately do NOT accept bare SVG/IMG as proof. Almost every
    // site has SVGs; the slop tell is the templated *icon-in-badge* combo.
    function hasIconLike(card) {
      // a) Emoji
      const text = (card.textContent || '').slice(0, 80);
      if (countEmoji(text) > 0) return true;

      // b) Icon inside a styled badge container.
      const iconCands = card.querySelectorAll('svg, img');
      for (const ic of iconCands) {
        const r = ic.getBoundingClientRect();
        if (r.width < 8 || r.width > 48 || r.height < 8 || r.height > 48) continue;
        // Walk up at most 2 ancestors looking for a styled wrapper.
        let cur = ic.parentElement;
        for (let depth = 0; cur && cur !== card && depth < 2; depth++, cur = cur.parentElement) {
          const pr = cur.getBoundingClientRect();
          if (pr.width < 20 || pr.width > 72 || pr.height < 20 || pr.height > 72) continue;
          const pcs = getComputedStyle(cur);
          const hasFill = pcs.backgroundColor && pcs.backgroundColor !== 'rgba(0, 0, 0, 0)' && pcs.backgroundColor !== 'transparent';
          const hasBgImg = (pcs.backgroundImage || '') !== 'none';
          const hasBorder = parseFloat(pcs.borderTopWidth) >= 1;
          // shadcn-style icon wrappers use rounded-* + a coloured fill / border.
          if (hasFill || hasBgImg || hasBorder) return true;
        }
      }

      // c) A standalone badge element: 20–56 px, with bg/fill or border, and
      //    short text (a digit, an emoji, or empty — typically a coloured chip).
      const candidates = card.querySelectorAll('div, span');
      for (let i = 0; i < Math.min(candidates.length, 6); i++) {
        const c = candidates[i];
        const r = c.getBoundingClientRect();
        if (r.width < 20 || r.width > 56 || r.height < 20 || r.height > 56) continue;
        const inner = (c.textContent || '').trim();
        if (inner.length > 4) continue;       // badges are short labels
        const cs = getComputedStyle(c);
        const hasFill = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
        const hasBgImg = (cs.backgroundImage || '') !== 'none';
        const hasBorder = parseFloat(cs.borderTopWidth) >= 1;
        if (hasFill || hasBgImg || hasBorder) return true;
      }
      return false;
    }

    function hasHeadingLike(card) {
      // 1. Real heading tag
      if (card.querySelector('h1, h2, h3, h4, h5, h6')) return true;
      // 2. Class hint
      if (card.querySelector('[class*="title" i], [class*="heading" i], [class*="label" i]')) return true;
      // 3. A short prominent text leaf (fontSize ≥ 16, weight ≥ 500, ≤ 60 chars)
      const leaves = card.querySelectorAll('div, span, p, strong, b');
      for (const l of leaves) {
        if (l.children.length > 0) continue;
        const t = (l.textContent || '').trim();
        if (t.length < 2 || t.length > 60) continue;
        const cs = getComputedStyle(l);
        const fs = parseFloat(cs.fontSize) || 0;
        const fw = parseInt(cs.fontWeight) || 400;
        if (fs >= 16 && fw >= 500) return true;
      }
      return false;
    }

    for (const el of visible) {
      // Skip nav/footer-rooted grids.
      if (T.excludeAncestorSelector && el.closest(T.excludeAncestorSelector)) continue;

      const kids = Array.from(el.children).filter(isVisible);
      if (kids.length < T.minKids || kids.length > T.maxKids) continue;

      const rects = kids.map(k => k.getBoundingClientRect());
      const firstW = rects[0].width;
      if (firstW < T.minCardW || firstW > T.maxCardW) continue;

      const sameWidth = rects.every(r => Math.abs(r.width - firstW) <= Math.max(8, firstW * T.widthTolerance));
      if (!sameWidth) continue;

      const tallEnough = rects.every(r => r.height > T.minCardH);
      if (!tallEnough) continue;

      // Each card must have a small stock-style icon AND a heading. We
      // intentionally do NOT accept "card-shape only" (no icon) — too many
      // legitimate feature sections look like that. Slop is the icon+title
      // template specifically.
      const uniform = kids.every(k => hasHeadingLike(k) && hasIconLike(k));
      if (!uniform) continue;

      if (kids.every(k => counted.has(k))) continue;
      kids.forEach(k => counted.add(k));

      count++;
      if (samples.length < 2) {
        samples.push({
          cards: kids.length,
          cardWidth: Math.round(firstW),
          sample: (kids[0].textContent || '').trim().slice(0, 80)
        });
      }
    }
    return { count, samples };
  },

  score: function (signal) {
    if (!signal || signal.count < 1) return { triggered: false };
    return {
      triggered: true,
      evidence: { gridCount: signal.count, samples: signal.samples }
    };
  }
};
