// Browser-side color helpers.
// Wrapped in a factory so the canvas + cache are captured by closure when
// the function is serialized via toString() and injected into the page.

export function createColorHelpers() {
  const cache = new Map();

  // A 2D canvas context lets the browser normalize ANY CSS colour (named, hex,
  // hsl, hwb, lab, lch, oklab, oklch, …) into rgba. But some pages break or
  // override canvas (e.g. canvas.getContext isn't a function), so guard every
  // step and fall back to a JS parser for the common rgb()/hex cases rather than
  // letting the whole scan crash.
  let ctx2d = null;
  try {
    const c = document.createElement('canvas');
    if (c && typeof c.getContext === 'function') { c.width = 1; c.height = 1; ctx2d = c.getContext('2d'); }
  } catch {}
  if (!ctx2d && typeof OffscreenCanvas === 'function') {
    try { ctx2d = new OffscreenCanvas(1, 1).getContext('2d'); } catch {}
  }

  // Canvas-free fallback: handles rgb()/rgba() and #hex (what getComputedStyle
  // returns for most colours). Exotic formats return null (treated as no match).
  function parseBasic(str) {
    const m = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
    if (m) {
      let a = 1;
      if (m[4] != null) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    let h = str.trim();
    if (h[0] === '#') {
      h = h.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
      if (h.length === 6 || h.length === 8) {
        return {
          r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
          a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
        };
      }
    }
    return null;
  }

  function parseColor(str) {
    if (!str) return null;
    if (cache.has(str)) return cache.get(str);
    if (str === 'transparent' || str === 'rgba(0, 0, 0, 0)') {
      const v = { r: 0, g: 0, b: 0, a: 0 };
      cache.set(str, v);
      return v;
    }
    let out = null;
    if (ctx2d) {
      ctx2d.clearRect(0, 0, 1, 1);
      let ok = true;
      try { ctx2d.fillStyle = str; } catch { ok = false; }
      if (ok) {
        ctx2d.fillRect(0, 0, 1, 1);
        try {
          const d = ctx2d.getImageData(0, 0, 1, 1).data;
          out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
        } catch {}
      }
    } else {
      out = parseBasic(str);
    }
    cache.set(str, out);
    return out;
  }

  function rgbToHsl(rgb) {
    let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, l };
  }

  function relativeLuminance(rgb) {
    const chan = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
  }

  function contrastRatio(c1, c2) {
    const L1 = relativeLuminance(c1), L2 = relativeLuminance(c2);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  function isPurple(color) {
    if (!color || color.a < 0.3) return false;
    const hsl = rgbToHsl(color);
    // Purple/violet/magenta range with enough saturation to not be grey.
    return hsl.h >= 250 && hsl.h <= 300 && hsl.s > 0.25 && hsl.l > 0.15 && hsl.l < 0.85;
  }

  return { parseColor, rgbToHsl, relativeLuminance, contrastRatio, isPurple };
}
