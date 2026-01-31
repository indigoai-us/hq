# my-hq User Guide

Complete reference for using my-hq - your personal AI operating system.

## Getting Started

### First Steps

1. **Configure your profile:** Run `/setup` to set up your personal preferences
2. **Explore commands:** Type `/help` to see available commands
3. **Find work:** Use `/nexttask` to discover what to work on

### Basic Workflow

1. Start a session: `claude` (in your my-hq directory)
2. Ask Claude for help or use a slash command
3. Claude will use workers and tools to accomplish tasks
4. Progress is saved automatically to `workspace/threads/`

## Commands Reference

### Session Management

| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save current state and check context usage |
| `/handoff` | Prepare for fresh session, document remaining work |
| `/reanchor` | Pause and realign before continuing |
| `/nexttask` | Scan HQ and suggest next tasks |
| `/remember` | Capture learnings for future sessions |

### Projects

| Command | Purpose |
|---------|---------|
| `/prd` | Generate a PRD through discovery questions |
| `/run-project` | Execute project via Pure Ralph loop |
| `/execute-task` | Run single task with workers |

### Workers

| Command | Purpose |
|---------|---------|
| `/run` | List or execute workers |
| `/newworker` | Create a new worker |
| `/metrics` | View worker execution metrics |

### System

| Command | Purpose |
|---------|---------|
| `/search` | Search across HQ (semantic + full-text) |
| `/cleanup` | Audit and clean HQ structure |
| `/setup` | Re-run setup wizard |

## Workers

Workers are autonomous AI agents with specific skills. They handle tasks in their domain.

### Worker Types

| Type | Purpose |
|------|---------|
| CodeWorker | Implement features, fix bugs, write tests |
| ContentWorker | Draft posts, maintain voice, create content |
| ResearchWorker | Analysis, market research, investigation |
| OpsWorker | Reports, automation, operational tasks |

### Running Workers

```
/run               # List available workers
/run dev-team      # List skills for dev-team workers
/run infra-dev build  # Run specific worker skill
```

## Projects

Projects in my-hq follow a structured workflow:

1. **PRD Creation:** Use `/prd` to define the project
2. **Execution:** Use `/run-project` for automated execution
3. **Review:** Track progress in `workspace/orchestrator/`

### Project Structure

```
projects/
└── my-project/
    ├── prd.json       # Project definition
    ├── research/      # Research documents
    └── README.md      # Project overview
```

## Workspace

The `workspace/` directory stores session state:

- `checkpoints/` - Manual save points
- `threads/` - Auto-saved sessions
- `orchestrator/` - Project execution state
- `learnings/` - Task insights and patterns

## Best Practices

1. **Use checkpoints:** Run `/checkpoint` before long tasks
2. **Follow context limits:** Handoff when context gets high
3. **Capture learnings:** Use `/remember` when something works well
4. **Keep PRDs small:** Break large projects into focused user stories

## Troubleshooting

### Claude isn't responding
- Check your authentication: Run `/login` in Claude
- Verify your API key or OAuth session

### Commands not found
- Ensure you're in your my-hq directory
- Check that `.claude/commands/` exists

### Workers not working
- Verify worker definitions in `workers/`
- Check worker registry at `workers/registry.yaml`

## Support

- Documentation: This file
- Issues: [GitHub Issues](https://github.com/your-org/my-hq/issues)
