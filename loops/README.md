# loops/

Runtime state for GHQ's autonomous project loops. This directory stores execution state using append-only JSONL files, replacing v1's `workspace/` directory with a simpler, flat design.

## Files

| File | Purpose |
|------|---------|
| `state.jsonl` | Current execution state -- append-only log of state transitions during loop execution |
| `history.jsonl` | Completed loop summaries -- one entry per finished `/run-project` execution |

## state.jsonl

An append-only JSONL file where each line records a state transition during execution. The orchestrator appends entries as skills start, complete, or fail.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp of the event |
| `type` | `string` (enum) | Event type (see table below) |
| `story_id` | `string` | Story identifier (e.g. `US-001`). Present on story/skill events. |
| `skill_id` | `string` | Skill identifier (e.g. `architect`). Present on skill events. |
| `data` | `object` | Event-specific payload (see table below) |

### Event Types

| Type | When | Data Fields |
|------|------|-------------|
| `loop_start` | `/run-project` begins | `project`, `stories_total`, `stories_pending` |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` |
| `story_blocked` | Story fails after retry | `story_id`, `skill_id`, `reason` |
| `loop_end` | `/run-project` finishes | `project`, `stories_completed`, `stories_blocked` |

### Example Entries

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"project":"user-auth","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"US-001","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"US-001","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"US-001","data":{"skills_run":["architect","backend"]}}
{"ts":"2026-03-01T14:15:02Z","type":"story_blocked","story_id":"US-005","skill_id":"backend","data":{"reason":"typecheck failed after 2 retries"}}
{"ts":"2026-03-01T15:30:00Z","type":"loop_end","data":{"project":"user-auth","stories_completed":4,"stories_blocked":1}}
```

## history.jsonl

Completed loop summaries. Each line is one finished `/run-project` execution.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp when the loop finished |
| `project` | `string` | Project slug |
| `duration_s` | `number` | Total loop duration in seconds |
| `stories_completed` | `number` | Count of stories that finished successfully |
| `stories_blocked` | `number` | Count of stories that failed after retries |
| `skills_invoked` | `number` | Total skill invocations across all stories |
| `blocked_stories` | `string[]` | List of story IDs that were blocked |

### Example Entry

```jsonl
{"ts":"2026-03-01T15:30:00Z","project":"user-auth","duration_s":5400,"stories_completed":4,"stories_blocked":1,"skills_invoked":12,"blocked_stories":["US-005"]}
```

## Usage

Read the last few state transitions:

```bash
tail -20 loops/state.jsonl | jq .
```

Check if a story completed:

```bash
grep '"story_complete"' loops/state.jsonl | grep 'US-001'
```

List all blocked stories:

```bash
grep '"story_blocked"' loops/state.jsonl | jq -r '.story_id'
```

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Unlike v1's `workspace/` directory, loops/ uses flat files.

## See Also

- `knowledge/ghq-core/loops-schema.md` -- Canonical schema definition
- `knowledge/ghq-core/prd-schema.md` -- Story definitions and beads workflow
