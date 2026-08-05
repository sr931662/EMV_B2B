# syntax=docker/dockerfile:1

# =============================================================================
# TravNexa Global — backend API image (Express + Prisma) for ECS Fargate
# =============================================================================
#
# Multi-stage so the runtime image carries no dev dependencies and no build tooling.
#
# Base image note: `-slim` (Debian) rather than `-alpine`. Prisma ships prebuilt query engines
# per platform, and the musl/OpenSSL combination on Alpine is a recurring source of
# "Query engine binary could not be found" failures. Debian slim costs ~40MB more and avoids
# that class of problem entirely.

# -----------------------------------------------------------------------------
# Stage 1 — install production dependencies and generate the Prisma client
# -----------------------------------------------------------------------------
FROM node:22-slim AS deps

# OpenSSL is required by Prisma's query engine at runtime; ca-certificates is required to make
# TLS connections to a hosted Postgres (Neon enforces sslmode=require).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first so `npm ci` is cached and only re-runs when dependencies actually change.
COPY package.json package-lock.json ./

# Full install (including devDependencies) because the `prisma` CLI needed by `generate` is one.
# Reproducible from the lockfile.
RUN npm ci

# The schema must be present before `prisma generate`.
COPY prisma ./prisma
RUN npx prisma generate

# Drop devDependencies now that the client exists. `prune` leaves the generated client alone —
# node_modules/.prisma is build output, not a package, and @prisma/client is a production dep.
#
# The `prisma` CLI is a production dependency on purpose, so it survives this prune: the entrypoint
# runs `prisma migrate deploy` at container start, and pruning the CLI away would make every task
# fail to boot. It costs a few MB in the image and removes a whole class of "someone forgot to run
# migrations" outage.
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# node:22-slim already ships a non-root `node` user (uid 1000). Running as root in a container
# means a container escape starts with root on the host namespace — never do it for a web app.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=deps /app/prisma ./prisma
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# The entrypoint runs migrations before the server starts. chmod because a checkout on Windows
# carries no executable bit, so relying on the host's file mode would fail only in CI.
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Upload target. NOTE: this lives on the container's ephemeral filesystem, so anything written
# here is DESTROYED when the task stops — every deploy, scale-in or crash. That is a deliberate,
# acknowledged decision for this deployment (see infra/DEPLOYMENT.md § Ephemeral storage); it is
# also why the ECS service is pinned to a single task. Payment proofs and visa documents are the
# data at risk. Switching to S3 or an EFS mount is the fix when that becomes unacceptable.
RUN mkdir -p storage/payments storage/visa-documents storage/quotes/emv storage/quotes/partner \
  && chown -R node:node storage

USER node

EXPOSE 4000

# ECS also health-checks via the ALB target group; this HEALTHCHECK is what makes `docker ps`
# and any non-ECS runtime (local, Compose) report the container's real state.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint applies pending migrations before starting the server, so a task can never come
# up against a database whose schema its code does not match. It `exec`s node at the end, so node
# still becomes PID 1 and receives SIGTERM directly — the graceful shutdown in src/index.js
# depends on that.
CMD ["./docker-entrypoint.sh"]
