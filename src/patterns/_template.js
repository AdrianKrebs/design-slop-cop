// ───────────────────────────────────────────────────────────────────────────
//  Add a new AI-design "tell"
// ───────────────────────────────────────────────────────────────────────────
//  1. Copy me:      cp src/patterns/_template.js src/patterns/<your-id>.js
//  2. Edit the fields + the two functions below. There's a tiny WORKING example
//     in place already — run it first, then adapt it to your tell.
//  3. Register it:  import your file in src/patterns/index.js and append it to
//                   the PATTERNS array (array order = display order).
//  4. Try it:       node check.js <a-site-with-the-tell> --pattern=<your-id>
//                   Prints the `signal` extract() returned and the `evidence`
//                   score() returned — your feedback loop while authoring.
//  5. Check it:     npm run eval   (precision/recall vs the labelled set)
//  6. Open a PR 🎉
//
//  ── What makes a good pattern (the bar for merging) ────────────────────────
//    • Deterministic — decided from the DOM + computed styles, never a guess.
//    • Common        — point to several Show HN sites that actually have it.
//    • Precise       — stays QUIET on plain, hand-built sites. Always test on
//                      news.ycombinator.com and a couple of sites you respect;
//                      a tell that flags good design is noise, not signal.
//    • Visible       — a human can see it in the screenshot.
//
//  ── The one gotcha ─────────────────────────────────────────────────────────
//    extract() is serialized with Function.prototype.toString() and run INSIDE
//    THE PAGE, so it must be self-contained: reference only `ctx.*` and browser
//    globals (document, getComputedStyle, …). No imports, no closures, no outer
//    variables — they vanish in the page and you get a ReferenceError at scan
//    time, not from your linter. Keep the `function` keyword too: method
//    shorthand (`extract(ctx){}`) doesn't survive serialization. It returns a
//    plain, JSON-cloneable "signal". score() then runs in NODE and turns that
//    signal into a verdict.
//
//  ── ctx (precomputed once per page, shared by every pattern) ────────────────
//    ctx.visible       Element[]      every visible element on the page
//    ctx.h1            Element|null   the first <h1>
//    ctx.bodyBg        {r,g,b}        effective <body> background colour
//    ctx.isDarkMode    boolean        the page reads as dark
//    ctx.fonts         { topFonts:[{name,chars,pct}], headingFont, slopFontsDetected }
//    ctx.thresholds    object         your `thresholds` (below) — read them here
//    helpers:  ctx.parseColor(str) · ctx.rgbToHsl(rgb) · ctx.relativeLuminance(rgb)
//              ctx.contrastRatio(a,b) · ctx.isPurple(rgb) · ctx.isVisible(el)
//              ctx.effectiveBg(el) · ctx.countEmoji(str)
//
//  Cribbing welcome: gradients.js (colour sniffing), centered-hero.js (fonts),
//  sidebar-emoji.js (emoji counting).
// ───────────────────────────────────────────────────────────────────────────

export default {
  id: 'my_pattern',              // unique snake_case id — must match the filename
  label: 'Human-readable name',  // full name (patterns page, reports)
  shortLabel: 'Short name',      // compact name (result card, CLI, gallery)
  description: 'One plain-language line: what the tell is.',
  category: 'colors',            // colors | fonts | layout | content
  thresholds: { min: 3 },        // tunables — serialized into the page for extract()

  // IN THE BROWSER. Inspect the page and return a plain signal object.
  // EXAMPLE: counts fully pill-shaped elements. Replace with your own tell.
  extract: function (ctx) {
    let count = 0;
    for (const el of ctx.visible) {
      const radius = parseFloat(getComputedStyle(el).borderRadius) || 0;
      if (radius >= 999) count++;
    }
    return { count };
  },

  // IN NODE. Turn the signal into a verdict, with evidence a human can read.
  score: function (signal, T) {
    if (!signal || signal.count < T.min) return { triggered: false };
    return { triggered: true, evidence: { count: signal.count } };
  }
};
