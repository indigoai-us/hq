---
title: "Gas Town Plugin Interface Contract"
category: gas-town-architecture
tags: ["gas-town", "plugins", "configuration", "production-patterns", "extensibility"]
source: "https://github.com/steveyegge/gastown/tree/main/plugins, https://github.com/steveyegge/gastown/blob/main/plugins/compactor-dog/plugin.md, https://github.com/steveyegge/gastown/blob/main/plugins/git-hygiene/plugin.md, https://github.com/steveyegge/gastown/blob/main/plugins/dolt-snapshots/plugin.md, https://github.com/steveyegge/gastown/blob/main/CHANGELOG.md, https://deepwiki.com/steveyegge/gastown"
confidence: 0.75
created_at: "2026-03-20T11:30:00Z"
updated_at: "2026-03-20T11:30:00Z"
---

Gas Town plugins are self-contained directories combining a `plugin.md` manifest with optional shell scripts or Go binaries.

## Plugin Directory Layout

Each plugin lives under `~/gt/plugins/{name}/` (town-level) and follows one of two execution models:

```
plugins/
  {name}/
    plugin.md        # required: TOML frontmatter + step instructions
    run.sh           # optional: deterministic shell execution
    main.go          # optional: compiled Go binary for complex plugins
```

## The `plugin.md` Manifest (TOML Frontmatter)

All plugins declare their contract via TOML frontmatter in `plugin.md`:

```toml
name = "git-hygiene"
description = "Clean up stale git branches across all rig repos"
version = 1

[gate]
type = "cooldown"       # or "event"
duration = "12h"        # for cooldown gates
# event = "convoy.created"  # for event-triggered gates

timeout = "10m"
notify_on_failure = true
severity = "low"        # low | medium | high
labels = ["plugin:git-hygiene", "category:cleanup"]
digest = true
```

### Gate Types

| Gate type | Trigger | Config field |
|-----------|---------|--------------|
| `cooldown` | Time-based throttle (run at most once per period) | `duration` (e.g. `"30m"`, `"12h"`) |
| `event` | Lifecycle event fires the plugin | `event` (e.g. `"convoy.created"`) |

## Execution Models

### 1. Declarative step plugins (most common)

The markdown body of `plugin.md` contains numbered step instructions that a Dog agent executes. No separate script is needed — the agent interprets the prose as its workflow. This is the original and most common model.

### 2. Deterministic shell plugins (`run.sh`)

For reproducible, non-LLM execution, the plugin ships a `run.sh` that Gas Town invokes directly. The CHANGELOG notes `session-hygiene` was converted from `plugin.md` prose to a deterministic `run.sh` for reliability. This is the preferred model for pure infrastructure tasks.

```bash
#!/usr/bin/env bash
# run.sh is invoked by Gas Town's plugin runner
# Exit 0 = success, non-zero = failure (triggers notify_on_failure)
```

### 3. Go binary plugins (complex integrations)

Plugins like `dolt-snapshots` ship a standalone `main.go`. The binary:
- Accepts CLI flags for configuration (`--host`, `--port`, `--dry-run`)
- Reads environment variables (`DOLT_HOST`, `GT_DOLT_PORT`)
- Monitors `~/.events.jsonl` for lifecycle events (file-based event bus)
- Does **not** implement a formal Go interface — it is a standalone CLI program

There is **no formal Go plugin interface** (no `type Plugin interface{...}`). Integration is entirely via CLI conventions and file-based event coordination.

## Town-Level vs Rig-Level Scope

- **Town-level plugins** live in `~/gt/plugins/` and apply to the entire workspace
- **Rig-level plugins** are implied by the architecture but not formally documented; rig-scoped configuration uses `gt rig` metadata before falling back to town-level defaults
- The bundled plugins in the gastown repo (`plugins/`) ship as town-level defaults; formula lookup falls back to embedded formulas for non-gastown rigs

## Exec-Wrapper Plugin Type

A newer plugin type (`exec-wrapper`) was added in v0.12.0 that wraps agent execution at the session level, enabling pre/post-execution hooks. Details are not yet publicly documented.

## Plugin Discovery and Deployment

```bash
gt plugin sync   # auto-deploys plugins after a build
```

Dogs use plugin lookup to find and run plugins; formula lookup falls back to embedded definitions for rigs without custom plugins.

## Bundled Plugin Examples

| Plugin | Gate | Execution | Purpose |
|--------|------|-----------|---------|
| `compactor-dog` | cooldown 30m | declarative steps | Monitor Dolt commit growth, escalate compaction |
| `git-hygiene` | cooldown 12h | declarative steps | Prune stale branches, stashes across all rigs |
| `dolt-snapshots` | event `convoy.created` | Go binary | Tag Dolt DBs at convoy boundaries for audit/rollback |
| `stuck-agent-dog` | (unknown) | declarative steps | Detect and unstick hung agents |
| `session-hygiene` | (unknown) | `run.sh` | Deterministic session cleanup |
