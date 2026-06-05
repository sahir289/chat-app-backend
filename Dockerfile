# syntax=docker/dockerfile:1.7

##########################################################################
# STAGE 1 — "builder": install ALL deps, generate Prisma client, compile TS
# We use a full Node image here because we need devDependencies (typescript,
# prisma CLI, type packages) to build. None of this ends up in the final image.
##########################################################################
FROM node:22-bookworm-slim AS builder

# All subsequent commands run from /app inside the image.
WORKDIR /app

# Copy ONLY the dependency manifests first. Docker caches each layer; as long
# as these two files don't change, the expensive "npm ci" layer is reused on
# rebuilds even when your source code changes. This is the #1 build-speed win.
COPY package.json package-lock.json ./

# Prisma's postinstall needs the schema present to generate the client, so copy
# it before installing. (If you don't have a prisma postinstall hook this is
# still required by the explicit "prisma generate" below.)
COPY prisma ./prisma

# "npm ci" = clean, reproducible install straight from package-lock.json.
# It deletes node_modules first and fails if lockfile and package.json disagree
# — exactly what you want in CI so prod matches what you tested.
RUN npm ci

# Now copy the rest of the source. Because this layer changes most often, it is
# intentionally placed AFTER npm ci so code edits don't bust the deps cache.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Generate the type-safe Prisma client into node_modules, then compile TS -> JS.
RUN npx prisma generate \
 && npm run build

# Drop devDependencies so we can copy a lean node_modules into the runtime image.
RUN npm prune --omit=dev


##########################################################################
# STAGE 2 — "runner": the tiny image that actually ships to production.
# It contains only Node, prod node_modules, compiled dist/, and Prisma assets.
##########################################################################
FROM node:22-bookworm-slim AS runner

# OpenSSL is required by Prisma's query engine at runtime on slim images.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Copy build artifacts from the builder stage (NOT from your machine).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# The official node image ships a non-root "node" user. Running as non-root is a
# baseline security control: if the app is compromised, the attacker is not root.
RUN chown -R node:node /app
USER node

# Documents which port the container listens on (matches PORT/serverConfig.ts).
EXPOSE 4000

# dumb-init becomes PID 1 so Linux signals (SIGTERM from Kubernetes) are forwarded
# to Node. Without it, your graceful-shutdown handlers in index.ts may be skipped.
ENTRYPOINT ["dumb-init", "--"]

# Apply DB migrations, THEN start the server. "migrate deploy" only applies
# already-generated migrations (never creates new ones) — the prod-safe command.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
