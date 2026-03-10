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
  "data": {}
}
```

### Entry Types

| Type | When | Data Fields |
|------|------|-------------|
| `loop_start` | `/run-loop` begins | `task_id`, `stories_total`, `stories_pending` |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` |
| `story_blocked` | Story fails after retry | `story_id`, `skill_id`, `reason` |
| `loop_end` | `/run-loop` finishes | `task_id`, `stories_completed`, `stories_blocked` |

### Example state.jsonl

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-def456","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:05:31Z","type":"skill_start","story_id":"ghq-def456","skill_id":"backend","data":{}}
{"ts":"2026-03-01T14:15:00Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"backend","data":{"files_changed":["src/auth.ts","src/auth.test.ts"],"back_pressure":{"tests":"pass","typecheck":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"ghq-def456","data":{"skills_run":["architect","backend"]}}
```

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

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Flat files only.

## See Also

- [Task Schema](task-schema.md) -- Task definitions and beads workflow
- [Quick Reference](quick-reference.md) -- GHQ overview
- `knowledge/ralph/` -- Ralph methodology (drives loop execution)
