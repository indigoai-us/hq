# HQ - Personal OS for AI Workers

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `INDEX.md` - Root directory map, recent threads, workers (start here)
- `USER-GUIDE.md` - Commands, workers, typical session
- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index

## INDEX.md System

Hierarchical INDEX.md files provide a navigable map of HQ. Read parent INDEX before diving into subdirectories.

**Key indexes:** `projects/INDEX.md`, `workspace/orchestrator/INDEX.md`, `companies/*/knowledge/INDEX.md`, `workers/*/INDEX.md`, `knowledge/INDEX.md`, `workspace/reports/INDEX.md`

**Spec:** `knowledge/hq-core/index-md-spec.md`
**Rebuild all:** `/cleanup --reindex`
**Auto-updated by:** `/checkpoint`, `/handoff`, `/reanchor`, `/prd`, `/run-project`, `/newworker`, content commands

## Structure

```
HQ/
├── .claude/commands/   # Slash commands (17, visibility: public|private in frontmatter)
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level (Ralph, workers, security, projects)
├── projects/           # Project PRDs
├── workers/            # Worker definitions
│   ├── dev-team/       # 12 code workers
│   └── content-*/      # 5 content workers
├── social-content/     # Content drafts
│   └── drafts/         # x/, linkedin/
└── workspace/
    ├── checkpoints/    # Manual saves
    ├── threads/        # Auto-saved sessions
    ├── orchestrator/   # Project state
    ├── learnings/      # Task insights (event log)
    └── content-ideas/  # Idea capture
```

## Workers

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| CodeWorker | Implement features, fix bugs | dev-team/* |
| ContentWorker | Draft content, maintain voice | content-brand, content-sales |
| SocialWorker | Post to platforms | x-worker |
| ResearchWorker | Analysis, market research | analyst |
| OpsWorker | Reports, automation | cfo-worker |

**Run a worker:** `/run {worker} {skill}`

**Build a worker:** `/newworker`

## Commands

### Session Management
| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save state + context status |
| `/handoff` | Prepare for fresh session |
| `/reanchor` | Pause and realign |
| `/nexttask` | Find next thing to work on |
| `/remember` | Capture learnings as rules in relevant files |
| `/learn` | Auto-capture and classify learnings from task execution |

### Projects
| Command | Purpose |
|---------|---------|
| `/prd` | Generate PRD through discovery |
| `/run-project` | Execute project via Ralph loop |
| `/execute-task` | Run single task with workers |

### Workers
| Command | Purpose |
|---------|---------|
| `/run` | List/execute workers |
| `/newworker` | Create new worker |
| `/metrics` | View execution metrics |

### System
| Command | Purpose |
|---------|---------|
| `/search` | Semantic + full-text search across HQ (qmd-powered) |
| `/search-reindex` | Reindex and re-embed HQ for qmd search |
| `/cleanup` | Audit and clean HQ |
| `/setup` | Interactive setup wizard |
| `/exit-plan` | Force exit from plan mode |

## Knowledge Repos

Knowledge folders can be their own git repos, symlinked into HQ. This enables independent versioning, sharing, and publishing per knowledge base.

**Convention:** Repos live in `repos/public/` or `repos/private/`. Symlinks in `knowledge/` and `companies/*/knowledge` point to them. The symlinks are tracked by HQ git; the repo contents are gitignored.

**Reading/searching:** Transparent. `qmd`, `Glob`, `Grep`, `Read` all follow symlinks.

**Committing knowledge changes:** Changes show in `git status` of the *target repo* (not HQ). To commit:
1. `cd` to the symlink target (e.g. `repos/public/knowledge-ralph/`)
2. `git add`, `git commit`, `git push` in that repo

**Adding new knowledge:** Create repo in `repos/{public|private}/knowledge-{name}`, symlink into the appropriate knowledge path.

## Search (qmd)

HQ can be indexed with [qmd](https://github.com/tobi/qmd) for local semantic + full-text search.

**When to search:** Before any planning, research, or context-gathering task, search HQ first with `qmd` to find relevant knowledge, workers, skills, and prior work.

**Commands (run via Bash tool):**
- `qmd search "<query>" --json -n 10` — BM25 keyword search (fast, default)
- `qmd vsearch "<query>" --json -n 10` — semantic/conceptual search
- `qmd query "<query>" --json -n 10` — hybrid BM25 + vector + re-ranking (best quality, slower)

**Slash commands:** `/search <query>`, `/search-reindex`

### Search rules (all commands/skills must follow)

| Need | Tool | Example |
|------|------|---------|
| Find HQ content by topic | `qmd search` or `qmd vsearch` | "Find knowledge about API integration" |
| Find files by path pattern | `Glob` | `workers/*/worker.yaml`, `projects/*/prd.json` |
| Search code in `repos/` | `Grep` | Pattern matching in source code |
| Validate structured files | `grep` in Bash | Checking YAML fields, git branch filtering |

**Never use Grep/Glob to search HQ content by topic.** That's what qmd does. Commands and skills that scan HQ for related context must use `qmd vsearch` (semantic) or `qmd search` (keyword), not Grep.

## Learned Rules

<!-- Max 20. Overflow removed (rule still lives in its source file). -->
<!-- Auto-managed by /learn. Manual: /remember -->

(none yet — rules accumulate as the system runs)

## Learning System

Learnings are rules injected directly into the files they govern:
- Worker rules → `worker.yaml` `instructions:` block
- Command rules → command `.md` `## Rules` section
- Knowledge rules → relevant knowledge file
- Global rules → this file `## Learned Rules`

- `/learn` captures and classifies learnings automatically after task execution
- `/remember` delegates to `/learn` — user corrections always promote to Tier 1

Event log: `workspace/learnings/*.json` (append-only, for analysis/dedup).

## Auto-Learn (Build Activities)

When building HQ infrastructure (new workers, knowledge bases, commands, projects), auto-capture structural changes so future sessions know what exists:

**Triggers:**
- `/newworker` completes → `/learn` with scope: global, rule: "Worker {id} exists at {path} for {purpose}"
- `/prd` completes → `/learn` with scope: global, rule: "Project {name} exists with {N} stories targeting {repo}"
- New knowledge files created → `/learn` with scope: global, rule: "Knowledge {topic} available at {path}"
- New command created → `/learn` with scope: global, rule: "Command /{name} available for {purpose}"

**Why:** Fresh sessions load CLAUDE.md but don't scan every directory. Learned rules act as an index of what has been built, preventing re-creation of existing resources and enabling discovery.

**Also:** After any structural change, run `qmd update 2>/dev/null || true` to keep search current.

## Auto-Checkpoint (PostToolsHook)

After completing any of these actions, automatically save thread state to `workspace/threads/`:

**Triggers:**
- Worker skill completion (via `/run`)
- Git commit
- File generation (reports, social drafts)
- Significant file edits in project repos

**Thread Format:** See `knowledge/hq-core/thread-schema.md`

**Why:** Prevents lost work, enables session resumption, provides audit trail.

**How:** After a triggering action, capture git state + summary and write to `workspace/threads/T-{timestamp}-{slug}.json`

**Knowledge repos:** When edits touch knowledge files (symlinked to `repos/`), commit those changes to the knowledge repo — not HQ git. See "Knowledge Repos" section above for commit instructions.

## File Sync

HQ files sync between local and cloud using an event-driven model. Sync is automatic at session boundaries -- you do not need to sync on every file edit.

**Automatic sync (no action needed):**
- `/checkpoint` and `/handoff` push local changes to cloud after completing their work
- `/run-project`, `/execute-task`, and `/prd` pull the latest cloud changes before starting

**Ad-hoc sync:** If you are doing significant work outside of project commands (e.g., editing knowledge files, updating worker definitions), run `hq sync push` when you reach a natural stopping point.

**Legacy fallback:** `hq sync start` runs continuous polling-based sync. This is not the primary approach -- prefer the event-driven model above.

**Do not** run sync after every file edit. Sync at session boundaries, not per-file.

## Auto-Handoff (Context Limit)

When context usage reaches 70% (remaining drops to 30%), automatically run `/handoff`.

**Rules:**
- Check context status line — when `remaining_percentage` ≤ 30, trigger handoff
- Before handoff, finish current atomic task (don't interrupt mid-edit)
- Notify user: "Context at {X}% remaining. Running /handoff to preserve continuity."
- Run `/handoff` with summary of remaining work
- This overrides manual handoff — don't wait for user to request it

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Ship, then iterate** - Working > perfect
