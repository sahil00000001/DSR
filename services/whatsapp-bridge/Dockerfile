# The WhatsApp bridge.
#
# Deliberately boring: one stage, no build step, no native toolchain. Baileys 6.7.24 is
# pure JavaScript, so this image builds identically on arm64 and amd64 and needs neither
# Chromium nor a compiler — unlike the browser-driving alternatives, which pull ~400 MB of
# headless Chrome and break whenever the base image's shared libraries move.
#
# The service must stay up to be useful, so the priorities here are a fast cold start and
# nothing that can fail to compile during a redeploy.

FROM node:22-alpine

# dumb-init gives PID 1 correct signal handling. Without it SIGTERM never reaches Node,
# the platform waits out its grace period and then SIGKILLs — which drops the WhatsApp
# socket without closing it. See the shutdown note in src/index.ts.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Dependencies first, so a code change does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Never run as root; nothing here needs it.
USER node

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# One process, no shell wrapper, so signals arrive unmangled.
ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "src/index.ts"]
