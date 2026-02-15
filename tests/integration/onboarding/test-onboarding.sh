#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Clean-room onboarding integration test
#
# Runs inside Docker. Tests the full onboarding flow:
#   create-hq → cloud setup-token → cloud upload → sync push → sync status → sync pull
#
# Exit 0 = all tests passed, Exit 1 = failures
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: $1"
}

assert_file_exists() {
  if [ -f "$1" ]; then
    pass "$2"
  else
    fail "$2 (file not found: $1)"
  fi
}

assert_dir_exists() {
  if [ -d "$1" ]; then
    pass "$2"
  else
    fail "$2 (dir not found: $1)"
  fi
}

echo "=== HQ Onboarding Clean Room Test ==="
echo ""

# ─── Phase 1: Start mock API ────────────────────────────────────────────────

echo "--- Phase 1: Starting mock API ---"
node /test/mock-api.mjs &
MOCK_PID=$!

# Wait for the mock API to become available
for i in $(seq 1 30); do
  if curl -s http://localhost:3333/api/files/quota -H "Authorization: Bearer test" > /dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

# Verify it's running
if curl -s http://localhost:3333/api/files/quota -H "Authorization: Bearer test" > /dev/null 2>&1; then
  pass "Mock API started on port 3333"
else
  fail "Mock API failed to start"
  echo "Results: 0/$TOTAL passed"
  exit 1
fi

# ─── Phase 2: Pre-seed credentials ──────────────────────────────────────────

echo "--- Phase 2: Pre-seeding credentials ---"

export HQ_CONFIG_HOME="/root"
export HQ_CLOUD_API_URL="http://localhost:3333"

mkdir -p /root/.hq
cp /test/fixtures/credentials.json /root/.hq/credentials.json

if [ -f /root/.hq/credentials.json ]; then
  pass "Credentials pre-seeded"
else
  fail "Credentials file missing"
fi

# ─── Phase 3: Test create-hq ────────────────────────────────────────────────

echo "--- Phase 3: Testing create-hq ---"
cd /workspace

# Run create-hq with all interactive prompts skipped
create-hq my-hq --skip-deps --skip-cli --skip-cloud 2>&1 || true

assert_dir_exists  "/workspace/my-hq"             "HQ directory scaffolded"
assert_file_exists "/workspace/my-hq/.claude/CLAUDE.md" "CLAUDE.md exists"
assert_file_exists "/workspace/my-hq/workers/registry.yaml" "Workers registry exists"
assert_dir_exists  "/workspace/my-hq/projects"     "Projects directory exists"

# ─── Phase 4: Test hq cloud setup-token ─────────────────────────────────────

echo "--- Phase 4: Testing cloud setup-token ---"

# Pipe a token value into the interactive prompt
echo "test-oauth-token-abcdefghijklmnop-for-integration" | hq cloud setup-token 2>&1 || true

# Verify the mock API received and stored the token
TOKEN_CHECK=$(curl -s http://localhost:3333/api/settings/claude-token \
  -H "Authorization: Bearer test-clerk-jwt-token-for-integration-testing")

HAS_TOKEN=$(echo "$TOKEN_CHECK" | jq -r '.hasToken')
if [ "$HAS_TOKEN" = "true" ]; then
  pass "Claude token stored via setup-token"
else
  fail "Claude token not stored (hasToken=$HAS_TOKEN)"
fi

# ─── Phase 5: Test hq cloud upload ──────────────────────────────────────────

echo "--- Phase 5: Testing cloud upload ---"
cd /workspace/my-hq

hq cloud upload --on-conflict merge --hq-root /workspace/my-hq 2>&1 || true

# Check the mock API has files
FILE_LIST=$(curl -s http://localhost:3333/api/files/list \
  -H "Authorization: Bearer test-clerk-jwt-token-for-integration-testing")

FILE_COUNT=$(echo "$FILE_LIST" | jq '.files | length')
if [ "$FILE_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Files uploaded to cloud ($FILE_COUNT files)"
else
  fail "No files uploaded (count=$FILE_COUNT)"
fi

# ─── Phase 6: Test hq sync push ─────────────────────────────────────────────

echo "--- Phase 6: Testing sync push ---"

# Create a new file to push
echo "# Test Push Content" > /workspace/my-hq/test-push-file.md

cd /workspace/my-hq
hq sync push 2>&1 || true

# Verify the new file was uploaded
FILE_LIST_AFTER=$(curl -s http://localhost:3333/api/files/list \
  -H "Authorization: Bearer test-clerk-jwt-token-for-integration-testing")

if echo "$FILE_LIST_AFTER" | jq -r '.files[]' | grep -q "test-push-file.md"; then
  pass "Sync push uploaded new file"
else
  fail "Sync push did not upload test-push-file.md"
fi

# ─── Phase 7: Test hq sync status ───────────────────────────────────────────

echo "--- Phase 7: Testing sync status ---"
cd /workspace/my-hq

STATUS_OUTPUT=$(hq sync status 2>&1) || true

if echo "$STATUS_OUTPUT" | grep -qi "last sync"; then
  pass "Sync status shows last sync info"
else
  fail "Sync status missing 'Last sync' (output: $STATUS_OUTPUT)"
fi

# ─── Phase 8: Test hq sync pull ─────────────────────────────────────────────

echo "--- Phase 8: Testing sync pull ---"

# Inject a file directly into the mock API
PULL_CONTENT=$(echo -n "pulled-from-cloud" | base64)
curl -s -X POST http://localhost:3333/api/files/upload \
  -H "Authorization: Bearer test-clerk-jwt-token-for-integration-testing" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"cloud-injected-file.md\",\"content\":\"$PULL_CONTENT\",\"size\":17}" > /dev/null

cd /workspace/my-hq
hq sync pull 2>&1 || true

if [ -f /workspace/my-hq/cloud-injected-file.md ]; then
  pass "Sync pull downloaded remote file"
else
  fail "Sync pull did not create cloud-injected-file.md"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS/$TOTAL passed"

# Cleanup
kill $MOCK_PID 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo "FAILED: $FAIL test(s) failed"
  exit 1
else
  echo "PASSED: Onboarding integration test"
  exit 0
fi
