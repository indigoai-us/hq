#!/bin/bash
# HQ Cloud Session Entrypoint
# Syncs user's HQ files from S3, then starts Claude Code in SDK/WebSocket mode
# connected to the HQ Cloud API relay.
#
# On startup: snapshots the workspace (paths + hashes) after S3 pull.
# On SIGTERM: computes diff against snapshot, uploads changed/new files,
#             removes deleted files from S3, sends sync status via HTTP,
#             then exits cleanly.
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
#   SYNC_DEADLINE   — Max seconds for diff-sync on shutdown (default: 30)

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[SESSION]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[SESSION]${NC} $1"; }
log_error() { echo -e "${RED}[SESSION]${NC} $1"; }

# Workspace snapshot manifest file (path\thash per line)
SNAPSHOT_FILE="/tmp/workspace-snapshot.manifest"
SYNC_DEADLINE="${SYNC_DEADLINE:-30}"

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

# --- Workspace snapshot ---
# Creates a manifest of all workspace files with their md5 hashes.
# Used to compute a diff at shutdown so only changed files are synced.

snapshot_workspace() {
    log_info "Snapshotting workspace for diff-sync..."
    rm -f "$SNAPSHOT_FILE"

    # Generate manifest: relative_path\tmd5hash
    # Exclude .git, node_modules, .claude (same as S3 sync excludes)
    find /hq -type f \
        ! -path '/hq/.git/*' \
        ! -path '/hq/node_modules/*' \
        ! -path '/hq/.claude/*' \
        -print0 2>/dev/null | \
    while IFS= read -r -d '' file; do
        local rel_path="${file#/hq/}"
        local hash
        hash=$(md5sum "$file" 2>/dev/null | cut -d' ' -f1) || continue
        printf '%s\t%s\n' "$rel_path" "$hash"
    done > "$SNAPSHOT_FILE"

    local count
    count=$(wc -l < "$SNAPSHOT_FILE" 2>/dev/null || echo 0)
    log_info "Snapshot captured — ${count} files"
}

# --- Diff-based sync to S3 ---
# Compares current workspace against the startup snapshot.
# Uploads changed/new files, deletes removed files from S3.
# Returns: 0 on success, 1 on failure
# Sets global: SYNC_UPLOADED, SYNC_DELETED, SYNC_ERRORS

SYNC_UPLOADED=0
SYNC_DELETED=0
SYNC_ERRORS=0

diff_sync_to_s3() {
    if [ -z "${S3_BUCKET:-}" ] || [ -z "${S3_PREFIX:-}" ]; then
        log_warn "S3 not configured, skipping diff sync"
        return 1
    fi

    local s3_region="${S3_REGION:-us-east-1}"
    local start_time
    start_time=$(date +%s)

    SYNC_UPLOADED=0
    SYNC_DELETED=0
    SYNC_ERRORS=0

    # Build current manifest
    local current_manifest="/tmp/workspace-current.manifest"
    rm -f "$current_manifest"

    find /hq -type f \
        ! -path '/hq/.git/*' \
        ! -path '/hq/node_modules/*' \
        ! -path '/hq/.claude/*' \
        -print0 2>/dev/null | \
    while IFS= read -r -d '' file; do
        local rel_path="${file#/hq/}"
        local hash
        hash=$(md5sum "$file" 2>/dev/null | cut -d' ' -f1) || continue
        printf '%s\t%s\n' "$rel_path" "$hash"
    done > "$current_manifest"

    # If no snapshot exists, fall back to full sync
    if [ ! -f "$SNAPSHOT_FILE" ]; then
        log_warn "No startup snapshot found, falling back to full sync"
        aws s3 sync /hq "s3://${S3_BUCKET}/${S3_PREFIX}" \
            --region "$s3_region" \
            --no-progress \
            --exclude ".git/*" \
            --exclude "node_modules/*" \
            --exclude ".claude/*" 2>/dev/null || {
            log_error "Full sync fallback failed"
            SYNC_ERRORS=1
            return 1
        }
        SYNC_UPLOADED=$(wc -l < "$current_manifest" 2>/dev/null || echo 0)
        return 0
    fi

    # --- Compute changed and new files ---
    # Files in current but not in snapshot, or with different hashes
    local changed_files="/tmp/sync-changed.list"
    rm -f "$changed_files"

    while IFS=$'\t' read -r rel_path current_hash; do
        local elapsed=$(( $(date +%s) - start_time ))
        if [ "$elapsed" -ge "$SYNC_DEADLINE" ]; then
            log_warn "Sync deadline reached (${SYNC_DEADLINE}s), aborting remaining uploads"
            break
        fi

        local old_hash=""
        if [ -f "$SNAPSHOT_FILE" ]; then
            old_hash=$(grep -P "^${rel_path}\t" "$SNAPSHOT_FILE" 2>/dev/null | cut -f2 || true)
        fi

        if [ "$current_hash" != "$old_hash" ]; then
            echo "$rel_path" >> "$changed_files"
        fi
    done < "$current_manifest"

    # Upload changed/new files
    if [ -f "$changed_files" ] && [ -s "$changed_files" ]; then
        while IFS= read -r rel_path; do
            local elapsed=$(( $(date +%s) - start_time ))
            if [ "$elapsed" -ge "$SYNC_DEADLINE" ]; then
                log_warn "Sync deadline reached during upload, aborting remaining"
                break
            fi

            local local_file="/hq/${rel_path}"
            local s3_key="${S3_PREFIX}/${rel_path}"

            if aws s3 cp "$local_file" "s3://${S3_BUCKET}/${s3_key}" \
                --region "$s3_region" \
                --no-progress 2>/dev/null; then
                SYNC_UPLOADED=$((SYNC_UPLOADED + 1))
            else
                log_warn "Failed to upload: ${rel_path}"
                SYNC_ERRORS=$((SYNC_ERRORS + 1))
            fi
        done < "$changed_files"
    fi

    # --- Compute deleted files ---
    # Files in snapshot but not in current
    while IFS=$'\t' read -r rel_path _hash; do
        local elapsed=$(( $(date +%s) - start_time ))
        if [ "$elapsed" -ge "$SYNC_DEADLINE" ]; then
            log_warn "Sync deadline reached during delete, aborting remaining"
            break
        fi

        if ! grep -qP "^${rel_path}\t" "$current_manifest" 2>/dev/null; then
            local s3_key="${S3_PREFIX}/${rel_path}"
            if aws s3 rm "s3://${S3_BUCKET}/${s3_key}" \
                --region "$s3_region" 2>/dev/null; then
                SYNC_DELETED=$((SYNC_DELETED + 1))
            else
                log_warn "Failed to delete from S3: ${rel_path}"
                SYNC_ERRORS=$((SYNC_ERRORS + 1))
            fi
        fi
    done < "$SNAPSHOT_FILE"

    # Cleanup temp files
    rm -f "$current_manifest" "$changed_files"

    local total=$((SYNC_UPLOADED + SYNC_DELETED))
    local elapsed=$(( $(date +%s) - start_time ))
    log_info "Diff sync complete — ${SYNC_UPLOADED} uploaded, ${SYNC_DELETED} deleted, ${SYNC_ERRORS} errors (${elapsed}s)"

    if [ "$SYNC_ERRORS" -gt 0 ]; then
        return 1
    fi
    return 0
}

# --- Send sync status via HTTP ---
# Posts sync status to the HQ API so it can be relayed to browser clients.
# Uses the session status endpoint since the container doesn't maintain its own WS.

send_sync_status() {
    local status="${1:-unknown}"     # success | failure | partial
    local uploaded="${2:-0}"
    local deleted="${3:-0}"
    local errors="${4:-0}"
    local duration_ms="${5:-0}"

    if [ -z "${HQ_API_URL:-}" ] || [ -z "${SESSION_ID:-}" ]; then
        log_warn "Cannot send sync status — HQ_API_URL or SESSION_ID not set"
        return 1
    fi

    local api_url="${HQ_API_URL%/}"
    local payload
    payload=$(cat <<SYNC_JSON
{
  "type": "sync_complete",
  "sessionId": "${SESSION_ID}",
  "payload": {
    "direction": "upload",
    "status": "${status}",
    "filesUploaded": ${uploaded},
    "filesDeleted": ${deleted},
    "errors": ${errors},
    "durationMs": ${duration_ms},
    "timestamp": $(date +%s000)
  }
}
SYNC_JSON
)

    # POST to the session sync-status endpoint
    # Falls back silently — sync status is informational, not critical
    if curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${CLAUDE_CODE_SESSION_ACCESS_TOKEN}" \
        -d "$payload" \
        "${api_url}/api/sessions/${SESSION_ID}/sync-status" \
        --max-time 5 \
        > /dev/null 2>&1; then
        log_info "Sync status sent to API: ${status}"
    else
        log_warn "Failed to send sync status to API"
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
        local sync_start
        sync_start=$(date +%s%3N 2>/dev/null || date +%s000)
        if diff_sync_to_s3; then
            local sync_end
            sync_end=$(date +%s%3N 2>/dev/null || date +%s000)
            local duration_ms=$(( sync_end - sync_start ))
            send_sync_status "success" "$SYNC_UPLOADED" "$SYNC_DELETED" "$SYNC_ERRORS" "$duration_ms"
        else
            local sync_end
            sync_end=$(date +%s%3N 2>/dev/null || date +%s000)
            local duration_ms=$(( sync_end - sync_start ))
            send_sync_status "failure" "$SYNC_UPLOADED" "$SYNC_DELETED" "$SYNC_ERRORS" "$duration_ms"
        fi
    fi

    exit "$exit_code"
}

# --- Sync files back to S3 (legacy full sync, kept as fallback) ---

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

    # Phase 1: Diff-sync changed files to S3 (within SYNC_DEADLINE)
    local sync_start
    sync_start=$(date +%s%3N 2>/dev/null || date +%s000)
    local sync_status="success"

    if diff_sync_to_s3; then
        log_info "Diff sync completed successfully"
    else
        log_error "Diff sync failed or partially completed"
        sync_status="failure"
        if [ "$SYNC_UPLOADED" -gt 0 ] || [ "$SYNC_DELETED" -gt 0 ]; then
            sync_status="partial"
        fi
    fi

    local sync_end
    sync_end=$(date +%s%3N 2>/dev/null || date +%s000)
    local duration_ms=$(( sync_end - sync_start ))

    # Phase 2: Send sync status to API before disconnecting
    send_sync_status "$sync_status" "$SYNC_UPLOADED" "$SYNC_DELETED" "$SYNC_ERRORS" "$duration_ms"

    # Phase 3: Send SIGTERM to Claude Code if running
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

    # Phase 4: Clean up
    rm -f /tmp/session.pid
    rm -f "$SNAPSHOT_FILE" /tmp/workspace-current.manifest /tmp/sync-changed.list

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
    snapshot_workspace
    start_claude
}

main "$@"
