#!/bin/bash
# HQ Cloud Session Entrypoint
# Syncs user's HQ files from S3, then starts Claude Code in SDK/WebSocket mode
# connected to the HQ Cloud API relay.
#
# Required env vars:
#   HQ_API_URL                     — HQ Cloud API base URL (http(s)://...)
#   SESSION_ID                     — Unique session identifier
#   S3_BUCKET                      — S3 bucket for user's HQ files
#   S3_PREFIX                      — S3 key prefix for this user's files
#   CLAUDE_CODE_SESSION_ACCESS_TOKEN — Bearer token for the WS relay auth
#   CLAUDE_CREDENTIALS_JSON        — Claude OAuth credentials JSON (Max subscription)
#
# Optional env vars:
#   ANTHROPIC_API_KEY — API key (only if not using Max subscription)
#   S3_REGION       — AWS region for S3 (default: us-east-1)
#   USER_ID         — User identifier (informational)
#   SHUTDOWN_TIMEOUT — Seconds to wait for graceful shutdown (default: 25)

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[SESSION]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[SESSION]${NC} $1"; }
log_error() { echo -e "${RED}[SESSION]${NC} $1"; }

# --- Validate required environment ---

validate_env() {
    local ok=true

    for var in HQ_API_URL SESSION_ID S3_BUCKET S3_PREFIX S3_REGION CLAUDE_CODE_SESSION_ACCESS_TOKEN; do
        if [ -z "${!var:-}" ]; then
            log_error "${var} is required but not set"
            ok=false
        fi
    done

    # Need one of: CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CREDENTIALS_JSON, or ANTHROPIC_API_KEY
    if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${CLAUDE_CREDENTIALS_JSON:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
        log_error "One of CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CREDENTIALS_JSON, or ANTHROPIC_API_KEY is required"
        ok=false
    fi

    if [ "$ok" = false ]; then
        log_error "Missing required environment variables — aborting"
        exit 1
    fi

    log_info "Environment validated"
}

# --- Write Claude credentials (Max subscription) ---

setup_claude_credentials() {
    # Always bypass onboarding for container sessions
    mkdir -p /root/.claude
    echo '{"hasCompletedOnboarding": true}' > /root/.claude/.claude.json
    chmod 600 /root/.claude/.claude.json

    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
        # Per-user OAuth token (from `claude setup-token`) — read natively by Claude CLI
        log_info "Using CLAUDE_CODE_OAUTH_TOKEN (per-user OAuth)"
    elif [ -n "${CLAUDE_CREDENTIALS_JSON:-}" ]; then
        # Legacy: full credentials JSON file
        log_info "Writing Claude Max subscription credentials (legacy)"
        echo "$CLAUDE_CREDENTIALS_JSON" > /root/.claude/.credentials.json
        chmod 600 /root/.claude/.credentials.json
        log_info "Claude credentials written to /root/.claude/.credentials.json"
    elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        log_info "Using ANTHROPIC_API_KEY (API billing mode)"
    fi
}

# --- Sync HQ files from S3 ---

sync_from_s3() {
    local s3_uri="s3://${S3_BUCKET}/${S3_PREFIX}"
    log_info "Syncing HQ files from ${s3_uri} to /hq ..."

    if aws s3 sync "$s3_uri" /hq \
        --region "${S3_REGION:-us-east-1}" \
        --no-progress \
        --exclude ".git/*" \
        --exclude "node_modules/*" \
        --exclude ".claude/*"; then
        local file_count
        file_count=$(find /hq -type f 2>/dev/null | wc -l)
        log_info "S3 sync complete — ${file_count} files in /hq"
    else
        log_error "S3 sync failed"
        exit 1
    fi
}

# --- Build Claude Code SDK URL ---

get_sdk_url() {
    # Strip trailing slash from API URL
    local api_url="${HQ_API_URL%/}"

    # Convert http(s):// to ws(s)://
    local ws_url
    ws_url=$(echo "$api_url" | sed 's|^https://|wss://|; s|^http://|ws://|')

    echo "${ws_url}/ws/relay/${SESSION_ID}"
}

# --- Start Claude Code ---

CLAUDE_PID=""

start_claude() {
    local sdk_url
    sdk_url=$(get_sdk_url)

    log_info "Starting Claude Code session"
    log_info "  Session ID: ${SESSION_ID}"
    log_info "  SDK URL:    ${sdk_url}"
    log_info "  HQ Root:    /hq"

    # Write a PID file so the healthcheck can verify the process
    echo $$ > /tmp/session.pid

    # Start Claude Code in SDK mode (background, so we can trap signals):
    #   --sdk-url          : Connect to HQ API relay via WebSocket
    #   --print            : Output to stdout (for container logs)
    #   --output-format    : NDJSON output
    #   --input-format     : NDJSON input
    #   --verbose          : Verbose logging for debugging
    #   -p ""              : Empty initial prompt (relay sends prompt after init)
    claude \
        --sdk-url "$sdk_url" \
        --print \
        --output-format stream-json \
        --input-format stream-json \
        --verbose \
        -p "" &

    CLAUDE_PID=$!
    echo "$CLAUDE_PID" > /tmp/session.pid
    log_info "Claude Code started (PID: ${CLAUDE_PID})"

    # Wait for the Claude process — this allows signal traps to fire
    wait "$CLAUDE_PID"
    local exit_code=$?

    # If we get here without a signal, Claude exited on its own
    if [ "$SHUTDOWN_IN_PROGRESS" != true ]; then
        log_info "Claude Code exited with code ${exit_code}"
        sync_back_to_s3
    fi

    exit "$exit_code"
}

# --- Sync files back to S3 ---

sync_back_to_s3() {
    if [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_PREFIX:-}" ]; then
        log_info "Syncing changes back to S3..."
        aws s3 sync /hq "s3://${S3_BUCKET}/${S3_PREFIX}" \
            --region "${S3_REGION:-us-east-1}" \
            --no-progress \
            --exclude ".git/*" \
            --exclude "node_modules/*" \
            --exclude ".claude/*" 2>/dev/null || log_warn "Final S3 sync failed"
    fi
}

# --- Graceful shutdown ---

SHUTDOWN_IN_PROGRESS=false
SHUTDOWN_TIMEOUT="${SHUTDOWN_TIMEOUT:-25}"

cleanup() {
    local signal="${1:-UNKNOWN}"

    if [ "$SHUTDOWN_IN_PROGRESS" = true ]; then
        log_warn "Shutdown already in progress, ignoring duplicate ${signal}"
        return
    fi
    SHUTDOWN_IN_PROGRESS=true

    log_info "Received ${signal}, initiating graceful shutdown..."

    # Sync any changed files back to S3 before killing Claude
    sync_back_to_s3

    # Send SIGTERM to Claude Code if running
    if [ -n "$CLAUDE_PID" ] && kill -0 "$CLAUDE_PID" 2>/dev/null; then
        log_info "Sending SIGTERM to Claude Code (PID: ${CLAUDE_PID})..."
        kill -TERM "$CLAUDE_PID" 2>/dev/null || true

        # Wait up to SHUTDOWN_TIMEOUT seconds for graceful exit
        local waited=0
        while kill -0 "$CLAUDE_PID" 2>/dev/null && [ $waited -lt "$SHUTDOWN_TIMEOUT" ]; do
            sleep 1
            waited=$((waited + 1))
        done

        # Force kill if still alive
        if kill -0 "$CLAUDE_PID" 2>/dev/null; then
            log_warn "Claude Code did not exit within ${SHUTDOWN_TIMEOUT}s, force killing..."
            kill -9 "$CLAUDE_PID" 2>/dev/null || true
        else
            log_info "Claude Code exited gracefully"
        fi
    fi

    # Clean up PID file
    rm -f /tmp/session.pid

    log_info "Session shutdown complete"
    exit 0
}

trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup SIGINT' SIGINT

# --- Main ---

main() {
    log_info "=== HQ Cloud Session Runtime ==="
    validate_env
    setup_claude_credentials
    sync_from_s3
    start_claude
}

main "$@"
