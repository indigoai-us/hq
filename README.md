# GHQ v2

Personal OS for orchestrating work across companies and AI.

## Philosophy

GHQ is a structured environment for managing multi-company work with AI agents. It provides:

- **Company isolation** -- each company's knowledge, credentials, and deploy targets are kept separate
- **Skill-based agents** -- reusable skills loaded on demand via `SKILL.md`
- **Task tracking** -- `bd` (beads) for dependency-aware, git-friendly issue management
- **Runtime loops** -- active work sessions tracked in `loops/`

## Directory Structure

```
.claude/          Claude agent skills (SKILL.md), hooks
companies/        Symlinks to ~/Documents/GHQ/companies/{slug}/
knowledge/        Shared knowledge bases and policies
loops/            Runtime state, active loops, checkpoints
```

## Setup

1. **Clone the repo:**
   ```bash
   git clone <repo-url> ~/repos/ghq_v2
   cd ~/repos/ghq_v2
   ```

2. **Initialize beads:**
   ```bash
   bd init
   ```

3. **Set up company directories:**
   ```bash
   mkdir -p ~/Documents/GHQ/companies/{your-company}
   ln -s ~/Documents/GHQ/companies/your-company companies/your-company
   ```

4. **Verify setup:**
   ```bash
   bd ready          # Should show available work
   ls companies/     # Should show your company symlinks
   ```

## Key Concepts

### Companies
Company data (credentials, knowledge, deploy targets) lives at `~/Documents/GHQ/companies/` and is symlinked into the repo's `companies/` directory. The `companies/` directory itself is gitignored to prevent credential leaks.

### Skills
Skills live in `.claude/skills/<name>/` with a `SKILL.md` file that Claude discovers on demand. Each skill encapsulates a specific capability (frontend, backend, deployment, etc.).

### Task Tracking (bd)
All task tracking uses `bd` (beads). Never use markdown TODO lists or external trackers. Issues auto-sync to `.beads/issues.jsonl` for git version control.

### Loops
The `loops/` directory holds runtime state for active work sessions -- checkpoints, thread context, and orchestrator state.

## Security

Credentials are excluded from Claude's context via `.claudeignore` patterns (`.env`, `*.pem`, `*.key`). The `companies/` directory is gitignored entirely.
