# GHQ Quick Reference

## Directory Structure

```
GHQ/
├── .claude/
│   ├── CLAUDE.md           # Project-level instructions
│   ├── hooks/              # PreToolUse / PostToolUse hooks
│   └── skills/             # SKILL.md files (native Claude Code format)
│       ├── architect/
│       │   └── SKILL.md
│       ├── code-reviewer/
│       │   └── SKILL.md
│       └── full-stack/
│           └── SKILL.md
├── companies/ -> ~/Documents/GHQ/companies/   # Symlink to secure storage
├── knowledge/
│   ├── ghq-core/           # GHQ schemas, specs, quick reference
│   ├── policies/           # Enforcement policies
│   ├── ralph/              # Ralph methodology
│   ├── skills/             # Skill authoring guide
│   └── video-gen/          # Video generation pipeline docs
├── loops/
│   ├── state.jsonl         # Append-only execution state
│   └── history.jsonl       # Completed loop records
├── projects/               # Project PRDs (beads-managed)
└── repos/                  # Cloned repos (targets of skill execution)
```

## Skills

### Registered Skills

Skills are discovered automatically by Claude Code from `.claude/skills/*/SKILL.md`. No registry file needed.

| Skill | Type | Purpose |
|-------|------|---------|
| `architect` | execution | System design, API design, architecture decisions |
| `code-reviewer` | execution | Code review, quality gating, and merge management |
| `full-stack` | composition | End-to-end feature delivery (chains architect + backend + frontend + review) |

### Skill Format

Each skill is a `SKILL.md` file in `.claude/skills/{skill-id}/SKILL.md`. See [Skill Schema](skill-schema.md) for the full format.

### Skill Types

| Type | Description |
|------|-------------|
| `execution` | Does work directly; spawned as a sub-agent |
| `composition` | Chains other skills; orchestrator resolves the chain |
| `library` | Shared context loaded by other skills |

## Projects and PRDs

Projects are managed with `bd` (beads CLI) for issue tracking:

```bash
bd list                    # List all stories
bd show US-001             # Show story details
bd close US-001            # Mark story complete
bd create "title"          # Create new story
```

PRD files live in `projects/{project-name}/` and are tracked by beads.

## Loops (Execution State)

The `loops/` directory replaces the v1 `workspace/` directory:

| File | Purpose |
|------|---------|
| `loops/state.jsonl` | Append-only log of current execution state |
| `loops/history.jsonl` | Completed loop records with outcomes |

See [Loops Schema](loops-schema.md) for full field definitions.

## Companies

Companies are stored outside the repo at `~/Documents/GHQ/companies/` and symlinked into the project:

```
companies/ -> ~/Documents/GHQ/companies/
  {slug}/
    settings/    # Credentials, API keys (gitignored via symlink)
    knowledge/   # Company-specific knowledge
    data/        # Company-specific data
```

The symlink keeps sensitive data out of the git repo. See [Company Isolation](../policies/company-isolation.md).

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
| PRD / beads workflow | [prd-schema.md](prd-schema.md) |
| Skill (SKILL.md) | [skill-schema.md](skill-schema.md) |
| Loops state | [loops-schema.md](loops-schema.md) |
| INDEX.md format | [index-md-spec.md](index-md-spec.md) |

## Ralph Loop

GHQ runs the Ralph methodology for autonomous project execution:

```
/run-project
  -> for each story in PRD (by priority, respecting dependsOn)
    -> /execute-task
      -> classify task type
      -> resolve skill chain
      -> spawn sub-agent per skill
      -> pass handoff JSON between skills
      -> run back-pressure checks after each skill
      -> append result to loops/state.jsonl
      -> mark story complete on success
```

Full methodology: `knowledge/ralph/`

## Back-Pressure Checks

After each skill completes, the orchestrator runs:

| Check | Command |
|-------|---------|
| Tests | Configured in project PRD |
| Typecheck | Configured in project PRD |
| Lint | Configured in project PRD |
| Build | Configured in project PRD |

If checks fail, the skill gets one retry. If the retry fails, the story is blocked.

## Conventions

- Story IDs: `US-XXX` format
- Work on `main` or worktrees only -- never feature branches
- Skill IDs: lowercase with hyphens (e.g., `code-reviewer`)
- All times: ISO8601 UTC
- Companies accessed via symlink, never committed to repo
