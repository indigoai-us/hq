# HQ - Personal OS for AI Workers

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `INDEX.md` - Root directory map, recent threads, workers (start here)
- `USER-GUIDE.md` - Commands, workers, typical session
- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index

## Structure

```
HQ/
├── .claude/commands/   # Slash commands (17, visibility: public|private in frontmatter)
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level (Ralph, workers, security, projects)
├── workers/            # Worker definitions
│   ├── dev-team/       # 12 code workers
│   └── content-*/      # 5 content workers
└── workspace/
    ├── checkpoints/    # Manual saves
    ├── threads/        # Auto-saved sessions
    ├── orchestrator/   # Project state
    └── learnings/      # Task insights (event log)
```

## Workers

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| CodeWorker | Implement features, fix bugs | dev-team/* |
| ContentWorker | Draft content, maintain voice | content-brand, content-sales |

## Commands

### Session Management
| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save state + context status |
| `/handoff` | Prepare for fresh session |
| `/reanchor` | Pause and realign |
| `/nexttask` | Find next thing to work on |

## Learned Rules

<!-- Max 20. Overflow removed (rule still lives in its source file). -->
<!-- Auto-managed by /learn. Manual: /remember -->

## Learning System

Learnings are rules injected directly into the files they govern.
- `/learn` captures and classifies learnings automatically after task execution
- `/remember` delegates to `/learn`

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect
