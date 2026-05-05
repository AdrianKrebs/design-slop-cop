# Labeling tool

A tiny local web UI to ground-truth the detector. For each analyzed site
you mark each of the 16 patterns as **Present**, **Not present**, or **Skip**.
The labels feed into `tools/eval.mjs` to compute precision / recall / F1 per
pattern.

## Usage

```bash
# 1. Run the analyzer first so we have screenshots + raw signals
npm run analyze

# 2. Start the labeling server
npm run label
# → opens http://localhost:7777/

# 3. Label sites in the browser. Each save appends one line to
#    dataset/labels.jsonl. Closing the page is fine; state is persisted.

# 4. When you've labeled enough (say 50–200), see the eval:
npm run eval
```

## Keyboard

- `←` / `→` — previous / next site
- `Cmd+S` — save
- click each pattern row to mark Present / Not present / Skip

## Conventions

For each pattern, "Present" means "yes, this pattern is visibly used on the
page" — independent of whether the detector flagged it. Once enough labels
exist, `eval.mjs` produces:

- **Precision** — when the detector triggers, how often it's right
- **Recall** — when the pattern is actually present, how often the detector catches it
- **FP / FN URL lists** — concrete examples to debug

`labels.jsonl` is append-only; the latest record per slug wins.
