#!/usr/bin/env bash
# test-bd-extensions.sh -- Tests for bd draft status, decision type, and bd-resolve
#
# Usage: ./loops/scripts/test-bd-extensions.sh
#
# Uses the production beads database with careful cleanup of test issues.
# Test issues use a distinctive prefix in their titles for identification.
#
# Tests acceptance criteria:
#   1. bd create + update --status draft creates a draft task
#   2. bd ready excludes draft tasks
#   3. bd create --type decision creates a decision task
#   4. bd-resolve <id> --answer <text> closes a decision and records the answer
#   5. bd list --status draft shows the draft task

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BD_RESOLVE="$SCRIPT_DIR/bd-resolve.sh"

PASS=0
FAIL=0
TOTAL=0
TEST_IDS=()  # Track created issues for cleanup

pass() { ((PASS++)); ((TOTAL++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  FAIL: $1 -- $2"; }

# ─────────────────────────────────────────────────
# Cleanup: delete all test issues on exit
# ─────────────────────────────────────────────────
cleanup() {
  for id in "${TEST_IDS[@]}"; do
    bd delete "$id" --force 2>/dev/null || true
  done
}
trap cleanup EXIT

# ─────────────────────────────────────────────────
# Verify prerequisites
# ─────────────────────────────────────────────────
echo "Checking prerequisites..."

# Verify draft status is configured
CUSTOM_STATUSES=$(bd config get status.custom 2>/dev/null || echo "")
if ! echo "$CUSTOM_STATUSES" | grep -q "draft"; then
  echo "Error: 'draft' not in status.custom config. Run: bd config set status.custom \"draft\"" >&2
  exit 1
fi
echo "  Custom statuses configured: $CUSTOM_STATUSES"

# ─────────────────────────────────────────────────
# Test 1: Create task and set status to draft
# ─────────────────────────────────────────────────
echo ""
echo "Test 1: bd create + update --status draft creates a draft task"

ID1=$(bd create "BDEXT-TEST draft task" --silent 2>/dev/null)
TEST_IDS+=("$ID1")
bd update "$ID1" --status draft --quiet 2>/dev/null

STATUS=$(bd show "$ID1" --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if isinstance(d,list) else d['status'])")
if [ "$STATUS" = "draft" ]; then
  pass "Task status is 'draft'"
else
  fail "Task status is 'draft'" "got '$STATUS'"
fi

# ─────────────────────────────────────────────────
# Test 2: bd ready excludes draft tasks
# ─────────────────────────────────────────────────
echo ""
echo "Test 2: bd ready excludes draft tasks"

READY_JSON=$(bd ready --json 2>/dev/null)
HAS_DRAFT=$(echo "$READY_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ids = [x['id'] for x in data] if isinstance(data, list) else []
    print('yes' if '$ID1' in ids else 'no')
except:
    print('no')
" 2>/dev/null)

if [ "$HAS_DRAFT" = "no" ]; then
  pass "Draft task excluded from bd ready"
else
  fail "Draft task excluded from bd ready" "found '$ID1' in ready list"
fi

# ─────────────────────────────────────────────────
# Test 3: bd create --type decision creates a decision task
# ─────────────────────────────────────────────────
echo ""
echo "Test 3: bd create --type decision creates a decision task"

ID2=$(bd create "BDEXT-TEST decision" --type decision --silent 2>/dev/null)
TEST_IDS+=("$ID2")
TYPE=$(bd show "$ID2" --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['issue_type'] if isinstance(d,list) else d['issue_type'])")

if [ "$TYPE" = "decision" ]; then
  pass "Issue type is 'decision'"
else
  fail "Issue type is 'decision'" "got '$TYPE'"
fi

# ─────────────────────────────────────────────────
# Test 4: bd-resolve closes decision with recorded answer
# ─────────────────────────────────────────────────
echo ""
echo "Test 4: bd-resolve closes decision and records answer"

ID3=$(bd create "BDEXT-TEST resolve me" --type decision --silent 2>/dev/null)
TEST_IDS+=("$ID3")

"$BD_RESOLVE" "$ID3" --answer "yes, approved" --json 2>/dev/null || true

RESOLVED_STATUS=$(bd show "$ID3" --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if isinstance(d,list) else d['status'])")

if [ "$RESOLVED_STATUS" = "closed" ]; then
  pass "Decision is closed after resolve"
else
  fail "Decision is closed after resolve" "got status '$RESOLVED_STATUS'"
fi

# Check answer is in metadata
ANSWER=$(bd show "$ID3" --json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
d = d[0] if isinstance(d, list) else d
meta = d.get('metadata', {})
print(meta.get('resolution_answer', ''))
" 2>/dev/null)

if [ "$ANSWER" = "yes, approved" ]; then
  pass "Resolution answer recorded in metadata"
else
  fail "Resolution answer recorded in metadata" "got '$ANSWER'"
fi

# ─────────────────────────────────────────────────
# Test 5: bd list --status draft shows draft tasks
# ─────────────────────────────────────────────────
echo ""
echo "Test 5: bd list --status draft shows draft tasks"

LIST_OUTPUT=$(bd list --status draft 2>/dev/null)
if echo "$LIST_OUTPUT" | grep -q "$ID1"; then
  pass "Draft task appears in bd list --status draft"
else
  fail "Draft task appears in bd list --status draft" "not found in output"
fi

# ─────────────────────────────────────────────────
# Test 6: bd-resolve rejects non-decision issues
# ─────────────────────────────────────────────────
echo ""
echo "Test 6: bd-resolve rejects non-decision issues"

ID4=$(bd create "BDEXT-TEST not a decision" --type task --silent 2>/dev/null)
TEST_IDS+=("$ID4")
RESOLVE_EXIT=0
"$BD_RESOLVE" "$ID4" --answer "nope" 2>/dev/null || RESOLVE_EXIT=$?

if [ "$RESOLVE_EXIT" -eq 2 ]; then
  pass "bd-resolve rejects non-decision issue with exit code 2"
else
  fail "bd-resolve rejects non-decision issue with exit code 2" "got exit code $RESOLVE_EXIT"
fi

# ─────────────────────────────────────────────────
# Test 7: bd-resolve rejects already-closed decisions
# ─────────────────────────────────────────────────
echo ""
echo "Test 7: bd-resolve rejects already-closed decisions"

RESOLVE_EXIT2=0
"$BD_RESOLVE" "$ID3" --answer "again" 2>/dev/null || RESOLVE_EXIT2=$?

if [ "$RESOLVE_EXIT2" -eq 3 ]; then
  pass "bd-resolve rejects closed decision with exit code 3"
else
  fail "bd-resolve rejects closed decision with exit code 3" "got exit code $RESOLVE_EXIT2"
fi

# ─────────────────────────────────────────────────
# Results
# ─────────────────────────────────────────────────
echo ""
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
