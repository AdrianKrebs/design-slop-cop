// Browser-side color helpers.
// Wrapped in a factory so the canvas + cache are captured by closure when
// the function is serialized via toString() and injected into the page.

export function createColorHelpers() {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx2d = canvas.getContext('2d');
  const cache = new Map();

  // Use a canvas 2D context so the browser normalizes any CSS color
  // (rgb, rgba, hsl, hwb, lab, lch, oklab, oklch, named, hex) into rgba.
  function parseColor(str) {
    if (!str) return null;
    if (cache.has(str)) return cache.get(str);
    if (str === 'transparent' || str === 'rgba(0, 0, 0, 0)') {
      const v = { r: 0, g: 0, b: 0, a: 0 };
      cache.set(str, v);
      return v;
    }
    ctx2d.clearRect(0, 0, 1, 1);
    try { ctx2d.fillStyle = str; } catch { cache.set(str, null); return null; }
    ctx2d.fillRect(0, 0, 1, 1);
    let out = null;
    try {
      const d = ctx2d.getImageData(0, 0, 1, 1).data;
      out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch {}
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
