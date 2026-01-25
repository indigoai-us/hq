# HQ - Personal OS for AI Workers

Personal OS for orchestrating AI workers, projects, and content.

## Key Files

- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index
- `USER-GUIDE.md` - Full command reference

## Structure

```
HQ/
├── .claude/commands/   # 22 slash commands
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level (Ralph, workers, security)
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

### Projects
| Command | Purpose |
|---------|---------|
| `/prd` | Generate PRD through discovery |
| `/run-project` | Execute project via Ralph loop |
| `/execute-task` | Run single task with workers |

### Content
| Command | Purpose |
|---------|---------|
| `/contentidea` | Build idea into content suite |
| `/suggestposts` | Research-driven suggestions |
| `/scheduleposts` | Choose what to post |

### Workers
| Command | Purpose |
|---------|---------|
| `/run` | List/execute workers |
| `/newworker` | Create new worker |
| `/metrics` | View execution metrics |

### System
| Command | Purpose |
|---------|---------|
| `/search` | Full-text search across HQ |
| `/hq-sync` | Sync modules from manifest |
| `/cleanup` | Audit and clean HQ |
| `/design-iterate` | Design A/B testing |

## Auto-Checkpoint (PostToolsHook)

Sessions auto-save to `workspace/threads/` after:
- Worker skill completion (via `/run`)
- Git commit
- File generation (reports, social drafts)
- Significant file edits in project repos

**Thread Format:** `T-{timestamp}-{slug}.json`

**Why:** Prevents lost work, enables session resumption, provides audit trail.

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect
