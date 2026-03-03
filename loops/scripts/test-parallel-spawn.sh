#!/usr/bin/env bash
# test-parallel-spawn.sh -- Tests for parallel sub-agent spawning logic
#
# Validates the batch-parallel execution model described in run-loop.md section 5.
# These are structural/logic tests that verify the orchestrator's batching behavior
# without actually spawning sub-agents (which requires the Claude Task tool).
#
# Usage: ./loops/scripts/test-parallel-spawn.sh
#
# Tests:
#   1. Single batch of 3 tasks -> all 3 spawned in one round
#   2. Batch of 7 tasks with max concurrency 5 -> splits into chunks of 5 + 2
#   3. Multiple sequential batches -> each batch waits for previous
#   4. Failed sub-agent in batch -> marks blocked, others continue
#   5. Empty batch (all closed) -> skipped gracefully

set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

pass() { ((PASS++)); ((TOTAL++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); ((TOTAL++)); echo "  FAIL: $1 -- $2"; }

assert_eq() {
  local expected="$1"
  local actual="$2"
  local label="$3"
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
# Helper: simulate chunk_batch -- split a batch into chunks of max N
# This mirrors the logic described in run-loop.md section 5a
# ─────────────────────────────────────────────────
chunk_batch() {
  local batch_json="$1"
  local max_concurrency="${2:-5}"
  echo "$batch_json" | jq -c --argjson max "$max_concurrency" '
    [range(0; length; $max) as $i | .[$i:$i+$max]]
  '
}

# ─────────────────────────────────────────────────
# Helper: simulate process_results -- given results array, separate completed/failed
# ─────────────────────────────────────────────────
process_results() {
  local results_json="$1"
  echo "$results_json" | jq -c '{
    completed: [.[] | select(.status == "completed") | .task_id],
    failed: [.[] | select(.status == "failed" or .status == "blocked") | .task_id]
  }'
}

# ─────────────────────────────────────────────────
# Test 1: Single batch of 3 tasks -> one chunk (under max 5)
# ─────────────────────────────────────────────────
echo "Test 1: Single batch under max concurrency -> one chunk"

BATCH_1='["task-a","task-b","task-c"]'
CHUNKS_1=$(chunk_batch "$BATCH_1" 5)
EXPECTED_1='[["task-a","task-b","task-c"]]'
assert_eq "$EXPECTED_1" "$CHUNKS_1" "3 tasks -> single chunk of 3"

# ─────────────────────────────────────────────────
# Test 2: Batch of 7 tasks with max concurrency 5 -> 2 chunks (5+2)
# ─────────────────────────────────────────────────
echo "Test 2: Batch exceeds max concurrency -> splits into chunks"

BATCH_2='["t1","t2","t3","t4","t5","t6","t7"]'
CHUNKS_2=$(chunk_batch "$BATCH_2" 5)
EXPECTED_2='[["t1","t2","t3","t4","t5"],["t6","t7"]]'
assert_eq "$EXPECTED_2" "$CHUNKS_2" "7 tasks -> chunks of 5 + 2"

# ─────────────────────────────────────────────────
# Test 3: Batch of exactly 5 -> one chunk
# ─────────────────────────────────────────────────
echo "Test 3: Batch of exactly max concurrency -> one chunk"

BATCH_3='["t1","t2","t3","t4","t5"]'
CHUNKS_3=$(chunk_batch "$BATCH_3" 5)
EXPECTED_3='[["t1","t2","t3","t4","t5"]]'
assert_eq "$EXPECTED_3" "$CHUNKS_3" "5 tasks -> single chunk of 5"

# ─────────────────────────────────────────────────
# Test 4: Process results - all completed
# ─────────────────────────────────────────────────
echo "Test 4: All sub-agents complete successfully"

RESULTS_4='[
  {"task_id":"t1","status":"completed","summary":"Done"},
  {"task_id":"t2","status":"completed","summary":"Done"},
  {"task_id":"t3","status":"completed","summary":"Done"}
]'
PROCESSED_4=$(process_results "$RESULTS_4")
EXPECTED_4='{"completed":["t1","t2","t3"],"failed":[]}'
assert_eq "$EXPECTED_4" "$PROCESSED_4" "All 3 completed, 0 failed"

# ─────────────────────────────────────────────────
# Test 5: Process results - mixed (1 failed, 2 completed)
# ─────────────────────────────────────────────────
echo "Test 5: Mixed results -- failed sub-agent marked, others continue"

RESULTS_5='[
  {"task_id":"t1","status":"completed","summary":"Done"},
  {"task_id":"t2","status":"failed","summary":"Tests failed"},
  {"task_id":"t3","status":"completed","summary":"Done"}
]'
PROCESSED_5=$(process_results "$RESULTS_5")
EXPECTED_5='{"completed":["t1","t3"],"failed":["t2"]}'
assert_eq "$EXPECTED_5" "$PROCESSED_5" "2 completed, 1 failed"

# ─────────────────────────────────────────────────
# Test 6: Process results - blocked status treated as failure
# ─────────────────────────────────────────────────
echo "Test 6: Blocked status treated same as failed"

RESULTS_6='[
  {"task_id":"t1","status":"blocked","summary":"Dependency missing"},
  {"task_id":"t2","status":"completed","summary":"Done"}
]'
PROCESSED_6=$(process_results "$RESULTS_6")
EXPECTED_6='{"completed":["t2"],"failed":["t1"]}'
assert_eq "$EXPECTED_6" "$PROCESSED_6" "Blocked treated as failed"

# ─────────────────────────────────────────────────
# Test 7: Empty batch -> empty chunk
# ─────────────────────────────────────────────────
echo "Test 7: Empty batch -> empty chunks"

BATCH_7='[]'
CHUNKS_7=$(chunk_batch "$BATCH_7" 5)
EXPECTED_7='[]'
assert_eq "$EXPECTED_7" "$CHUNKS_7" "Empty batch produces no chunks"

# ─────────────────────────────────────────────────
# Test 8: Max concurrency of 1 -> fully sequential
# ─────────────────────────────────────────────────
echo "Test 8: Max concurrency 1 -> each task is its own chunk"

BATCH_8='["t1","t2","t3"]'
CHUNKS_8=$(chunk_batch "$BATCH_8" 1)
EXPECTED_8='[["t1"],["t2"],["t3"]]'
assert_eq "$EXPECTED_8" "$CHUNKS_8" "Concurrency 1 forces sequential"

# ─────────────────────────────────────────────────
# Test 9: Verify batch ordering is preserved through chunking
# ─────────────────────────────────────────────────
echo "Test 9: Batch ordering preserved across multi-batch plan"

# Simulate a 3-batch plan from dep-graph: [["a","b"], ["c"], ["d","e","f","g","h","i"]]
# Batch 3 has 6 items -> chunks to [5] + [1]
MULTI_BATCHES='[["a","b"], ["c"], ["d","e","f","g","h","i"]]'
# Process each batch and collect chunk counts
CHUNK_COUNTS=$(echo "$MULTI_BATCHES" | jq -c '[
  .[] |
  [range(0; length; 5) as $i | .[$i:$i+5]] |
  length
]')
EXPECTED_9='[1,1,2]'
assert_eq "$EXPECTED_9" "$CHUNK_COUNTS" "Batch 1: 1 chunk, Batch 2: 1 chunk, Batch 3: 2 chunks"

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
