# =============================================================================
# HQ Cloud API - Multi-stage Docker build
# =============================================================================
# Build context: packages/hq-cloud/ (required for workspace dependencies)
# Build command: docker build -f api/Dockerfile -t hq-cloud-api .
# Run command:   docker run -p 3001:3001 --env-file api/.env hq-cloud-api
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies and build TypeScript
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /build

# Copy workspace root files first (for pnpm workspace resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy package.json files for all workspace packages the API depends on
# This layer is cached until any package.json changes
COPY api/package.json api/package.json
COPY file-sync/package.json file-sync/package.json

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code for file-sync (dependency of api)
COPY file-sync/tsconfig.json file-sync/tsconfig.json
COPY file-sync/src/ file-sync/src/

# Build file-sync first (api depends on it)
RUN pnpm --filter @hq-cloud/file-sync build

# Copy source code for api
COPY api/tsconfig.json api/tsconfig.json
COPY api/src/ api/src/

# Build the API
RUN pnpm --filter @hq-cloud/api build

# Prune devDependencies for a smaller runtime image
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Stage 2: Production runtime
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:20-slim AS runtime

# Install pnpm (needed for workspace symlinks in node_modules)
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

# Security: run as non-root user
RUN groupadd --gid 1001 hqcloud && \
    useradd --uid 1001 --gid hqcloud --shell /bin/sh --create-home hqcloud

WORKDIR /app

# Copy workspace root config (pnpm needs these for workspace resolution)
COPY --from=builder /build/package.json /build/pnpm-workspace.yaml /build/pnpm-lock.yaml ./

# Copy production node_modules (includes workspace symlinks)
COPY --from=builder /build/node_modules/ ./node_modules/

# Copy file-sync built output + package.json + production node_modules
COPY --from=builder /build/file-sync/package.json ./file-sync/package.json
COPY --from=builder /build/file-sync/dist/ ./file-sync/dist/
COPY --from=builder /build/file-sync/node_modules/ ./file-sync/node_modules/

# Copy API built output + package.json + production node_modules
COPY --from=builder /build/api/package.json ./api/package.json
COPY --from=builder /build/api/dist/ ./api/dist/
COPY --from=builder /build/api/node_modules/ ./api/node_modules/

# Set ownership to non-root user
RUN chown -R hqcloud:hqcloud /app

USER hqcloud

# Configure defaults (overridable via env vars at runtime)
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info

# Expose the API port
EXPOSE 3001

# Health check using the /api/health endpoint
# Interval: 30s, Timeout: 5s, Start period: 10s, Retries: 3
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

# Start the API server
WORKDIR /app/api
CMD ["node", "dist/index.js"]
