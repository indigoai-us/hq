<p align="center">
  <img src="docs/images/hq-banner.svg" alt="HQ - Your Personal Operating System" width="600">
</p>

<h1 align="center">HQ Starter Kit</h1>

<p align="center">
  <strong>A personal operating system for orchestrating AI workers.</strong>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/coreyepstein/mr-burns"><img src="https://img.shields.io/badge/Powered%20by-Mr.%20Burns-yellow.svg" alt="Powered by Mr. Burns"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-you-get">What You Get</a> •
  <a href="#commands">Commands</a> •
  <a href="#the-ralph-methodology">Ralph Methodology</a>
</p>

---

## What is HQ?

HQ is infrastructure for a **personal operating system** - not just files, but active systems that execute, learn, and scale.

```
┌─────────────────────────────────────────────────────────────────┐
│                           YOUR HQ                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   WORKERS   │    │  KNOWLEDGE  │    │  COMMANDS   │        │
│   │  Do things  │    │   Learn &   │    │ Orchestrate │        │
│   │ autonomously│    │   remember  │    │  workflows  │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│          │                  │                  │                │
│          └──────────────────┼──────────────────┘                │
│                             ▼                                   │
│                    ┌─────────────┐                              │
│                    │ CHECKPOINTS │                              │
│                    │   Survive   │                              │
│                    │   sessions  │                              │
│                    └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Think of it as:
- **Workers** that do things autonomously (code, content, research, ops)
- **Knowledge bases** that workers learn from and contribute to
- **Checkpoints** that let work survive across context limits
- **Commands** that orchestrate everything from Claude Code

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/coreyepstein/hq-starter-kit.git my-hq
cd my-hq

# 2. Open in Claude Code and run setup
/setup

# 3. Follow the wizard to configure your HQ
```

That's it. You now have a personal OS.

## What You Get

### Commands

| Command | What it does |
|---------|--------------|
| `/checkpoint` | Save your work, survive context limits |
| `/handoff` | Continue work in a fresh session |
| `/reanchor` | Pause and realign before continuing |
| `/nexttask` | Find the next thing to work on |
| `/newproject` | Create a PRD for autonomous execution |
| `/newworker` | Build a new AI worker |
| `/hq-sync` | Pull framework updates |

### Worker Framework

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose |
|------|---------|
| **Code Workers** | Implement features, fix bugs |
| **Content Workers** | Draft posts, maintain voice |
| **Research Workers** | Analyze markets, competitors |
| **Ops Workers** | Monitor systems, automate tasks |

### Knowledge Bases

Pre-loaded knowledge for you and your workers:

- **Ralph Methodology** - Complete guide to autonomous AI coding
- **Worker Framework** - Patterns for building effective workers
- **Your Profile** - Created during setup for voice/style consistency

### Checkpoint System

Never lose work to context limits again.

```bash
# Save state before context fills up
/checkpoint feature-x

# Later, in a fresh session
/nexttask  # Finds your checkpoint automatically
```

## The Ralph Methodology

HQ is built on **Ralph** - a methodology for autonomous AI coding that actually works.

### The Core Loop

```
1. Pick a task from PRD (where passes: false)
2. Implement in fresh context
3. Run back pressure (tests, lint, typecheck)
4. If passing, commit and mark complete
5. Repeat until all tasks pass
```

**Key insight:** A simple for loop beats complex orchestration.

### Why It Works

- **Fresh context per task** - No accumulated confusion
- **Back pressure validates** - Code that doesn't pass isn't done
- **Atomic commits** - Each task = one commit
- **PRD is source of truth** - Simple JSON, easy to inspect

See the full methodology in `knowledge/Ralph/`.

## Directory Structure

```
my-hq/
├── .claude/
│   ├── CLAUDE.md           # Session protocol
│   └── commands/           # Slash commands
├── knowledge/
│   ├── Ralph/              # Coding methodology
│   ├── workers/            # Worker framework
│   └── {your-name}/        # Your profile (after /setup)
├── workers/
│   ├── registry.yaml       # Worker index
│   └── examples/           # Example workers
├── projects/               # Your PRDs live here
├── workspace/
│   ├── checkpoints/        # Session saves
│   ├── orchestrator/       # Project state
│   └── scratch/            # Working area
└── companies/              # Optional: multi-company setup
```

## Workflow Examples

### Daily Flow

```bash
/nexttask                    # What needs attention?
# Work on the task...
/checkpoint my-task          # Save progress
```

### Starting a Project

```bash
/newproject                  # Creates PRD through discovery
# Answer the questions...
ralph-tui run --prd ./projects/my-project/prd.json
```

### Building a Worker

```bash
/newworker                   # Scaffold a new worker
# Configure skills...
/run my-worker               # Execute it
```

## Part of the HQ Framework

This starter kit is part of the larger **HQ Framework**:

| Component | Purpose |
|-----------|---------|
| **[mr-burns](https://github.com/coreyepstein/mr-burns)** | PRD executor - runs tasks autonomously |
| **hq-starter-kit** | This repo - personal OS template |
| **[hq-cli](https://github.com/coreyepstein/hq-cli)** | Module management CLI |

## Customization

This is a **template**. Fork it, customize it, make it yours.

- Add workers for your specific workflows
- Build knowledge bases for your domains
- Create commands for your patterns
- Connect to your tools via MCP

## Credits

- **Ralph Methodology** by [Geoffrey Huntley](https://ghuntley.com/ralph/)
- **ralph-tui** by [subsy](https://github.com/subsy)
- Inspired by personal knowledge management systems and AI workflow patterns

## License

MIT - Do whatever you want with it.
