# syntax=docker/dockerfile:1.7

##########################################################################
# STAGE 1 — "builder": install ALL deps, generate Prisma client, compile TS
# We use a full Node image here because we need devDependencies (typescript,
# prisma CLI, type packages) to build. None of this ends up in the final image.
##########################################################################
FROM node:22.18.0-bookworm-slim AS builder

# All subsequent commands run from /app inside the image.
WORKDIR /app

# Copy ONLY the dependency manifests first. Docker caches each layer; as long
# as these two files don't change, the expensive "npm ci" layer is reused on
# rebuilds even when your source code changes. This is the #1 build-speed win.
COPY package.json package-lock.json ./

# Prisma's postinstall needs the schema present to generate the client, so copy
# it before installing.
COPY prisma ./prisma

# "npm ci" = clean, reproducible install straight from package-lock.json.
RUN npm ci

# Now copy the rest of the source.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Generate Prisma client and compile TypeScript.
RUN npx prisma generate \
 && npm run build

# Drop devDependencies.
RUN npm prune --omit=dev


##########################################################################
# STAGE 2 — "runner": the image that actually ships to production.
##########################################################################
FROM node:22.18.0-bookworm-slim AS runner

# OpenSSL is required by Prisma's query engine at runtime.
# dumb-init ensures Kubernetes SIGTERM is forwarded correctly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

# Copy build artifacts from builder stage.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# The official node image ships a non-root "node" user.
# Running as non-root is a baseline security control.
RUN chown -R node:node /app
USER node

# Documents which port the container listens on.
EXPOSE 4000

# dumb-init becomes PID 1 so Linux signals are forwarded correctly.
ENTRYPOINT ["dumb-init", "--"]


# Healthcheck to verify the container is healthy. Kubernetes uses this to decide
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
CMD node healthcheck.js || exit 1

##########################################################################
# IMPORTANT:
#
# DO NOT run migrations here.
#
# Migrations should be executed by:
#
# 1. Jenkins migration stage OR
# 2. Kubernetes Job
#
# This prevents multiple replicas from executing migrations simultaneously.
##########################################################################

CMD ["node", "dist/src/index.js"]


