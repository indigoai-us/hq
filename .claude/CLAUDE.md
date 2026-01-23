# HQ - Personal Operating System

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index

## Structure

```
HQ/
├── .claude/commands/   # Slash commands
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level knowledge (Ralph, workers)
├── projects/           # Project PRDs
├── workers/            # Worker definitions
└── workspace/
    ├── checkpoints/    # Session saves
    ├── orchestrator/   # Project state tracking
    ├── reports/        # Generated outputs
    └── scratch/        # Working area
```

## Companies (Optional)

Each company owns its:
- `settings/` - API credentials, configs
- `data/` - Exports, reports, financials
- `knowledge/` - Company-specific docs

## Workers

Workers are autonomous agents with defined skills. They're not monitors - they *do things*.

| Category | Examples | Purpose |
|----------|----------|---------|
| Assistant | email | Email digest, calendar, personal ops |
| Code | project-name | Implement features, fix bugs |
| Social | x-personal | Draft posts, maintain presence |
| Research | competitive | Analysis, market research |

**Run a worker:** `/run {worker-name}`

**Build a worker:** `/newworker`

## Commands

| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save current state + context status |
| `/handoff` | Clear context, continue from checkpoint |
| `/reanchor` | Force pause and realign on goals |
| `/nexttask` | Find next task to work on |
| `/newproject` | Create new project PRD |
| `/newworker` | Scaffold new worker |
| `/hq-sync` | Sync modules from manifest |

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect
