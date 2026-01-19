# HQ - Personal Operating System

HQ is your command center for orchestrating work across projects, workers, and AI agents. Think of it as infrastructure for a "personal OS" - not just files, but active systems that execute, learn, and scale.

## Two Modes: Build vs Work

Every HQ session operates in one of two modes. **Identify the mode first** - it determines what knowledge you need and how you operate.

### BUILD Mode
**Purpose:** Evolving the infrastructure itself - workers, apps, knowledge, workflows.

**When:** Creating/modifying workers, updating HQ structure, building tools, improving the system.

**Knowledge to load:**
- `knowledge/workers/` - Worker framework and patterns
- `knowledge/Ralph/` - Coding methodology (for code work)
- Worker-specific docs in `workers/{worker}/`

**Behavior:**
- Think architecturally - how does this fit the system?
- Document decisions in knowledge bases
- Test changes before committing
- Consider reusability across workers/projects

**Examples:**
- "Add a new skill to the assistant worker"
- "Create a research worker for competitive analysis"
- "Update the email digest format"
- "Build an MCP server for X"

### WORK Mode
**Purpose:** Using the infrastructure to get things done.

**When:** Executing tasks, running workers, producing deliverables, researching, communicating.

**Knowledge to load:**
- `knowledge/{your-name}/profile.md` - Your preferences and context
- `knowledge/{your-name}/voice-style.md` - Voice, style guidelines
- Worker skills relevant to the task

**Behavior:**
- Focus on output quality and speed
- Use existing workers/tools when available
- Don't modify infrastructure unless necessary
- Match your communication style

**Examples:**
- "Draft a LinkedIn post about AI trends"
- "Run the email digest worker"
- "Research competitors"
- "Summarize this document"

### Hybrid Tasks
Some tasks span both modes. Start in Work mode, switch to Build if you discover missing infrastructure.

Example: "Set up daily monitoring"
1. Work mode: Check if existing worker can do this
2. Build mode: If not, add the capability
3. Work mode: Execute the monitoring

## Session Protocol

### Starting a Session
1. **Identify mode** - Build or Work?
2. **Load relevant knowledge** - Don't load everything, just what's needed
3. **Check workspace/checkpoints/** - Any in-progress work to resume?
4. **Confirm scope** - Especially for Build tasks that affect infrastructure

### During a Session
- **Checkpoint regularly** - Write state to `workspace/checkpoints/{task-id}.json` after significant progress
- **Stay in your lane** - Don't drift between modes without acknowledging it
- **Ask when unclear** - Especially for Build work that has system-wide impact

### Ending a Session
1. Write final checkpoint if work is in progress
2. Log to `data/journal/hq-journal.jsonl`:
   ```jsonl
   {"ts":"ISO8601","mode":"build|work","summary":"what was done","files_touched":["paths"],"outcome":"completed|in_progress|blocked"}
   ```
3. If code changed: commit with clear message
4. Hand off context for next session

## Directory Structure

```
HQ/
├── .claude/           # Agent configuration (you are here)
├── data/              # Persistent data (journals, logs)
├── knowledge/         # Knowledge bases (Ralph, workers, your profile)
├── settings/          # Configuration (credentials, preferences)
├── workers/           # Worker definitions and skills
│   ├── assistant/     # Email, calendar, etc.
│   ├── code/          # Code workers for projects
│   ├── social/        # X, LinkedIn posting
│   ├── research/      # Competitive, market research
│   └── registry.yaml  # Worker index
├── projects/          # Active project PRDs
└── workspace/         # Active work (checkpoints, drafts, scratch)
```

## Workers Overview

Workers are autonomous agents with defined skills. They're not monitors - they *do things*.

| Category | Examples | Purpose |
|----------|----------|---------|
| Assistant | email | Email digest, calendar, personal ops |
| Code | project-name | Implement features, fix bugs |
| Social | x-personal | Draft posts, maintain presence |
| Research | competitive | Analysis, market research |

**Run a worker:** Load its worker.yaml and follow its skill definitions.

**Build a worker:** See `knowledge/workers/README.md` for the framework, or run `/newworker`.

## Commands

| Command | Purpose |
|---------|---------|
| `/setup` | Interactive configuration wizard |
| `/checkpoint` | Save current state + context status |
| `/handoff` | Clear context, continue from checkpoint |
| `/reanchor` | Force pause and realign on goals |
| `/build` | Enter BUILD mode |
| `/work` | Enter WORK mode |
| `/newproject` | Create new project PRD |
| `/newworker` | Scaffold new worker |
| `/ralph-loop` | Run autonomous implementation loop |
| `/nexttask` | Find next task to work on |

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect
