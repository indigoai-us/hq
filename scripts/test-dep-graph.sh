#!/usr/bin/env bash
# test-dep-graph.sh -- Tests for dep-graph.sh dependency batching algorithm
#
# Usage: ./scripts/test-dep-graph.sh
#
# Tests the three core scenarios from acceptance criteria:
#   1. All independent subtasks -> single batch
#   2. Linear chain A->B->C -> sequential batches
#   3. Diamond deps (A->B, A->C, B->D, C->D) -> [A], [B,C], [D]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEP_GRAPH="$SCRIPT_DIR/dep-graph.sh"

PASS=0
FAIL=0
TOTAL=0

pass() { ((PASS++)); ((TOTAL++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  FAIL: $1 -- $2"; }

assert_eq() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  # Normalize whitespace for comparison
  local norm_expected norm_actual
  norm_expected=$(echo "$expected" | jq -cS '.')
  norm_actual=$(echo "$actual" | jq -cS '.')
  if [ "$norm_expected" = "$norm_actual" ]; then
    pass "$label"
  else
    fail "$label" "expected=$norm_expected actual=$norm_actual"
  fi
}

# ─────────────────────────────────────────────────
# Test 1: All independent (no blocking deps)
# 4 subtasks, no blocks dependencies -> all in one batch
# ─────────────────────────────────────────────────
echo "Test 1: All independent subtasks -> single batch"

INPUT_1='[
  {"id":"t1","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"t2","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"t3","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"t4","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]}
]'

EXPECTED_1='[["t1","t2","t3","t4"]]'
ACTUAL_1=$(echo "$INPUT_1" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_1" "$ACTUAL_1" "4 independent subtasks in one batch"

# ─────────────────────────────────────────────────
# Test 2: Linear chain A -> B -> C
# Each in a separate sequential batch
# ─────────────────────────────────────────────────
echo "Test 2: Linear chain A->B->C -> sequential batches"

INPUT_2='[
  {"id":"A","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"B","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"A","type":"blocks"}]},
  {"id":"C","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"B","type":"blocks"}]}
]'

EXPECTED_2='[["A"],["B"],["C"]]'
ACTUAL_2=$(echo "$INPUT_2" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_2" "$ACTUAL_2" "Linear chain produces 3 sequential batches"

# ─────────────────────────────────────────────────
# Test 3: Diamond deps
# A->B, A->C, B->D, C->D
# Batches: [A], [B,C], [D]
# ─────────────────────────────────────────────────
echo "Test 3: Diamond deps -> [A], [B,C], [D]"

INPUT_3='[
  {"id":"A","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"B","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"A","type":"blocks"}]},
  {"id":"C","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"A","type":"blocks"}]},
  {"id":"D","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"B","type":"blocks"},{"depends_on_id":"C","type":"blocks"}]}
]'

EXPECTED_3='[["A"],["B","C"],["D"]]'
ACTUAL_3=$(echo "$INPUT_3" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_3" "$ACTUAL_3" "Diamond deps produce 3 batches with B,C parallel"

# ─────────────────────────────────────────────────
# Test 4: Single subtask (edge case)
# ─────────────────────────────────────────────────
echo "Test 4: Single subtask -> single batch"

INPUT_4='[
  {"id":"solo","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]}
]'

EXPECTED_4='[["solo"]]'
ACTUAL_4=$(echo "$INPUT_4" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_4" "$ACTUAL_4" "Single subtask in one batch"

# ─────────────────────────────────────────────────
# Test 5: Already-closed subtasks are excluded
# ─────────────────────────────────────────────────
echo "Test 5: Closed subtasks excluded from batches"

INPUT_5='[
  {"id":"done","status":"closed","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"open1","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"done","type":"blocks"}]},
  {"id":"open2","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]}
]'

EXPECTED_5='[["open1","open2"]]'
ACTUAL_5=$(echo "$INPUT_5" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_5" "$ACTUAL_5" "Closed deps treated as resolved"

# ─────────────────────────────────────────────────
# Test 6: Empty input (no subtasks)
# ─────────────────────────────────────────────────
echo "Test 6: Empty input -> empty batches"

INPUT_6='[]'

EXPECTED_6='[]'
ACTUAL_6=$(echo "$INPUT_6" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_6" "$ACTUAL_6" "Empty input returns empty array"

# ─────────────────────────────────────────────────
# Test 7: Complex graph with multiple roots
# A and B are independent roots, C depends on A, D depends on B, E depends on C and D
# Batches: [A,B], [C,D], [E]
# ─────────────────────────────────────────────────
echo "Test 7: Complex graph with multiple roots"

INPUT_7='[
  {"id":"A","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"B","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"}]},
  {"id":"C","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"A","type":"blocks"}]},
  {"id":"D","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"B","type":"blocks"}]},
  {"id":"E","status":"open","dependencies":[{"depends_on_id":"parent","type":"parent-child"},{"depends_on_id":"C","type":"blocks"},{"depends_on_id":"D","type":"blocks"}]}
]'

EXPECTED_7='[["A","B"],["C","D"],["E"]]'
ACTUAL_7=$(echo "$INPUT_7" | "$DEP_GRAPH" --stdin)
assert_eq "$EXPECTED_7" "$ACTUAL_7" "Multiple roots with convergence"

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
