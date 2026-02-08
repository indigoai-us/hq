#!/bin/bash
# HQ Worker Runtime Health Check
# Returns 0 if the worker is healthy, non-zero otherwise

set -e

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "UNHEALTHY: Node.js not available"
    exit 1
fi

# Check if HQ directory exists
if [ ! -d "/hq" ]; then
    echo "UNHEALTHY: HQ directory not found"
    exit 1
fi

# Check if Claude CLI is available
if ! command -v claude &> /dev/null; then
    echo "UNHEALTHY: Claude CLI not available"
    exit 1
fi

# Optional: Check HQ API connectivity if URL is set
if [ -n "$HQ_API_URL" ]; then
    # Basic connectivity check (just DNS resolution for now)
    # In production, this could do a full health endpoint check
    :
fi

echo "HEALTHY: Worker runtime ready"
exit 0
