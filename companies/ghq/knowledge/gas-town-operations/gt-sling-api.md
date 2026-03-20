---
title: "gt sling API Reference"
category: gas-town-operations
tags: ["gas-town", "cli", "agent-orchestration", "task-management", "coordination"]
source: "https://github.com/steveyegge/gastown/blob/main/internal/cmd/sling.go, https://github.com/steveyegge/gastown, https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://github.com/steveyegge/gastown/blob/main/docs/glossary.md"
confidence: 0.8
created_at: "2026-03-20T04:00:00Z"
updated_at: "2026-03-20T04:00:00Z"
---

`gt sling <bead-id> <rig>` is THE unified work dispatch command in Gas Town — it spawns a polecat, hooks work, and starts a session.

## Core Syntax

```sh
gt sling <bead-id> <rig>          # Assign single bead to rig
gt sling <bead-id> <rig> --crew   # Target a crew member instead of polecat
gt sling gt-abc gt-def <rig>      # Batch: two beads, one rig
gt sling mol-review --on gt-abc <rig>  # Apply formula molecule to existing bead
```

## Flag Reference

### Context & Message
| Flag | Description |
|------|-------------|
| `--subject / -s` | Context subject for the work |
| `--message / -m` | Context message for the work |
| `--args / -a` | Natural-language instructions for the executor (e.g., `"patch release"`) |
| `--stdin` | Read `--message` / `--args` from stdin (avoids shell quoting issues) |

### Targeting
| Flag | Description |
|------|-------------|
| `--crew` | Target a crew member in the specified rig rather than spawning a polecat |
| `--formula` | Override formula (default: `mol-polecat-work`) |
| `--on` | Apply formula to an existing bead (implies wisp scaffolding) |
| `--var` | Formula variable as `key=value`; repeatable |

### Polecat Spawning
| Flag | Description |
|------|-------------|
| `--create` | Create the polecat if it doesn't already exist |
| `--force` | Ignore unread mail and override existing assignments |
| `--account` | Claude Code account handle to use |
| `--agent` | Override runtime agent (built-ins: `claude`, `gemini`, `codex`, `cursor`, `auggie`, `amp`, `opencode`, `copilot`, `pi`, `omp`; or a custom alias) |
| `--base-branch` | Override the worktree base branch for the spawned polecat |
| `--no-boot` | Skip rig boot after spawn |

### Convoy Management
| Flag | Description |
|------|-------------|
| `--no-convoy` | Skip auto-convoy creation |
| `--owned` | Mark the auto-convoy as caller-managed (skips automatic witness/refinery registration) |
| `--merge` | Merge strategy: `direct` / `mr` / `local` |
| `--no-merge` | Skip merge queue on completion |

### Advanced
| Flag | Description |
|------|-------------|
| `--ralph` | Enable fresh-context loop mode (Ralph Wiggum mode) for multi-step workflows |
| `--hook-raw-bead` | Hook without applying the default formula (expert mode) |
| `--max-concurrent` | Limit concurrent spawns in batch mode |
| `--dry-run / -n` | Show what would happen without doing it |

## Execution Modes

### Immediate Dispatch (default)
Standard path: bead assigned to agent, polecat spawned, session started. All work appears in `gt convoy list` via auto-convoy.

### Deferred / Capacity-Scheduled Dispatch
Triggered when `scheduler.max_polecats > 0` in config. Work is routed through the capacity scheduler rather than spawning a polecat immediately. Epic IDs and convoy IDs with explicit rig targets are rejected in this mode.

### Batch Mode
```sh
gt sling gt-abc gt-def gt-ghi gastown
```
Multiple beads, single rig target. Each bead gets its own polecat. Respects `--max-concurrent` for throttling.

### Formula-on-Bead (Molecule Attachment)
```sh
gt sling mol-review --on gt-abc myrig
```
Instantiates a formula molecule and attaches it to an existing work bead. Enables composing reusable workflow molecules onto in-flight work.

### Two-Bead Auto-Resolve
```sh
gt sling gt-abc gt-def
```
When no explicit rig is given and two bead IDs are provided, sling infers the rig from bead ID prefixes.

## Auto-Convoy Creation

By default, slinging a single issue automatically creates a convoy named `"Work: [issue-title]"`. This ensures all work appears on the Charmbracelet TUI dashboard.

- Use `--no-convoy` to suppress auto-convoy creation.
- Use `--owned` for caller-managed convoys (witness/refinery don't auto-register).
- The convoy captures everything from single polecats to full swarms.

## Molecule Composition

- **Default formula**: `mol-polecat-work` is auto-applied unless `--hook-raw-bead` is set. This provides structured work guidance to the LLM executor.
- **Single-molecule constraint**: Only one molecule may be attached to a work bead at a time. The system checks both dependency bonds and description metadata to prevent conflicting instructions.
- **Stale molecule auto-burn**: If a molecule from a previous session is detected as stale, it is auto-burned to unblock re-dispatch.
- **`--ralph` flag**: Enables Ralph loop mode — each molecule step gets a fresh context window rather than maintaining conversational history, improving isolation in multi-step workflows.

## Restart Behavior

Molecules are durable: each step is a tracked Bead that survives agent crashes. When a polecat restarts, it finds its molecule on the hook and resumes via GUPP ("If there is work on your hook, YOU MUST RUN IT"). The execution path may differ across sessions (nondeterministic idempotence), but the outcome converges on the workflow's intended result.

A sleeping town is woken whenever any `gt sling` (or other mutating `gt`/`bd` command) fires — no manual nudge required.
