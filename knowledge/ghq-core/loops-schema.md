# Loops Schema

The `loops/` directory stores execution state for GHQ's autonomous project loops. It replaces v1's `workspace/` directory with a simpler, append-only design.

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
  "story_id": "US-001",
  "skill_id": "architect",
  "data": {}
}
```

### Entry Types

| Type | When | Data Fields |
|------|------|-------------|
| `loop_start` | `/run-project` begins | `project`, `stories_total`, `stories_pending` |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` |
| `story_blocked` | Story fails after retry | `story_id`, `skill_id`, `reason` |
| `loop_end` | `/run-project` finishes | `project`, `stories_completed`, `stories_blocked` |

### Example state.jsonl

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"project":"user-auth","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"US-001","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"US-001","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:05:31Z","type":"skill_start","story_id":"US-001","skill_id":"backend","data":{}}
{"ts":"2026-03-01T14:15:00Z","type":"skill_complete","story_id":"US-001","skill_id":"backend","data":{"files_changed":["src/auth.ts","src/auth.test.ts"],"back_pressure":{"tests":"pass","typecheck":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"US-001","data":{"skills_run":["architect","backend"]}}
```

## history.jsonl

Completed loop summaries. Each line is one finished `/run-project` execution.

### Entry Schema

```json
{
  "ts": "2026-03-01T15:30:00Z",
  "project": "user-auth",
  "duration_s": 5400,
  "stories_completed": 4,
  "stories_blocked": 1,
  "skills_invoked": 12,
  "blocked_stories": ["US-005"]
}
```

## Reading Loop State

To get the current state of an in-progress loop, read the last few lines of `state.jsonl`:

```bash
tail -20 loops/state.jsonl | jq .
```

To check if a story has completed:

```bash
grep '"story_complete"' loops/state.jsonl | grep 'US-001'
```

To review all blocked stories:

```bash
grep '"story_blocked"' loops/state.jsonl | jq -r '.story_id'
```

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Unlike v1's `workspace/orchestrator/state.json` + `workspace/threads/*.json`, loops uses flat files.

## Migration from v1

| v1 (workspace/) | v2 (loops/) |
|------------------|-------------|
| `workspace/orchestrator/state.json` | `loops/state.jsonl` |
| `workspace/threads/*.json` | Replaced by state.jsonl entries |
| `workspace/reports/` | Not carried forward (reports generated on demand) |
| Checkpoint JSON schema | JSONL entries with `type` field |
| Thread IDs (`T-YYYYMMDD-HHMMSS-slug`) | Timestamps in each JSONL entry |

## See Also

- [PRD Schema](prd-schema.md) -- Story definitions and beads workflow
- [Quick Reference](quick-reference.md) -- GHQ overview
- `knowledge/ralph/` -- Ralph methodology (drives loop execution)
