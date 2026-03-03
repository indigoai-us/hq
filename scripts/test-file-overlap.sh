#!/usr/bin/env bash
# test-file-overlap.sh -- Tests for file-overlap.sh overlap detection
#
# Validates that subtasks with overlapping file scopes are separated into
# different batches to prevent parallel write conflicts.
#
# Usage: ./scripts/test-file-overlap.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE_OVERLAP="$SCRIPT_DIR/file-overlap.sh"

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

# Check output contains a string (for logging assertions)
assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    pass "$label"
  else
    fail "$label" "output does not contain '$needle'"
  fi
}

# ─────────────────────────────────────────────────
# Test 1: Two subtasks targeting same SKILL.md -> separated
# This is the primary acceptance test from the task spec.
# ─────────────────────────────────────────────────
echo "Test 1: Two subtasks both targeting same SKILL.md are NOT parallel"

INPUT_1='{
  "batch": ["t1", "t2"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Implement SKILL.md for deep-research",
      "description": "Create .claude/skills/deep-research/SKILL.md implementing the designed architecture",
      "metadata": "{\"acceptanceCriteria\":[\".claude/skills/deep-research/SKILL.md exists\"]}"
    },
    "t2": {
      "id": "t2",
      "title": "Add link validation to deep-research SKILL.md",
      "description": "Add link validation step to .claude/skills/deep-research/SKILL.md",
      "metadata": "{\"acceptanceCriteria\":[\"SKILL.md includes a link validation step\"]}"
    }
  }
}'

RESULT_1=$(echo "$INPUT_1" | "$FILE_OVERLAP" --stdin 2>/dev/null)
# t1 and t2 should NOT be in the same batch -- t2 should be deferred
EXPECTED_1='[["t1"],["t2"]]'
assert_eq "$EXPECTED_1" "$RESULT_1" "Two subtasks targeting same SKILL.md split into 2 batches"

# ─────────────────────────────────────────────────
# Test 2: Two subtasks with no file overlap -> stay parallel
# ─────────────────────────────────────────────────
echo "Test 2: No overlap -> both stay in same batch"

INPUT_2='{
  "batch": ["t1", "t2"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Update run-loop.md command",
      "description": "Update .claude/commands/run-loop.md with parallel logic",
      "metadata": "{\"acceptanceCriteria\":[\"run-loop.md updated\"]}"
    },
    "t2": {
      "id": "t2",
      "title": "Update loops schema docs",
      "description": "Update knowledge/ghq-core/loops-schema.md with batch_id field",
      "metadata": "{\"acceptanceCriteria\":[\"loops-schema.md updated\"]}"
    }
  }
}'

RESULT_2=$(echo "$INPUT_2" | "$FILE_OVERLAP" --stdin 2>/dev/null)
EXPECTED_2='[["t1","t2"]]'
assert_eq "$EXPECTED_2" "$RESULT_2" "No overlap: both tasks stay parallel"

# ─────────────────────────────────────────────────
# Test 3: Three subtasks, two overlap -> overlap pair separated
# ─────────────────────────────────────────────────
echo "Test 3: Three subtasks, two overlap, one independent"

INPUT_3='{
  "batch": ["t1", "t2", "t3"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Add overlap detection script",
      "description": "Create scripts/file-overlap.sh for detecting file conflicts",
      "metadata": "{}"
    },
    "t2": {
      "id": "t2",
      "title": "Add overlap tests",
      "description": "Create scripts/test-file-overlap.sh to test the overlap detection",
      "metadata": "{}"
    },
    "t3": {
      "id": "t3",
      "title": "Integrate overlap into run-loop",
      "description": "Update scripts/file-overlap.sh with integration hooks",
      "metadata": "{}"
    }
  }
}'

RESULT_3=$(echo "$INPUT_3" | "$FILE_OVERLAP" --stdin 2>/dev/null)
# t1 and t3 both target scripts/file-overlap.sh -> t3 deferred
# t2 targets scripts/test-file-overlap.sh -> no overlap with t1
EXPECTED_3='[["t1","t2"],["t3"]]'
assert_eq "$EXPECTED_3" "$RESULT_3" "Overlapping pair split, independent stays"

# ─────────────────────────────────────────────────
# Test 4: Single task -> no splitting needed
# ─────────────────────────────────────────────────
echo "Test 4: Single task in batch -> pass through unchanged"

INPUT_4='{
  "batch": ["t1"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Build dep graph",
      "description": "Create scripts/dep-graph.sh",
      "metadata": "{}"
    }
  }
}'

RESULT_4=$(echo "$INPUT_4" | "$FILE_OVERLAP" --stdin 2>/dev/null)
EXPECTED_4='[["t1"]]'
assert_eq "$EXPECTED_4" "$RESULT_4" "Single task passes through"

# ─────────────────────────────────────────────────
# Test 5: repoPath overlap -> same repo means same scope
# ─────────────────────────────────────────────────
echo "Test 5: Subtasks sharing repoPath with broad scope overlap"

INPUT_5='{
  "batch": ["t1", "t2"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Refactor database models",
      "description": "Update src/models/user.ts and src/models/post.ts",
      "metadata": "{\"repoPath\":\"/Users/test/myapp\"}"
    },
    "t2": {
      "id": "t2",
      "title": "Add API routes",
      "description": "Create src/routes/api.ts and update src/index.ts",
      "metadata": "{\"repoPath\":\"/Users/test/myapp\"}"
    }
  }
}'

RESULT_5=$(echo "$INPUT_5" | "$FILE_OVERLAP" --stdin 2>/dev/null)
# Different files extracted from descriptions -> no overlap
EXPECTED_5='[["t1","t2"]]'
assert_eq "$EXPECTED_5" "$RESULT_5" "Same repo but different files -> no overlap"

# ─────────────────────────────────────────────────
# Test 6: Overlapping directory scope
# ─────────────────────────────────────────────────
echo "Test 6: Subtasks targeting same directory"

INPUT_6='{
  "batch": ["t1", "t2"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Update run-loop command",
      "description": "Modify .claude/commands/run-loop.md",
      "metadata": "{}"
    },
    "t2": {
      "id": "t2",
      "title": "Update run-loop command with error handling",
      "description": "Add error handling to .claude/commands/run-loop.md",
      "metadata": "{}"
    }
  }
}'

RESULT_6=$(echo "$INPUT_6" | "$FILE_OVERLAP" --stdin 2>/dev/null)
EXPECTED_6='[["t1"],["t2"]]'
assert_eq "$EXPECTED_6" "$RESULT_6" "Same file target -> split into sequential"

# ─────────────────────────────────────────────────
# Test 7: Logging output indicates serialization reason
# ─────────────────────────────────────────────────
echo "Test 7: Logging indicates serialization due to overlap"

# Capture stderr (where logs go)
LOG_7=$(echo "$INPUT_1" | "$FILE_OVERLAP" --stdin 2>&1 1>/dev/null || true)
assert_contains "$LOG_7" "overlap" "Log mentions overlap detection"

# ─────────────────────────────────────────────────
# Test 8: Empty batch -> empty output
# ─────────────────────────────────────────────────
echo "Test 8: Empty batch -> empty output"

INPUT_8='{
  "batch": [],
  "subtasks": {}
}'

RESULT_8=$(echo "$INPUT_8" | "$FILE_OVERLAP" --stdin 2>/dev/null)
EXPECTED_8='[]'
assert_eq "$EXPECTED_8" "$RESULT_8" "Empty batch returns empty array"

# ─────────────────────────────────────────────────
# Test 9: Description with explicit file paths
# ─────────────────────────────────────────────────
echo "Test 9: Explicit file paths in description extracted correctly"

INPUT_9='{
  "batch": ["t1", "t2"],
  "subtasks": {
    "t1": {
      "id": "t1",
      "title": "Update state schema",
      "description": "Modify loops/state.jsonl schema and update knowledge/ghq-core/loops-schema.md",
      "metadata": "{}"
    },
    "t2": {
      "id": "t2",
      "title": "Update loop docs",
      "description": "Update knowledge/ghq-core/loops-schema.md with new entry types",
      "metadata": "{}"
    }
  }
}'

RESULT_9=$(echo "$INPUT_9" | "$FILE_OVERLAP" --stdin 2>/dev/null)
# Both target knowledge/ghq-core/loops-schema.md
EXPECTED_9='[["t1"],["t2"]]'
assert_eq "$EXPECTED_9" "$RESULT_9" "Shared file path in description -> split"

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
