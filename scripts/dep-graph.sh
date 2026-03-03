#!/usr/bin/env bash
# dep-graph.sh -- Build dependency DAG and identify parallel execution batches
#
# Reads subtask data (from bd children --json) and groups open subtasks into
# execution levels (batches) using topological sort (Kahn algorithm).
# Each batch contains independent subtasks that can run concurrently.
# Batch N+1 depends on all tasks in batch N being completed.
#
# Usage:
#   ./scripts/dep-graph.sh <parent-task-id>       # Fetch from beads
#   echo '<json>' | ./scripts/dep-graph.sh --stdin  # Read from stdin (for testing)
#
# Output (JSON):
#   [["taskA","taskB"], ["taskC"], ["taskD","taskE"]]
#   Each inner array is a batch. Batches are ordered: batch 0 runs first.
#
# Algorithm:
#   1. Parse subtasks, filter to open/in_progress only
#   2. Extract "blocks" dependencies (ignore parent-child)
#   3. Build adjacency list and in-degree map
#   4. Kahn algorithm with level tracking:
#      - Start with all nodes having in-degree 0 (no unresolved deps)
#      - Process one level at a time: all zero-degree nodes form a batch
#      - Remove them, decrement successors in-degrees
#      - Repeat until all nodes are placed
#   5. Output batches as JSON array of arrays

set -euo pipefail

# ─────────────────────────────────────────────────
# Input: get subtask JSON
# ─────────────────────────────────────────────────
if [ "${1:-}" = "--stdin" ]; then
  SUBTASKS_JSON=$(cat)
elif [ -n "${1:-}" ]; then
  SUBTASKS_JSON=$(bd children "$1" --json 2>/dev/null)
else
  echo "Usage: dep-graph.sh <parent-task-id> | dep-graph.sh --stdin" >&2
  exit 1
fi

# ─────────────────────────────────────────────────
# Process: Build DAG and compute batches via jq
# ─────────────────────────────────────────────────
echo "$SUBTASKS_JSON" | jq -c '
# Step 1: Separate open and closed subtasks
. as $all |
[.[] | select(.status == "open" or .status == "in_progress")] as $open |
[$all[] | select(.status == "closed" or .status == "done") | .id] as $closed_ids |
[$open[] | .id] as $open_ids |

if ($open | length) == 0 then
  []
else

  # Step 2: Build blocking-dependency edges (only "blocks" type, only between open subtasks)
  [
    $open[] |
    .id as $task_id |
    (.dependencies // [])[] |
    select(.type == "blocks") |
    select(.depends_on_id as $dep | $open_ids | index($dep) != null) |
    { from: .depends_on_id, to: $task_id }
  ] as $edges |

  # Step 3: Compute in-degree for each open subtask
  (reduce $open_ids[] as $id ({}; . + { ($id): 0 })) as $base_degrees |
  (reduce $edges[] as $e ($base_degrees; .[$e.to] = (.[$e.to] // 0) + 1)) as $in_degree |

  # Step 4: Build adjacency list (forward edges: from -> [to1, to2, ...])
  (reduce $edges[] as $e ({}; .[$e.from] = ((.[$e.from] // []) + [$e.to]))) as $adj |

  # Step 5: Kahn algorithm with level tracking
  { batches: [], degrees: $in_degree, remaining: $open_ids } |
  until(
    (.remaining | length) == 0;

    . as $state |
    [$state.remaining[] | select($state.degrees[.] == 0)] as $batch |

    if ($batch | length) == 0 then
      # Cycle detected -- dump remaining as final batch
      .batches += [.remaining] | .remaining = []
    else
      ($batch | sort) as $sorted_batch |
      (.remaining | [.[] | . as $id | select([$sorted_batch[] | select(. == $id)] | length == 0)]) as $new_remaining |
      (reduce $sorted_batch[] as $node (.degrees;
        reduce ($adj[$node] // [])[] as $succ (.; .[$succ] = (.[$succ] - 1))
      )) as $new_degrees |
      .batches += [$sorted_batch] | .degrees = $new_degrees | .remaining = $new_remaining
    end
  ) |
  .batches

end
'
