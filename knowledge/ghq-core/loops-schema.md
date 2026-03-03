# Loops Schema

The `loops/` directory stores execution state for GHQ's autonomous loops. It uses a simple, append-only design.

## Location

```
loops/
  state.jsonl       # Current execution state (append-only)
  history.jsonl     # Completed loop records
```

## state.jsonl

An append-only JSONL file where each line records a state transition during execution. The orchestrator appends entries as skills start, complete, or fail.

### Entry Schema

```json
{
  "ts": "2026-03-01T14:30:52.000Z",
  "type": "skill_start|skill_complete|skill_error|story_complete|story_blocked|loop_start|loop_end",
  "story_id": "ghq-abc123",
  "skill_id": "architect",
  "batch_id": "ghq-abc123-b1-1709312400",
  "data": {}
}
```

#### batch_id (parallel execution tracking)

The `batch_id` field tracks which subtasks ran concurrently during batch-parallel execution. It is **optional** for backwards compatibility -- entries without `batch_id` are assumed to be from sequential (pre-parallel) execution.

| Rule | Description |
|------|-------------|
| Format | `{parent-task-id}-b{batch-number}-{epoch-seconds}` (e.g. `ghq-abc123-b1-1709312400`) |
| Parallel subtasks | Share the **same** `batch_id` (they ran in the same batch) |
| Sequential subtasks | Each gets a **unique** `batch_id` (batch of one) |
| Absent `batch_id` | Entry is from sequential execution (backwards compatible) |
| Applied to | `skill_start`, `skill_complete`, `skill_error`, `story_complete`, `story_blocked` |
| Not applied to | `loop_start`, `loop_end` (these are loop-level, not batch-level) |

The orchestrator generates the `batch_id` once per batch and passes it to all sub-agents in that batch. The `batch_id` is included in every state.jsonl entry written during that batch's execution.

### Entry Types

| Type | When | Data Fields | batch_id |
|------|------|-------------|----------|
| `loop_start` | `/run-loop` begins | `task_id`, `stories_total`, `stories_pending` | -- |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` | optional |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` | optional |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` | optional |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` | optional |
| `story_blocked` | Story fails after retry | `story_id`, `skill_id`, `reason` | optional |
| `loop_end` | `/run-loop` finishes | `task_id`, `stories_completed`, `stories_blocked` | -- |

### Example: Sequential Execution (no batch_id -- backwards compatible)

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-def456","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:05:31Z","type":"skill_start","story_id":"ghq-def456","skill_id":"backend","data":{}}
{"ts":"2026-03-01T14:15:00Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"backend","data":{"files_changed":["src/auth.ts","src/auth.test.ts"],"back_pressure":{"tests":"pass","typecheck":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"ghq-def456","data":{"skills_run":["architect","backend"]}}
```

### Example: Parallel Execution (with batch_id)

In this example, subtasks `ghq-sub1` and `ghq-sub2` run in parallel (batch 1), then `ghq-sub3` runs alone (batch 2, depends on both).

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":3,"stories_pending":3}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-sub1","skill_id":"content","batch_id":"ghq-abc123-b1-1709312400","data":{}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-sub2","skill_id":"backend","batch_id":"ghq-abc123-b1-1709312400","data":{}}
{"ts":"2026-03-01T14:03:00Z","type":"skill_complete","story_id":"ghq-sub1","skill_id":"content","batch_id":"ghq-abc123-b1-1709312400","data":{"files_changed":["docs/api.md"],"back_pressure":{"tests":"pass"}}}
{"ts":"2026-03-01T14:03:01Z","type":"story_complete","story_id":"ghq-sub1","batch_id":"ghq-abc123-b1-1709312400","data":{"skills_run":["content"]}}
{"ts":"2026-03-01T14:05:00Z","type":"skill_complete","story_id":"ghq-sub2","skill_id":"backend","batch_id":"ghq-abc123-b1-1709312400","data":{"files_changed":["src/api.ts"],"back_pressure":{"tests":"pass","typecheck":"pass"}}}
{"ts":"2026-03-01T14:05:01Z","type":"story_complete","story_id":"ghq-sub2","batch_id":"ghq-abc123-b1-1709312400","data":{"skills_run":["backend"]}}
{"ts":"2026-03-01T14:05:10Z","type":"skill_start","story_id":"ghq-sub3","skill_id":"frontend","batch_id":"ghq-abc123-b2-1709312710","data":{}}
{"ts":"2026-03-01T14:10:00Z","type":"skill_complete","story_id":"ghq-sub3","skill_id":"frontend","batch_id":"ghq-abc123-b2-1709312710","data":{"files_changed":["src/App.tsx"],"back_pressure":{"tests":"pass","typecheck":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:10:01Z","type":"story_complete","story_id":"ghq-sub3","batch_id":"ghq-abc123-b2-1709312710","data":{"skills_run":["frontend"]}}
{"ts":"2026-03-01T14:10:02Z","type":"loop_end","data":{"task_id":"ghq-abc123","stories_completed":3,"stories_blocked":0}}
```

**Interpreting parallel execution from the log:**
- `ghq-sub1` and `ghq-sub2` share `batch_id` `ghq-abc123-b1-1709312400` -- they ran concurrently in batch 1
- `ghq-sub3` has `batch_id` `ghq-abc123-b2-1709312710` -- it ran alone in batch 2 (after batch 1 completed)
- `loop_start` and `loop_end` have no `batch_id` (loop-level events)

## history.jsonl

Completed loop summaries. Each line is one finished `/run-loop` execution.

### Entry Schema

```json
{
  "ts": "2026-03-01T15:30:00Z",
  "task_id": "ghq-abc123",
  "duration_s": 5400,
  "stories_completed": 4,
  "stories_blocked": 1,
  "skills_invoked": 12,
  "blocked_stories": ["ghq-ghi789"]
}
```

## Reading Loop State

To get the current state of an in-progress loop, read the last few lines of `state.jsonl`:

```bash
tail -20 loops/state.jsonl | jq .
```

To check if a task has completed:

```bash
grep '"story_complete"' loops/state.jsonl | grep 'ghq-def456'
```

To review all blocked tasks:

```bash
grep '"story_blocked"' loops/state.jsonl | jq -r '.story_id'
```

To find all subtasks that ran in a specific batch:

```bash
grep '"ghq-abc123-b1-1709312400"' loops/state.jsonl | jq -r '.story_id' | sort -u
```

To identify which batches ran during a loop:

```bash
grep 'batch_id' loops/state.jsonl | jq -r '.batch_id' | sort -u
```

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Flat files only.

## See Also

- [Task Schema](task-schema.md) -- Task definitions and beads workflow
- [Quick Reference](quick-reference.md) -- GHQ overview
- `knowledge/ralph/` -- Ralph methodology (drives loop execution)
