# HQ - Personal OS for AI Workers

Personal OS for orchestrating AI workers, projects, and content.

## Key Files

- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index
- `USER-GUIDE.md` - Full command reference

## Structure

```
HQ/
├── .claude/commands/   # 16 slash commands
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level (Ralph, workers, security, pure-ralph, projects)
├── projects/           # Project PRDs
├── workers/            # Worker definitions
│   ├── dev-team/       # 13 code workers
│   └── content-*/      # 5 content workers
├── social-content/     # Content drafts
│   └── drafts/         # x/, linkedin/
└── workspace/
    ├── checkpoints/    # Manual saves
    ├── threads/        # Auto-saved sessions
    ├── orchestrator/   # Project state
    ├── learnings/      # Task insights
    └── content-ideas/  # Idea capture
```

## Workers

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| CodeWorker | Implement features, fix bugs | dev-team/* |
| ContentWorker | Draft content, maintain voice | content-brand, content-sales |
| SocialWorker | Post to platforms | x-worker |
| ResearchWorker | Analysis, market research | analyst |
| OpsWorker | Reports, automation | cfo-worker |

**Run a worker:** `/run {worker} {skill}`

**Build a worker:** `/newworker`

## Commands

### Session Management
| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save state + context status |
| `/handoff` | Prepare for fresh session |
| `/reanchor` | Pause and realign |
| `/nexttask` | Find next thing to work on |
| `/remember` | Capture learnings as rules in relevant files |

### Projects
| Command | Purpose |
|---------|---------|
| `/prd` | Generate PRD through discovery |
| `/run-project` | Execute project via Ralph loop |
| `/execute-task` | Run single task with workers |

### Workers
| Command | Purpose |
|---------|---------|
| `/run` | List/execute workers |
| `/newworker` | Create new worker |
| `/metrics` | View execution metrics |

### System
| Command | Purpose |
|---------|---------|
| `/search` | Semantic + full-text search across HQ (qmd-powered) |
| `/search-reindex` | Reindex and re-embed HQ for qmd search |
| `/cleanup` | Audit and clean HQ |
| `/setup` | Interactive setup wizard |
| `/exit-plan` | Force exit from plan mode |

## Auto-Checkpoint (PostToolsHook)

Sessions auto-save to `workspace/threads/` after:
- Worker skill completion (via `/run`)
- Git commit
- File generation (reports, social drafts)
- Significant file edits in project repos

**Thread Format:** `T-{timestamp}-{slug}.json`

**Why:** Prevents lost work, enables session resumption, provides audit trail.

## Auto-Handoff (Context Limit)

When context usage reaches 70% (remaining drops to 30%), automatically run `/handoff`.

**Rules:**
- Check context status line — when `remaining_percentage` ≤ 30, trigger handoff
- Before handoff, finish current atomic task (don't interrupt mid-edit)
- Notify user: "Context at {X}% remaining. Running /handoff to preserve continuity."
- Run `/handoff` with summary of remaining work
- This overrides manual handoff — don't wait for user to request it

## Search (qmd)

HQ can be indexed with [qmd](https://github.com/tobi/qmd) for local semantic + full-text search.

**Commands (run via Bash tool):**
- `qmd search "<query>" --json -n 10` — BM25 keyword search (fast, default)
- `qmd vsearch "<query>" --json -n 10` — semantic/conceptual search
- `qmd query "<query>" --json -n 10` — hybrid BM25 + vector + re-ranking (best quality, slower)

**Slash commands:** `/search <query>`, `/search-reindex`

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect

## Pure Ralph Learnings

Cross-project patterns discovered through `/pure-ralph` execution. These learnings transcend individual tasks and apply across HQ.

<!--
Format for adding learnings:

### [Category] Title
**Discovered:** Project name or context
**Pattern:** What to do
**Impact:** Why this matters across projects
-->

### [PRD] Keep Acceptance Criteria Verifiable
**Discovered:** purist-ralph-loop project
**Pattern:** Write acceptance criteria that can be checked programmatically or by reading specific files/outputs
**Impact:** Enables autonomous verification; vague criteria cause task failures or require human intervention

### [Workflow] Single-Task Focus Prevents Context Bloat
**Discovered:** purist-ralph-loop project
**Pattern:** Each Claude session handles exactly one task, reads only what's needed
**Impact:** Fresh context per task prevents accumulated confusion; easier to debug failures

### [Self-Improvement] Two-Level Learning System
**Discovered:** purist-ralph-loop project
**Pattern:** Task-level learnings go in workflow prompts; cross-project learnings go in CLAUDE.md
**Impact:** Keeps learnings appropriately scoped; prevents prompt bloat while capturing valuable insights
