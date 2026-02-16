# HQ - Personal OS for AI Workers

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `INDEX.md` - Root directory map
- `USER-GUIDE.md` - Commands, workers, typical session

## Structure

```
HQ/
├── .claude/commands/   # Slash commands
├── companies/          # Company-scoped resources
├── knowledge/          # HQ-level knowledge
├── workers/            # Worker definitions
└── workspace/          # Working state
```

## Workers

Workers are autonomous agents with defined skills.

## Commands

### Session Management
| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save state |
| `/handoff` | Prepare for fresh session |

## Learned Rules

<!-- Max 20. Overflow removed (rule still lives in its source file). -->
<!-- Auto-managed by /learn. Manual: /remember -->

1. **NEVER work on a project without using the actual PRD and `/run-project` flow.** All project work must have a tracked PRD.
2. **All code contributions go to `C:\repos\hq`**, never `C:\hq`.** The installed HQ at `C:\hq` is for personal use only.
3. **Project protofit3-form-analysis exists at projects/protofit3-form-analysis/ with 8 stories targeting C:\repos\protofit3** — AI-powered workout form analysis.

## Learning System

Learnings are rules injected directly into the files they govern.

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings
