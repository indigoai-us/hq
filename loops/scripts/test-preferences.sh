#!/usr/bin/env bash
# test-preferences.sh -- Tests for the preference memory system
#
# Usage: ./loops/scripts/test-preferences.sh
#
# Tests acceptance criteria:
#   1. preferences.yaml schema has question/answer/date/applies_to fields
#   2. write-preference.sh writes a preference entry to preferences.yaml
#   3. Preference file is valid YAML after multiple writes
#   4. read-preferences.sh reads preferences for a company/action
#   5. bd-resolve writes preference entry to correct company preferences.yaml
#   6. Confidence counter increments correctly for ask_until_confident
#   7. ask_once_then_remember finds prior preference after write

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GHQ_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WRITE_PREF="$SCRIPT_DIR/write-preference.sh"
READ_PREF="$SCRIPT_DIR/read-preferences.sh"
CHECK_ESCALATION="$SCRIPT_DIR/check-escalation.sh"

PASS=0
FAIL=0
TOTAL=0
TEMP_DIR=""

pass() { ((PASS++)); ((TOTAL++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  FAIL: $1 -- $2"; }

# -------------------------------------------------
# Cleanup
# -------------------------------------------------
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

TEMP_DIR=$(mktemp -d)

# -------------------------------------------------
# Verify prerequisites
# -------------------------------------------------
echo "Checking prerequisites..."

if [[ ! -x "$WRITE_PREF" ]]; then
  echo "Error: write-preference.sh not found or not executable at $WRITE_PREF" >&2
  exit 1
fi
echo "  write-preference.sh found"

if [[ ! -x "$READ_PREF" ]]; then
  echo "Error: read-preferences.sh not found or not executable at $READ_PREF" >&2
  exit 1
fi
echo "  read-preferences.sh found"

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required" >&2
  exit 1
fi
echo "  python3 available"

# Create test company structure
mkdir -p "$TEMP_DIR/companies/test-co/policies"
cat > "$TEMP_DIR/companies/test-co/policies/escalation.yaml" <<'YAML'
default_policy: always_ask
policies:
  deploy:
    type: ask_once_then_remember
    description: Ask once, then remember the answer
  refactor:
    type: ask_until_confident
    description: Ask until confident
    confidence_threshold: 3
  commit:
    type: autonomous
    description: Commit freely
YAML

# =============================================
# Test 1: write-preference.sh creates a valid preference entry
# =============================================
echo ""
echo "Test 1: write-preference.sh creates a valid preference entry"

GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company test-co \
  --action deploy \
  --question "Should I deploy to production?" \
  --answer "Yes, deploy freely" \
  --applies-to all 2>/dev/null

PREFS_FILE="$TEMP_DIR/companies/test-co/policies/preferences.yaml"
if [[ -f "$PREFS_FILE" ]]; then
  pass "preferences.yaml created"
else
  fail "preferences.yaml created" "file not found"
fi

# =============================================
# Test 2: preferences.yaml is valid YAML
# =============================================
echo ""
echo "Test 2: preferences.yaml is valid YAML"

if python3 -c "import yaml; yaml.safe_load(open('$PREFS_FILE'))" 2>/dev/null; then
  pass "preferences.yaml is valid YAML"
else
  fail "preferences.yaml is valid YAML" "invalid YAML"
fi

# =============================================
# Test 3: preference entry has required schema fields
# =============================================
echo ""
echo "Test 3: preference entry has required schema fields"

HAS_FIELDS=$(python3 -c "
import yaml, sys
with open('$PREFS_FILE') as f:
    data = yaml.safe_load(f)
prefs = data.get('preferences', [])
if not prefs:
    print('no_prefs')
    sys.exit(0)
p = prefs[0]
required = ['action', 'question', 'answer', 'date', 'applies_to']
missing = [f for f in required if f not in p]
if missing:
    print('missing:' + ','.join(missing))
else:
    print('ok')
" 2>/dev/null)

if [[ "$HAS_FIELDS" == "ok" ]]; then
  pass "preference entry has all required fields (action, question, answer, date, applies_to)"
else
  fail "preference entry has all required fields" "got '$HAS_FIELDS'"
fi

# =============================================
# Test 4: Multiple writes produce valid YAML
# =============================================
echo ""
echo "Test 4: Multiple writes produce valid YAML"

GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company test-co \
  --action refactor \
  --question "Should I refactor the auth module?" \
  --answer "Yes" \
  --applies-to backend 2>/dev/null

GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company test-co \
  --action refactor \
  --question "Should I refactor the payment module?" \
  --answer "Yes" \
  --applies-to backend 2>/dev/null

VALID=$(python3 -c "
import yaml
with open('$PREFS_FILE') as f:
    data = yaml.safe_load(f)
prefs = data.get('preferences', [])
print(len(prefs))
" 2>/dev/null)

if [[ "$VALID" == "3" ]]; then
  pass "3 preferences written, file still valid YAML"
else
  fail "3 preferences written" "got $VALID entries"
fi

# =============================================
# Test 5: read-preferences.sh reads preferences for a company/action
# =============================================
echo ""
echo "Test 5: read-preferences.sh reads preferences for a company/action"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$READ_PREF" --company test-co --action deploy --json 2>/dev/null) || true

HAS_ANSWER=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
prefs = data.get('preferences', [])
if prefs and prefs[0].get('answer') == 'Yes, deploy freely':
    print('ok')
else:
    print('no')
" 2>/dev/null)

if [[ "$HAS_ANSWER" == "ok" ]]; then
  pass "read-preferences returns correct preference for action"
else
  fail "read-preferences returns correct preference" "got '$RESULT'"
fi

# =============================================
# Test 6: read-preferences.sh returns empty for unknown action
# =============================================
echo ""
echo "Test 6: read-preferences.sh returns empty for unknown action"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$READ_PREF" --company test-co --action unknown_action --json 2>/dev/null) || true

COUNT=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data.get('preferences', [])))
" 2>/dev/null)

if [[ "$COUNT" == "0" ]]; then
  pass "unknown action returns 0 preferences"
else
  fail "unknown action returns 0 preferences" "got $COUNT"
fi

# =============================================
# Test 7: ask_once_then_remember sees preference after write
# =============================================
echo ""
echo "Test 7: ask_once_then_remember returns 'autonomous' after preference write"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action deploy 2>/dev/null) || true
if [[ "$RESULT" == "autonomous" ]]; then
  pass "ask_once_then_remember returns 'autonomous' after write-preference"
else
  fail "ask_once_then_remember returns 'autonomous'" "got '$RESULT'"
fi

# =============================================
# Test 8: ask_until_confident below threshold still returns 'ask'
# =============================================
echo ""
echo "Test 8: ask_until_confident below threshold still returns 'ask'"

# We have 2 refactor entries (threshold is 3)
RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action refactor 2>/dev/null) || true
if [[ "$RESULT" == "ask" ]]; then
  pass "ask_until_confident (2 of 3) returns 'ask'"
else
  fail "ask_until_confident (2 of 3) returns 'ask'" "got '$RESULT'"
fi

# =============================================
# Test 9: ask_until_confident at threshold returns 'autonomous'
# =============================================
echo ""
echo "Test 9: ask_until_confident at threshold returns 'autonomous'"

GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company test-co \
  --action refactor \
  --question "Should I refactor the user module?" \
  --answer "Yes" \
  --applies-to backend 2>/dev/null

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action refactor 2>/dev/null) || true
if [[ "$RESULT" == "autonomous" ]]; then
  pass "ask_until_confident (3 of 3) returns 'autonomous'"
else
  fail "ask_until_confident (3 of 3) returns 'autonomous'" "got '$RESULT'"
fi

# =============================================
# Test 10: write-preference.sh errors for missing company
# =============================================
echo ""
echo "Test 10: write-preference.sh errors for missing company"

if GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company nonexistent-co \
  --action deploy \
  --question "test" \
  --answer "test" \
  --applies-to all 2>/dev/null; then
  fail "missing company exits with error" "exited with 0"
else
  pass "missing company exits with error"
fi

# =============================================
# Test 11: read-preferences.sh --count returns correct count
# =============================================
echo ""
echo "Test 11: read-preferences.sh --count returns correct count"

COUNT=$(GHQ_ROOT="$TEMP_DIR" "$READ_PREF" --company test-co --action refactor --count 2>/dev/null) || true
if [[ "$COUNT" == "3" ]]; then
  pass "count returns 3 for refactor action"
else
  fail "count returns 3 for refactor action" "got '$COUNT'"
fi

# =============================================
# Test 12: write-preference.sh with --decision-id records it
# =============================================
echo ""
echo "Test 12: write-preference.sh with --decision-id records decision reference"

GHQ_ROOT="$TEMP_DIR" "$WRITE_PREF" \
  --company test-co \
  --action push \
  --question "Should I push to remote?" \
  --answer "Yes, always push" \
  --applies-to all \
  --decision-id ghq-test-dec1 2>/dev/null

HAS_DEC_ID=$(python3 -c "
import yaml
with open('$PREFS_FILE') as f:
    data = yaml.safe_load(f)
prefs = data.get('preferences', [])
push_prefs = [p for p in prefs if p.get('action') == 'push']
if push_prefs and push_prefs[0].get('decision_id') == 'ghq-test-dec1':
    print('ok')
else:
    print('no')
" 2>/dev/null)

if [[ "$HAS_DEC_ID" == "ok" ]]; then
  pass "decision_id recorded in preference entry"
else
  fail "decision_id recorded in preference entry" "got '$HAS_DEC_ID'"
fi

# =============================================
# Summary
# =============================================
echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed (of $TOTAL)"
echo "========================================"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
