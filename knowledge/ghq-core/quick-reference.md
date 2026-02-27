# GHQ Quick Reference

## Directory Structure

```
GHQ/
├── .claude/
│   ├── CLAUDE.md           # Project-level instructions
│   ├── commands/           # Slash commands
│   ├── hooks/              # PreToolUse / PostToolUse hooks
│   ├── policies/           # Enforcement rules
│   └── skills/             # Skill definitions + registry
│       ├── registry.yaml
│       ├── _template/
│       ├── architect/
│       ├── code-reviewer/
│       └── full-stack/
├── knowledge/
│   ├── ghq-core/           # GHQ schemas, specs, quick reference
│   ├── ralph/              # Ralph Wiggum Loop methodology
│   └── skills/             # Skill framework documentation
├── projects/               # Project PRDs
├── repos/                  # Cloned repos (targets of skill execution)
└── workspace/
    ├── orchestrator/       # /run-project state
    ├── reports/            # Generated reports
    └── threads/            # Session checkpoints + handoffs
```

## Skills

### Registered Skills

| Skill | Type | Purpose |
|-------|------|---------|
| `architect` | execution | System design, API design, architecture decisions |
| `code-reviewer` | execution | Code review, quality gating, and merge management |
| `full-stack` | composition | End-to-end feature delivery (chains architect + backend + frontend + review) |

### Skill Registry

`.claude/skills/registry.yaml` — index of all skills. Updated by `/cleanup --reindex`.

### Skill Types

| Type | Description |
|------|-------------|
| `execution` | Does work directly; spawned as a sub-agent |
| `composition` | Chains other skills; orchestrator resolves the chain |
| `library` | Shared context loaded by other skills |

## Commands

Commands live in `.claude/commands/`.

| Command | Description |
|---------|-------------|
| `/prd` | Create project PRD |
| `/run-project` | Execute PRD stories via skill chain |
| `/execute-task` | Run a single story with a skill |
| `/checkpoint` | Save session state as a thread |
| `/handoff` | Prepare session handoff JSON |
| `/learn` | Capture and classify learnings |
| `/newcompany` | Scaffold a new company with full infrastructure |
| `/garden` | Content audit and curation |
| `/cleanup` | Validate structural integrity; `--reindex` rebuilds all INDEX.md files |
| `/search` | Search GHQ knowledge + repos via qmd (BM25, semantic, hybrid) |

## Knowledge Bases

| Path | Contents |
|------|----------|
| `knowledge/ghq-core/` | GHQ schemas, index-md spec, quick reference |
| `knowledge/ralph/` | Ralph Wiggum Loop methodology (01-overview through 10-workflow) |
| `knowledge/skills/` | Skill framework documentation and concepts |

## Projects

`projects/{project-name}/prd.json` — each project has a PRD JSON file.

See [PRD Schema](prd-schema.md) for full field definitions.

## Threads (Session State)

`workspace/threads/{thread_id}.json` — checkpoints and handoffs.

Thread ID format: `T-{YYYYMMDD}-{HHMMSS}-{slug}`

See [Thread Schema](thread-schema.md) for full field definitions.

## Checkpoints

`workspace/orchestrator/state.json` — current `/run-project` execution state.

See [Checkpoint Schema](checkpoint-schema.json) for the JSON schema.

## Key Schemas

| Schema | File |
|--------|------|
| Thread / checkpoint | [thread-schema.md](thread-schema.md) |
| PRD | [prd-schema.md](prd-schema.md) |
| Checkpoint JSON Schema | [checkpoint-schema.json](checkpoint-schema.json) |
| Skill YAML | [skill-schema.md](skill-schema.md) |
| INDEX.md format | [index-md-spec.md](index-md-spec.md) |

## Ralph Loop

GHQ runs the Ralph Wiggum Loop for autonomous project execution:

```
/run-project
  -> for each story in PRD (by priority, respecting dependsOn)
    -> /execute-task
      -> classify task type
      -> resolve skill chain
      -> spawn sub-agent per skill
      -> pass handoff JSON between skills
      -> run back-pressure checks after each skill
      -> mark story passes: true on success
```

Full methodology: `knowledge/ralph/`

## Back-Pressure Checks

After each skill completes, the orchestrator runs:

| Check | Command |
|-------|---------|
| Tests | Configured in `metadata.qualityGates` |
| Typecheck | Configured in `metadata.qualityGates` |
| Lint | Configured in `metadata.qualityGates` |
| Build | Configured in `metadata.qualityGates` |

If checks fail, the skill gets one retry. If the retry fails, the story is blocked.

## Conventions

- Story IDs: `US-XXX` format
- Branch names: `feature/{name}` format
- Skill IDs: lowercase with hyphens (e.g., `code-reviewer`)
- Thread IDs: `T-{YYYYMMDD}-{HHMMSS}-{slug}`
- All times: ISO8601 UTC
