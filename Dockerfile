# Playwright's official image ships the matching Chromium build + every system
# library it needs (fonts, libnss, etc). Keep this tag in lockstep with the
# "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    # Chromium is already installed in the base image — skip the postinstall download.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install deps first for layer caching. --ignore-scripts skips the postinstall
# `playwright install` (the browser is baked into the base image already).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# App source (the .dockerignore keeps results/, node_modules, etc. out).
COPY src ./src
COPY web ./web

# The base image has a non-root "pwuser" — run as it.
USER pwuser

EXPOSE 8080
CMD ["node", "web/server.mjs"]
