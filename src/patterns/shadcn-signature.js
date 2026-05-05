// shadcn/ui fingerprint — CSS variables (--background, --primary…),
// `data-slot` attributes, lucide icons, Radix data-attrs, Tailwind shadcn classes.

export default {
  id: 'shadcn_signature',
  label: 'shadcn/ui signature',
  shortLabel: 'shadcn',
  description: 'Radix + shadcn CSS vars + lucide, untouched from the install.',
  category: 'css',
  thresholds: {
    detectThreshold: 3
  },

  extract: function (ctx) {
    const rootStyle = getComputedStyle(document.documentElement);
    const SHADCN_VARS = [
      '--background', '--foreground', '--primary', '--primary-foreground',
      '--secondary', '--muted', '--muted-foreground', '--accent', '--border',
      '--input', '--ring', '--radius'
    ];
    const varHits = SHADCN_VARS.filter(v => rootStyle.getPropertyValue(v).trim() !== '').length;
    const hasDataSlot = !!document.querySelector('[data-slot]');
    const hasLucide = !!document.querySelector('svg.lucide, .lucide, svg[class*="lucide-"]');
    const htmlText = document.documentElement.outerHTML.slice(0, 300000);
    const hasShadcnClasses = /bg-background|text-foreground|bg-primary|text-primary-foreground|bg-muted|text-muted-foreground/.test(htmlText);
    const hasRadix = !!document.querySelector('[data-radix-collection-item], [data-radix-popper-content-wrapper], [data-radix-scroll-area-viewport]') || /data-radix/.test(htmlText);
    const score = (varHits >= 4 ? 2 : varHits > 0 ? 1 : 0)
      + (hasDataSlot ? 2 : 0)
      + (hasLucide ? 1 : 0)
      + (hasShadcnClasses ? 2 : 0)
      + (hasRadix ? 1 : 0);
    return {
      varHits, hasDataSlot, hasLucide, hasShadcnClasses, hasRadix, score
    };
  },

  score: function (signal, T) {
    if (!signal || signal.score < T.detectThreshold) return { triggered: false };
    return {
      triggered: true,
      evidence: {
        score: signal.score,
        cssVars: signal.varHits,
        dataSlot: signal.hasDataSlot,
        lucide: signal.hasLucide,
        shadcnClasses: signal.hasShadcnClasses,
        radix: signal.hasRadix
      }
    };
  }
};
