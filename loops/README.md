# loops/

Runtime state for GHQ's autonomous loops. This directory stores execution state using append-only JSONL files.

## Files

| File | Purpose |
|------|---------|
| `state.jsonl` | Current execution state -- append-only log of state transitions during loop execution |
| `history.jsonl` | Completed loop summaries -- one entry per finished `/run-loop` execution |

## state.jsonl

An append-only JSONL file where each line records a state transition during execution. The orchestrator appends entries as skills start, complete, or fail.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp of the event |
| `type` | `string` (enum) | Event type (see table below) |
| `story_id` | `string` | Task identifier (e.g. `ghq-def456`). Present on task/skill events. |
| `skill_id` | `string` | Skill identifier (e.g. `architect`). Present on skill events. |
| `data` | `object` | Event-specific payload (see table below) |

### Event Types

| Type | When | Data Fields |
|------|------|-------------|
| `loop_start` | `/run-loop` begins | `task_id`, `stories_total`, `stories_pending` |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` |
| `story_blocked` | Task fails after retry | `story_id`, `skill_id`, `reason` |
| `loop_end` | `/run-loop` finishes | `task_id`, `stories_completed`, `stories_blocked` |

### Example Entries

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-def456","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"ghq-def456","data":{"skills_run":["architect","backend"]}}
{"ts":"2026-03-01T14:15:02Z","type":"story_blocked","story_id":"ghq-ghi789","skill_id":"backend","data":{"reason":"typecheck failed after 2 retries"}}
{"ts":"2026-03-01T15:30:00Z","type":"loop_end","data":{"task_id":"ghq-abc123","stories_completed":4,"stories_blocked":1}}
```

## history.jsonl

Completed loop summaries. Each line is one finished `/run-loop` execution.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp when the loop finished |
| `task_id` | `string` | Parent task ID |
| `duration_s` | `number` | Total loop duration in seconds |
| `stories_completed` | `number` | Count of subtasks that finished successfully |
| `stories_blocked` | `number` | Count of subtasks that failed after retries |
| `skills_invoked` | `number` | Total skill invocations across all subtasks |
| `blocked_stories` | `string[]` | List of task IDs that were blocked |

### Example Entry

```jsonl
{"ts":"2026-03-01T15:30:00Z","task_id":"ghq-abc123","duration_s":5400,"stories_completed":4,"stories_blocked":1,"skills_invoked":12,"blocked_stories":["ghq-ghi789"]}
```

## Usage

Read the last few state transitions:

```bash
tail -20 loops/state.jsonl | jq .
```

Check if a task completed:

```bash
grep '"story_complete"' loops/state.jsonl | grep 'ghq-def456'
```

List all blocked tasks:

```bash
grep '"story_blocked"' loops/state.jsonl | jq -r '.story_id'
```

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Flat files only.

## See Also

- `knowledge/ghq-core/loops-schema.md` -- Canonical schema definition
- `knowledge/ghq-core/task-schema.md` -- Task definitions and beads workflow
