# HQ Starter Kit

Your personal operating system for orchestrating AI workers.

## What is HQ?

HQ is infrastructure for a "personal OS" - not just files, but active systems that execute, learn, and scale. Built on the [Ralph Methodology](./knowledge/Ralph/README.md) for autonomous AI coding.

Think of it as:
- **Workers** that do things autonomously (email digests, content drafting, code implementation)
- **Knowledge bases** that workers learn from and contribute to
- **Checkpoints** that let work survive across sessions
- **Commands** that orchestrate everything

## Quick Start

1. **Clone this repo:**
   ```bash
   git clone https://github.com/coreyepstein/hq-starter-kit.git my-hq
   cd my-hq
   ```

2. **Open in Claude Code and run setup:**
   ```
   /setup
   ```

3. **Answer the wizard questions** to configure your HQ with your name, roles, and starter project.

## What's Included

### Core Infrastructure

| Component | Purpose |
|-----------|---------|
| **Commands** | Slash commands for workflows (`/checkpoint`, `/build`, `/work`, etc.) |
| **Worker Framework** | Templates and patterns for building AI workers |
| **Checkpoint System** | Save and resume work across sessions |
| **Ralph Methodology** | Complete docs for autonomous AI coding |

### Starter Projects

Choose during `/setup`:

| Project | Description | Best For |
|---------|-------------|----------|
| **Personal Assistant** | Email digest, task scanning | Productivity-focused users |
| **Social Media Worker** | Content drafting, voice consistency | Personal brand builders |
| **Code Worker** | Ralph loops, autonomous implementation | Developers |

## Two Modes

### BUILD Mode (`/build`)
Evolving the infrastructure itself - workers, knowledge, workflows.

```
/build
```

Use when: Creating workers, updating HQ structure, improving the system.

### WORK Mode (`/work`)
Using the infrastructure to get things done.

```
/work
```

Use when: Executing tasks, running workers, producing deliverables.

## Commands

| Command | Purpose |
|---------|---------|
| `/setup` | Interactive configuration wizard |
| `/checkpoint` | Save current state + check context |
| `/handoff` | Clear context, continue from checkpoint |
| `/reanchor` | Pause and realign on goals |
| `/build` | Enter BUILD mode |
| `/work` | Enter WORK mode |
| `/newproject` | Create new project PRD |
| `/newworker` | Scaffold new worker |
| `/ralph-loop` | Run autonomous implementation loop |
| `/nexttask` | Find next task to work on |
| `/contentidea` | Build out a content idea |
| `/suggestposts` | Get strategic posting suggestions |
| `/scheduleposts` | Pick what to post now |
| `/digest` | Generate email digest |

## Worker Types

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| **AssistantWorker** | Email, calendar, personal ops | Email digest |
| **CodeWorker** | Implement features, fix bugs | Project implementation |
| **SocialWorker** | Draft posts, maintain presence | X/LinkedIn content |
| **ResearchWorker** | Analysis, market research | Competitive analysis |
| **OpsWorker** | Monitoring, automation | Ad performance tracking |

## The Ralph Loop

Simple but powerful pattern for autonomous coding:

```
1. Pick a task from PRD (where passes: false)
2. Implement it in fresh context
3. Run back pressure (tests, lint, typecheck)
4. If passing, commit and mark complete
5. Repeat until all tasks pass
```

Key insight: A simple for loop beats complex orchestration.

See [knowledge/Ralph/](./knowledge/Ralph/README.md) for full documentation.

## Directory Structure

```
HQ/
├── .claude/           # Commands and configuration
│   ├── CLAUDE.md      # Session protocol
│   └── commands/      # Slash commands
├── knowledge/         # Knowledge bases
│   ├── Ralph/         # Ralph methodology
│   ├── workers/       # Worker framework
│   └── {your-name}/   # Your profile (created by /setup)
├── workers/           # Worker definitions
│   ├── registry.yaml  # Worker index
│   └── examples/      # Example worker configs
├── starter-projects/  # Project templates
├── projects/          # Your active projects
├── workspace/         # Checkpoints, drafts, scratch
├── settings/          # Your configurations
└── data/              # Journals, logs
```

## Workflow Example

```
# Morning routine
/nexttask                    # What needs attention?
/work                        # Execute on priority task

# Content creation
/suggestposts                # What should I post?
/contentidea AI is eating X  # Build out the idea
/scheduleposts               # Pick what to post now

# Code implementation
/newproject                  # Create PRD for new feature
/ralph-loop                  # Autonomous implementation

# End of session
/checkpoint my-task          # Save progress
```

## Learn More

- [Ralph Methodology](./knowledge/Ralph/README.md) - Core principles
- [Worker Framework](./knowledge/workers/README.md) - Building workers
- [Worker Templates](./knowledge/workers/templates/) - Starting points

## Contributing

This is a personal OS template. Fork it, customize it, make it yours.

Issues and PRs welcome for framework improvements.

## Credits

- **Ralph Methodology** by [Geoffrey Huntley](https://ghuntley.com)
- Inspired by various AI workflow patterns and personal knowledge management systems

## License

MIT
