# Ground-truth labels

Each line in `labels.jsonl` is one label record:

```json
{
  "slug": "chattr.online_login",
  "url": "https://chattr.online/login",
  "labels": {
    "slop_fonts": "present",
    "purple_accent": "present",
    "glassmorphism": "not_present",
    "icon_card_grid": "skip"
  },
  "notes": "intentional retro theme — classifier limitation",
  "timestamp": "2026-04-19T09:30:00.000Z"
}
```

`labels.jsonl` is **append-only**. The latest record per `slug` wins, so
re-labeling a site is fine — just save again. Old records aren't deleted
(useful for an audit trail).

To add a label: run `npm run label` and use the browser UI.
To compute precision/recall: run `npm run eval`.

This dataset is the project's ground truth. Contributions welcome — open
a PR adding new labels or correcting existing ones.
