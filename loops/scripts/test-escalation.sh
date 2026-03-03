#!/usr/bin/env bash
# test-escalation.sh -- Tests for the escalation policy system
#
# Usage: ./loops/scripts/test-escalation.sh
#
# Tests acceptance criteria:
#   1. escalation.yaml for each company is valid YAML
#   2. check_escalation function returns correct result for each policy type
#   3. check_escalation returns 'ask' for always_ask policy
#   4. check_escalation returns 'autonomous' for autonomous policy
#   5. check_escalation returns correct result for ask_once_then_remember
#   6. check_escalation returns correct result for ask_until_confident
#   7. check_escalation returns 'ask' for unknown actions (safe default)
#   8. check_escalation exits with error for missing company

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GHQ_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECK_ESCALATION="$SCRIPT_DIR/check-escalation.sh"

PASS=0
FAIL=0
TOTAL=0
TEMP_DIR=""

pass() { ((PASS++)); ((TOTAL++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  FAIL: $1 -- $2"; }

# ─────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# Create temp dir for test fixtures
TEMP_DIR=$(mktemp -d)

# ─────────────────────────────────────────────────
# Verify prerequisites
# ─────────────────────────────────────────────────
echo "Checking prerequisites..."

if [[ ! -x "$CHECK_ESCALATION" ]]; then
  echo "Error: check-escalation.sh not found or not executable at $CHECK_ESCALATION" >&2
  exit 1
fi
echo "  check-escalation.sh found"

# Verify python3 is available (used for YAML parsing)
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required" >&2
  exit 1
fi
echo "  python3 available"

# ═════════════════════════════════════════════════
# Test 1: Company escalation.yaml files are valid YAML
# ═════════════════════════════════════════════════
echo ""
echo "Test 1: Company escalation.yaml files are valid YAML"

for company in launch-grid production-house; do
  POLICY_FILE="$GHQ_ROOT/companies/$company/policies/escalation.yaml"
  if [[ ! -f "$POLICY_FILE" ]]; then
    fail "$company/policies/escalation.yaml exists" "file not found"
    continue
  fi

  # Validate YAML using python3
  if python3 -c "import yaml; yaml.safe_load(open('$POLICY_FILE'))" 2>/dev/null; then
    pass "$company/policies/escalation.yaml is valid YAML"
  else
    fail "$company/policies/escalation.yaml is valid YAML" "invalid YAML"
  fi
done

# ═════════════════════════════════════════════════
# Test 2: escalation.yaml contains required policy types
# ═════════════════════════════════════════════════
echo ""
echo "Test 2: escalation.yaml contains expected structure"

for company in launch-grid production-house; do
  POLICY_FILE="$GHQ_ROOT/companies/$company/policies/escalation.yaml"
  if [[ ! -f "$POLICY_FILE" ]]; then
    fail "$company has policies section" "file not found"
    continue
  fi

  # Check that the file has a 'policies' key with action entries
  HAS_POLICIES=$(python3 -c "
import yaml, sys
d = yaml.safe_load(open('$POLICY_FILE'))
if 'policies' in d and isinstance(d['policies'], dict) and len(d['policies']) > 0:
    print('yes')
else:
    print('no')
" 2>/dev/null)

  if [[ "$HAS_POLICIES" == "yes" ]]; then
    pass "$company/escalation.yaml has policies section"
  else
    fail "$company/escalation.yaml has policies section" "missing or empty 'policies' key"
  fi
done

# ═════════════════════════════════════════════════
# Test 3: check_escalation returns 'ask' for always_ask policy
# ═════════════════════════════════════════════════
echo ""
echo "Test 3: check_escalation returns 'ask' for always_ask"

# Create a test escalation.yaml with always_ask
mkdir -p "$TEMP_DIR/companies/test-co/policies"
cat > "$TEMP_DIR/companies/test-co/policies/escalation.yaml" <<'YAML'
default_policy: always_ask
policies:
  deploy:
    type: always_ask
    description: Always ask before deploying
  commit:
    type: autonomous
    description: Commit freely
YAML

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action deploy 2>/dev/null) || true
if [[ "$RESULT" == "ask" ]]; then
  pass "always_ask returns 'ask'"
else
  fail "always_ask returns 'ask'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 4: check_escalation returns 'autonomous' for autonomous policy
# ═════════════════════════════════════════════════
echo ""
echo "Test 4: check_escalation returns 'autonomous' for autonomous"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action commit 2>/dev/null) || true
if [[ "$RESULT" == "autonomous" ]]; then
  pass "autonomous returns 'autonomous'"
else
  fail "autonomous returns 'autonomous'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 5: check_escalation returns 'ask' for ask_once_then_remember (no prior answer)
# ═════════════════════════════════════════════════
echo ""
echo "Test 5: check_escalation returns 'ask' for ask_once_then_remember (no prior)"

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
YAML

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action deploy 2>/dev/null) || true
if [[ "$RESULT" == "ask" ]]; then
  pass "ask_once_then_remember (no prior) returns 'ask'"
else
  fail "ask_once_then_remember (no prior) returns 'ask'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 6: check_escalation returns 'autonomous' for ask_once_then_remember (with prior answer)
# ═════════════════════════════════════════════════
echo ""
echo "Test 6: check_escalation returns 'autonomous' for ask_once_then_remember (with prior)"

# Create a preferences file with a prior answer for 'deploy'
cat > "$TEMP_DIR/companies/test-co/policies/preferences.yaml" <<'YAML'
preferences:
  - action: deploy
    question: "Should I deploy to production?"
    answer: "Yes, deploy freely"
    date: "2026-03-01"
    applies_to: all
YAML

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action deploy 2>/dev/null) || true
if [[ "$RESULT" == "autonomous" ]]; then
  pass "ask_once_then_remember (with prior) returns 'autonomous'"
else
  fail "ask_once_then_remember (with prior) returns 'autonomous'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 7: check_escalation returns 'ask' for ask_until_confident (below threshold)
# ═════════════════════════════════════════════════
echo ""
echo "Test 7: check_escalation returns 'ask' for ask_until_confident (below threshold)"

# Create preferences with only 1 answer for 'refactor' (threshold is 3)
cat > "$TEMP_DIR/companies/test-co/policies/preferences.yaml" <<'YAML'
preferences:
  - action: refactor
    question: "Should I refactor the auth module?"
    answer: "Yes"
    date: "2026-03-01"
    applies_to: all
YAML

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action refactor 2>/dev/null) || true
if [[ "$RESULT" == "ask" ]]; then
  pass "ask_until_confident (below threshold) returns 'ask'"
else
  fail "ask_until_confident (below threshold) returns 'ask'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 8: check_escalation returns 'autonomous' for ask_until_confident (at threshold)
# ═════════════════════════════════════════════════
echo ""
echo "Test 8: check_escalation returns 'autonomous' for ask_until_confident (at threshold)"

# Create preferences with 3 answers for 'refactor' (threshold is 3)
cat > "$TEMP_DIR/companies/test-co/policies/preferences.yaml" <<'YAML'
preferences:
  - action: refactor
    question: "Should I refactor the auth module?"
    answer: "Yes"
    date: "2026-03-01"
    applies_to: all
  - action: refactor
    question: "Should I refactor the payment module?"
    answer: "Yes"
    date: "2026-03-02"
    applies_to: all
  - action: refactor
    question: "Should I refactor the user module?"
    answer: "Yes"
    date: "2026-03-03"
    applies_to: all
YAML

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action refactor 2>/dev/null) || true
if [[ "$RESULT" == "autonomous" ]]; then
  pass "ask_until_confident (at threshold) returns 'autonomous'"
else
  fail "ask_until_confident (at threshold) returns 'autonomous'" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 9: check_escalation returns default_policy for unknown actions
# ═════════════════════════════════════════════════
echo ""
echo "Test 9: check_escalation returns default_policy for unknown actions"

# Remove preferences to test clean fallback
rm -f "$TEMP_DIR/companies/test-co/policies/preferences.yaml"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action unknown_action 2>/dev/null) || true
if [[ "$RESULT" == "ask" ]]; then
  pass "unknown action falls back to default_policy (always_ask -> ask)"
else
  fail "unknown action falls back to default_policy" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Test 10: check_escalation errors for missing company
# ═════════════════════════════════════════════════
echo ""
echo "Test 10: check_escalation errors for missing company"

if GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company nonexistent-co --action deploy 2>/dev/null; then
  fail "missing company exits with error" "exited with 0"
else
  pass "missing company exits with error"
fi

# ═════════════════════════════════════════════════
# Test 11: check_escalation --json outputs valid JSON
# ═════════════════════════════════════════════════
echo ""
echo "Test 11: check_escalation --json outputs valid JSON"

RESULT=$(GHQ_ROOT="$TEMP_DIR" "$CHECK_ESCALATION" --company test-co --action deploy --json 2>/dev/null) || true
if echo "$RESULT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  pass "--json outputs valid JSON"
else
  fail "--json outputs valid JSON" "got '$RESULT'"
fi

# ═════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed (of $TOTAL)"
echo "════════════════════════════════════════"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
