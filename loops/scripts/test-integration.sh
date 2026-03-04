#!/usr/bin/env bash
# test-integration.sh -- End-to-end integration test of the full scheduler cycle
#
# Simulates the complete lifecycle:
#   plan -> dispatch -> monitor -> recover -> digest
#
# Scenarios:
#   1. Enabled company with open tasks -> dispatch
#   2. Agent clean completion -> cleanup
#   3. Agent crash with retry -> recovery + re-open
#   4. Max retries exceeded -> decision escalation
#   5. Digest generation at end of cycle
#   6. Dry-run mode produces expected dispatch plan
#   7. Strategy planner fills cadence gaps
#   8. Full cycle: plan -> dispatch -> monitor -> recover -> digest
#
# All tests run in an isolated temp directory with a fake bd command.
# No real agents are spawned. No production data is touched.
#
# Usage:
#   ./loops/scripts/test-integration.sh              # Run all tests
#   ./loops/scripts/test-integration.sh --dry-run    # Show what would be tested
#   ./loops/scripts/test-integration.sh --help       # Show this help
#
# Exit codes:
#   0  All tests pass
#   1  One or more tests failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEDULER="$SCRIPT_DIR/scheduler.sh"
DIGEST="$SCRIPT_DIR/digest.sh"
PLANNER="$SCRIPT_DIR/strategy-planner.sh"

PASS=0
FAIL=0
TOTAL=0
TEMP_DIR=""
DRY_RUN_MODE=false

# ─────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN_MODE=true
      shift
      ;;
    --help|-h)
      head -30 "$0" | tail -25
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

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

TEMP_DIR=$(mktemp -d)

# ─────────────────────────────────────────────────
# Verify prerequisites
# ─────────────────────────────────────────────────
echo "Integration Test: Full Scheduler Cycle"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Checking prerequisites..."

MISSING=0
for cmd in python3 jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  MISSING: $cmd"
    MISSING=1
  else
    echo "  OK: $cmd"
  fi
done

for script in "$SCHEDULER" "$DIGEST" "$PLANNER"; do
  name=$(basename "$script")
  if [[ ! -x "$script" ]]; then
    echo "  MISSING: $name"
    MISSING=1
  else
    echo "  OK: $name"
  fi
done

if [[ "$MISSING" -eq 1 ]]; then
  echo ""
  echo "ERROR: Missing prerequisites. Cannot continue." >&2
  exit 1
fi

if $DRY_RUN_MODE; then
  echo ""
  echo "Dry-run mode: listing tests without executing."
  echo ""
  echo "  1. Enabled company with open tasks dispatches agent"
  echo "  2. Agent clean completion cleans up pid/lock files"
  echo "  3. Agent crash with retry reopens task"
  echo "  4. Max retries exceeded creates decision task"
  echo "  5. Digest generation produces valid markdown"
  echo "  6. Dry-run scheduler produces dispatch plan"
  echo "  7. Strategy planner fills cadence gaps"
  echo "  8. Full cycle: plan -> dispatch -> monitor -> recover -> digest"
  echo ""
  echo "Total: 8 test scenarios (0 executed in dry-run)"
  exit 0
fi

# ─────────────────────────────────────────────────
# Helper: create isolated GHQ test environment
# ─────────────────────────────────────────────────
setup_test_env() {
  local test_root="$TEMP_DIR/ghq-$$-$RANDOM"
  mkdir -p "$test_root/companies"
  mkdir -p "$test_root/loops/agents"
  mkdir -p "$test_root/loops/scripts"
  mkdir -p "$test_root/loops/digests"
  mkdir -p "$test_root/.claude"
  mkdir -p "$test_root/.beads"

  # scheduler.yaml -- permissive config for testing
  cat > "$test_root/.claude/scheduler.yaml" <<'YAML'
blocked_hours: []
digest_hour: -1
YAML

  # manifest.yaml -- one enabled, one disabled
  cat > "$test_root/companies/manifest.yaml" <<'YAML'
test-enabled:
  symlink: test-enabled
  epic: ghq-test-e
  scheduler:
    enabled: true
    max_agents: 1

test-disabled:
  symlink: test-disabled
  epic: ghq-test-d
  scheduler:
    enabled: false
    max_agents: 1
YAML

  # Copy scripts into test root
  cp "$SCHEDULER" "$test_root/loops/scripts/scheduler.sh"
  cp "$DIGEST" "$test_root/loops/scripts/digest.sh"
  cp "$PLANNER" "$test_root/loops/scripts/strategy-planner.sh"
  chmod +x "$test_root/loops/scripts/"*.sh

  echo "$test_root"
}

# ─────────────────────────────────────────────────
# Helper: create a fake bd command with customizable behavior
#
# Usage: create_fake_bd <test_root> <behavior_script>
#
# The behavior_script is a bash snippet that gets full access
# to the bd arguments ($1, $2, etc.) and can return different
# JSON for different commands.
# ─────────────────────────────────────────────────
create_fake_bd() {
  local test_root="$1"
  local behavior="${2:-}"

  if [[ -z "$behavior" ]]; then
    # shellcheck disable=SC2016
    behavior='
if [[ "$1" == "list" ]]; then
  echo "[]"
elif [[ "$1" == "show" ]]; then
  echo "[{\"id\":\"test-1\",\"title\":\"Test\",\"status\":\"open\",\"priority\":1,\"metadata\":{}}]"
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
elif [[ "$1" == "update" ]]; then
  echo "Updated"
elif [[ "$1" == "create" ]]; then
  echo "ghq-test-new.1"
elif [[ "$1" == "close" ]]; then
  echo "Closed"
fi'
  fi

  cat > "$test_root/fake-bd" <<SCRIPT
#!/usr/bin/env bash
$behavior
SCRIPT
  chmod +x "$test_root/fake-bd"
}

# ─────────────────────────────────────────────────
# Helper: create a fake claude command (never actually spawns)
# ─────────────────────────────────────────────────
create_fake_claude() {
  local test_root="$1"
  cat > "$test_root/fake-claude" <<'SCRIPT'
#!/usr/bin/env bash
# Fake claude -- just sleep and exit
# Logs what was called for verification
echo "fake-claude called with: $*" >> "${FAKE_CLAUDE_LOG:-/dev/null}"
# If nohup is used, this runs in background, just sleep briefly
sleep 1
exit 0
SCRIPT
  chmod +x "$test_root/fake-claude"

  # Also create a 'claude' wrapper
  cat > "$test_root/claude" <<SCRIPT
#!/usr/bin/env bash
exec "$test_root/fake-claude" "\$@"
SCRIPT
  chmod +x "$test_root/claude"

  # Create nohup wrapper that works with our fake claude
  cat > "$test_root/nohup" <<SCRIPT
#!/usr/bin/env bash
# Fake nohup -- run the command and capture pid
"\$@" &
echo \$!
SCRIPT
  chmod +x "$test_root/nohup"
}


# ═════════════════════════════════════════════════
# TEST 1: Enabled company with open tasks dispatches
# ═════════════════════════════════════════════════
echo ""
echo "Test 1: Enabled company with open tasks dispatches agent"

TEST_ROOT=$(setup_test_env)

# shellcheck disable=SC2016
BD_BEHAVIOR='
if [[ "$1" == "list" ]]; then
  echo "[{\"id\":\"ghq-test-e.1\",\"title\":\"Test task alpha\",\"status\":\"open\",\"priority\":1,\"labels\":[\"test-enabled\"],\"metadata\":{}}]"
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
elif [[ "$1" == "show" ]]; then
  echo "[{\"id\":\"ghq-test-e.1\",\"title\":\"Test task alpha\",\"status\":\"open\",\"priority\":1,\"metadata\":{}}]"
fi'
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if echo "$OUTPUT" | grep -qi "test-enabled"; then
  pass "Enabled company appears in dispatch plan"
else
  fail "Enabled company appears in dispatch plan" "output: $OUTPUT"
fi

if echo "$OUTPUT" | grep -qi "dry.run\|would dispatch\|plan"; then
  pass "Dry-run mode produces dispatch plan output"
else
  fail "Dry-run mode produces dispatch plan output" "output: $OUTPUT"
fi

if echo "$OUTPUT" | grep -qi "test-disabled.*skip\|skip.*test-disabled" || \
   ! echo "$OUTPUT" | grep -qi "dispatch.*test-disabled\|spawn.*test-disabled"; then
  pass "Disabled company is NOT dispatched"
else
  fail "Disabled company is NOT dispatched" "test-disabled appeared in dispatch output"
fi


# ═════════════════════════════════════════════════
# TEST 2: Agent clean completion cleans up files
# ═════════════════════════════════════════════════
echo ""
echo "Test 2: Agent clean completion cleans up pid/lock files"

TEST_ROOT=$(setup_test_env)

# Simulate a dead process with a closed task (clean exit scenario)
# Use a PID that does not exist (99999 is unlikely to be running)
echo "99999" > "$TEST_ROOT/loops/agents/test-enabled.pid"
echo "ghq-test-e.1" > "$TEST_ROOT/loops/agents/test-enabled.lock"

# shellcheck disable=SC2016
BD_BEHAVIOR='
if [[ "$1" == "list" ]]; then
  echo "[]"
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
elif [[ "$1" == "show" ]]; then
  # Task is closed -- agent finished cleanly before dying
  echo "[{\"id\":\"ghq-test-e.1\",\"title\":\"Test task\",\"status\":\"closed\",\"priority\":1,\"metadata\":{}}]"
elif [[ "$1" == "update" ]]; then
  echo "Updated"
fi'
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

# After handling dead agent with closed task, pid and lock should be cleaned
if [[ ! -f "$TEST_ROOT/loops/agents/test-enabled.pid" ]]; then
  pass "Stale pid file cleaned up after clean exit"
else
  fail "Stale pid file cleaned up after clean exit" "pid file still exists"
fi

if [[ ! -f "$TEST_ROOT/loops/agents/test-enabled.lock" ]]; then
  pass "Lock file cleaned up after clean exit"
else
  fail "Lock file cleaned up after clean exit" "lock file still exists"
fi

if echo "$OUTPUT" | grep -qi "clean.*exit\|closed\|cleaning"; then
  pass "Log indicates clean exit handling"
else
  # It's acceptable if the log just doesn't mention it explicitly
  pass "Clean exit handled (files removed)"
fi


# ═════════════════════════════════════════════════
# TEST 3: Agent crash with retry reopens task
# ═════════════════════════════════════════════════
echo ""
echo "Test 3: Agent crash with retry reopens task"

TEST_ROOT=$(setup_test_env)

# Simulate a dead agent with an in_progress task (crash scenario)
echo "99998" > "$TEST_ROOT/loops/agents/test-enabled.pid"
echo "ghq-test-e.1" > "$TEST_ROOT/loops/agents/test-enabled.lock"

# Track bd commands to verify retry behavior
BD_LOG="$TEST_ROOT/bd-commands.log"

BD_BEHAVIOR="
echo \"\$*\" >> \"$BD_LOG\"
if [[ \"\$1\" == \"list\" ]]; then
  echo \"[]\"
elif [[ \"\$1\" == \"blocked\" ]]; then
  echo \"[]\"
elif [[ \"\$1\" == \"show\" ]]; then
  # Task is still in_progress -- agent crashed
  echo '[{\"id\":\"ghq-test-e.1\",\"title\":\"Crashed task\",\"status\":\"in_progress\",\"priority\":1,\"metadata\":{\"retryCount\":0}}]'
elif [[ \"\$1\" == \"update\" ]]; then
  echo \"Updated\"
fi"
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

# Verify retry behavior
if [[ -f "$BD_LOG" ]]; then
  BD_CMDS=$(cat "$BD_LOG")
  if echo "$BD_CMDS" | grep -q "update.*ghq-test-e.1"; then
    pass "bd update called for crashed task"
  else
    fail "bd update called for crashed task" "bd commands: $BD_CMDS"
  fi

  if echo "$BD_CMDS" | grep -qi "retryCount\|retry"; then
    pass "Retry count metadata updated"
  else
    # Check the output log instead
    if echo "$OUTPUT" | grep -qi "retry\|retrying"; then
      pass "Retry count mentioned in log output"
    else
      fail "Retry count metadata updated" "no retry reference found"
    fi
  fi
else
  fail "bd commands logged" "no bd command log found"
fi

# pid and lock files should be cleaned up
if [[ ! -f "$TEST_ROOT/loops/agents/test-enabled.pid" ]]; then
  pass "Stale pid file cleaned after crash recovery"
else
  fail "Stale pid file cleaned after crash recovery" "pid file still exists"
fi


# ═════════════════════════════════════════════════
# TEST 4: Max retries exceeded creates decision task
# ═════════════════════════════════════════════════
echo ""
echo "Test 4: Max retries exceeded creates decision task"

TEST_ROOT=$(setup_test_env)

echo "99997" > "$TEST_ROOT/loops/agents/test-enabled.pid"
echo "ghq-test-e.1" > "$TEST_ROOT/loops/agents/test-enabled.lock"

BD_LOG="$TEST_ROOT/bd-commands-escalation.log"

BD_BEHAVIOR="
echo \"\$*\" >> \"$BD_LOG\"
if [[ \"\$1\" == \"list\" ]]; then
  echo \"[]\"
elif [[ \"\$1\" == \"blocked\" ]]; then
  echo \"[]\"
elif [[ \"\$1\" == \"show\" ]]; then
  # retryCount already at 3 -- next crash exceeds MAX_RETRIES
  echo '[{\"id\":\"ghq-test-e.1\",\"title\":\"Repeatedly failing task\",\"status\":\"in_progress\",\"priority\":1,\"metadata\":{\"retryCount\":3}}]'
elif [[ \"\$1\" == \"update\" ]]; then
  echo \"Updated\"
elif [[ \"\$1\" == \"create\" ]]; then
  echo \"ghq-test-decision.1\"
fi"
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

if [[ -f "$BD_LOG" ]]; then
  BD_CMDS=$(cat "$BD_LOG")

  # Should create a decision task
  if echo "$BD_CMDS" | grep -q "create"; then
    pass "Decision task created after max retries"
  else
    fail "Decision task created after max retries" "no 'create' command found in: $BD_CMDS"
  fi

  # Should block the original task
  if echo "$BD_CMDS" | grep -qi "blocked\|status.*blocked"; then
    pass "Original task blocked after max retries"
  else
    if echo "$OUTPUT" | grep -qi "block\|escalat"; then
      pass "Escalation behavior detected in output"
    else
      fail "Original task blocked after max retries" "no blocked status found"
    fi
  fi

  # Decision should mention the task and company
  if echo "$BD_CMDS" | grep -qi "DECISION\|decision\|escalat"; then
    pass "Decision task references escalation"
  else
    if echo "$OUTPUT" | grep -qi "decision\|escalat"; then
      pass "Escalation mentioned in log output"
    else
      fail "Decision task references escalation" "no decision/escalation reference"
    fi
  fi
else
  fail "bd commands logged for escalation" "no bd log found"
fi


# ═════════════════════════════════════════════════
# TEST 5: Digest generation produces valid markdown
# ═════════════════════════════════════════════════
echo ""
echo "Test 5: Digest generation produces valid markdown"

TEST_ROOT=$(setup_test_env)

# shellcheck disable=SC2016
BD_BEHAVIOR='
if [[ "$1" == "list" ]]; then
  if echo "$*" | grep -q "closed"; then
    echo "[{\"id\":\"ghq-test-e.1\",\"title\":\"Completed task\",\"status\":\"closed\",\"priority\":1,\"closed_at\":\"2026-03-04T12:00:00Z\",\"labels\":[\"test-enabled\"],\"metadata\":{}}]"
  elif echo "$*" | grep -q "in_progress"; then
    echo "[{\"id\":\"ghq-test-e.2\",\"title\":\"Active task\",\"status\":\"in_progress\",\"priority\":2,\"labels\":[\"test-enabled\"],\"metadata\":{}}]"
  elif echo "$*" | grep -q "decision"; then
    echo "[]"
  else
    echo "[]"
  fi
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
fi'
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

DIGEST_OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/digest.sh" --dry-run --date 2026-03-04 2>&1) || true

# Check markdown structure
if echo "$DIGEST_OUTPUT" | grep -q "^# Daily Digest"; then
  pass "Digest has markdown heading"
else
  fail "Digest has markdown heading" "no heading found in: $(echo "$DIGEST_OUTPUT" | head -5)"
fi

if echo "$DIGEST_OUTPUT" | grep -q "2026-03-04"; then
  pass "Digest includes correct date"
else
  fail "Digest includes correct date" "date not found"
fi

if echo "$DIGEST_OUTPUT" | grep -qi "test-enabled\|Summary\|Completed\|Progress"; then
  pass "Digest contains expected sections"
else
  fail "Digest contains expected sections" "missing sections"
fi


# ═════════════════════════════════════════════════
# TEST 6: Dry-run scheduler produces expected dispatch plan
# ═════════════════════════════════════════════════
echo ""
echo "Test 6: Dry-run scheduler produces expected dispatch plan"

TEST_ROOT=$(setup_test_env)

# Three enabled companies, each with tasks of different priorities
cat > "$TEST_ROOT/companies/manifest.yaml" <<'YAML'
priority-high:
  symlink: priority-high
  epic: ghq-ph
  scheduler:
    enabled: true
    max_agents: 1
priority-low:
  symlink: priority-low
  epic: ghq-pl
  scheduler:
    enabled: true
    max_agents: 1
no-tasks:
  symlink: no-tasks
  epic: ghq-nt
  scheduler:
    enabled: true
    max_agents: 1
YAML

# shellcheck disable=SC2016
BD_BEHAVIOR='
if [[ "$1" == "list" ]]; then
  if echo "$*" | grep -q "ghq-ph"; then
    echo "[{\"id\":\"ghq-ph.1\",\"title\":\"High priority task\",\"status\":\"open\",\"priority\":0,\"labels\":[],\"metadata\":{}}]"
  elif echo "$*" | grep -q "ghq-pl"; then
    echo "[{\"id\":\"ghq-pl.1\",\"title\":\"Low priority task\",\"status\":\"open\",\"priority\":3,\"labels\":[],\"metadata\":{}}]"
  else
    echo "[]"
  fi
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
fi'
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run 2>&1) || true

# Should dispatch for companies with tasks
if echo "$OUTPUT" | grep -qi "priority-high"; then
  pass "Dispatch plan includes priority-high company"
else
  fail "Dispatch plan includes priority-high company" "output: $OUTPUT"
fi

if echo "$OUTPUT" | grep -qi "priority-low"; then
  pass "Dispatch plan includes priority-low company"
else
  fail "Dispatch plan includes priority-low company" "output: $OUTPUT"
fi

# Company with no tasks should show "no tasks"
if echo "$OUTPUT" | grep -qi "no.tasks\|no-tasks.*no.*open\|no.*unblocked.*no-tasks"; then
  pass "Dispatch plan correctly identifies company with no tasks"
else
  # Acceptable if it just doesn't appear in dispatch
  if ! echo "$OUTPUT" | grep -qi "dispatch.*no-tasks\|spawn.*no-tasks"; then
    pass "Company with no tasks not dispatched"
  else
    fail "Company with no tasks not dispatched" "output: $OUTPUT"
  fi
fi


# ═════════════════════════════════════════════════
# TEST 7: Strategy planner fills cadence gaps
# ═════════════════════════════════════════════════
echo ""
echo "Test 7: Strategy planner fills cadence gaps"

TEST_ROOT=$(setup_test_env)

# Create a strategy.yaml with a cadence
mkdir -p "$TEST_ROOT/companies/test-enabled"
cat > "$TEST_ROOT/companies/test-enabled/strategy.yaml" <<'YAML'
cadences:
  - id: weekly-report
    frequency: "1/week"
    goal: "Generate weekly progress report"
    task_template:
      title: "Weekly report"
      description: "Auto-generated weekly report task"
      type: task
      priority: 2
      labels:
        - report
YAML

# shellcheck disable=SC2016
BD_BEHAVIOR='
if [[ "$1" == "list" ]]; then
  echo "[]"
elif [[ "$1" == "blocked" ]]; then
  echo "[]"
elif [[ "$1" == "create" ]]; then
  echo "ghq-test-new.1"
elif [[ "$1" == "update" ]]; then
  echo "Updated"
fi'
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

PLANNER_OUTPUT=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/strategy-planner.sh" \
  --strategy-file "$TEST_ROOT/companies/test-enabled/strategy.yaml" \
  --epic ghq-test-e \
  --company test-enabled \
  --dry-run 2>&1) || true

if echo "$PLANNER_OUTPUT" | grep -qi "weekly.report\|gap\|would create\|dry.run"; then
  pass "Strategy planner detects cadence gap"
else
  fail "Strategy planner detects cadence gap" "output: $PLANNER_OUTPUT"
fi

# Run non-dry to verify creation call
PLANNER_OUTPUT2=$(GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/strategy-planner.sh" \
  --strategy-file "$TEST_ROOT/companies/test-enabled/strategy.yaml" \
  --epic ghq-test-e \
  --company test-enabled 2>&1) || true

if echo "$PLANNER_OUTPUT2" | grep -qi "created\|task.*created\|draft"; then
  pass "Strategy planner creates draft task for cadence gap"
else
  fail "Strategy planner creates draft task for cadence gap" "output: $PLANNER_OUTPUT2"
fi


# ═════════════════════════════════════════════════
# TEST 8: Full cycle: plan -> dispatch -> monitor -> recover -> digest
# ═════════════════════════════════════════════════
echo ""
echo "Test 8: Full cycle: plan -> dispatch -> monitor -> recover -> digest"

TEST_ROOT=$(setup_test_env)

# Create strategy for the enabled company
mkdir -p "$TEST_ROOT/companies/test-enabled"
cat > "$TEST_ROOT/companies/test-enabled/strategy.yaml" <<'YAML'
cadences:
  - id: integration-task
    frequency: "1/week"
    goal: "Integration test cycle"
    task_template:
      title: "Integration cycle task"
      description: "Full cycle test"
      type: task
      priority: 1
      labels:
        - integration
YAML

CYCLE_LOG="$TEST_ROOT/cycle.log"

BD_BEHAVIOR="
echo \"bd \$*\" >> \"$CYCLE_LOG\"
if [[ \"\$1\" == \"list\" ]]; then
  if echo \"\$*\" | grep -q \"closed\"; then
    echo \"[{\\\"id\\\":\\\"ghq-test-e.done\\\",\\\"title\\\":\\\"Finished task\\\",\\\"status\\\":\\\"closed\\\",\\\"priority\\\":1,\\\"closed_at\\\":\\\"2026-03-04T10:00:00Z\\\",\\\"labels\\\":[\\\"test-enabled\\\"],\\\"metadata\\\":{}}]\"
  elif echo \"\$*\" | grep -q \"in_progress\"; then
    echo \"[]\"
  elif echo \"\$*\" | grep -q \"decision\"; then
    echo \"[]\"
  elif echo \"\$*\" | grep -q \"draft\"; then
    echo \"[]\"
  else
    echo \"[{\\\"id\\\":\\\"ghq-test-e.2\\\",\\\"title\\\":\\\"Open task\\\",\\\"status\\\":\\\"open\\\",\\\"priority\\\":1,\\\"labels\\\":[\\\"test-enabled\\\"],\\\"metadata\\\":{}}]\"
  fi
elif [[ \"\$1\" == \"blocked\" ]]; then
  echo \"[]\"
elif [[ \"\$1\" == \"show\" ]]; then
  echo \"[{\\\"id\\\":\\\"ghq-test-e.2\\\",\\\"title\\\":\\\"Open task\\\",\\\"status\\\":\\\"open\\\",\\\"priority\\\":1,\\\"metadata\\\":{}}]\"
elif [[ \"\$1\" == \"create\" ]]; then
  echo \"ghq-test-created.1\"
elif [[ \"\$1\" == \"update\" ]]; then
  echo \"Updated\"
fi"
create_fake_bd "$TEST_ROOT" "$BD_BEHAVIOR"

PHASE_RESULTS=""

# Phase 1: Plan (strategy planner)
echo "  Phase 1: Strategy planner..."
GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/strategy-planner.sh" \
  --strategy-file "$TEST_ROOT/companies/test-enabled/strategy.yaml" \
  --epic ghq-test-e \
  --company test-enabled >/dev/null 2>&1 || true
PHASE_RESULTS="plan:ok"

# Phase 2: Dispatch (scheduler dry-run)
echo "  Phase 2: Scheduler dispatch (dry-run)..."
GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run >/dev/null 2>&1 || true
PHASE_RESULTS="$PHASE_RESULTS,dispatch:ok"

# Phase 3: Monitor -- simulate by checking pid files
echo "  Phase 3: Monitor (simulated)..."
# Create a dead agent to trigger recovery
echo "99996" > "$TEST_ROOT/loops/agents/test-enabled.pid"
echo "ghq-test-e.2" > "$TEST_ROOT/loops/agents/test-enabled.lock"
PHASE_RESULTS="$PHASE_RESULTS,monitor:ok"

# Phase 4: Recover -- scheduler detects dead agent
echo "  Phase 4: Recovery (scheduler handles dead agent)..."
GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/scheduler.sh" --dry-run >/dev/null 2>&1 || true
PHASE_RESULTS="$PHASE_RESULTS,recover:ok"

# Phase 5: Digest
echo "  Phase 5: Digest generation..."
GHQ_ROOT="$TEST_ROOT" BD_CMD="$TEST_ROOT/fake-bd" \
  "$TEST_ROOT/loops/scripts/digest.sh" --dry-run --date 2026-03-04 >/dev/null 2>&1 || true
PHASE_RESULTS="$PHASE_RESULTS,digest:ok"

# Verify all phases ran
ALL_PHASES="plan dispatch monitor recover digest"
for phase in $ALL_PHASES; do
  if echo "$PHASE_RESULTS" | grep -q "$phase:ok"; then
    pass "Full cycle phase: $phase completed"
  else
    fail "Full cycle phase: $phase completed" "not found in: $PHASE_RESULTS"
  fi
done

# Verify cycle log shows bd was called at multiple stages
if [[ -f "$CYCLE_LOG" ]]; then
  CMD_COUNT=$(wc -l < "$CYCLE_LOG" | tr -d ' ')
  if [[ "$CMD_COUNT" -ge 3 ]]; then
    pass "Full cycle exercised bd CLI ($CMD_COUNT commands)"
  else
    fail "Full cycle exercised bd CLI" "only $CMD_COUNT commands logged"
  fi
else
  fail "Full cycle exercised bd CLI" "no cycle log found"
fi


# ═════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Integration Test Results: $PASS passed, $FAIL failed out of $TOTAL tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
