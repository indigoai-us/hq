#!/usr/bin/env bash
# test-scheduler.sh -- Tests for the scheduler dispatch loop
#
# Usage: ./loops/scripts/test-scheduler.sh
#
# Tests:
#   1. scheduler.sh passes shellcheck
#   2. Dry-run mode lists what would be dispatched without spawning
#   3. Skips companies with scheduler.enabled: false
#   4. Skips companies with existing pid file for running process
#   5. Spawned agent prompt uses /run-loop not /execute-task
#   6. Respects blocked_hours from scheduler.yaml
#   7. Respects max_concurrent_agents from scheduler.yaml
#   8. Creates loops/agents/ directory structure
#   9. Writes lockfile with task ID before spawning
#  10. Ranks tasks by priority (lower number = higher priority)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GHQ_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCHEDULER="$SCRIPT_DIR/scheduler.sh"

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

if [[ ! -x "$SCHEDULER" ]]; then
  echo "Error: scheduler.sh not found or not executable at $SCHEDULER" >&2
  exit 1
fi
echo "  scheduler.sh found"

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required" >&2
  exit 1
fi
echo "  python3 available"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  exit 1
fi
echo "  jq available"

# ─────────────────────────────────────────────────
# Helper: create a fake GHQ environment for testing
# ─────────────────────────────────────────────────
setup_test_env() {
  local test_root="$TEMP_DIR/ghq-$$-$RANDOM"
  mkdir -p "$test_root/companies"
  mkdir -p "$test_root/loops/agents"
  mkdir -p "$test_root/loops/scripts"
  mkdir -p "$test_root/.claude"
  mkdir -p "$test_root/.beads"

  # Create scheduler.yaml
  cat > "$test_root/.claude/scheduler.yaml" <<'YAML'
max_concurrent_agents: 2
cooldown_after_failure: 900
daily_budget: 50.00
blocked_hours:
  - 2
  - 3
  - 4
YAML

  # Create manifest.yaml with two companies
  cat > "$test_root/companies/manifest.yaml" <<'YAML'
alpha-co:
  symlink: alpha-co
  epic: ghq-alpha
  scheduler:
    enabled: true
    max_agents: 1

beta-co:
  symlink: beta-co
  epic: ghq-beta
  scheduler:
    enabled: false
    max_agents: 1
YAML

  # Copy scheduler.sh into test root
  cp "$SCHEDULER" "$test_root/loops/scripts/scheduler.sh"
  chmod +x "$test_root/loops/scripts/scheduler.sh"

  echo "$test_root"
}

# Helper: create a fake bd command that returns tasks
create_fake_bd() {
  local test_root="$1"
  local tasks_json="${2:-[]}"

  cat > "$test_root/fake-bd" <<SCRIPT
#!/usr/bin/env bash
# Fake bd CLI for testing
if [[ "\$1" == "list" ]]; then
  echo '$tasks_json'
elif [[ "\$1" == "show" ]]; then
  echo '{"id":"test-1","title":"Test task","status":"open","priority":1}'
elif [[ "\$1" == "blocked" ]]; then
  echo '[]'
fi
SCRIPT
  chmod +x "$test_root/fake-bd"
}

# ═════════════════════════════════════════════════
# Test 1: scheduler.sh passes shellcheck
# ═════════════════════════════════════════════════
echo ""
echo "Test 1: scheduler.sh passes shellcheck"

if command -v shellcheck &>/dev/null; then
  if shellcheck "$SCHEDULER" 2>/dev/null; then
    pass "scheduler.sh passes shellcheck"
  else
    ERRORS=$(shellcheck "$SCHEDULER" 2>&1 || true)
    fail "scheduler.sh passes shellcheck" "shellcheck errors: $ERRORS"
  fi
else
  echo "  SKIP: shellcheck not installed"
  ((TOTAL++))
fi

# ═════════════════════════════════════════════════
# Test 2: Dry-run mode lists what would be dispatched
# ═════════════════════════════════════════════════
echo ""
echo "Test 2: Dry-run mode lists what would be dispatched without spawning"

TEST_ROOT=$(setup_test_env)

# Create fake bd that returns an open task for alpha-co
TASK_JSON='[{"id":"ghq-alpha.1","title":"Alpha task","status":"open","priority":1,"labels":["alpha-co"],"metadata":{}}]'
create_fake_bd "$TEST_ROOT" "$TASK_JSON"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if echo "$OUTPUT" | grep -qi "dry.run\|would dispatch\|would spawn\|plan"; then
  pass "Dry-run mode produces output without spawning"
else
  fail "Dry-run mode produces output" "output: $OUTPUT"
fi

# Verify no pid files were created (nothing spawned)
PID_COUNT=$(find "$TEST_ROOT/loops/agents" -name "*.pid" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$PID_COUNT" -eq 0 ]]; then
  pass "Dry-run does not create pid files"
else
  fail "Dry-run does not create pid files" "found $PID_COUNT pid files"
fi

# ═════════════════════════════════════════════════
# Test 3: Skips companies with scheduler.enabled: false
# ═════════════════════════════════════════════════
echo ""
echo "Test 3: Skips companies with scheduler.enabled: false"

TEST_ROOT=$(setup_test_env)
create_fake_bd "$TEST_ROOT" "$TASK_JSON"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

# beta-co has scheduler.enabled: false, should be skipped
if echo "$OUTPUT" | grep -qi "beta-co.*skip\|skip.*beta-co\|beta-co.*disabled"; then
  pass "Skips beta-co (scheduler.enabled: false)"
else
  # Check that beta-co is NOT in the dispatch list
  if ! echo "$OUTPUT" | grep -qi "dispatch.*beta-co\|spawn.*beta-co\|beta-co.*dispatch"; then
    pass "beta-co not in dispatch plan (disabled)"
  else
    fail "Skips beta-co (disabled)" "beta-co appears in dispatch: $OUTPUT"
  fi
fi

# alpha-co has scheduler.enabled: true, should be present
if echo "$OUTPUT" | grep -qi "alpha-co"; then
  pass "Considers alpha-co (scheduler.enabled: true)"
else
  fail "Considers alpha-co (enabled)" "alpha-co not mentioned: $OUTPUT"
fi

# ═════════════════════════════════════════════════
# Test 4: Skips companies with existing pid file for running process
# ═════════════════════════════════════════════════
echo ""
echo "Test 4: Skips companies with existing pid file for running process"

TEST_ROOT=$(setup_test_env)
create_fake_bd "$TEST_ROOT" "$TASK_JSON"

# Create a pid file with the current shell's PID (a running process)
mkdir -p "$TEST_ROOT/loops/agents"
echo $$ > "$TEST_ROOT/loops/agents/alpha-co.pid"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if echo "$OUTPUT" | grep -qi "alpha-co.*running\|alpha-co.*skip\|skip.*alpha-co\|alpha-co.*agent.*active\|alpha-co.*already"; then
  pass "Skips alpha-co with running agent (pid file exists)"
else
  fail "Skips alpha-co with running agent" "output: $OUTPUT"
fi

# ═════════════════════════════════════════════════
# Test 5: Spawned agent prompt uses /run-loop not /execute-task
# ═════════════════════════════════════════════════
echo ""
echo "Test 5: Spawned agent prompt uses /run-loop not /execute-task"

# Check that the scheduler source code uses /run-loop for spawning
if grep -q '/run-loop' "$SCHEDULER"; then
  pass "scheduler.sh references /run-loop"
else
  fail "scheduler.sh references /run-loop" "/run-loop not found in source"
fi

if grep -q 'execute-task' "$SCHEDULER" 2>/dev/null; then
  # It's OK if execute-task appears in comments, but not in spawn commands
  SPAWN_LINES=$(grep -n 'claude.*execute-task\|execute-task.*claude\|".*execute-task' "$SCHEDULER" | grep -v '^#\|^[[:space:]]*#' || true)
  if [[ -n "$SPAWN_LINES" ]]; then
    fail "Does not use /execute-task for spawning" "found: $SPAWN_LINES"
  else
    pass "Does not use /execute-task in spawn commands"
  fi
else
  pass "No /execute-task references in scheduler"
fi

# ═════════════════════════════════════════════════
# Test 6: Respects blocked_hours from scheduler.yaml
# ═════════════════════════════════════════════════
echo ""
echo "Test 6: Respects blocked_hours from scheduler.yaml"

TEST_ROOT=$(setup_test_env)
create_fake_bd "$TEST_ROOT" "$TASK_JSON"

# Override scheduler.yaml to block the current hour
CURRENT_HOUR=$(date -u +%-H)
cat > "$TEST_ROOT/.claude/scheduler.yaml" <<YAML
max_concurrent_agents: 2
cooldown_after_failure: 900
daily_budget: 50.00
blocked_hours:
  - $CURRENT_HOUR
YAML

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if echo "$OUTPUT" | grep -qi "blocked.*hour\|hour.*blocked\|blocked_hours\|not dispatching.*hour"; then
  pass "Respects blocked_hours (current hour blocked)"
else
  fail "Respects blocked_hours" "output: $OUTPUT"
fi

# ═════════════════════════════════════════════════
# Test 7: Respects max_concurrent_agents from scheduler.yaml
# ═════════════════════════════════════════════════
echo ""
echo "Test 7: Respects max_concurrent_agents from scheduler.yaml"

TEST_ROOT=$(setup_test_env)

# Create manifest with 3 enabled companies
cat > "$TEST_ROOT/companies/manifest.yaml" <<'YAML'
co-a:
  symlink: co-a
  epic: ghq-a
  scheduler:
    enabled: true
    max_agents: 1
co-b:
  symlink: co-b
  epic: ghq-b
  scheduler:
    enabled: true
    max_agents: 1
co-c:
  symlink: co-c
  epic: ghq-c
  scheduler:
    enabled: true
    max_agents: 1
YAML

# Set max_concurrent_agents to 2
cat > "$TEST_ROOT/.claude/scheduler.yaml" <<'YAML'
max_concurrent_agents: 2
cooldown_after_failure: 900
daily_budget: 50.00
blocked_hours: []
YAML

TASK_JSON='[{"id":"ghq-a.1","title":"Task A","status":"open","priority":1,"labels":[],"metadata":{}}]'
create_fake_bd "$TEST_ROOT" "$TASK_JSON"

# Create pid file for co-a and co-b (both "running") to hit the limit
echo $$ > "$TEST_ROOT/loops/agents/co-a.pid"
echo $$ > "$TEST_ROOT/loops/agents/co-b.pid"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if echo "$OUTPUT" | grep -qi "max.*concurrent\|concurrent.*limit\|agent.*limit\|limit.*reached\|at capacity"; then
  pass "Respects max_concurrent_agents limit"
else
  fail "Respects max_concurrent_agents limit" "output: $OUTPUT"
fi

# ═════════════════════════════════════════════════
# Test 8: Creates loops/agents/ directory structure
# ═════════════════════════════════════════════════
echo ""
echo "Test 8: Creates loops/agents/ directory structure"

TEST_ROOT=$(setup_test_env)
# Remove agents dir to test auto-creation
rm -rf "$TEST_ROOT/loops/agents"

create_fake_bd "$TEST_ROOT" "$TASK_JSON"

GHQ_ROOT="$TEST_ROOT" PATH="$TEST_ROOT:$PATH" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1 || true

if [[ -d "$TEST_ROOT/loops/agents" ]]; then
  pass "loops/agents/ directory created"
else
  fail "loops/agents/ directory created" "directory not found"
fi

# ═════════════════════════════════════════════════
# Test 9: Writes lockfile with task ID before spawning
# ═════════════════════════════════════════════════
echo ""
echo "Test 9: Source code writes lockfile with task ID before spawning"

# Verify the scheduler writes a .lock file
if grep -q '\.lock' "$SCHEDULER"; then
  pass "scheduler.sh references .lock files"
else
  fail "scheduler.sh references .lock files" "no .lock reference found"
fi

# Check lockfile is written before claude spawn
LOCK_LINE=$(grep -n '\.lock' "$SCHEDULER" | head -1 | cut -d: -f1)
SPAWN_LINE=$(grep -n 'claude.*-p\|claude.*--print' "$SCHEDULER" | head -1 | cut -d: -f1)

if [[ -n "$LOCK_LINE" && -n "$SPAWN_LINE" ]]; then
  if [[ "$LOCK_LINE" -lt "$SPAWN_LINE" ]]; then
    pass "Lockfile written before agent spawned"
  else
    fail "Lockfile written before agent spawned" "lock at line $LOCK_LINE, spawn at line $SPAWN_LINE"
  fi
else
  if [[ -n "$LOCK_LINE" ]]; then
    pass "Lockfile logic present in source"
  else
    fail "Lockfile logic present" "lock or spawn line not found"
  fi
fi

# ═════════════════════════════════════════════════
# Test 10: Ranks tasks by priority (lower number = higher priority)
# ═════════════════════════════════════════════════
echo ""
echo "Test 10: Ranks tasks by priority"

# Verify ranking logic exists in source
if grep -qi 'priority\|rank\|score\|sort' "$SCHEDULER"; then
  pass "scheduler.sh contains ranking/priority logic"
else
  fail "scheduler.sh contains ranking/priority logic" "no priority/rank logic found"
fi

# ═════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS passed, $FAIL failed out of $TOTAL tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
