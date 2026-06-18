# Deploying the public Design Slop Cop

A public web frontend: paste a URL → it loads the site in a real headless
Chromium, runs the 15 pattern checks, returns a scored verdict + screenshot.

## Why Fly.io

The only hard part of this app is that **every request runs a full headless
Chromium** (~0.5–1 GB RAM, 5–15 s). That one fact drives the platform choice:

| Option | Verdict |
|---|---|
| **Fly.io (Docker)** ✅ | Runs the existing Node server unchanged in Playwright's official Chromium image. Scale-to-zero when idle (~$0), auto-starts more machines from a pool when a machine hits its concurrency limit — exactly what an HN spike needs. ~$2–5/mo idle, pay-per-second under load. **Chosen.** |
| AWS Lambda + `@sparticuz/chromium` | Scales infinitely but: fiddly minified-Chromium setup, 5 s cold starts, `/tmp` cleanup bugs, and since Aug 2025 AWS bills the cold-start INIT phase (10–50% more for browser workloads). Most engineering effort. |
| Cloudflare Browser Rendering | Clean and edge-native, but requires rewriting to Cloudflare's Playwright fork + Workers, free tier is only 10 min/day, and concurrent-browser caps ($2/extra browser) bite during a spike. |
| Render / Railway | Render free tier = 30–60 s cold starts (bad for a spike); neither matches Fly's request-based autostart for heavy, slow requests. |

The app is already hardened for a spike (see `web/server.mjs`): one shared
browser, a **concurrency cap + queue** (protects RAM), an **LRU cache by URL**
(everyone pasting the same trending link is served instantly), an **SSRF guard**
(refuses localhost/private IPs — important for a public URL fetcher), and a
**per-IP rate limit**.

## One-time setup

```bash
# 1. Install the Fly CLI and log in
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login               # run this yourself: ! fly auth login

# 2. From the repo root — fly.toml already exists, so DON'T let launch overwrite it.
#    Pick a region near your audience and confirm the app name.
fly launch --no-deploy --copy-config --name design-slop-cop --region iad
```

If the app name is taken, pick another and update `app =` in `fly.toml`.

## Deploy

```bash
fly deploy
```

First build pulls the ~2 GB Playwright base image, so it takes a few minutes;
later deploys are fast. When it's done:

```bash
fly open          # opens the live URL
fly logs          # tail logs (you'll see [scan] lines)
```

## Make it survive the HN front page

Pre-warm a small pool so requests fan out across machines instead of queueing
on one. Fly auto-starts the stopped ones the moment a running machine passes its
soft concurrency limit (set to 2 in `fly.toml`), and stops them again when idle.

```bash
fly scale count 4          # create a pool of 4 machines (scale to taste)
fly scale show             # confirm size = shared-cpu-2x, 2 GB
```

Rules of thumb during a spike:
- Each machine does `SCAN_CONCURRENCY` (2) scans at once → a 4-machine pool ≈ 8
  concurrent scans, the rest queue briefly then get a polite 503.
- More throughput = raise `fly scale count` (cheap, scales horizontally) before
  raising `SCAN_CONCURRENCY` (needs more RAM per machine).
- Want bigger machines instead? `fly scale vm shared-cpu-4x --memory 4096` and
  bump `SCAN_CONCURRENCY` to `4` (set via `fly secrets set` or in `fly.toml`).

## Cost

- **Idle:** with `min_machines_running = 1` you pay for one `shared-cpu-2x`/2 GB
  ≈ a few $/month. Set it to `0` in `fly.toml` for ~$0 idle (first visitor eats a
  ~1–3 s cold start).
- **Under load:** billed per-second only while machines run. A burst of traffic
  that spins up 4 machines for a few hours is cents-to-low-dollars, and the LRU
  cache means repeat URLs cost nothing.
- Watch outbound bandwidth ($0.02/GB) — screenshots are returned inline.

## Local smoke test

```bash
npm start                       # → http://localhost:8080
# or against the built container:
docker build -t design-slop-cop .
docker run -p 8080:8080 design-slop-cop
```

## Tuning knobs (env / fly.toml)

| Var | Default | Meaning |
|---|---|---|
| `SCAN_CONCURRENCY` | 2 | Concurrent scans per machine (gate on RAM) |
| `MAX_QUEUE` | 12 | Waiting scans before returning 503 |
| `RATE_PER_MIN` | 12 | Scans/min per IP |
| `CACHE_TTL_MS` | 3600000 | Result cache lifetime (1h) |
| `CACHE_MAX` | 500 | Max cached URLs |

## Keeping Chromium in sync

The Docker base image tag (`mcr.microsoft.com/playwright:v1.59.1-noble`) must
match the `playwright` version in `package.json`. When you bump Playwright,
update the `FROM` tag in `Dockerfile` to the same `vX.Y.Z`.
