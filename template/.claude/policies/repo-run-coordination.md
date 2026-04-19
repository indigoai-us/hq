---
id: repo-run-coordination
title: Repo-level active-run coordination across sessions
scope: global
trigger: /run-project, /execute-task, /brainstorm, /prd, Edit, Write, Bash
enforcement: hard
---

## Rule

When a `/run-project` owns a repo, no other Claude session may edit files inside
that repo until the run finishes. "Owns" means: the orchestrator has registered
itself in `workspace/orchestrator/active-runs.json` with `scope: "repo"` and
`repo_path` matching the target file's ancestor `.git` root.

Enforcement is automatic and layered:

1. **SessionStart banner** (`.claude/hooks/check-repo-active-runs.sh`) —
   When a new session opens with cwd inside a repo that already has a live
   foreign owner, prints an `<active-runs-warning>` block listing the owner
   (command, project, PID, started_at) and remediation options. Non-blocking.

2. **PreToolUse hard block** (`.claude/hooks/block-on-active-run.sh`) —
   Blocks `Edit`, `Write`, `NotebookEdit`, `MultiEdit`, and destructive `Bash`
   patterns (`rm`, `git reset --hard`, `git clean -`, `git checkout --`,
   `git rebase`, `git merge`, `git push`, `git commit`, `git apply`, `sed -i`,
   `awk -i`, `mv`, `tee`, `>`, `>>`) with exit-code 2 and a remediation message.
   Self-matches via `$PPID` ancestor walk + `session_id` from hook stdin.

3. **Command preflight** — `/run-project` and `/execute-task` call
   `scripts/repo-run-registry.sh check "$REPO_PATH"` before doing any work.
   If a live foreign owner exists with `scope: "repo"`, abort unless the user
   passes `--ignore-active-runs`. `/brainstorm` and `/prd` only warn (they do
   not register themselves and do not modify files in the owned repo by default).

### Registration (`/run-project` only)

`scripts/run-project.sh` must, after resolving `REPO_PATH`, call:

```
scripts/repo-run-registry.sh register \
  --pid $PARENT_CLAUDE_PID --session-id $SESSION_ID \
  --command /run-project --project $PROJECT \
  --repo $REPO_PATH --scope repo
```

and on every exit path (`EXIT` trap, SIGINT/SIGTERM) call
`scripts/repo-run-registry.sh deregister --run-id $REPO_RUN_ID`. A background
heartbeat loop (`sleep 60; heartbeat`) keeps the entry fresh; if the
heartbeat age exceeds `repo_coordination.stale_heartbeat_minutes`
(default 15), the entry is auto-pruned on the next `check`/`list`.

`/execute-task`, `/brainstorm`, and `/prd` do **not** register themselves.

### Scope

- `scope: "repo"` — owns the entire repo tree. This is the default for
  `/run-project` unless `--worktree` is explicitly set.
- `scope: "worktree:{abs_path}"` — owns only a subtree (a git worktree).
  Other sessions may edit the main repo and sibling worktrees freely.

### Bypass (emergency only)

Set `HQ_IGNORE_ACTIVE_RUNS=1` in the session environment to disable the
PreToolUse block. Use only when the owning session is verifiably dead and
the registry has not yet auto-pruned. Bypass events must be appended to
`workspace/learnings/active-run-bypasses.jsonl` with
`{ts, run_id, bypassed_by, target_repo, reason}` for audit.

### Read-only is always allowed

`Read`, `Grep`, `Glob`, `git status`, `git diff`, `git log`, `ls`, `cat`,
and other non-mutating operations are never blocked by this system,
regardless of ownership.

## Related

- Registry CLI: `scripts/repo-run-registry.sh`
- Registry file: `workspace/orchestrator/active-runs.json`
- Config: `settings/orchestrator.yaml` → `repo_coordination:` block
- Legacy (soft) policy: `.claude/policies/orchestrator-competing-processes.md`
- File-lock (story-scoped) layer: `.claude/CLAUDE.md` → "File Locking" section
