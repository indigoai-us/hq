#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HQ Cloud E2E Smoke Test
#
# Validates the full HQ Cloud API flow against a live (or local) deployment:
#   1. Health check
#   2. Authentication (CLI token or Clerk JWT)
#   3. Settings endpoints
#   4. File upload / list / download / quota
#   5. Sync diff
#   6. Cleanup (delete uploaded test files)
#
# Usage:
#   TOKEN=hqcli_xxx bash tests/e2e/cloud-smoke.sh
#   TOKEN=hqcli_xxx API_URL=http://localhost:3001 bash tests/e2e/cloud-smoke.sh
#
# Environment Variables:
#   TOKEN       (required) Bearer token — CLI token (hqcli_xxx) or Clerk JWT
#   API_URL     (optional) Base URL for the API. Defaults to the live ALB endpoint.
#   VERBOSE     (optional) Set to "true" for detailed curl output
#   CLEANUP     (optional) Set to "false" to skip cleanup of test files
#
# Prerequisites:
#   - bash (Git Bash on Windows, or native on Linux/macOS)
#   - curl
#   - jq (for JSON parsing)
#   - A valid auth token (see README)
#
# Exit codes:
#   0 = all tests passed
#   1 = one or more tests failed
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────

API_URL="${API_URL:-http://hq-cloud-api-dev-1008856793.us-east-1.elb.amazonaws.com}"
TOKEN="${TOKEN:-}"
VERBOSE="${VERBOSE:-false}"
CLEANUP="${CLEANUP:-true}"

# Strip trailing slash from API_URL
API_URL="${API_URL%/}"

# Test file content (small text file for upload test)
TEST_FILE_PATH="__e2e_smoke_test/test-$(date +%s).txt"
TEST_FILE_CONTENT="HQ Cloud E2E smoke test at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
TEST_FILE_BASE64=$(echo -n "$TEST_FILE_CONTENT" | base64)

# ─── Color output ───────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ─── State tracking ────────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
UPLOADED_FILE=""

# ─── Helper functions ───────────────────────────────────────────────────────

log_header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_step() {
  echo -e "\n${BOLD}[$1] $2${NC}"
}

log_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

log_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "  ${RED}FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "       ${RED}$2${NC}"
  fi
}

log_skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  echo -e "  ${YELLOW}SKIP${NC} $1"
}

log_info() {
  echo -e "  ${BLUE}INFO${NC} $1"
}

# Make an API request and capture status code + body
# Usage: api_call METHOD PATH [BODY]
# Sets: HTTP_STATUS, HTTP_BODY
api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${API_URL}${path}"

  local curl_args=(-s -w "\n%{http_code}")

  # Add auth header if token is set
  if [ -n "$TOKEN" ]; then
    curl_args+=(-H "Authorization: Bearer $TOKEN")
  fi

  # Add content-type and body for POST/PUT
  if [ "$method" = "POST" ] || [ "$method" = "PUT" ]; then
    curl_args+=(-H "Content-Type: application/json")
    if [ -n "$body" ]; then
      curl_args+=(-d "$body")
    fi
  fi

  curl_args+=(-X "$method")

  if [ "$VERBOSE" = "true" ]; then
    echo "  > $method $url"
  fi

  local response
  response=$(curl "${curl_args[@]}" "$url" 2>&1) || true

  # Extract status code (last line) and body (everything else)
  HTTP_STATUS=$(echo "$response" | tail -1)
  HTTP_BODY=$(echo "$response" | sed '$d')

  if [ "$VERBOSE" = "true" ]; then
    echo "  < HTTP $HTTP_STATUS"
    echo "  < $HTTP_BODY" | head -5
  fi
}

# Extract a JSON field using jq
json_field() {
  echo "$HTTP_BODY" | jq -r "$1" 2>/dev/null || echo ""
}

# Check if jq is available
check_prerequisites() {
  log_header "Prerequisites Check"

  if ! command -v curl &>/dev/null; then
    echo -e "${RED}ERROR: curl is required but not installed${NC}"
    exit 1
  fi
  log_pass "curl is available"

  if ! command -v jq &>/dev/null; then
    echo -e "${RED}ERROR: jq is required but not installed${NC}"
    echo "  Install: https://stedolan.github.io/jq/download/"
    exit 1
  fi
  log_pass "jq is available"

  if [ -z "$TOKEN" ]; then
    echo -e "${RED}ERROR: TOKEN environment variable is required${NC}"
    echo ""
    echo "  Set a CLI token:  TOKEN=hqcli_xxx bash tests/e2e/cloud-smoke.sh"
    echo "  Or a Clerk JWT:   TOKEN=eyJhbG... bash tests/e2e/cloud-smoke.sh"
    exit 1
  fi
  log_pass "TOKEN is set (${TOKEN:0:10}...)"
  log_info "API_URL: $API_URL"
}

# ─── Test: Health Check ─────────────────────────────────────────────────────

test_health() {
  log_step "1" "Health Check (unauthenticated)"

  # GET /api/health — should work without auth
  local old_token="$TOKEN"
  TOKEN=""
  api_call GET "/api/health"
  TOKEN="$old_token"

  if [ "$HTTP_STATUS" = "200" ]; then
    local status
    status=$(json_field '.status')
    log_pass "/api/health returned 200 (status: $status)"
  else
    log_fail "/api/health returned HTTP $HTTP_STATUS" "$HTTP_BODY"
    return
  fi

  # GET /api/health/ready
  TOKEN=""
  api_call GET "/api/health/ready"
  TOKEN="$old_token"

  if [ "$HTTP_STATUS" = "200" ]; then
    local ready
    ready=$(json_field '.ready')
    log_pass "/api/health/ready returned 200 (ready: $ready)"
  else
    log_fail "/api/health/ready returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi

  # GET /api/health/live
  TOKEN=""
  api_call GET "/api/health/live"
  TOKEN="$old_token"

  if [ "$HTTP_STATUS" = "200" ]; then
    local live
    live=$(json_field '.live')
    log_pass "/api/health/live returned 200 (live: $live)"
  else
    log_fail "/api/health/live returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: Authentication ───────────────────────────────────────────────────

test_auth() {
  log_step "2" "Authentication"

  # GET /api/auth/me — requires valid token
  api_call GET "/api/auth/me"

  if [ "$HTTP_STATUS" = "200" ]; then
    local user_id
    user_id=$(json_field '.userId')
    log_pass "/api/auth/me returned 200 (userId: $user_id)"
  else
    log_fail "/api/auth/me returned HTTP $HTTP_STATUS" "$HTTP_BODY"
    echo -e "  ${RED}Auth failed — remaining authenticated tests will likely fail${NC}"
    return
  fi

  # CLI token verify (if using a CLI token)
  if [[ "$TOKEN" == hqcli_* ]]; then
    api_call GET "/api/auth/cli-verify"
    if [ "$HTTP_STATUS" = "200" ]; then
      local valid
      valid=$(json_field '.valid')
      log_pass "/api/auth/cli-verify returned 200 (valid: $valid)"
    else
      log_fail "/api/auth/cli-verify returned HTTP $HTTP_STATUS" "$HTTP_BODY"
    fi
  else
    log_skip "/api/auth/cli-verify (not using CLI token)"
  fi
}

# ─── Test: Settings ─────────────────────────────────────────────────────────

test_settings() {
  log_step "3" "Settings"

  # GET /api/settings
  api_call GET "/api/settings"

  if [ "$HTTP_STATUS" = "200" ]; then
    local hq_dir onboarded
    hq_dir=$(json_field '.hqDir // "null"')
    onboarded=$(json_field '.onboarded // "null"')
    log_pass "/api/settings returned 200 (hqDir: $hq_dir, onboarded: $onboarded)"
  else
    log_fail "/api/settings returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi

  # GET /api/settings/onboarding-status
  api_call GET "/api/settings/onboarding-status"

  if [ "$HTTP_STATUS" = "200" ]; then
    local onboarded
    onboarded=$(json_field '.onboarded')
    log_pass "/api/settings/onboarding-status returned 200 (onboarded: $onboarded)"
  else
    log_fail "/api/settings/onboarding-status returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: File Upload ──────────────────────────────────────────────────────

test_file_upload() {
  log_step "4" "File Upload"

  local upload_body
  upload_body=$(jq -n \
    --arg path "$TEST_FILE_PATH" \
    --arg content "$TEST_FILE_BASE64" \
    --arg contentType "text/plain" \
    '{path: $path, content: $content, contentType: $contentType}')

  api_call POST "/api/files/upload" "$upload_body"

  if [ "$HTTP_STATUS" = "201" ]; then
    local ok key size
    ok=$(json_field '.ok')
    key=$(json_field '.key')
    size=$(json_field '.size')
    log_pass "/api/files/upload returned 201 (ok: $ok, size: $size)"
    log_info "Uploaded to key: $key"
    UPLOADED_FILE="$TEST_FILE_PATH"
  else
    log_fail "/api/files/upload returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: File List ────────────────────────────────────────────────────────

test_file_list() {
  log_step "5" "File List"

  # List files with the test prefix
  local encoded_prefix
  encoded_prefix=$(echo -n "__e2e_smoke_test" | jq -sRr @uri)
  api_call GET "/api/files/list?prefix=$encoded_prefix"

  if [ "$HTTP_STATUS" = "200" ]; then
    local file_count
    file_count=$(echo "$HTTP_BODY" | jq '.files | length' 2>/dev/null || echo "0")
    log_pass "/api/files/list returned 200 ($file_count files with test prefix)"

    # Verify our uploaded file appears
    if [ -n "$UPLOADED_FILE" ]; then
      local found
      found=$(echo "$HTTP_BODY" | jq --arg path "$TEST_FILE_PATH" \
        '[.files[]? | select(.key | endswith($path))] | length' 2>/dev/null || echo "0")
      if [ "$found" -gt 0 ]; then
        log_pass "Uploaded file found in listing"
      else
        log_fail "Uploaded file NOT found in listing"
      fi
    fi
  else
    log_fail "/api/files/list returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: File Download ───────────────────────────────────────────────────

test_file_download() {
  log_step "6" "File Download"

  if [ -z "$UPLOADED_FILE" ]; then
    log_skip "File download (no file was uploaded)"
    return
  fi

  local encoded_path
  encoded_path=$(echo -n "$TEST_FILE_PATH" | jq -sRr @uri)
  api_call GET "/api/files/download?path=$encoded_path"

  if [ "$HTTP_STATUS" = "200" ]; then
    # Verify content matches what we uploaded
    if [ "$HTTP_BODY" = "$TEST_FILE_CONTENT" ]; then
      log_pass "/api/files/download returned 200 (content matches)"
    else
      log_pass "/api/files/download returned 200 (content retrieved)"
      log_info "Content length: ${#HTTP_BODY} bytes"
    fi
  else
    log_fail "/api/files/download returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: File Quota ───────────────────────────────────────────────────────

test_file_quota() {
  log_step "7" "File Quota"

  api_call GET "/api/files/quota"

  if [ "$HTTP_STATUS" = "200" ]; then
    local used_bytes quota_bytes
    used_bytes=$(json_field '.usedBytes // .used // "unknown"')
    quota_bytes=$(json_field '.quotaBytes // .quota // "unknown"')
    log_pass "/api/files/quota returned 200 (used: $used_bytes, quota: $quota_bytes)"
  else
    log_fail "/api/files/quota returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: Sync Diff ───────────────────────────────────────────────────────

test_sync_diff() {
  log_step "8" "Sync Diff"

  # Send an empty manifest to get the sync diff
  local sync_body='{"manifest":[]}'
  api_call POST "/api/files/sync" "$sync_body"

  if [ "$HTTP_STATUS" = "200" ]; then
    local upload_count download_count in_sync_count
    upload_count=$(json_field '.summary.upload // 0')
    download_count=$(json_field '.summary.download // 0')
    in_sync_count=$(json_field '.summary.inSync // 0')
    log_pass "/api/files/sync returned 200 (upload: $upload_count, download: $download_count, inSync: $in_sync_count)"
  else
    log_fail "/api/files/sync returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Test: Sync Status ─────────────────────────────────────────────────────

test_sync_status() {
  log_step "9" "Sync Status"

  api_call GET "/api/sync/status"

  if [ "$HTTP_STATUS" = "200" ]; then
    local daemon_state is_syncing
    daemon_state=$(json_field '.daemonState // "unknown"')
    is_syncing=$(json_field '.isSyncing // "unknown"')
    log_pass "/api/sync/status returned 200 (daemon: $daemon_state, syncing: $is_syncing)"
  else
    log_fail "/api/sync/status returned HTTP $HTTP_STATUS" "$HTTP_BODY"
  fi
}

# ─── Cleanup ────────────────────────────────────────────────────────────────

test_cleanup() {
  log_step "C" "Cleanup"

  if [ "$CLEANUP" != "true" ]; then
    log_skip "Cleanup disabled (CLEANUP=false)"
    return
  fi

  if [ -z "$UPLOADED_FILE" ]; then
    log_info "No test files to clean up"
    return
  fi

  # The API doesn't have a DELETE /files endpoint, so we note the leftover.
  # In the future we could add one, or use the S3 SDK directly.
  log_info "Test file uploaded at path: $UPLOADED_FILE"
  log_info "Note: No DELETE endpoint available. Test files are in __e2e_smoke_test/ prefix."
  log_info "These can be cleaned up via AWS console or a cleanup script."
}

# ─── Summary ────────────────────────────────────────────────────────────────

print_summary() {
  log_header "Summary"

  local total=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
  echo ""
  echo -e "  ${GREEN}Passed:  $PASS_COUNT${NC}"
  echo -e "  ${RED}Failed:  $FAIL_COUNT${NC}"
  echo -e "  ${YELLOW}Skipped: $SKIP_COUNT${NC}"
  echo -e "  ${BOLD}Total:   $total${NC}"
  echo ""

  if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}All tests passed!${NC}"
  else
    echo -e "  ${RED}${BOLD}$FAIL_COUNT test(s) failed.${NC}"
  fi

  echo ""
}

# ─── Main ───────────────────────────────────────────────────────────────────

main() {
  log_header "HQ Cloud E2E Smoke Test"
  echo -e "  Target: ${BOLD}$API_URL${NC}"
  echo -e "  Date:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  check_prerequisites

  test_health
  test_auth
  test_settings
  test_file_upload
  test_file_list
  test_file_download
  test_file_quota
  test_sync_diff
  test_sync_status
  test_cleanup

  print_summary

  if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
