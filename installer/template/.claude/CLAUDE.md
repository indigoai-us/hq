# my-hq

Personal AI operating system for orchestrating workers, projects, and content.

## Quick Start

1. Run `/setup` to configure your profile and preferences
2. Use `/nexttask` to find what to work on
3. Use `/prd` to plan new projects
4. Use `/run` to execute workers

## Core Commands

| Command | Purpose |
|---------|---------|
| `/setup` | Interactive setup wizard |
| `/nexttask` | Find next task to work on |
| `/prd` | Plan a new project |
| `/run` | Execute a worker skill |
| `/checkpoint` | Save current state |
| `/handoff` | Hand off to fresh session |
| `/search` | Search across HQ |

## Structure

```
my-hq/
├── .claude/         # Claude configuration
├── agents.md        # Your profile
├── workers/         # Worker definitions
├── projects/        # Project PRDs
├── workspace/       # Session state
├── knowledge/       # Domain knowledge
└── social-content/  # Content drafts
```

## Learn More

See USER-GUIDE.md for full documentation.
