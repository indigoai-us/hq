# HQ Worker Runtime Base Image
# Base image for all HQ workers running in the cloud

FROM node:20-alpine

LABEL maintainer="HQ Cloud Team"
LABEL description="Base image for HQ workers with Claude CLI and HQ structure"

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash \
    jq \
    && rm -rf /var/cache/apk/*

# Set environment variables for HQ API connection
ENV HQ_API_URL=""
ENV HQ_API_KEY=""
ENV WORKER_ID=""
ENV NODE_ENV="production"
ENV HQ_ROOT="/hq"

# Create HQ directory structure
RUN mkdir -p /hq \
    && mkdir -p /hq/.claude/commands \
    && mkdir -p /hq/companies \
    && mkdir -p /hq/knowledge \
    && mkdir -p /hq/projects \
    && mkdir -p /hq/workers \
    && mkdir -p /hq/workspace/checkpoints \
    && mkdir -p /hq/workspace/threads \
    && mkdir -p /hq/workspace/orchestrator \
    && mkdir -p /hq/workspace/learnings \
    && mkdir -p /hq/workspace/content-ideas \
    && mkdir -p /hq/social-content/drafts/x \
    && mkdir -p /hq/social-content/drafts/linkedin

# Create local bin directory for CLI tools
RUN mkdir -p /usr/local/bin

# Copy Claude CLI placeholder script
COPY scripts/claude-cli.sh /usr/local/bin/claude
RUN chmod +x /usr/local/bin/claude

# Copy worker entrypoint script
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy worker bootstrap script (API registration and WebSocket)
COPY scripts/bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

# Copy health check script
COPY scripts/healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

# Set working directory
WORKDIR /hq

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# Default entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command (can be overridden)
CMD ["worker"]
