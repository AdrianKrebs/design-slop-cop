// Template for a new pattern. Copy this file to `src/patterns/<your-id>.js`,
// fill it in, then import + append it in `src/patterns/index.js`.
//
// Debug it as you go:
//   node check.js <a-site-that-should-trigger-it> --pattern=<your-id>
// That prints the raw `signal` your extract() returned and the `evidence`
// your score() returned — the fast feedback loop while authoring.
//
// ─────────────────────────────────────────────────────────────────────────
// HOW IT RUNS (read this once — it explains the one real gotcha):
//
//   extract(ctx)  runs IN THE BROWSER. It is serialized with
//                 Function.prototype.toString() and injected into the page,
//                 so it MUST be self-contained: reference only `ctx.*` and
//                 browser globals (document, getComputedStyle, …). NO imports,
//                 NO closures, NO outer variables — they vanish in the page
//                 and you get a ReferenceError at scan time, not at lint time.
//                 It returns a plain "signal" object (must be JSON-cloneable).
//
//   score(signal, T)  runs IN NODE afterwards. It reads the signal and your
//                 thresholds T, and returns { triggered, evidence }.
//
// ─────────────────────────────────────────────────────────────────────────
// WHAT'S IN `ctx` (all precomputed once per page, shared across patterns):
//
//   Computed signals:
//     ctx.visible        Element[]  — all visible elements on the page
//     ctx.h1             Element|null — the first <h1>
//     ctx.bodyBg         {r,g,b}    — effective background color of <body>
//     ctx.bodyLuminance  number     — 0 (black) … 1 (white)
//     ctx.isDarkMode     boolean    — true when the page reads as dark
//     ctx.fonts          { topFonts, headingFont, slopFontsDetected }
//                                   — topFonts: [{name, chars, pct}], sorted
//     ctx.thresholds     object     — your `thresholds` below (also passed to
//                                      score() as T; read from here in extract)
//
//   Helpers (call them as ctx.<name>(...)):
//     ctx.parseColor(str)            → {r,g,b,a}
//     ctx.rgbToHsl({r,g,b})          → {h,s,l}
//     ctx.relativeLuminance(rgb)     → 0..1
//     ctx.contrastRatio(rgb1, rgb2)  → number
//     ctx.isPurple(rgb)              → boolean   (indigo/violet test)
//     ctx.isVisible(el)              → boolean
//     ctx.effectiveBg(el)            → {r,g,b}   (walks up for real bg)
//     ctx.countEmoji(str)            → number
//
// Tip: skim a couple of shipped patterns for the house style —
//   gradients.js (color sniffing), centered-hero.js (uses ctx.fonts),
//   sidebar-emoji.js (uses ctx.countEmoji).
// ─────────────────────────────────────────────────────────────────────────

export default {
  id: 'my_pattern',                // unique snake_case id; also the filename
  label: 'Human-readable name',    // shown in the full report
  shortLabel: 'Short name',        // shown in the CLI / compact lists
  description: 'One line on what the tell is and why it reads as AI design.',
  category: 'colors',              // grouping: colors | fonts | layout | content
  thresholds: {                    // tunables, serialized into the page for you
    min: 3
  },

  // Runs in the browser. Return a plain signal object (numbers/strings/bools).
  extract: function (ctx) {
    const { visible, thresholds } = ctx;
    let count = 0;
    for (const el of visible) {
      const cs = getComputedStyle(el);
      // …inspect `el` / `cs` and accumulate evidence…
      if (false) count++;
    }
    return { count };
  },

  // Runs in Node. Decide triggered + attach human-readable evidence.
  score: function (signal, T) {
    if (!signal) return { triggered: false };
    const triggered = signal.count >= T.min;
    if (!triggered) return { triggered: false };
    return { triggered: true, evidence: { count: signal.count } };
  }
};
