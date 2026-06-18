// Visibility + DOM helpers. Factory closes over parseColor so effectiveBg
// can walk up the DOM looking for a non-transparent ancestor.

export function createVisibilityHelpers(parseColor) {
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false;
    return true;
  }

  function effectiveBg(el) {
    let cur = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
      // Also consider a solid-looking gradient bg-image. Many AI templates
      // ship body { background-image: linear-gradient(#070f1f, #081428) }
      // with backgroundColor still transparent — the visible bg is the
      // gradient's average colour.
      const grad = gradientAverageColor(cs.backgroundImage);
      if (grad) return grad;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  // Return the average of all colour stops in a CSS gradient bg-image, or
  // null if the value isn't a gradient. We only call this for the body /
  // html / topmost-section ancestor walk, so cost is bounded.
  function gradientAverageColor(bgImage) {
    if (!bgImage || !/gradient\(/.test(bgImage)) return null;
    const matches = bgImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || [];
    if (!matches.length) return null;
    let r = 0, g = 0, b = 0, n = 0;
    for (const m of matches) {
      const c = parseColor(m);
      if (!c) continue;
      r += c.r; g += c.g; b += c.b; n++;
    }
    if (!n) return null;
    return { r: r / n, g: g / n, b: b / n, a: 1 };
  }

  return { isVisible, effectiveBg };
}
