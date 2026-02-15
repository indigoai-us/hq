#!/bin/bash
# HQ Cloud Session Health Check
# Returns 0 if Claude Code process is alive, non-zero otherwise.
# Called by Docker HEALTHCHECK at regular intervals.

set -e

# Check Claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "UNHEALTHY: Claude CLI not available"
    exit 1
fi

# Check HQ directory exists and has files
if [ ! -d "/hq" ]; then
    echo "UNHEALTHY: /hq directory not found"
    exit 1
fi

# Check Claude Code process is running via PID file
if [ -f /tmp/session.pid ]; then
    SESSION_PID=$(cat /tmp/session.pid)
    if [ -n "$SESSION_PID" ] && kill -0 "$SESSION_PID" 2>/dev/null; then
        echo "HEALTHY: Claude Code session active (PID: ${SESSION_PID})"
        exit 0
    fi
fi

# Fallback: check if any claude process with --sdk-url is running
if pgrep -f "claude.*--sdk-url" > /dev/null 2>&1; then
    echo "HEALTHY: Claude Code session active (found via pgrep)"
    exit 0
fi

echo "UNHEALTHY: Claude Code process not found"
exit 1
