# ─── Build Stage ─────────────────────────────────────────────────────────────
FROM node:22 AS build

WORKDIR /app

# Install all deps (including devDeps for tsc)
COPY package*.json ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS prod

WORKDIR /app

# Docker CLI — needed for spawning agent containers via mounted Docker socket
# git — needed for HQ repo sync
RUN apt-get update && apt-get install -y \
    docker.io \
    git \
    ca-certificates \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Production dependencies only (skip devDeps)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Data volume for SQLite + working files
VOLUME ["/data"]

# Runtime defaults — override via ECS task definition environment block
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
