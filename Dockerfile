# The container an install runs in.
#
# Playwright's own image, and not a slim Node one, because the browser door
# and PDF rendering are half of what the desk is (#24, spec #27): a "research
# desk" that cannot read a JavaScript page or print a report is a different
# product. The tag is pinned to the `playwright-core` version in
# `server/package.json` — the browsers baked into the image are the ones that
# version knows how to drive, and a drift between the two is a browser that
# fails to launch at run time with a message about a download that is never
# going to happen.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# `git` because repo work clones, commits and diffs with it, and the base
# image does not carry it. Node is the image's own.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The manifests first, so a source edit does not re-resolve the tree. All four
# are copied because this is an npm workspace: `npm ci` reads every one of
# them before it will touch the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY web/package.json web/

# Not `--omit=dev`: the server runs TypeScript directly through tsx and the
# web bundle is built by Vite, so both live in devDependencies and both are
# needed here. NODE_ENV is deliberately left alone for the same reason —
# setting it to production would silently skip them.
RUN npm ci

COPY . .

# The bundle the server serves from its own port (D-272). Built here, into
# `web/dist`, which `installPaths()` keeps on the product side precisely so a
# volume cannot pin an install to whichever bundle landed on it first.
RUN npm run build

# Where the operator's half lives (D-270). The volume mounts here, so the
# secrets file `/data/.env`, the data directory `/data/.agentlings` and the
# sandboxes under it all outlive the container. Nothing is written here during
# the build — Railway mounts a volume at run time only, so anything baked in
# would be hidden the moment the real one arrives.
ENV AGENTLINGS_HOME=/data
RUN mkdir -p /data

# No password, no public interface (D-271). This bind is the reason
# `AGENTLINGS_PASSWORD` is the template's one required variable: without it
# the server refuses to listen and says so in one line, rather than putting an
# ungated install on a public address.
ENV AGENTLINGS_BIND=0.0.0.0

# The port is the host's (`PORT`, D-271), so nothing is wired here. EXPOSE is
# documentation; Railway routes to whatever the process listens on.
EXPOSE 4600

# The same launcher `npm run serve` uses, called directly rather than through
# npm so that the platform's SIGTERM reaches the wrapper — which forwards it —
# instead of dying in an npm shim. It keeps the server's last words in
# `/data/.agentlings/server.log`, on the volume, which is the only reason a
# crash on a host is examinable at all.
CMD ["node", "server/scripts/dev-logged.mjs", "--no-watch"]
