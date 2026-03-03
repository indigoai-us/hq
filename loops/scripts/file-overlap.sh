#!/usr/bin/env bash
# file-overlap.sh -- Detect file overlap between subtasks in a parallel batch
#
# Takes a batch of subtask IDs and their metadata, estimates which files each
# subtask will touch (using description, title, and acceptance criteria heuristics),
# and splits overlapping subtasks into separate sub-batches to prevent parallel
# write conflicts.
#
# Usage:
#   echo '<json>' | ./loops/scripts/file-overlap.sh --stdin   # Read from stdin
#   ./loops/scripts/file-overlap.sh <parent-task-id> <batch-json>  # Fetch from beads
#
# Input JSON format (stdin):
#   {
#     "batch": ["task-a", "task-b", "task-c"],
#     "subtasks": {
#       "task-a": { "id": "task-a", "title": "...", "description": "...", "metadata": "{...}" },
#       ...
#     }
#   }
#
# Output (JSON):
#   [["task-a","task-c"], ["task-b"]]
#   Each inner array is a sub-batch. task-b was deferred because it overlaps with task-a.
#
# Algorithm:
#   1. For each subtask, extract file scope from title, description, and acceptanceCriteria
#   2. Build conflict pairs: tasks sharing any file path
#   3. Greedy first-fit: assign tasks to sub-batches avoiding conflicts
#
# Logging:
#   Serialization decisions are logged to stderr with overlapping file paths.

set -euo pipefail

# ─────────────────────────────────────────────────
# Input
# ─────────────────────────────────────────────────
if [ "${1:-}" = "--stdin" ]; then
  INPUT_JSON=$(cat)
elif [ -n "${1:-}" ] && [ -n "${2:-}" ]; then
  PARENT_ID="$1"
  BATCH_JSON="$2"
  SUBTASKS_RAW=$(bd children "$PARENT_ID" --json 2>/dev/null)
  INPUT_JSON=$(echo "$SUBTASKS_RAW" | jq -c --argjson batch "$BATCH_JSON" '
    ($batch) as $ids |
    {
      batch: $ids,
      subtasks: (
        [.[] | select(.id as $id | $ids | index($id) != null)] |
        reduce .[] as $t ({}; . + { ($t.id): $t })
      )
    }
  ')
else
  echo "Usage: file-overlap.sh --stdin | file-overlap.sh <parent-task-id> <batch-json>" >&2
  exit 1
fi

# ─────────────────────────────────────────────────
# Phase 1: Extract file scopes per subtask
# Output: {"task-a": ["path1", "path2"], "task-b": ["path3"]}
# ─────────────────────────────────────────────────
SCOPES=$(echo "$INPUT_JSON" | jq -c '
  # Extract file-like paths from text using two strategies:
  # 1. Paths with directory separators (e.g. .claude/skills/SKILL.md)
  # 2. Standalone filenames (e.g. SKILL.md, run-loop.md)
  # IMPORTANT: bind each match result to a variable before concatenating
  # to avoid jq generator composition issues with comma in array constructor.
  def extract_paths:
    ([match("([a-zA-Z0-9_./-]+/[a-zA-Z0-9_.-]+\\.[a-zA-Z0-9]+)"; "g") | .captures[0].string]) as $dir_paths |
    ([match("(?:^|\\s)([A-Z][A-Za-z0-9_-]*\\.[a-zA-Z]{1,5})(?:\\s|$|[,;])"; "g") | .captures[0].string]) as $file_names |
    ($dir_paths + $file_names) | map(gsub("^\\./"; "") | ascii_downcase) | unique;

  .batch as $batch |
  .subtasks as $subtasks |
  reduce $batch[] as $id ({};
    ($subtasks[$id]) as $task |
    (
      ($task.title // "") + " " +
      ($task.description // "") + " " +
      (
        (($task.metadata // "{}") | if type == "string" then (try fromjson // {}) else . end) |
        (.acceptanceCriteria // []) |
        if type == "array" then join(" ") else tostring end
      )
    ) as $text |
    . + { ($id): ($text | extract_paths) }
  )
')

# ─────────────────────────────────────────────────
# Phase 2: Find conflict pairs
# Output: [{"a":"task-a","b":"task-b","files":["shared.md"]}]
# ─────────────────────────────────────────────────
CONFLICTS=$(echo "$INPUT_JSON" | jq -c --argjson scopes "$SCOPES" '
  .batch as $batch |
  [
    range(0; $batch | length) as $i |
    range($i + 1; $batch | length) as $j |
    ($batch[$i]) as $id_a |
    ($batch[$j]) as $id_b |
    ($scopes[$id_a] // []) as $pa |
    ($scopes[$id_b] // []) as $pb |
    ([$pa[] | . as $p | select([$pb[] | select(. == $p)] | length > 0)]) as $overlap |
    select($overlap | length > 0) |
    { a: $id_a, b: $id_b, files: $overlap }
  ]
')

# ─────────────────────────────────────────────────
# Phase 3: Greedy sub-batch assignment
# Process tasks in batch order; assign to first non-conflicting sub-batch.
# ─────────────────────────────────────────────────
RESULT=$(echo "$INPUT_JSON" | jq -c --argjson conflicts "$CONFLICTS" '
  .batch as $batch |

  if ($batch | length) <= 1 then
    if ($batch | length) == 0 then [] else [$batch] end
  else
    # For each task, precompute set of conflicting task IDs
    (reduce $batch[] as $tid ({};
      . + { ($tid): [
        ($conflicts[] | select(.a == $tid) | .b),
        ($conflicts[] | select(.b == $tid) | .a)
      ] | unique }
    )) as $conflict_map |

    # Greedy first-fit coloring
    (reduce $batch[] as $tid (
      { sub_batches: [] };

      ($conflict_map[$tid] // []) as $my_conflicts |

      # Find first sub-batch with no conflicting task
      (
        . as $state |
        ($state.sub_batches | length) as $num |
        (reduce range(0; $num + 1) as $idx (
          { placed: false, result: $state };
          if .placed then . else
            if $idx == $num then
              # Create new sub-batch
              { placed: true, result: ($state | .sub_batches += [[$tid]]) }
            else
              # Check if sub-batch $idx has any conflict
              ($state.sub_batches[$idx]) as $sb |
              ([$my_conflicts[] | . as $c | select([$sb[] | select(. == $c)] | length > 0)] | length) as $hits |
              if $hits == 0 then
                { placed: true, result: ($state | .sub_batches[$idx] += [$tid]) }
              else
                .
              end
            end
          end
        ))
      ).result
    )) |

    [.sub_batches[] | select(length > 0)]
  end
')

# ─────────────────────────────────────────────────
# Phase 4: Log serialization decisions to stderr
# ─────────────────────────────────────────────────
NUM_SUBBATCHES=$(echo "$RESULT" | jq 'length')
BATCH_SIZE=$(echo "$INPUT_JSON" | jq '.batch | length')

if [ "$NUM_SUBBATCHES" -gt 1 ] && [ "$BATCH_SIZE" -gt 1 ]; then
  echo "$CONFLICTS" | jq -r '.[] | "file-overlap: serialized \(.b) after \(.a) due to overlap on: \(.files | join(", "))"' >&2
fi

echo "$RESULT"
