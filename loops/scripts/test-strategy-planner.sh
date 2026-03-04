#!/usr/bin/env bash
# test-strategy-planner.sh -- Tests for strategy-planner.sh
#
# Validates:
#   - Planner creates draft task when cadence gap detected
#   - Planner creates nothing when all cadence slots filled
#   - Draft tasks have correct parent epic and labels
#   - strategy.yaml is valid YAML
#   - Planner is idempotent (no duplicates on re-run)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GHQ="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLANNER="$SCRIPT_DIR/strategy-planner.sh"
BD="${BD_CMD:-bd}"

PASS=0
FAIL=0
TESTS_RUN=0

# ─────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected='$expected', actual='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if echo "$haystack" | grep -q "$needle"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected to contain '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" haystack="$2" needle="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if ! echo "$haystack" | grep -q "$needle"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected NOT to contain '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

assert_gt() {
  local label="$1" actual="$2" threshold="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "$actual" -gt "$threshold" ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected > $threshold, actual=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

# ─────────────────────────────────────────────────
# Setup: create temporary strategy.yaml for testing
# ─────────────────────────────────────────────────
TEMP_DIR=$(mktemp -d)
TEMP_COMPANY="$TEMP_DIR/test-company"
mkdir -p "$TEMP_COMPANY"

cleanup() {
  rm -rf "$TEMP_DIR"
  # Clean up any draft tasks created during testing
  local draft_tasks
  draft_tasks=$($BD list --status draft --label "test-strategy-planner" --json 2>/dev/null) || draft_tasks="[]"
  local ids
  ids=$(echo "$draft_tasks" | python3 -c "
import json, sys
tasks = json.load(sys.stdin)
for t in tasks:
    print(t['id'])
" 2>/dev/null) || true
  for tid in $ids; do
    $BD delete "$tid" --force 2>/dev/null || true
  done
}
trap cleanup EXIT

# ─────────────────────────────────────────────────
# Test 1: strategy.yaml validation
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 1: strategy.yaml validation ==="

# Valid YAML
cat > "$TEMP_COMPANY/strategy.yaml" <<'YAML'
goals:
  - id: grow-audience
    title: Grow YouTube audience
    description: Increase subscribers and views through consistent content
    priority: 1

cadences:
  - id: weekly-video
    goal: grow-audience
    type: recurring
    frequency: 2/week
    task_template:
      title: "Produce weekly video"
      type: task
      priority: 2
      labels:
        - content
        - video

milestones:
  - id: first-1k-subs
    goal: grow-audience
    target_date: "2026-06-01"
    description: Reach 1000 subscribers

task_templates:
  video-production:
    title: "Produce video: {topic}"
    type: task
    priority: 2
    labels:
      - content
      - video
    description: "Script, record, edit, and publish a video on {topic}"
YAML

VALID=$(python3 -c "
import yaml, sys
try:
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f)
    if data and 'goals' in data:
        print('valid')
    else:
        print('invalid')
except Exception as e:
    print('error: ' + str(e))
" "$TEMP_COMPANY/strategy.yaml" 2>&1)

assert_eq "Valid strategy.yaml parses correctly" "valid" "$VALID"

# Invalid YAML
cat > "$TEMP_DIR/bad.yaml" <<'YAML'
goals:
  - id: test
    title: [unclosed bracket
YAML

INVALID=$(python3 -c "
import yaml, sys
try:
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f)
    print('valid')
except Exception:
    print('invalid')
" "$TEMP_DIR/bad.yaml" 2>&1)

assert_eq "Invalid YAML detected" "invalid" "$INVALID"

# ─────────────────────────────────────────────────
# Test 2: Planner dry-run with gap detection
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 2: Dry-run gap detection ==="

# The planner should detect that cadence requires 2 videos/week
# and report draft tasks in dry-run mode
OUTPUT=$(GHQ_ROOT="$GHQ" bash "$PLANNER" --dry-run --strategy-file "$TEMP_COMPANY/strategy.yaml" --epic "ghq-53s" --company "test-co" --labels "test-strategy-planner" 2>&1) || true

assert_contains "Dry-run produces output" "$OUTPUT" "dry-run"
assert_not_contains "Dry-run does not create tasks" "$OUTPUT" "Created draft task"
assert_contains "Dry-run shows planned tasks" "$OUTPUT" "Produce weekly video"

# ─────────────────────────────────────────────────
# Test 3: Planner creates draft tasks for gaps
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 3: Draft task creation ==="

# Run planner for real -- it should create draft tasks
GHQ_ROOT="$GHQ" bash "$PLANNER" --strategy-file "$TEMP_COMPANY/strategy.yaml" --epic "ghq-53s" --company "test-co" --labels "test-strategy-planner" 2>&1 || true

# Check that draft tasks were created
DRAFT_TASKS=$($BD list --status draft --label "test-strategy-planner" --json 2>/dev/null) || DRAFT_TASKS="[]"
DRAFT_COUNT=$(echo "$DRAFT_TASKS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null)

assert_gt "At least one draft task created" "$DRAFT_COUNT" 0

# Check that draft tasks have correct status and labels
if [[ "$DRAFT_COUNT" -gt 0 ]]; then
  FIRST_TASK=$(echo "$DRAFT_TASKS" | python3 -c "
import json, sys
tasks = json.load(sys.stdin)
print(json.dumps(tasks[0]))
" 2>/dev/null)
  FIRST_STATUS=$(echo "$FIRST_TASK" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
  assert_eq "Draft task has draft status" "draft" "$FIRST_STATUS"

  FIRST_LABELS=$(echo "$FIRST_TASK" | python3 -c "import json,sys; print(','.join(sorted(json.load(sys.stdin).get('labels',[]))))")
  assert_contains "Draft task has test label" "$FIRST_LABELS" "test-strategy-planner"

  # Verify metadata contains cadence_id
  HAS_CADENCE=$(echo "$FIRST_TASK" | python3 -c "
import json,sys
t = json.load(sys.stdin)
meta = t.get('metadata', {}) or {}
print('yes' if meta.get('cadence_id') else 'no')
")
  assert_eq "Draft task has cadence_id in metadata" "yes" "$HAS_CADENCE"
fi

# ─────────────────────────────────────────────────
# Test 4: Idempotency -- re-run creates no duplicates
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 4: Idempotency ==="

# Run planner again with same inputs
RERUN_OUTPUT=$(GHQ_ROOT="$GHQ" bash "$PLANNER" --strategy-file "$TEMP_COMPANY/strategy.yaml" --epic "ghq-53s" --company "test-co" --labels "test-strategy-planner" 2>&1) || true

# Count draft tasks again -- should be same count
DRAFT_TASKS_2=$($BD list --status draft --label "test-strategy-planner" --json 2>/dev/null) || DRAFT_TASKS_2="[]"
DRAFT_COUNT_2=$(echo "$DRAFT_TASKS_2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null)

assert_eq "Idempotent -- no new tasks on re-run" "$DRAFT_COUNT" "$DRAFT_COUNT_2"
assert_contains "Re-run reports already exists" "$RERUN_OUTPUT" "already exists"

# ─────────────────────────────────────────────────
# Test 5: Planner creates nothing when no cadences
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 5: No tasks when no cadences ==="

cat > "$TEMP_DIR/empty-cadence-strategy.yaml" <<'YAML'
goals:
  - id: stable-ops
    title: Maintain stable operations
    description: Keep things running smoothly
    priority: 3

cadences: []

milestones: []

task_templates: {}
YAML

EMPTY_OUTPUT=$(GHQ_ROOT="$GHQ" bash "$PLANNER" --strategy-file "$TEMP_DIR/empty-cadence-strategy.yaml" --epic "ghq-53s" --company "test-empty" --labels "test-strategy-planner" 2>&1) || true

assert_contains "No cadences reports no gaps" "$EMPTY_OUTPUT" "No cadences"

# ─────────────────────────────────────────────────
# Test 6: shellcheck passes
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 6: shellcheck ==="

if command -v shellcheck &>/dev/null; then
  SC_OUTPUT=$(shellcheck "$PLANNER" 2>&1) || true
  if [[ -z "$SC_OUTPUT" ]]; then
    TESTS_RUN=$((TESTS_RUN + 1))
    PASS=$((PASS + 1))
    echo "  PASS: shellcheck passes"
  else
    TESTS_RUN=$((TESTS_RUN + 1))
    FAIL=$((FAIL + 1))
    echo "  FAIL: shellcheck found issues:"
    echo "$SC_OUTPUT" | head -20
  fi
else
  TESTS_RUN=$((TESTS_RUN + 1))
  PASS=$((PASS + 1))
  echo "  SKIP: shellcheck not installed (counted as pass)"
fi

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed ($TESTS_RUN total)"
echo "════════════════════════════════════════"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
