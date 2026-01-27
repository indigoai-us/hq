<p align="center">
  <img src="docs/images/hq-banner.svg" alt="HQ - Your Personal Operating System" width="600">
</p>

<h1 align="center">HQ - Personal OS for AI Workers</h1>

<p align="center">
  <strong>Build your AI team. Ship projects autonomously. Never lose context.</strong>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/coreyepstein/hq-cli"><img src="https://img.shields.io/badge/CLI-hq--cli-green.svg" alt="HQ CLI"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#whats-new-in-v20">What's New</a> •
  <a href="#core-concepts">Core Concepts</a> •
  <a href="#commands">Commands</a> •
  <a href="#workers">Workers</a>
</p>

---

## What is HQ?

HQ is infrastructure for orchestrating **AI workers** - autonomous agents that code, write content, research, and automate tasks.

Not just files. Active systems that:
- **Execute** - Workers do real work autonomously
- **Learn** - Knowledge bases grow smarter over time
- **Scale** - Add workers for new domains
- **Survive** - Checkpoints persist across sessions

```
┌─────────────────────────────────────────────────────────────────┐
│                           YOUR HQ                               │
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

## Quick Start

```bash
# 1. Clone
git clone https://github.com/coreyepstein/hq-starter-kit.git my-hq
cd my-hq

# 2. Open in Claude Code
claude

# 3. Run setup wizard
/setup
```

That's it. You now have a personal OS with 18 workers ready to deploy.

## What's New in v2.0

### Project Orchestration
Execute entire projects autonomously with the Ralph loop:
```bash
/prd "Build a dashboard"     # Create PRD through discovery
/run-project my-dashboard    # Execute all tasks via workers
```

### Content Pipeline
Full content workflow from idea to publish:
```bash
/contentidea "AI agents"     # Build out idea → drafts
/suggestposts               # Research-driven suggestions
/scheduleposts              # Smart timing for posting
```

### Dev Team (13 Workers)
Complete development team for autonomous coding:
- `project-manager` - PRD lifecycle
- `task-executor` - Route tasks to workers
- `architect` - System design
- `backend-dev` / `frontend-dev` / `database-dev`
- `qa-tester` - Testing & validation
- `code-reviewer` - PR management
- And more...

### Auto-Checkpoint
Never lose work. Sessions auto-save to `workspace/threads/`.

### Design Iteration
A/B test designs with git branches:
```bash
/design-iterate hero-section  # Create variations
# Review, compare, choose winner
```

---

## Core Concepts

### Workers
Autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| **CodeWorker** | Implement features, fix bugs | frontend-dev, backend-dev |
| **ContentWorker** | Draft content, maintain voice | content-brand, content-sales |
| **SocialWorker** | Post to platforms | x-worker, linkedin-worker |
| **ResearchWorker** | Analyze data, markets | analyst, researcher |
| **OpsWorker** | Reports, automation | cfo-worker, cmo-worker |

### Knowledge Bases
Workers learn from and contribute to shared knowledge:

- `knowledge/Ralph/` - Autonomous coding methodology
- `knowledge/workers/` - Worker patterns & templates
- `knowledge/ai-security-framework/` - Security best practices
- `knowledge/dev-team/` - Development patterns
- `knowledge/design-styles/` - Design guidelines

### Commands
Slash commands orchestrate everything:

```bash
/run worker-name skill    # Execute a worker skill
/checkpoint my-work       # Save session state
/handoff                  # Prepare for fresh session
```

### Checkpoints
Work survives context limits:

```bash
/checkpoint feature-x     # Save state
# ... context fills up ...
/nexttask                 # Finds checkpoint, continues work
```

---

## Commands

### Session Management
| Command | What it does |
|---------|--------------|
| `/checkpoint` | Save progress, survive context limits |
| `/handoff` | Prepare handoff for fresh session |
| `/reanchor` | Pause, show state, realign |
| `/nexttask` | Find next thing to work on |

### Workers
| Command | What it does |
|---------|--------------|
| `/run` | List all workers |
| `/run {worker}` | Show worker's skills |
| `/run {worker} {skill}` | Execute a skill |
| `/newworker` | Create a new worker |
| `/metrics` | View worker execution metrics |

### Projects
| Command | What it does |
|---------|--------------|
| `/prd` | Generate PRD through discovery |
| `/run-project` | Execute project via Ralph loop |
| `/pure-ralph` | External terminal loop (fully autonomous) |
| `/execute-task` | Run single task with workers |

### Content
| Command | What it does |
|---------|--------------|
| `/contentidea` | Build idea into full content suite |
| `/suggestposts` | Research-driven post suggestions |
| `/scheduleposts` | Choose what to post now |

### System
| Command | What it does |
|---------|--------------|
| `/search` | Full-text search across HQ |
| `/hq-sync` | Sync modules from manifest |
| `/cleanup` | Audit and clean HQ |
| `/design-iterate` | Manage design A/B tests |

---

## Workers

### Dev Team (13 workers)
Full development team for autonomous project execution:

```yaml
project-manager    → PRD lifecycle, task selection
task-executor      → Analyze & route to workers
architect          → System design, API design
backend-dev        → API endpoints, business logic
frontend-dev       → React/Next components
database-dev       → Schema, migrations
qa-tester          → Testing, validation
motion-designer    → Animations, polish
infra-dev          → CI/CD, deployment
code-reviewer      → PR review, quality gates
knowledge-curator  → Update knowledge bases
product-planner    → Technical specs
```

### Content Team (5 workers)
Specialized content analysis:

```yaml
content-brand     → Voice, messaging, tone
content-sales     → Conversion copy, CTAs
content-product   → Technical accuracy
content-legal     → Compliance, claims
content-shared    → Shared utilities (library)
```

### Creating Your Own

```bash
/newworker  # Interactive scaffold
```

Or manually create `workers/my-worker/worker.yaml`:

```yaml
worker:
  id: my-worker
  name: "My Worker"
  type: OpsWorker

skills:
  - name: do-thing
    description: "Does the thing"
    execution:
      steps:
        - "Step 1"
        - "Step 2"
```

---

## Project Execution

HQ uses the **Ralph Methodology** for autonomous coding.

### The Loop

```
1. Pick task from PRD (passes: false)
2. Execute in fresh context
3. Run back pressure (tests, lint, typecheck)
4. If passing → commit, mark complete
5. Repeat until done
```

### Why It Works

- **Fresh context per task** - No accumulated confusion
- **Back pressure validates** - Code that doesn't pass isn't done
- **Atomic commits** - One task = one commit
- **PRD is truth** - Simple JSON, easy to inspect

### Running a Project

```bash
# 1. Create PRD
/prd "Build user authentication"

# 2. Execute via Ralph loop
/run-project auth-system

# 3. Monitor progress
/run-project auth-system --status
```

### Pure Ralph Mode

For fully autonomous execution, use `/pure-ralph` to spawn an external terminal that runs the loop independently:

```bash
# Auto mode (default) - fully autonomous, no intervention needed
/pure-ralph my-project

# Manual mode - see chain of thought, close windows between tasks
/pure-ralph my-project -m
```

**Why Pure Ralph?**
- **Fresh context every task** - Each task runs in a new Claude session, preventing context rot
- **External orchestrator** - Loop runs outside Claude, immune to context compression
- **Self-improving** - Claude can update its own prompt as it learns
- **Watchable** - See progress in a visible terminal window

---

## Directory Structure

```
my-hq/
├── .claude/
│   ├── CLAUDE.md              # Session protocol
│   └── commands/              # 22 slash commands
├── knowledge/
│   ├── Ralph/                 # Coding methodology
│   ├── workers/               # Worker framework + templates
│   ├── ai-security-framework/ # Security practices
│   ├── dev-team/              # Development patterns
│   ├── design-styles/         # Design guidelines
│   └── loom/                  # Agent patterns
├── workers/
│   ├── registry.yaml          # Worker index
│   ├── dev-team/              # 13 dev workers
│   └── content-*/             # Content workers
├── projects/                  # Your PRDs
├── social-content/
│   └── drafts/                # Content drafts (x/, linkedin/)
├── workspace/
│   ├── checkpoints/           # Manual saves
│   ├── threads/               # Auto-saved sessions
│   ├── orchestrator/          # Project state
│   └── learnings/             # Captured insights
└── companies/                 # Multi-company setup
```

---

## Part of the HQ Framework

| Component | Purpose |
|-----------|---------|
| **hq-starter-kit** | This repo - personal OS template |
| **[hq-cli](https://github.com/coreyepstein/hq-cli)** | Module management CLI |

---

## Customization

This is a **template**. Make it yours:

- Add workers for your workflows
- Build knowledge bases for your domains
- Create commands for your patterns
- Connect tools via MCP

---

## Credits

- **Ralph Methodology** by [Geoffrey Huntley](https://ghuntley.com/ralph/)
- **Loom Agent Architecture** by [Geoffrey Huntley](https://github.com/ghuntley/loom) - Thread system, state machine, and agent patterns
- Inspired by personal knowledge systems and AI workflow patterns

## License

MIT - Do whatever you want with it.
