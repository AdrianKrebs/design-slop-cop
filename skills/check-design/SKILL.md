---
description: Score a URL for the 16 AI design patterns common to AI-generated landing pages (templated fonts, vibe purple, gradients, perma dark, icon-card grid, numbered steps, FAQ accordion, glassmorphism, etc). Use when the user asks "score this site", "is this site templated/AI-generated?", "check for AI design patterns", "run ai-design-checker", or pastes a URL and asks how AI-templated it looks.
when_to_use: "score example.com", "is this site templated?", "check for AI design patterns", "run ai-design-checker on https://...", "how AI-generated does this look?"
argument-hint: <url>
allowed-tools: Bash(node */src/cli.js *) Bash(cd *) Bash(npm install*) Bash(npx playwright install *)
---

# AI Design Checker

Runs the bundled `ai-design-checker` CLI against a URL and reports which of the 16 deterministic design patterns trigger.

## How to use

When the user asks to score, check, or analyze a URL for AI design patterns:

1. **First-run setup** — only needed once per machine, ~200 MB Chromium download:

   ```bash
   cd "${CLAUDE_SKILL_DIR}/../.." && [ -d node_modules ] || npm install
   npx playwright install chromium
   ```

   If the user has already used this skill on this machine, skip both lines.

2. **Run the CLI in JSON mode** for parseable output:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../src/cli.js" $ARGUMENTS --json
   ```

   - `$ARGUMENTS` is the URL the user provided.
   - Each scan takes ~7 seconds. Don't fan out parallel runs.
   - If the CLI exits with `Could not launch Chromium`, run the playwright install line in step 1 first.

3. **Parse the returned JSON.** Shape:

   ```jsonc
   {
     "url": "https://example.com",
     "score": 38,                 // 0–100, percentage of patterns triggered
     "tierLabel": "Mild",         // "Heavy" (5+), "Mild" (2–4), "Clean" (0–1)
     "patternsFlagged": 4,
     "patternsTotal": 16,
     "patterns": [
       { "id": "gradients", "label": "Gradients", "triggered": true,  "evidence": { ... } },
       { "id": "shadcn",    "label": "shadcn",    "triggered": false, "evidence": null }
       // ... 16 entries
     ]
   }
   ```

4. **Summarise** for the user, leading with the verdict:

   - **Tier + score** as the headline.
   - **Triggered patterns** in a short list (use the `label` field).
   - For 1–2 of the most prominent triggers, include one specific signal from the `evidence` object (e.g. for `gradients`: "5 gradient backgrounds + hero gradient text").
   - Don't repeat the full clean list; mention the count of clean patterns only if asked.

## When NOT to use

- The user provides text or a screenshot, not a URL — this skill needs a real reachable URL.
- The user wants to score multiple sites in bulk — point them at `npm run analyze` in the cloned repo.
- The user is asking about the methodology — the 16 patterns and rules live in `src/patterns/<id>.js`; link to https://github.com/AdrianKrebs/ai-design-checker

## Pattern reference

The 16 patterns: templated fonts, VibeCode purple, gradients, shadcn signature, accent stripe, glassmorphism, colored glow, sidebar emoji, centered hero, all-caps headings, perma dark, icon-card grid, numbered 1·2·3 steps, stat banner, hero eyebrow pill, FAQ accordion. Full rules: https://github.com/AdrianKrebs/ai-design-checker/tree/main/src/patterns
