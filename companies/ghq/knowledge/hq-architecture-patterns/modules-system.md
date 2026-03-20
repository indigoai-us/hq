---
title: "hq-starter-kit Modules System: merge/link/copy Distribution Strategies"
category: hq-architecture-patterns
tags: ["configuration", "cli", "production-patterns", "coordination", "open-source"]
source: "companies/indigo/projects/indigo-nx/repos/indigo-nx/../../../hq-starter-kit/modules/modules.yaml, companies/indigo/projects/indigo-nx/repos/indigo-nx/../../../hq-starter-kit/modules/cli/src/commands/modules-sync.ts"
confidence: 0.95
created_at: 2026-03-20T08:45:00Z
updated_at: 2026-03-20T08:45:00Z
---

hq-starter-kit's modules system distributes HQ updates via a `modules/modules.yaml` manifest with three sync strategies: `link`, `merge`, and `copy`.

## What It Is

The modules system is a lightweight package manager for HQ configurations — knowledge files, Claude commands, worker definitions — that need to flow from an upstream repo into a local HQ instance. It lives in `modules/` alongside a CLI at `modules/cli/`.

Key files:
- `modules/modules.yaml` — manifest declaring which repos to pull from and how
- `modules/modules.lock` — pinned commit SHAs for reproducible installs (auto-generated)
- `.hq-sync-state.json` — per-file hash state for conflict detection (merge strategy)
- `modules/.synced/` — git-ignored directory where module repos are cloned

## modules.yaml Schema

```yaml
version: "1.0"
modules:
  - name: hq-core                  # Unique identifier
    repo: https://github.com/user/hq-starter-kit.git
    branch: main
    strategy: merge                # link | merge | copy
    access: public                 # public | team | role:X
    paths:
      knowledge/Ralph: knowledge/Ralph   # src-in-module: dest-in-hq
      .claude/commands: .claude/commands
```

## The Three Strategies

### link — Real-Time Symlinks
Creates **relative symlinks** from the cloned module repo to the destination path in HQ. Changes in the module are immediately visible without re-syncing. Requires a local clone.

- Skips silently if a real (non-symlink) file exists at destination
- Replaces existing symlinks on re-sync
- Best for: local company knowledge mounts (e.g., `companies/indigo/knowledge`)

### merge — Conflict-Aware Copy
Copies files with SHA-256 hash tracking per file in `.hq-sync-state.json`.

Conflict logic:
1. Destination doesn't exist → copy (safe)
2. Dest hash == source hash → skip (identical)
3. Dest hash == last-synced hash → copy (local unchanged)
4. Dest hash != last-synced hash and != source hash → **conflict**

On conflict (interactive mode), user picks: `[k]eep`, `[t]ake`, `[d]iff`, `[m]anual`.
Non-interactive (`--no-interactive`) defaults to keep-local. Previous resolutions are remembered by hash pair in `.hq-sync-state.json` to avoid re-prompting.

Best for: upstream HQ updates (knowledge entries, commands) where local edits are likely.

### copy — Destructive One-Time Copy
Overwrites the destination completely with `cp -R`. No conflict detection, no state tracking. Use for initial setup or role-specific content where you never want to customize locally.

## CLI Commands

The CLI (`@hq/cli` v0.1.0) is implemented in TypeScript at `modules/cli/src/`. Built with `commander` and `yaml` packages.

| Command | Description |
|---------|-------------|
| `hq modules add <repo-url>` | Append a module entry to modules.yaml (auto-names from URL) |
| `hq modules list` | Display all modules with status |
| `hq modules sync` | Clone/fetch all modules and apply their strategy |
| `hq modules sync --module X` | Sync a single named module |
| `hq modules sync --dry-run` | Print what would happen, no changes |
| `hq modules sync --locked` | Use pinned commits from modules.lock |
| `hq modules sync --no-interactive` | Skip conflict prompts (keep local on conflict) |
| `hq modules update <name>` | Fetch latest and update lock entry |
| `hq modules update --all` | Update all lock entries to latest |

**Build status**: The TypeScript source is complete but `dist/` is not compiled in the hq-starter-kit repo. To use: `cd modules/cli && npm install && npm run build`.

The CLI searches upward from `cwd` for `modules/modules.yaml` to find HQ root.

## Comparison with git Submodules

| Dimension | git submodules | hq modules |
|-----------|---------------|------------|
| Granularity | Whole repo at a commit | Selective path mappings (`src → dest`) |
| Conflict handling | git merge conflicts | Hash-tracked, interactive per-file resolution |
| Lock/pin | Submodule commit pointer | `modules.lock` YAML |
| Update workflow | `git submodule update` | `hq modules sync --locked` |
| Real-time | No (git checkout required) | Yes (link strategy via symlinks) |
| Parent repo awareness | Yes (`.gitmodules`, staged) | No (independent of parent git) |
| Local override | Full divergence via git | Merge strategy preserves local edits |

The modules system is more ergonomic for distributing **non-code configuration** (knowledge, prompts, commands) where you want selective path mapping and local override support. git submodules are better for whole-repo dependencies where parent git history should track the exact upstream version.

## Access Control

The `access` field (`public` / `team` / `role:X`) is wired into the schema and RBAC-aware, but enforcement is **not yet implemented** in the CLI (v0.1.0). The field is stored for future gating.

## Practical Usage in GHQ

The `hq-core` module uses `strategy: merge` to pull upstream improvements from hq-starter-kit without clobbering local customizations. Company knowledge modules (Indigo, Cortex) use `strategy: link` — they live as separate local repos mounted into `companies/{slug}/knowledge/`.
