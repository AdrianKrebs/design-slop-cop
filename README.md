# Design Slop Cop

Design slop is the feeling that tells you a website is purely AI-generated. This is an attempt to classify the patterns behind it.

- Live app: [slopcop.adriankrebs.ch](https://slopcop.adriankrebs.ch)
- Blog post: [blog post](https://www.adriankrebs.ch/blog/design-slop/)
- HN discussion ["Scoring Show HN submissions for AI design patterns"](https://news.ycombinator.com/item?id=47864393)

The tool loads each site in a headless browser, analyzes the DOM, and reports which of 14 deterministic AI design patterns are found.
Manual verification across ~150 labeled sites suggests ~5–10% false positives. Still, take it with a grain of salt :)

## Install

```bash
git clone https://github.com/AdrianKrebs/design-slop-cop
cd design-slop-cop && npm install
```

Requires Node 18+.

## Check a single URL

A clean site (no AI design patterns triggered):

```bash
$ node check.js https://news.ycombinator.com/
https://news.ycombinator.com/
Low slop · score 0/100 · 0/14 patterns
```

A heavy one (7 patterns triggered):

```bash
$ node check.js https://engagemii.com/aeo
https://engagemii.com/aeo
High slop · score 50/100 · 7/14 patterns

Triggered:
  • Vibe purple
  • Gradients
  • Perma dark
  • 1·2·3 steps
  • Stat banner
  • Headline badge
  • FAQ
```

Add `--json` for machine-readable output:

```bash
$ node check.js https://engagemii.com/aeo --json
{
  "url": "https://engagemii.com/aeo",
  "score": 50,
  "tierLabel": "Heavy",
  "patternsFlagged": 7,
  "patternsTotal": 14,
  "patterns": [
    { "id": "purple_accent", "label": "Vibe purple", "triggered": true, "evidence": {...} },
    ...
  ]
}
```

To update an existing clone, `git pull` inside the directory.

## Run the web frontend

The same UI as the live site at [slopcop.adriankrebs.ch](https://slopcop.adriankrebs.ch) — paste a URL, get a scored verdict and screenshot:

```bash
npm start          # → http://localhost:8080
```

The first scan is slow (it warms up a headless browser); subsequent scans reuse it. `/show` serves the browsable Show HN gallery, and `/patterns` is the reference page for all 14 patterns (definition + a real example of each). To deploy it publicly, see [`DEPLOY.md`](DEPLOY.md).

The patterns page is pre-built and self-contained (example crops embedded as data URIs). To regenerate it:

```bash
npm run capture-examples   # re-shoot one example crop per pattern → web/pattern-examples.json
npm run patterns           # build web/patterns.html from those crops
```

## Run the full corpus

For batch analysis (the bundled `urls.txt` ships the latest ~200 Show HN posts) — same install as above, then:

```bash
npm run analyze                      # sequential, ~100 min for 1k URLs
node src/run.js --concurrency=4      # 4 parallel, ~25 min, ~600 MB RAM
node src/run.js --skip-existing      # only fetch URLs not yet cached
```

Results go to `results/`:
- `results/raw/<slug>.json` — per-URL signals + score
- `results/screenshots/<slug>.png` — full-page screenshot
- `results/all-results.json` — all scored entries combined

## Patterns

| # | Pattern | The tell |
|---|---|---|
| 1 | Templated display fonts | Space Grotesk, Instrument Serif, Geist, Syne, or Fraunces used as the page default |
| 2 | Hero font mix | One hero word set apart with a second font, an italic, or a different color |
| 3 | Vibe purple | Indigo/violet accent on CTAs and links |
| 4 | Gradients | Gradient backgrounds, or gradient-clipped hero text |
| 5 | Accent stripe | Colored stripe on a card's top or left edge |
| 6 | Glassmorphism | Backdrop-blur on translucent floating panels |
| 7 | Colored glow | Saturated `box-shadow` glow on buttons and cards |
| 8 | Emoji nav | Nav or sidebar items prefixed with emoji |
| 9 | Centered + Inter | Centered hero set in Inter or a generic sans |
| 10 | Perma dark | Dark background with muted grey body text |
| 11 | Numbered steps | A "1 · 2 · 3" step sequence |
| 12 | Stat banner | "10K+ users · 99.9% uptime · 4.9★" stat row |
| 13 | Headline badge | A pill badge floating above the H1 |
| 14 | FAQ accordion | "Frequently asked questions" with 3+ collapsible Q&As |

The full rule for each pattern lives in `src/patterns/<id>.js`.

## Score

```
score      = round(100 × patternsFlagged / patternsTotal)
slop level = ≥4 High · 2–3 Medium · 0–1 Low
```

## Tools

```bash
npm run scan      # → http://localhost:7788  minimal dev scanner (see "Run the web frontend" for the full UI)
npm run label     # → http://localhost:7777  label sites for ground truth
npm run eval      # precision / recall vs dataset/labels.jsonl (165 labels shipped)
npm run report    # generate results/index.html — browsable tier-filtered grid
npm run fetch     # pull the latest 100 Show HN URLs into urls.txt
```

The scan UI launches a real browser per URL, so the first scan after starting the server is slower. The label UI lets you mark each pattern `present` / `not_present` / `skip`; saves are appended to `dataset/labels.jsonl`. The eval script compares the detector's verdict against those labels.

## Adding a pattern

Spotted a tell we miss? Each pattern is one self-contained file. To add one:

1. **Copy the template:** `cp src/patterns/_template.js src/patterns/<your-id>.js`. It documents the full export shape, everything available in `ctx`, and the one gotcha (below).
2. **Fill in the exports:** `{ id, label, shortLabel, description, category, thresholds, extract(ctx), score(signal, T) }`.
   - `extract(ctx)` runs **in the browser** (it's serialized with `Function.prototype.toString()`), so keep it self-contained: reference only `ctx.*` — no imports, closures, or outer variables.
   - `score(signal, T)` runs **in Node** and returns `{ triggered: true|false, evidence: ... }`.
3. **Register it:** import the file in `src/patterns/index.js` and append it to the `PATTERNS` array (array order = display order).
4. **Debug it:** `node check.js <a-site-that-should-trigger-it> --pattern=<your-id>` prints the raw signal your `extract` returned and the verdict your `score` returned. Confirm it fires there and stays quiet on clean sites.
5. **Check accuracy:** `npm run eval` to make sure precision/recall didn't regress, then open a PR.

## License

MIT.
