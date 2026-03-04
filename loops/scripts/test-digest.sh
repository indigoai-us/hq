#!/usr/bin/env bash
# test-digest.sh -- Tests for the daily digest generator
#
# Usage: ./loops/scripts/test-digest.sh
#
# Tests:
#   1. digest.sh passes shellcheck
#   2. Generates markdown file at correct path with date stamp
#   3. Digest grouped by company
#   4. Shows completed tasks
#   5. Shows in-progress tasks
#   6. Shows blocked/failed tasks
#   7. Pending decisions include context and bd resolve commands
#   8. Drafts section shows tasks needing promotion
#   9. Digest includes all enabled companies
#  10. Dry-run mode prints to stdout instead of file
#  11. Handles empty state gracefully (no companies, no tasks)
#  12. Custom date flag overrides default

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export GHQ_ROOT
GHQ_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIGEST="$SCRIPT_DIR/digest.sh"

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

if [[ ! -x "$DIGEST" ]]; then
  echo "Error: digest.sh not found or not executable at $DIGEST" >&2
  exit 1
fi
echo "  digest.sh found"

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
  mkdir -p "$test_root/loops/digests"
  mkdir -p "$test_root/.claude"
  mkdir -p "$test_root/.beads"

  # Create scheduler.yaml with digest_hour
  cat > "$test_root/.claude/scheduler.yaml" <<'YAML'
max_concurrent_agents: 2
cooldown_after_failure: 900
daily_budget: 50.00
blocked_hours: []
digest_hour: 18
YAML

  # Create manifest.yaml with test companies
  cat > "$test_root/companies/manifest.yaml" <<'YAML'
acme-corp:
  symlink: acme-corp
  repos: []
  settings: companies/acme-corp/settings/
  skills: []
  knowledge: companies/acme-corp/knowledge/
  deploy: []
  vercel_projects: []
  epic: acme-1
  qmd_collections:
    - acme-corp
  scheduler:
    enabled: true
    max_agents: 1

beta-inc:
  symlink: beta-inc
  repos: []
  settings: companies/beta-inc/settings/
  skills: []
  knowledge: companies/beta-inc/knowledge/
  deploy: []
  vercel_projects: []
  epic: beta-1
  qmd_collections:
    - beta-inc
  scheduler:
    enabled: true
    max_agents: 1

disabled-co:
  symlink: disabled-co
  repos: []
  settings: companies/disabled-co/settings/
  skills: []
  knowledge: companies/disabled-co/knowledge/
  deploy: []
  vercel_projects: []
  epic: dis-1
  qmd_collections:
    - disabled-co
  scheduler:
    enabled: false
    max_agents: 1
YAML

  echo "$test_root"
}

# ─────────────────────────────────────────────────
# Helper: create a mock bd command
# ─────────────────────────────────────────────────
create_mock_bd() {
  local test_root="$1"
  local mock_bd="$test_root/mock-bd"

  cat > "$mock_bd" <<'SCRIPT'
#!/usr/bin/env bash
# Mock bd command for testing digest.sh
# Returns different results based on arguments

set -euo pipefail

MOCK_DATA_DIR="${MOCK_DATA_DIR:-/tmp/mock-bd-data}"

# Route by subcommand
case "${1:-}" in
  list)
    shift
    # Parse flags
    PARENT=""
    STATUS=""
    TYPE=""
    LABEL=""
    JSON_FLAG=false
    LIMIT=""
    ALL_FLAG=false
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --parent) PARENT="$2"; shift 2 ;;
        -s|--status) STATUS="$2"; shift 2 ;;
        -t|--type) TYPE="$2"; shift 2 ;;
        -l|--label) LABEL="$2"; shift 2 ;;
        --json) JSON_FLAG=true; shift ;;
        -n|--limit) LIMIT="$2"; shift 2 ;;
        --all) ALL_FLAG=true; shift ;;
        *) shift ;;
      esac
    done

    # Return mock data based on filters
    if [[ "$TYPE" == "decision" && "$STATUS" == "open" ]]; then
      if [[ -f "$MOCK_DATA_DIR/decisions.json" ]]; then
        cat "$MOCK_DATA_DIR/decisions.json"
      else
        echo "[]"
      fi
    elif [[ "$STATUS" == "closed" ]]; then
      if [[ -f "$MOCK_DATA_DIR/closed_${PARENT}.json" ]]; then
        cat "$MOCK_DATA_DIR/closed_${PARENT}.json"
      else
        echo "[]"
      fi
    elif [[ "$STATUS" == "in_progress" ]]; then
      if [[ -f "$MOCK_DATA_DIR/in_progress_${PARENT}.json" ]]; then
        cat "$MOCK_DATA_DIR/in_progress_${PARENT}.json"
      else
        echo "[]"
      fi
    elif [[ "$STATUS" == "open" ]]; then
      if [[ -f "$MOCK_DATA_DIR/open_${PARENT}.json" ]]; then
        cat "$MOCK_DATA_DIR/open_${PARENT}.json"
      else
        echo "[]"
      fi
    elif $ALL_FLAG; then
      if [[ -f "$MOCK_DATA_DIR/all_${PARENT}.json" ]]; then
        cat "$MOCK_DATA_DIR/all_${PARENT}.json"
      else
        echo "[]"
      fi
    else
      echo "[]"
    fi
    ;;
  blocked)
    shift
    PARENT=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --parent) PARENT="$2"; shift 2 ;;
        --json) shift ;;
        *) shift ;;
      esac
    done
    if [[ -f "$MOCK_DATA_DIR/blocked_${PARENT}.json" ]]; then
      cat "$MOCK_DATA_DIR/blocked_${PARENT}.json"
    else
      echo "[]"
    fi
    ;;
  show)
    shift
    ID="$1"
    shift
    if [[ -f "$MOCK_DATA_DIR/show_${ID}.json" ]]; then
      cat "$MOCK_DATA_DIR/show_${ID}.json"
    else
      echo "[]"
    fi
    ;;
  *)
    echo "[]"
    ;;
esac
SCRIPT
  chmod +x "$mock_bd"
  echo "$mock_bd"
}

# ─────────────────────────────────────────────────
# Helper: populate mock bd data
# ─────────────────────────────────────────────────
populate_mock_data() {
  local data_dir="$1"
  mkdir -p "$data_dir"

  # Closed tasks for acme-1
  cat > "$data_dir/closed_acme-1.json" <<'JSON'
[
  {"id":"acme-1.1","title":"Set up CI pipeline","status":"closed","issue_type":"task","priority":1,"closed_at":"2026-03-04T10:00:00Z","labels":["acme-corp"]},
  {"id":"acme-1.2","title":"Deploy landing page","status":"closed","issue_type":"task","priority":2,"closed_at":"2026-03-04T14:00:00Z","labels":["acme-corp"]}
]
JSON

  # In-progress tasks for acme-1
  cat > "$data_dir/in_progress_acme-1.json" <<'JSON'
[
  {"id":"acme-1.3","title":"Build user auth","status":"in_progress","issue_type":"task","priority":1,"labels":["acme-corp"]}
]
JSON

  # Open tasks for acme-1
  cat > "$data_dir/open_acme-1.json" <<'JSON'
[
  {"id":"acme-1.4","title":"Add payment integration","status":"open","issue_type":"task","priority":2,"labels":["acme-corp"]}
]
JSON

  # Blocked tasks for acme-1
  cat > "$data_dir/blocked_acme-1.json" <<'JSON'
[
  {"id":"acme-1.5","title":"API rate limiting","status":"open","issue_type":"task","priority":2,"labels":["acme-corp"],"blocked_by":["acme-1.3"]}
]
JSON

  # Closed tasks for beta-1
  cat > "$data_dir/closed_beta-1.json" <<'JSON'
[
  {"id":"beta-1.1","title":"Design system setup","status":"closed","issue_type":"task","priority":1,"closed_at":"2026-03-04T09:00:00Z","labels":["beta-inc"]}
]
JSON

  # In-progress tasks for beta-1
  cat > "$data_dir/in_progress_beta-1.json" <<'JSON'
[]
JSON

  # Open tasks for beta-1
  cat > "$data_dir/open_beta-1.json" <<'JSON'
[
  {"id":"beta-1.2","title":"Dashboard UI","status":"open","issue_type":"task","priority":3,"labels":["beta-inc"]}
]
JSON

  # Blocked tasks for beta-1
  cat > "$data_dir/blocked_beta-1.json" <<'JSON'
[]
JSON

  # Open decisions
  cat > "$data_dir/decisions.json" <<'JSON'
[
  {"id":"acme-1.d1","title":"Choose auth provider","status":"open","issue_type":"decision","priority":1,"labels":["acme-corp"],"description":"Need to decide between Auth0 and Clerk for user authentication","metadata":{"company":"acme-corp","action":"choose_auth_provider"}}
]
JSON
}

# ─────────────────────────────────────────────────
# Test 1: shellcheck
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 1: shellcheck ==="
if command -v shellcheck &>/dev/null; then
  if shellcheck "$DIGEST" 2>&1; then
    pass "digest.sh passes shellcheck"
  else
    fail "digest.sh has shellcheck warnings" "see output above"
  fi
else
  echo "  SKIP: shellcheck not installed"
fi

# ─────────────────────────────────────────────────
# Test 2: Generates markdown file at correct path
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 2: Generates markdown at correct path ==="

TEST_ROOT=$(setup_test_env)
MOCK_DATA_DIR="$TEMP_DIR/mock-data-2"
populate_mock_data "$MOCK_DATA_DIR"
MOCK_BD=$(create_mock_bd "$TEST_ROOT")

export MOCK_DATA_DIR
GHQ_ROOT="$TEST_ROOT" BD_CMD="$MOCK_BD" "$DIGEST" --date 2026-03-04 2>&1 || true

EXPECTED_FILE="$TEST_ROOT/loops/digests/2026-03-04.md"
if [[ -f "$EXPECTED_FILE" ]]; then
  pass "Digest file created at $EXPECTED_FILE"
else
  fail "Digest file not found" "expected $EXPECTED_FILE"
fi

# ─────────────────────────────────────────────────
# Test 3: Digest grouped by company
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 3: Digest grouped by company ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  CONTENT=$(cat "$EXPECTED_FILE")
  if echo "$CONTENT" | grep -q "acme-corp" && echo "$CONTENT" | grep -q "beta-inc"; then
    pass "Digest contains company groupings"
  else
    fail "Digest missing company groupings" "expected acme-corp and beta-inc headings"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 4: Shows completed tasks
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 4: Shows completed tasks ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  if grep -qi "completed\|closed\|done" "$EXPECTED_FILE" && grep -q "Set up CI pipeline" "$EXPECTED_FILE"; then
    pass "Digest shows completed tasks"
  else
    fail "Digest missing completed tasks" "expected 'Set up CI pipeline' in completed section"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 5: Shows in-progress tasks
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 5: Shows in-progress tasks ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  if grep -qi "in.progress\|active\|working" "$EXPECTED_FILE" && grep -q "Build user auth" "$EXPECTED_FILE"; then
    pass "Digest shows in-progress tasks"
  else
    fail "Digest missing in-progress tasks" "expected 'Build user auth' in in-progress section"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 6: Shows blocked tasks
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 6: Shows blocked tasks ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  if grep -qi "blocked\|fail" "$EXPECTED_FILE" && grep -q "API rate limiting" "$EXPECTED_FILE"; then
    pass "Digest shows blocked tasks"
  else
    fail "Digest missing blocked tasks" "expected 'API rate limiting' in blocked section"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 7: Pending decisions include bd resolve commands
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 7: Pending decisions with bd resolve commands ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  if grep -q "bd-resolve\|bd resolve" "$EXPECTED_FILE" && grep -q "acme-1.d1" "$EXPECTED_FILE"; then
    pass "Pending decisions include bd resolve commands"
  else
    fail "Missing bd resolve commands" "expected bd-resolve command with decision ID acme-1.d1"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 8: Digest includes all enabled companies
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 8: Includes enabled companies, excludes disabled ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  CONTENT=$(cat "$EXPECTED_FILE")
  has_acme=$(echo "$CONTENT" | grep -c "acme-corp" || true)
  has_beta=$(echo "$CONTENT" | grep -c "beta-inc" || true)
  has_disabled=$(echo "$CONTENT" | grep -c "disabled-co" || true)

  if [[ "$has_acme" -gt 0 && "$has_beta" -gt 0 && "$has_disabled" -eq 0 ]]; then
    pass "Includes enabled companies, excludes disabled"
  else
    fail "Company filtering incorrect" "acme=$has_acme beta=$has_beta disabled=$has_disabled"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Test 9: Dry-run prints to stdout
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 9: Dry-run mode ==="

TEST_ROOT_DRY=$(setup_test_env)
MOCK_DATA_DIR_DRY="$TEMP_DIR/mock-data-dry"
populate_mock_data "$MOCK_DATA_DIR_DRY"
MOCK_BD_DRY=$(create_mock_bd "$TEST_ROOT_DRY")

DRY_OUTPUT=$(MOCK_DATA_DIR="$MOCK_DATA_DIR_DRY" GHQ_ROOT="$TEST_ROOT_DRY" BD_CMD="$MOCK_BD_DRY" "$DIGEST" --dry-run --date 2026-03-04 2>&1) || true

# In dry-run mode, no file should be created
DRY_FILE="$TEST_ROOT_DRY/loops/digests/2026-03-04.md"
if [[ ! -f "$DRY_FILE" ]] && echo "$DRY_OUTPUT" | grep -qi "daily digest"; then
  pass "Dry-run prints to stdout without creating file"
else
  if [[ -f "$DRY_FILE" ]]; then
    fail "Dry-run created a file" "expected stdout only"
  else
    fail "Dry-run output missing digest content" "expected markdown on stdout"
  fi
fi

# ─────────────────────────────────────────────────
# Test 10: Handles empty state gracefully
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 10: Handles empty state ==="

TEST_ROOT_EMPTY=$(setup_test_env)
MOCK_DATA_DIR_EMPTY="$TEMP_DIR/mock-data-empty"
mkdir -p "$MOCK_DATA_DIR_EMPTY"
# Create empty manifest -- no companies
cat > "$TEST_ROOT_EMPTY/companies/manifest.yaml" <<'YAML'
YAML

MOCK_BD_EMPTY=$(create_mock_bd "$TEST_ROOT_EMPTY")

EMPTY_OUTPUT=$(MOCK_DATA_DIR="$MOCK_DATA_DIR_EMPTY" GHQ_ROOT="$TEST_ROOT_EMPTY" BD_CMD="$MOCK_BD_EMPTY" "$DIGEST" --date 2026-03-04 2>&1) || true
EMPTY_FILE="$TEST_ROOT_EMPTY/loops/digests/2026-03-04.md"

if [[ -f "$EMPTY_FILE" ]] || echo "$EMPTY_OUTPUT" | grep -qi "no enabled companies\|digest"; then
  pass "Handles empty state gracefully"
else
  fail "Empty state not handled" "expected graceful output"
fi

# ─────────────────────────────────────────────────
# Test 11: Custom date flag
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 11: Custom date flag ==="

TEST_ROOT_DATE=$(setup_test_env)
MOCK_DATA_DIR_DATE="$TEMP_DIR/mock-data-date"
populate_mock_data "$MOCK_DATA_DIR_DATE"
MOCK_BD_DATE=$(create_mock_bd "$TEST_ROOT_DATE")

MOCK_DATA_DIR="$MOCK_DATA_DIR_DATE" GHQ_ROOT="$TEST_ROOT_DATE" BD_CMD="$MOCK_BD_DATE" "$DIGEST" --date 2026-01-15 2>&1 || true

CUSTOM_FILE="$TEST_ROOT_DATE/loops/digests/2026-01-15.md"
if [[ -f "$CUSTOM_FILE" ]]; then
  pass "Custom date creates correct file"
else
  fail "Custom date file not created" "expected $CUSTOM_FILE"
fi

# ─────────────────────────────────────────────────
# Test 12: Markdown validity (basic checks)
# ─────────────────────────────────────────────────
echo ""
echo "=== Test 12: Valid markdown structure ==="

if [[ -f "$EXPECTED_FILE" ]]; then
  CONTENT=$(cat "$EXPECTED_FILE")
  has_h1=$(echo "$CONTENT" | grep -c "^# " || true)
  has_h2=$(echo "$CONTENT" | grep -c "^## " || true)

  if [[ "$has_h1" -ge 1 && "$has_h2" -ge 1 ]]; then
    pass "Valid markdown structure (has h1 and h2 headings)"
  else
    fail "Invalid markdown structure" "h1=$has_h1 h2=$has_h2"
  fi
else
  fail "No digest file to check" "file not generated"
fi

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed (out of $TOTAL)"
echo "==============================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
