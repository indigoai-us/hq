---
title: "Beads Community Tools Ecosystem"
category: beads-architecture
tags: ["open-source", "task-management", "cli", "agent-tooling", "comparison"]
source: "https://github.com/steveyegge/beads/blob/main/docs/COMMUNITY_TOOLS.md, https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/, https://github.com/mantoni/beads-ui, https://github.com/acartine/foolery, https://news.ycombinator.com/item?id=47075901"
confidence: 0.85
created_at: "2026-03-20T05:30:00Z"
updated_at: "2026-03-20T05:30:00Z"
---

Beads has a growing community ecosystem catalogued in `docs/COMMUNITY_TOOLS.md` — tools range from terminal UIs to full web dashboards, editor plugins, and coordination servers. Maturity varies significantly.

## Notable Tools by Category

### Terminal UIs

| Tool | Language | Notable Features | Status |
|------|----------|-----------------|--------|
| **Mardi Gras** | Go | Real-time updates, Gas Town orchestration, tmux integration, Claude Code dispatch | Active |
| **perles** | Go | Custom BQL (Beads Query Language), search, dependency + kanban views | Active |
| **bdui** | — | Tree view, dependency graph, vim-style navigation | Active |
| **lazybeads** | Go (Bubble Tea) | Lightweight browse/manage UI | Active |
| **bsv** | — | Simple two-panel tree viewer organized by epic/task/sub-task | Active |

### Web UIs

| Tool | Language | Notable Features | Status |
|------|----------|-----------------|--------|
| **beads-ui** (mantoni) | Node.js | Live updates, kanban board; v0.9.3 as of Jan 2026 | Actively maintained |
| **Foolery** (acartine) | Next.js/TypeScript | Dependency-aware wave planning, live terminal monitoring, verification queue, keyboard-first; featured on HN | Active |
| **BeadBoard** | Next.js/TypeScript | Windows-native, multi-project registry, dependency graph explorer, agent sessions hub | Active |
| **beads-web** | TypeScript/Rust | Cross-platform binary distribution, 7 themes, Dolt integration | Actively maintained |
| **beady** | — | Simple web UI for bd CLI | Active |
| **beads-viz-prototype** | — | Generates interactive HTML from `bd export` | Prototype |

### Editor Extensions

| Tool | Language | Editor | Status |
|------|----------|--------|--------|
| **vscode-beads** | TypeScript | VS Code | Active |
| **opencode-beads** | Node.js | OpenCode | Active |
| **nvim-beads** | Lua | Neovim | Active |
| **beads.el** | Emacs Lisp | Emacs | Active |
| **beads-manager** | Kotlin | JetBrains IDEs | Active |

### Native / Desktop Apps

| Tool | Language | Notable Features |
|------|----------|-----------------|
| **Beadbox** | Tauri/Next.js | Native macOS, real-time sync, epic tree progress bars |
| **Beads Task-Issue Tracker** | Tauri/Vue | Cross-platform browse/create/manage |

### SDKs & Orchestration

| Tool | Language | Notable Features |
|------|----------|-----------------|
| **beads-sdk** | TypeScript | Zero-dependency typed client — CRUD, filtering, search, labels, dependencies, comments, epics, sync |
| **Foolery** | Next.js/TypeScript | Claude Code orchestration layer with wave planning |
| **beads-compound** | Bash/TypeScript | Claude Code plugin, 28 specialized agents, persistent memory |
| **JAT (Agentic IDE)** | — | Full visual dashboard: live sessions, task manager, code editor, terminal; integrates Beads + Agent Mail + 50 bash tools, can supervise 20+ agents |

### Coordination Servers

| Tool | Language | Notable Features |
|------|----------|-----------------|
| **BeadHub** (bdh) | Python/TypeScript | Work claiming, file reservation, presence, inter-agent messaging; hosted dashboard at beadhub.ai for OSS projects |

### Data Source Middleware

| Tool | Language | Notable Features |
|------|----------|-----------------|
| **stringer** | Go | Mines git repos for TODOs, churn hotspots, dependency health |
| **jira-beads-sync** | — | Bidirectional Jira ↔ Beads sync |

## Maturity Concerns

Beads is evolving rapidly. As of early 2026, GitHub issue [#2134](https://github.com/steveyegge/beads/issues/2134) explicitly flagged that `COMMUNITY_TOOLS.md` needs revision because "beads is moving in different directions very quickly" and 3rd-party tooling compatibility is dropping. Some previously listed tools (e.g., `bv` — beads viewer) are no longer compatible with current `bd` releases.

**Practical heuristic**: prefer tools that track the `bd` CLI's JSON output format (most stable surface) over tools with direct Dolt SQL access (more brittle to schema changes).

## Most Mature Picks (as of March 2026)

- **Web UI**: `beads-ui` (mantoni) — most established, v0.9.3; or **Foolery** for agent orchestration workflows
- **TUI**: **Mardi Gras** — deepest Gas Town + tmux integration
- **SDK**: **beads-sdk** — zero deps, TypeScript
- **Coordination**: **BeadHub** — adds multi-agent claiming on top of bare Beads
