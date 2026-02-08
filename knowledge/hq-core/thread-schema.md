# Thread Schema

Threads persist complete session state including conversation summary, git context, and worker execution info. Inspired by Loom's thread-system.

## Location

`workspace/threads/{thread_id}.json`

## Thread ID Format

`T-{YYYYMMDD}-{HHMMSS}-{slug}`

Example: `T-20260123-143052-mrr-report`

## Schema

```json
{
  "thread_id": "T-20260123-143052-mrr-report",
  "version": 1,
  "created_at": "2026-01-23T14:30:52.000Z",
  "updated_at": "2026-01-23T14:35:00.000Z",

  "workspace_root": "~/Documents/HQ",
  "cwd": "repos/private/{company}",

  "git": {
    "branch": "main",
    "remote_url": "git@github.com:user/repo.git",
    "initial_commit": "abc1234",
    "current_commit": "def5678",
    "commits_made": [
      "def5678: feat: add MRR calculation"
    ],
    "dirty": false
  },

  "worker": {
    "id": "{worker-id}",
    "skill": "mrr",
    "state": "completed",
    "started_at": "2026-01-23T14:30:52.000Z",
    "completed_at": "2026-01-23T14:35:00.000Z"
  },

  "conversation_summary": "Generated MRR report showing $45,230 current MRR with 3.2% growth",
  "files_touched": [
    "workspace/reports/finance/2026-01-23-mrr.md"
  ],
  "next_steps": [],

  "metadata": {
    "title": "MRR Report Jan 2026",
    "tags": ["finance", "{company}", "mrr"]
  }
}
```

## Fields

### Core

| Field | Type | Description |
|-------|------|-------------|
| `thread_id` | string | Unique identifier |
| `version` | number | Schema version (currently 1) |
| `created_at` | ISO8601 | Thread creation time |
| `updated_at` | ISO8601 | Last update time |

### Context

| Field | Type | Description |
|-------|------|-------------|
| `workspace_root` | string | HQ root path |
| `cwd` | string | Working directory (relative to root) |

### Git State

| Field | Type | Description |
|-------|------|-------------|
| `git.branch` | string | Current branch |
| `git.remote_url` | string | Origin remote URL |
| `git.initial_commit` | string | Commit SHA at thread start |
| `git.current_commit` | string | Commit SHA at thread end |
| `git.commits_made` | string[] | Commits created during session |
| `git.dirty` | boolean | Uncommitted changes present |

### Worker State

| Field | Type | Description |
|-------|------|-------------|
| `worker.id` | string | Worker ID (if applicable) |
| `worker.skill` | string | Skill executed |
| `worker.state` | enum | `idle`, `loading`, `executing`, `verifying`, `completed`, `error` |
| `worker.started_at` | ISO8601 | Execution start |
| `worker.completed_at` | ISO8601 | Execution end |

### Results

| Field | Type | Description |
|-------|------|-------------|
| `conversation_summary` | string | What was accomplished |
| `files_touched` | string[] | Files created/modified |
| `next_steps` | string[] | Remaining work |

### Metadata

| Field | Type | Description |
|-------|------|-------------|
| `metadata.title` | string | Human-readable title |
| `metadata.tags` | string[] | Searchable tags |

## State Values

Worker states follow the FSM:

```
idle → loading → executing → verifying → completed
                    ↓
                  error
```

## Usage

### Creating a Thread

```bash
# Captured by /checkpoint command
/checkpoint mrr-report
```

### Searching Threads

```bash
# Via /search command
/search mrr
```

### Listing Recent

```bash
ls -lt workspace/threads/ | head -10
```

## Backward Compatibility

Old checkpoints in `workspace/checkpoints/` remain valid. Threads are a superset with richer git context.

## See Also

- [Loom thread-system](../loom/thread-system.md) - Inspiration
- `/checkpoint` command - Creates threads
- `/search` command - Searches threads
