FROM node:22-slim

# Install Chromium, git, and system dependencies for browser automation
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    git \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set Chromium path for puppeteer/browser automation tools
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Install Claude Code globally (claude CLI used by agent-browser and sessions)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy package manifest and install dependencies first (layer cache)
COPY package.json ./
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build: tsc compiles agent-runner → dist/agent-runner.js (ESM)
#        esbuild bundles mcp-server → dist/mcp-server.cjs (CJS, for stdio MCP)
RUN npm run build

# Runtime mount points (provided at container start):
# /workspace/skills/    — HQ skills (read-only)
# /workspace/knowledge/ — HQ knowledge (read-only)
# /workspace/group/     — Group persistent memory (read/write)
# /ipc/                 — IPC directory (read/write)

# Default env (overridden by host at launch)
ENV IPC_DIR=/ipc
ENV GROUP_DIR=/workspace/group
ENV KNOWLEDGE_DIR=/workspace/knowledge
ENV CONTAINER_TIMEOUT_MS=1800000
ENV MODEL=claude-sonnet-4-6

CMD ["node", "dist/agent-runner.js"]
