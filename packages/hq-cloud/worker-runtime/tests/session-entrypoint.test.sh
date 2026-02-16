#!/bin/bash
# Session Entrypoint Script Tests
# Run with: bash tests/session-entrypoint.test.sh
#
# Tests validate the session-entrypoint.sh and session-healthcheck.sh scripts
# for correct environment validation, SDK URL construction, signal handling,
# and Dockerfile.session structure.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRYPOINT_SCRIPT="$ROOT_DIR/scripts/session-entrypoint.sh"
HEALTHCHECK_SCRIPT="$ROOT_DIR/scripts/session-healthcheck.sh"
DOCKERFILE_SESSION="$ROOT_DIR/Dockerfile.session"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test utilities
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo -e "${RED}FAIL:${NC} $message"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Assertion failed}"

    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo -e "${RED}FAIL:${NC} $message"
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Assertion failed}"

    if [[ "$haystack" != *"$needle"* ]]; then
        return 0
    else
        echo -e "${RED}FAIL:${NC} $message"
        echo "  Expected NOT to contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

run_test() {
    local test_name="$1"
    local test_fn="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "  Testing: $test_name... "

    if $test_fn; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# =========================================================================
# Entrypoint script tests
# =========================================================================

test_entrypoint_exists() {
    [ -f "$ENTRYPOINT_SCRIPT" ]
}

test_entrypoint_executable() {
    [ -x "$ENTRYPOINT_SCRIPT" ] || chmod +x "$ENTRYPOINT_SCRIPT"
    [ -x "$ENTRYPOINT_SCRIPT" ]
}

test_entrypoint_has_validate_env() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "validate_env" "Should have validate_env function"
}

test_entrypoint_validates_anthropic_key() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "ANTHROPIC_API_KEY" "Should validate ANTHROPIC_API_KEY"
}

test_entrypoint_validates_hq_api_url() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "HQ_API_URL" "Should validate HQ_API_URL"
}

test_entrypoint_validates_session_id() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "SESSION_ID" "Should validate SESSION_ID"
}

test_entrypoint_validates_s3_bucket() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "S3_BUCKET" "Should validate S3_BUCKET"
}

test_entrypoint_validates_s3_prefix() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "S3_PREFIX" "Should validate S3_PREFIX"
}

test_entrypoint_validates_session_access_token() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "CLAUDE_CODE_SESSION_ACCESS_TOKEN" "Should validate CLAUDE_CODE_SESSION_ACCESS_TOKEN"
}

test_entrypoint_exits_on_missing_env() {
    # Run with all env vars empty — should exit non-zero
    local output
    local exit_code=0
    output=$(
        ANTHROPIC_API_KEY="" \
        HQ_API_URL="" \
        SESSION_ID="" \
        S3_BUCKET="" \
        S3_PREFIX="" \
        S3_REGION="" \
        CLAUDE_CODE_SESSION_ACCESS_TOKEN="" \
        bash "$ENTRYPOINT_SCRIPT" 2>&1
    ) || exit_code=$?

    [ "$exit_code" -ne 0 ] && assert_contains "$output" "required" "Should report missing required variables"
}

test_entrypoint_has_s3_sync() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "aws s3 sync" "Should use aws s3 sync for S3 download"
}

test_entrypoint_s3_sync_excludes_git() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '--exclude ".git/*"' "Should exclude .git from S3 sync"
}

test_entrypoint_s3_sync_excludes_node_modules() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '--exclude "node_modules/*"' "Should exclude node_modules from S3 sync"
}

test_entrypoint_sdk_url_construction() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # Should convert http(s) to ws(s) and append /ws/relay/${SESSION_ID}
    assert_contains "$content" "ws/relay/" "Should construct SDK URL with /ws/relay/ path" && \
    assert_contains "$content" "SESSION_ID" "Should use SESSION_ID in SDK URL"
}

test_entrypoint_sdk_url_https_to_wss() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" 'https://|wss://' "Should convert https to wss"
}

test_entrypoint_sdk_url_http_to_ws() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" 'http://|ws://' "Should convert http to ws"
}

test_entrypoint_claude_sdk_url_flag() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--sdk-url" "Should pass --sdk-url flag to claude"
}

test_entrypoint_claude_print_flag() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--print" "Should pass --print flag to claude"
}

test_entrypoint_claude_output_format() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--output-format stream-json" "Should use stream-json output format"
}

test_entrypoint_claude_input_format() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--input-format stream-json" "Should use stream-json input format"
}

test_entrypoint_claude_verbose() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--verbose" "Should pass --verbose flag to claude"
}

test_entrypoint_claude_empty_prompt() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '-p ""' "Should pass empty prompt with -p flag"
}

test_entrypoint_writes_pid_file() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "/tmp/session.pid" "Should write PID file for healthcheck"
}

test_entrypoint_has_signal_handlers() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "trap" "Should set up signal traps" && \
    assert_contains "$content" "SIGTERM" "Should handle SIGTERM" && \
    assert_contains "$content" "SIGINT" "Should handle SIGINT"
}

test_entrypoint_graceful_shutdown_syncs_s3() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # cleanup/shutdown function should use diff sync to S3
    assert_contains "$content" "diff_sync_to_s3" "Should diff-sync files back to S3 on shutdown"
}

test_entrypoint_graceful_shutdown_kills_claude() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # Should send SIGTERM to Claude PID on shutdown
    assert_contains "$content" "CLAUDE_PID" "Should track Claude PID" && \
    assert_contains "$content" 'kill -TERM' "Should send SIGTERM to Claude on shutdown"
}

test_entrypoint_graceful_shutdown_force_kill() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # Should force kill if Claude doesn't exit within timeout
    assert_contains "$content" 'kill -9' "Should force kill if SIGTERM times out"
}

test_entrypoint_shutdown_timeout_configurable() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "SHUTDOWN_TIMEOUT" "Should have configurable shutdown timeout"
}

# =========================================================================
# Healthcheck script tests
# =========================================================================

test_healthcheck_exists() {
    [ -f "$HEALTHCHECK_SCRIPT" ]
}

test_healthcheck_executable() {
    [ -x "$HEALTHCHECK_SCRIPT" ] || chmod +x "$HEALTHCHECK_SCRIPT"
    [ -x "$HEALTHCHECK_SCRIPT" ]
}

test_healthcheck_checks_claude_cli() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "command -v claude" "Should check claude CLI is available"
}

test_healthcheck_checks_hq_directory() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "/hq" "Should check /hq directory exists"
}

test_healthcheck_checks_pid_file() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "/tmp/session.pid" "Should check PID file"
}

test_healthcheck_checks_process_running() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "kill -0" "Should check process is alive via kill -0"
}

test_healthcheck_pgrep_fallback() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "pgrep" "Should have pgrep fallback for process detection"
}

test_healthcheck_reports_healthy() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "HEALTHY" "Should output HEALTHY when process is running"
}

test_healthcheck_reports_unhealthy() {
    local content
    content=$(cat "$HEALTHCHECK_SCRIPT")
    assert_contains "$content" "UNHEALTHY" "Should output UNHEALTHY when process is not running"
}

# =========================================================================
# Dockerfile.session tests
# =========================================================================

test_dockerfile_exists() {
    [ -f "$DOCKERFILE_SESSION" ]
}

test_dockerfile_base_image_node20_slim() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "FROM node:20-slim" "Should use node:20-slim (needs glibc, not Alpine)"
}

test_dockerfile_not_alpine() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_not_contains "$content" "alpine" "Should NOT use Alpine (Claude Code needs glibc)"
}

test_dockerfile_installs_aws_cli() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "awscli" "Should install AWS CLI for S3 sync"
}

test_dockerfile_installs_claude_code() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "npm install -g @anthropic-ai/claude-code" "Should install Claude Code CLI via npm"
}

test_dockerfile_cleans_npm_cache() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "npm cache clean" "Should clean npm cache to reduce image size"
}

test_dockerfile_env_anthropic_key() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV ANTHROPIC_API_KEY=""' "Should declare ANTHROPIC_API_KEY env var"
}

test_dockerfile_env_session_id() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV SESSION_ID=""' "Should declare SESSION_ID env var"
}

test_dockerfile_env_hq_api_url() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV HQ_API_URL=""' "Should declare HQ_API_URL env var"
}

test_dockerfile_env_s3_bucket() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV S3_BUCKET=""' "Should declare S3_BUCKET env var"
}

test_dockerfile_env_s3_prefix() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV S3_PREFIX=""' "Should declare S3_PREFIX env var"
}

test_dockerfile_env_s3_region() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV S3_REGION="us-east-1"' "Should declare S3_REGION with default"
}

test_dockerfile_env_session_access_token() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENV CLAUDE_CODE_SESSION_ACCESS_TOKEN=""' "Should declare CLAUDE_CODE_SESSION_ACCESS_TOKEN env var"
}

test_dockerfile_creates_hq_dir() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "mkdir -p /hq" "Should create /hq directory"
}

test_dockerfile_copies_entrypoint() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "session-entrypoint.sh" "Should copy session-entrypoint.sh"
}

test_dockerfile_copies_healthcheck() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "session-healthcheck.sh" "Should copy session-healthcheck.sh"
}

test_dockerfile_sets_workdir() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "WORKDIR /hq" "Should set WORKDIR to /hq"
}

test_dockerfile_has_healthcheck() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "HEALTHCHECK" "Should configure Docker HEALTHCHECK"
}

test_dockerfile_entrypoint_session() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" 'ENTRYPOINT ["/usr/local/bin/session-entrypoint.sh"]' "Should set ENTRYPOINT to session-entrypoint.sh"
}

test_dockerfile_installs_procps() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "procps" "Should install procps for pgrep support in healthcheck"
}

test_dockerfile_installs_git() {
    local content
    content=$(cat "$DOCKERFILE_SESSION")
    assert_contains "$content" "git" "Should install git (needed by Claude Code)"
}

# =========================================================================
# Workspace snapshot tests (US-004)
# =========================================================================

test_entrypoint_has_snapshot_workspace() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "snapshot_workspace" "Should have snapshot_workspace function"
}

test_entrypoint_snapshot_uses_md5() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "md5sum" "Should use md5sum for file hashing"
}

test_entrypoint_snapshot_creates_manifest() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "SNAPSHOT_FILE" "Should use SNAPSHOT_FILE for manifest path" && \
    assert_contains "$content" "workspace-snapshot.manifest" "Should write to workspace-snapshot.manifest"
}

test_entrypoint_snapshot_excludes_git() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # snapshot_workspace should exclude .git like S3 sync does
    assert_contains "$content" ".git" "Snapshot should reference .git exclusion"
}

test_entrypoint_snapshot_excludes_node_modules() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "node_modules" "Snapshot should reference node_modules exclusion"
}

test_entrypoint_snapshot_called_after_s3_sync() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # In main(), snapshot_workspace should come after sync_from_s3
    # Check that sync_from_s3 appears before snapshot_workspace in main()
    local sync_line snapshot_line
    sync_line=$(grep -n "sync_from_s3" "$ENTRYPOINT_SCRIPT" | tail -1 | cut -d: -f1)
    snapshot_line=$(grep -n "snapshot_workspace" "$ENTRYPOINT_SCRIPT" | tail -1 | cut -d: -f1)
    [ "$sync_line" -lt "$snapshot_line" ]
}

# =========================================================================
# Diff-sync tests (US-004)
# =========================================================================

test_entrypoint_has_diff_sync() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "diff_sync_to_s3" "Should have diff_sync_to_s3 function"
}

test_entrypoint_diff_sync_uploads_changed() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "aws s3 cp" "Should use aws s3 cp for individual file uploads"
}

test_entrypoint_diff_sync_deletes_removed() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "aws s3 rm" "Should use aws s3 rm for deleted files"
}

test_entrypoint_diff_sync_tracks_counts() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "SYNC_UPLOADED" "Should track uploaded file count" && \
    assert_contains "$content" "SYNC_DELETED" "Should track deleted file count" && \
    assert_contains "$content" "SYNC_ERRORS" "Should track error count"
}

test_entrypoint_diff_sync_has_deadline() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "SYNC_DEADLINE" "Should have SYNC_DEADLINE for timeout enforcement"
}

test_entrypoint_diff_sync_deadline_default_30() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" 'SYNC_DEADLINE="${SYNC_DEADLINE:-30}"' "Should default SYNC_DEADLINE to 30 seconds"
}

test_entrypoint_diff_sync_falls_back_to_full() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "No startup snapshot found" "Should fall back to full sync when no snapshot"
}

# =========================================================================
# Sync status WebSocket notification tests (US-004)
# =========================================================================

test_entrypoint_has_send_sync_status() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "send_sync_status" "Should have send_sync_status function"
}

test_entrypoint_sync_status_posts_to_api() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "sync-status" "Should POST to sync-status endpoint"
}

test_entrypoint_sync_status_includes_direction() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '"direction": "upload"' "Should include upload direction in sync status"
}

test_entrypoint_sync_status_includes_file_counts() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "filesUploaded" "Should include filesUploaded in payload" && \
    assert_contains "$content" "filesDeleted" "Should include filesDeleted in payload"
}

test_entrypoint_sync_status_includes_errors() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '"errors"' "Should include errors count in payload"
}

test_entrypoint_sync_status_includes_duration() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "durationMs" "Should include durationMs in payload"
}

test_entrypoint_sync_status_uses_auth_token() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "CLAUDE_CODE_SESSION_ACCESS_TOKEN" "Should use session access token for auth"
}

test_entrypoint_sync_status_has_timeout() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" "--max-time" "Should have a timeout on the sync status HTTP call"
}

test_entrypoint_cleanup_sends_sync_status() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    # The cleanup function should call send_sync_status after diff_sync_to_s3
    assert_contains "$content" "send_sync_status" "cleanup should send sync status"
}

test_entrypoint_cleanup_handles_partial_sync() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" '"partial"' "Should report partial status when some files synced but errors occurred"
}

test_entrypoint_cleanup_cleans_temp_files() {
    local content
    content=$(cat "$ENTRYPOINT_SCRIPT")
    assert_contains "$content" 'rm -f "$SNAPSHOT_FILE"' "Should clean up snapshot file on shutdown" && \
    assert_contains "$content" "workspace-current.manifest" "Should clean up current manifest on shutdown"
}

# =========================================================================
# Main test runner
# =========================================================================

main() {
    echo "=== Session Entrypoint Tests ==="
    echo ""

    echo "--- Entrypoint script ---"
    run_test "Script exists" test_entrypoint_exists
    run_test "Script is executable" test_entrypoint_executable
    run_test "Has validate_env function" test_entrypoint_has_validate_env
    run_test "Validates ANTHROPIC_API_KEY" test_entrypoint_validates_anthropic_key
    run_test "Validates HQ_API_URL" test_entrypoint_validates_hq_api_url
    run_test "Validates SESSION_ID" test_entrypoint_validates_session_id
    run_test "Validates S3_BUCKET" test_entrypoint_validates_s3_bucket
    run_test "Validates S3_PREFIX" test_entrypoint_validates_s3_prefix
    run_test "Validates CLAUDE_CODE_SESSION_ACCESS_TOKEN" test_entrypoint_validates_session_access_token
    run_test "Exits on missing env vars" test_entrypoint_exits_on_missing_env
    run_test "Uses aws s3 sync" test_entrypoint_has_s3_sync
    run_test "S3 sync excludes .git" test_entrypoint_s3_sync_excludes_git
    run_test "S3 sync excludes node_modules" test_entrypoint_s3_sync_excludes_node_modules
    run_test "SDK URL construction" test_entrypoint_sdk_url_construction
    run_test "SDK URL: https -> wss" test_entrypoint_sdk_url_https_to_wss
    run_test "SDK URL: http -> ws" test_entrypoint_sdk_url_http_to_ws
    run_test "Claude --sdk-url flag" test_entrypoint_claude_sdk_url_flag
    run_test "Claude --print flag" test_entrypoint_claude_print_flag
    run_test "Claude --output-format stream-json" test_entrypoint_claude_output_format
    run_test "Claude --input-format stream-json" test_entrypoint_claude_input_format
    run_test "Claude --verbose flag" test_entrypoint_claude_verbose
    run_test "Claude -p empty prompt" test_entrypoint_claude_empty_prompt
    run_test "Writes PID file" test_entrypoint_writes_pid_file
    run_test "Has signal handlers" test_entrypoint_has_signal_handlers
    run_test "Graceful shutdown syncs S3" test_entrypoint_graceful_shutdown_syncs_s3
    run_test "Graceful shutdown kills Claude" test_entrypoint_graceful_shutdown_kills_claude
    run_test "Force kill on timeout" test_entrypoint_graceful_shutdown_force_kill
    run_test "Shutdown timeout configurable" test_entrypoint_shutdown_timeout_configurable
    echo ""

    echo "--- Workspace snapshot (US-004) ---"
    run_test "Has snapshot_workspace function" test_entrypoint_has_snapshot_workspace
    run_test "Snapshot uses md5sum" test_entrypoint_snapshot_uses_md5
    run_test "Snapshot creates manifest file" test_entrypoint_snapshot_creates_manifest
    run_test "Snapshot excludes .git" test_entrypoint_snapshot_excludes_git
    run_test "Snapshot excludes node_modules" test_entrypoint_snapshot_excludes_node_modules
    run_test "Snapshot called after S3 sync" test_entrypoint_snapshot_called_after_s3_sync
    echo ""

    echo "--- Diff sync to S3 (US-004) ---"
    run_test "Has diff_sync_to_s3 function" test_entrypoint_has_diff_sync
    run_test "Uploads changed files individually" test_entrypoint_diff_sync_uploads_changed
    run_test "Deletes removed files from S3" test_entrypoint_diff_sync_deletes_removed
    run_test "Tracks upload/delete/error counts" test_entrypoint_diff_sync_tracks_counts
    run_test "Has SYNC_DEADLINE for timeout" test_entrypoint_diff_sync_has_deadline
    run_test "SYNC_DEADLINE defaults to 30s" test_entrypoint_diff_sync_deadline_default_30
    run_test "Falls back to full sync without snapshot" test_entrypoint_diff_sync_falls_back_to_full
    echo ""

    echo "--- Sync status notification (US-004) ---"
    run_test "Has send_sync_status function" test_entrypoint_has_send_sync_status
    run_test "Posts to sync-status API endpoint" test_entrypoint_sync_status_posts_to_api
    run_test "Includes upload direction" test_entrypoint_sync_status_includes_direction
    run_test "Includes file counts" test_entrypoint_sync_status_includes_file_counts
    run_test "Includes error count" test_entrypoint_sync_status_includes_errors
    run_test "Includes duration" test_entrypoint_sync_status_includes_duration
    run_test "Uses session access token" test_entrypoint_sync_status_uses_auth_token
    run_test "Has HTTP call timeout" test_entrypoint_sync_status_has_timeout
    run_test "Cleanup sends sync status" test_entrypoint_cleanup_sends_sync_status
    run_test "Reports partial sync status" test_entrypoint_cleanup_handles_partial_sync
    run_test "Cleans up temp files" test_entrypoint_cleanup_cleans_temp_files
    echo ""

    echo "--- Healthcheck script ---"
    run_test "Script exists" test_healthcheck_exists
    run_test "Script is executable" test_healthcheck_executable
    run_test "Checks claude CLI" test_healthcheck_checks_claude_cli
    run_test "Checks /hq directory" test_healthcheck_checks_hq_directory
    run_test "Checks PID file" test_healthcheck_checks_pid_file
    run_test "Checks process running" test_healthcheck_checks_process_running
    run_test "pgrep fallback" test_healthcheck_pgrep_fallback
    run_test "Reports HEALTHY" test_healthcheck_reports_healthy
    run_test "Reports UNHEALTHY" test_healthcheck_reports_unhealthy
    echo ""

    echo "--- Dockerfile.session ---"
    run_test "Dockerfile exists" test_dockerfile_exists
    run_test "Uses node:20-slim base" test_dockerfile_base_image_node20_slim
    run_test "Not Alpine" test_dockerfile_not_alpine
    run_test "Installs AWS CLI" test_dockerfile_installs_aws_cli
    run_test "Installs Claude Code" test_dockerfile_installs_claude_code
    run_test "Cleans npm cache" test_dockerfile_cleans_npm_cache
    run_test "ENV ANTHROPIC_API_KEY" test_dockerfile_env_anthropic_key
    run_test "ENV SESSION_ID" test_dockerfile_env_session_id
    run_test "ENV HQ_API_URL" test_dockerfile_env_hq_api_url
    run_test "ENV S3_BUCKET" test_dockerfile_env_s3_bucket
    run_test "ENV S3_PREFIX" test_dockerfile_env_s3_prefix
    run_test "ENV S3_REGION" test_dockerfile_env_s3_region
    run_test "ENV CLAUDE_CODE_SESSION_ACCESS_TOKEN" test_dockerfile_env_session_access_token
    run_test "Creates /hq directory" test_dockerfile_creates_hq_dir
    run_test "Copies entrypoint" test_dockerfile_copies_entrypoint
    run_test "Copies healthcheck" test_dockerfile_copies_healthcheck
    run_test "Sets WORKDIR /hq" test_dockerfile_sets_workdir
    run_test "Has HEALTHCHECK" test_dockerfile_has_healthcheck
    run_test "ENTRYPOINT is session-entrypoint.sh" test_dockerfile_entrypoint_session
    run_test "Installs procps" test_dockerfile_installs_procps
    run_test "Installs git" test_dockerfile_installs_git
    echo ""

    echo "=== Test Results ==="
    echo "  Total:  $TESTS_RUN"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    else
        echo "  Failed: $TESTS_FAILED"
    fi
    echo ""

    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
}

main
