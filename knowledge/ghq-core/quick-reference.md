# GHQ Quick Reference

## Directory Structure

```
GHQ/
├── .claude/
│   ├── CLAUDE.md           # Project-level instructions
│   ├── hooks/              # PreToolUse / PostToolUse hooks
│   └── skills/             # SKILL.md files (native Claude Code format)
│       ├── architect/
│       ├── backend/
│       ├── browser-automation/
│       ├── code-reviewer/
│       ├── database/
│       ├── deep-research/
│       ├── enhancement/
│       ├── frontend/
│       ├── full-stack/
│       ├── qa/
│       └── video-gen/
├── companies/                                 # Per-slug symlinks to ~/Documents/GHQ/companies/{slug}
├── knowledge/
│   ├── ghq-core/           # GHQ schemas, specs, quick reference
│   ├── policies/           # Enforcement policies
│   ├── ralph/              # Ralph methodology
│   ├── skills/             # Skill authoring guide
│   └── video-gen/          # Video generation pipeline docs
├── loops/
│   ├── state.jsonl         # Append-only execution state (gitignored)
│   └── history.jsonl       # Completed loop records (gitignored)
└── workspace/              # Heavy assets, scratch files (scratch/ is gitignored)
```

## Skills

### Registered Skills

Skills are discovered automatically by Claude Code from `.claude/skills/*/SKILL.md`. No registry file needed.

| Skill | Type | Purpose |
|-------|------|---------|
| `architect` | execution | System design, API design, architecture decisions |
| `backend` | execution | API endpoints, business logic, and server-side integrations |
| `browser-automation` | execution | Automate websites and desktop apps using agent-browser CLI |
| `code-reviewer` | execution | Code review, quality gating, and merge management |
| `database` | execution | Schema design, migrations, and query optimization |
| `deep-research` | execution | Autonomous web research producing markdown reports with citations |
| `enhancement` | composition | Incremental improvements (chains code-reviewer + qa) |
| `frontend` | execution | React/Next.js components, pages, and client-side logic |
| `full-stack` | composition | End-to-end feature delivery (chains architect + backend + frontend + review) |
| `qa` | execution | Testing, validation, and accessibility verification |
| `video-gen` | execution | End-to-end video production pipeline (TTS, Remotion, ffmpeg) |

### Skill Format

Each skill is a `SKILL.md` file in `.claude/skills/{skill-id}/SKILL.md`. See [Skill Schema](skill-schema.md) for the full format.

### Skill Types

| Type | Description |
|------|-------------|
| `execution` | Does work directly; spawned as a sub-agent |
| `composition` | Chains other skills; orchestrator resolves the chain |
| `library` | Shared context loaded by other skills |

## Tasks

Tasks are managed with `bd` (beads CLI). Each company has its own `.beads/` database — always `cd companies/{slug}/` before running `bd` commands:

```bash
cd companies/{slug}
bd list                    # List all tasks
bd show ghq-abc123         # Show task details
bd children ghq-abc123     # List subtasks
bd close ghq-abc123        # Mark task complete
bd create "title"          # Create new task
bd create "title" --parent ghq-abc123 --type task  # Create subtask
```

Epic tasks contain subtasks that are executed by `/run-loop`.

## Loops (Execution State)

The `loops/` directory stores execution state:

| File | Purpose |
|------|---------|
| `loops/state.jsonl` | Append-only log of current execution state |
| `loops/history.jsonl` | Completed loop records with outcomes |

See [Loops Schema](loops-schema.md) for full field definitions.

## Companies

Companies are stored outside the repo at `~/Documents/GHQ/companies/` and symlinked into the project. Each company slug is an individual symlink:

```
companies/
  {slug}/ -> ~/Documents/GHQ/companies/{slug}   # One symlink per company
    .beads/      # Per-company issue tracking (bd init)
    settings/    # Credentials, API keys (hidden via .claudeignore)
    knowledge/   # Company-specific knowledge
    projects/    # Company long-running projects
    policies/    # Company-specific policies
```

The symlinks keep sensitive data out of the git repo. See `knowledge/policies/company-isolation.md`.

## Knowledge Bases

| Path | Contents |
|------|----------|
| `knowledge/ghq-core/` | GHQ schemas, index-md spec, quick reference |
| `knowledge/policies/` | Enforcement policies (company isolation, etc.) |
| `knowledge/ralph/` | Ralph methodology (01-overview through 11-team-training) |
| `knowledge/skills/` | Skill authoring guide |
| `knowledge/video-gen/` | Video generation pipeline reference |

## Key Schemas

| Schema | File |
|--------|------|
| Task / beads workflow | [task-schema.md](task-schema.md) |
| Skill (SKILL.md) | [skill-schema.md](skill-schema.md) |
| Loops state | [loops-schema.md](loops-schema.md) |
| README.md auto-index format | [readme-index-spec.md](readme-index-spec.md) |

## Ralph Loop

GHQ runs the Ralph methodology for autonomous task execution:

```
/run-loop {task-id}
  -> bd children {task-id} --json (get subtasks by priority)
  -> for each open subtask (respecting dependencies)
    -> /execute-task {subtask-id}
      -> classify task type
      -> resolve skill chain
      -> spawn sub-agent per skill
      -> pass handoff JSON between skills
      -> run back-pressure checks after each skill
      -> append result to loops/state.jsonl
      -> bd close {subtask-id} on success
```

Full methodology: `knowledge/ralph/`

## Back-Pressure Checks

After each skill completes, the orchestrator runs:

| Check | Command |
|-------|---------|
| Tests | Configured in task metadata |
| Typecheck | Configured in task metadata |
| Lint | Configured in task metadata |
| Build | Configured in task metadata |

If checks fail, the skill gets one retry. If the retry fails, the task is blocked.

## Conventions

- Task IDs: beads format (e.g. `ghq-abc123`)
- Work on `main` or worktrees only -- never feature branches
- Skill IDs: lowercase with hyphens (e.g., `code-reviewer`)
- All times: ISO8601 UTC
- Companies accessed via symlink, never committed to repo
