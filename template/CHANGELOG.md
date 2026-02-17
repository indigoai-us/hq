# Changelog

## v5.5.0 (2026-02-16)

### Added
- `/recover-session` — Recover dead Claude Code sessions that hit context limits without running `/handoff`. Reconstructs thread JSON from JSONL session data.
- `/update-hq` — Renamed from `/migrate`. Upgrade HQ from latest starter-kit release (friendlier command name).

### Changed
- `.claude/CLAUDE.md` — Updated command count (19→23), added Communication section with `/email`, `/checkemail`, `/decide`, added `/recover-session` to Session Management

### Fixed
- Scrubbed remaining company-specific reference from v5.4.0 changelog

### Renamed
- `/migrate` → `/update-hq` — Same functionality, more intuitive name

---

## v5.4.0 (2026-02-12)

### Added
- `/checkemail` — Quick inbox cleanup: auto-archive junk, then triage what matters one at a time
- `/decide` — Human-in-the-loop batch decision UI for classifying, reviewing, or triaging 5+ items
- `/email` — Multi-account Gmail management via gmail-local MCP
- **HQ Desktop knowledge** — 12 spec files for the upcoming HQ Desktop app (terminal sessions, knowledge browser, worker management, project views, notifications, event sources)
- `hq-core/quick-reference.md` — Lookup tables for workers, commands, repos
- `hq-core/starter-kit-compatibility-contract.md` — Contract between HQ and starter-kit
- `hq-core/desktop-claude-code-integration.md` — Claude Code integration specs
- `hq-core/desktop-company-isolation.md` — Company isolation for desktop
- `hq-core/hq-structure-detection.md` — HQ structure detection logic

### Changed
- `/run-project` — Sub-agents now explicitly forbidden from using EnterPlanMode/TodoWrite (prevents Claude from overriding the PRD orchestrator with its own plan)
- `/execute-task` — Added anti-plan rule to Rules section (defense-in-depth)
- `/checkpoint`, `/cleanup`, `/handoff`, `/metrics`, `/newworker`, `/reanchor`, `/remember`, `/run`, `/search`, `/search-reindex` — Various improvements and refinements
- Codex workers (codex-coder, codex-reviewer, codex-debugger) — Updated worker configs and skills
- Knowledge files updated: `index-md-spec.md`, `thread-schema.md`, `skill-schema.md`, `state-machine.md`, `projects/README.md`, `workers/README.md`

### Fixed
- Scrubbed remaining PII from prior releases (company names in examples, absolute paths)
- Removed company-specific command references from changelog and migration guide

## v5.3.0 (2026-02-11)

### Added
- **Codex Workers (3)** — Production-ready AI workers powered by OpenAI Codex SDK via MCP:
  - `codex-coder` — Code generation, feature implementation, component scaffolding (3 skills)
  - `codex-reviewer` — Code review, targeted improvements, best-practices pass (3 skills)
  - `codex-debugger` — Error diagnosis, root-cause analysis, bug fixing with back-pressure loop (3 skills)
- **MCP Integration Pattern** — Workers can now connect to external AI tools via Model Context Protocol. Codex workers demonstrate the shared MCP server pattern (codex-engine wraps the Codex SDK, three workers share it).
- **9 skill files** — Full markdown skill definitions with process steps, arguments, output schemas, and human checkpoints for all codex workers.
- **README — Codex Workers section** — Complete documentation with usage examples, prerequisites, and architecture overview.
- **README — OpenAI Codex** added to prerequisites table (optional).

### Changed
- **`workers/sample-worker/worker.yaml`** — Enhanced with modern patterns: MCP integration (commented-out template), reporting section, spawn_method, retry_attempts, dynamic context loading, verification with back-pressure commands, human checkpoints.
- **`workers/registry.yaml`** — Version 5.0 → 6.0. Added dev-team section with 3 codex workers.
- **`.claude/CLAUDE.md`** — Added MCP Integration section, updated Workers section with bundled worker listings, updated structure tree with dev-team directory.
- **README** — Updated "What's New" to lead with Codex Workers + MCP (v5.3). Worker YAML example updated to show modern patterns (execution, verification, MCP, state_machine). Updated worker type examples.

---

## v5.2.0 (2026-02-11)

### Added
- **`/setup` — CLI dependency checks**: Now checks for GitHub CLI (`gh`) and Vercel CLI (`vercel`) during setup, with install + auth instructions. Non-blocking (recommended, not required except `claude` itself).
- **`/setup` — Knowledge repo scaffolding**: Setup now creates a personal knowledge repo (`repos/private/knowledge-personal/`) as a proper git repo and symlinks it into `companies/personal/knowledge/`. Explains the symlink pattern and how to convert bundled knowledge later.
- **README — Prerequisites table**: New section listing all CLI tools (claude, gh, qmd, vercel) with install commands.
- **README — Knowledge Repos guide**: Full walkthrough: how symlinks work, creating repos, committing changes, converting bundled knowledge.
- **README — `repos/` in directory tree**: Directory structure now shows `repos/public/` and `repos/private/`.

### Changed
- **`.claude/CLAUDE.md`** — Knowledge Repos "Adding new knowledge" expanded from one-liner to step-by-step with commands for HQ-level and company-scoped knowledge.
- **`/setup`** — Phase 0 expanded (2 checks → 4), Phase 2 now includes knowledge repo creation + symlinks + `.gitignore` updates. Time estimate 2min → 5min.

---

## v5.1.0 (2026-02-08)

### Added
- **Context Diet** — New section in `.claude/CLAUDE.md` with lazy-loading rules to minimize context burn on session start. Sessions no longer pre-load INDEX.md or agents.md unless the task requires it.

### Changed
- **`.claude/CLAUDE.md`** — Added Context Diet section, updated Key Files to discourage eager loading
- **`/checkpoint`** — Recent threads now written to `workspace/threads/recent.md` (not embedded in INDEX.md). INDEX.md gets timestamp-only updates.
- **`/handoff`** — Same change: threads to `recent.md`, slim INDEX.md updates
- **`/reanchor`** — Added "When to Use" guidance: only run when explicitly called or disoriented, never auto-trigger
- Knowledge files refreshed: `Ralph/11-team-training-guide.md`, `hq-core/index-md-spec.md`, `hq-core/thread-schema.md`, `workers/README.md`, `workers/skill-schema.md`, `workers/state-machine.md`, `workers/templates/base-worker.yaml`, `projects/README.md`

---

## v5.0.0 (2026-02-07)

### Added
- **`/personal-interview`** — Deep conversational interview to build your profile and social voice. Populates `profile.md`, `voice-style.md`, and `agents.md` from ~18 thoughtful questions.
- **`workers/sample-worker/`** — Example worker with `worker.yaml` and `skills/example.md`. Copy and customize to build your own.

### Changed
- **`/setup`** — Simplified from 5 phases to 3. Now asks just name, work, and goals. Recommends `/personal-interview` for deeper profile building.
- **`.claude/CLAUDE.md`** — Updated structure (18 commands, sample-worker), added `/personal-interview` to commands table. Removed bundled worker listings.
- **`/execute-task`** — Added codebase exploration guidance (qmd collection search for workers), Linear sync integration for completed tasks
- **`/handoff`** — Added auto-commit of HQ changes before handoff (not just knowledge repos)
- **`/prd`** — Added target repo scanning via qmd collections during PRD creation
- **`/run-project`** — Added Linear sync integration (sets tasks to "In Progress" on execution start)
- **`/search`** — Added company auto-detection from context (cwd, active worker, recent files), enhanced collection scoping
- **`/search-reindex`** — Multi-collection architecture docs, instructions for adding new repo collections
- **`/cleanup`**, **`/reanchor`** — Genericized company INDEX paths
- `workers/registry.yaml` — Version 5.0, sample-worker only
- `knowledge/Ralph/11-team-training-guide.md` — Expanded with week-by-week team training insights
- `knowledge/hq-core/index-md-spec.md` — Genericized company references
- `knowledge/workers/README.md`, `skill-schema.md` — Updated examples
- `knowledge/projects/README.md` — Updated project examples

### Removed
- **All bundled workers** — `workers/dev-team/` (12 workers), `workers/content-*/` (5 workers), `workers/security-scanner/` removed. Build your own with `/newworker` using `sample-worker/` as reference.
- **`starter-projects/`** — Removed. Use `/prd` to create projects.

### Breaking
- Workers directory restructured: all pre-built workers removed. If you use dev-team or content workers, keep your existing copies.
- `/setup` no longer offers starter project selection. Use `/prd` + `/newworker` instead.

---

## v4.0.0 (2026-01-31)

### Added
- **`/learn`** — Automated learning pipeline: captures learnings from task execution/failure and injects rules directly into the files they govern (worker.yaml, command .md, knowledge files, or CLAUDE.md). Deduplicates via qmd, supports global promotion, event logging.
- **INDEX.md System** — Hierarchical INDEX.md files provide navigable maps of HQ. Auto-updated by `/checkpoint`, `/handoff`, `/reanchor`, `/prd`, `/run-project`, `/newworker`. Spec at `knowledge/hq-core/index-md-spec.md`
- **Knowledge Repos** — Knowledge folders can now be independent git repos, symlinked into HQ for versioning and sharing
- **Learning System** — Rules injected directly into source files (worker.yaml, commands, knowledge, CLAUDE.md). `/learn` + `/remember` pipeline with dedup, event logging, and global cap (20 rules)
- **Auto-Learn (Build Activities)** — `/newworker`, `/prd`, new knowledge/commands auto-register themselves via `/learn`
- **Search rules** — Formal policy: use qmd for HQ content search, never Grep/Glob for topic search
- `knowledge/Ralph/11-team-training-guide.md` — Team training guide for Ralph methodology
- `knowledge/hq-core/checkpoint-schema.json` — Checkpoint data format
- `knowledge/hq-core/index-md-spec.md` — INDEX.md specification

### Changed
- **`.claude/CLAUDE.md`** — Major rewrite: added INDEX.md System, Knowledge Repos, Learning System, Auto-Learn, Search rules sections. Command count 16 → 17
- **All 14 public commands refreshed** — `/checkpoint` (knowledge repo state), `/cleanup` (INDEX.md audit + knowledge repo checks), `/execute-task` (learnings integration, orchestrator output), `/handoff` (knowledge repo commits, INDEX.md regen), `/metrics`, `/newworker` (auto-learn + INDEX updates), `/prd` (auto-learn + INDEX updates), `/reanchor` (INDEX-based context loading), `/remember` (delegates to /learn), `/run-project` (fresh-context sub-agent pattern, auto-reanchor between tasks), `/run` (learnings loading), `/search-reindex`, `/search`
- `workers/registry.yaml` — Version 3.0 → 4.0, dev team count 13 → 12
- `knowledge/hq-core/thread-schema.md` — Added knowledge repo tracking
- `knowledge/workers/README.md`, `skill-schema.md`, `state-machine.md` — Updated
- `knowledge/projects/README.md` — Updated
- `workers/dev-team/code-reviewer/skills/review-pr.md` — Generalized E2E checks
- `workers/dev-team/frontend-dev/worker.yaml` — Generalized E2E requirements
- `workers/dev-team/qa-tester/worker.yaml` — Generalized E2E testing
- `workers/dev-team/task-executor/skills/validate-completion.md` — Added E2E manifest validation

### Removed
- `knowledge/pure-ralph/` — Removed (pure-ralph patterns merged into Ralph methodology core)

---

## v3.3.0 (2026-01-28)

### Added
- **Auto-Handoff** — Claude now auto-runs `/handoff` when context usage hits 70%, preserving session continuity without manual intervention
- `/setup` and `/exit-plan` now included in starter kit

### Changed
- **Command visibility overhaul** — 16 public commands (down from 29). Content, design, and company-specific commands moved to private
- All 16 public commands refreshed with latest improvements
- `.claude/CLAUDE.md` — Updated command tables, added Auto-Handoff section, count 29 → 16
- `workers/registry.yaml` — Paths updated to flat structure (`workers/` not `workers/public/`)
- Knowledge files PII-scrubbed

### Removed
- `/contentidea`, `/suggestposts`, `/scheduleposts`, `/preview-post`, `/post-now` — moved to private (content pipeline)
- `/humanize` — moved to private (content polish)
- `/generateimage`, `/svg`, `/style-american-industrial`, `/design-iterate` — moved to private (design tools)
- `/publish-kit`, `/pure-ralph` — moved to private
- `/hq-sync` — moved to private

---

## v3.2.0 (2026-01-28)

### Added
- **`/remember`** - Capture learnings when things don't work right. Injects rules directly into relevant files (worker.yaml, commands, CLAUDE.md, skills) instead of a separate database. Supports deduplication via qmd search and Ralph integration for auto-capture on back-pressure failures.
- `workers/registry.yaml` - Added `frontend-designer` and `qa-tester` standalone workers

### Changed
- All 28 existing public commands refreshed with latest improvements
- `.claude/CLAUDE.md` - Command count 28 → 29, added `/remember` to session management
- `workers/registry.yaml` - Version 2.0 → 3.0

---

## v3.1.0 (2026-01-28)

### Changed
- **`/prd`** - Merged `/newproject` into `/prd`. Single command now handles discovery, PRD generation (prd.json + README.md), orchestrator registration, beads sync, and execution choice
- **`/run-project`** - Strict prd.json validation: hard stop if missing, field validation on load, no README.md fallback
- **`/execute-task`** - Same strict prd.json validation as `/run-project`
- **`/newworker`** - Updated `/newproject` references to `/prd`
- **`/nexttask`** - Updated `/newproject` reference to `/prd`
- **`.claude/CLAUDE.md`** - Command count 29 → 28, removed `/newproject` from project commands

### Removed
- **`/newproject`** - Merged into `/prd`. Use `/prd` for all project planning

### Breaking
- `/newproject` no longer exists. Use `/prd` instead (same discovery flow + now outputs prd.json)
- `/run-project` and `/execute-task` require `prd.json` with `userStories` array (not `features`). Legacy PRDs must be migrated.

---

## v3.0.0 (2026-01-27)

### Added
- **`/humanize`** - Remove AI writing patterns from drafts
- **`/pure-ralph`** - External terminal orchestrator for autonomous PRD execution
- **`/svg`** - Generate minimalist abstract white line SVG graphics
- **`/search-reindex`** - Reindex and re-embed HQ for qmd search
- `knowledge/pure-ralph/` - Pure Ralph loop patterns, branch workflow, and learnings
- `knowledge/design-styles/ethereal-abstract.md` - Ethereal abstract style guide
- `knowledge/design-styles/liminal-portal.md` - Liminal portal style guide
- `knowledge/hq/checkpoint-schema.json` - Checkpoint data format
- `knowledge/projects/` - Project creation guidelines and templates

### Changed
- **`/search`** - Upgraded to qmd-powered semantic + full-text search (BM25, vector, hybrid modes)
- **`/handoff`** - Added search index update step (`qmd update && qmd embed`)
- **`/run-project`** - Updated orchestration pattern with inline worker pipeline execution
- **`/execute-task`** - Worker names aligned with actual dev-team worker IDs; added `content` task type
- **`.claude/CLAUDE.md`** - Updated command count (22 → 29), added Design section, qmd Search section, new knowledge refs

### Breaking
- `/search` syntax changed to qmd-based queries. Install [qmd](https://github.com/tobi/qmd) or use the built-in grep fallback.

---

## v2.1.0 (2026-01-26)

### Added
- **`/generateimage`** - Generate images via Gemini Nano Banana (gnb)
- **`/post-now`** - Post approved content to X or LinkedIn immediately
- **`/preview-post`** - Preview social drafts, select images, approve for posting
- **`/publish-kit`** - Sync HQ → hq-starter-kit with PII scrubbing

### Changed
- **`/contentidea`** - Enhanced multi-platform workflow with:
  - Image generation per approved style (7 styles)
  - Visual prompt patterns by theme
  - Anti-AI slop rules (humanizer)
  - Preview site sync
- **`/scheduleposts`** - Improved queue management and image generation workflow
- **`/style-american-industrial`** - Expanded monochrome variant with CSS variables
- **`/metrics`** - Updated example worker names
- **`/run`** - Updated example worker names
- **`/search`** - Updated example worker names
- **`/suggestposts`** - Generalized for any user

### Fixed
- Consistent PII scrubbing across all skills

---

## v2.0.0 (2026-01-25)

Major release: Project orchestration, content pipeline, and 18 production workers.

### Project Orchestration
- **`/run-project`** - Execute entire projects via Ralph loop
- **`/execute-task`** - Worker-coordinated task execution
- **`/prd`** - Enhanced PRD generation with HQ context awareness
- `workspace/orchestrator/` - Project state tracking
- `workspace/learnings/` - Captured insights from executions

### Content Pipeline
- **`/contentidea`** - Build raw idea into full content suite (one-liner → post → article)
- **`/suggestposts`** - Research-driven post suggestions aligned with goals
- **`/scheduleposts`** - Smart timing for posting based on content inventory
- `social-content/drafts/` - Platform-specific draft storage (x/, linkedin/)
- `workspace/content-ideas/inbox.jsonl` - Idea capture

### Dev Team (13 workers)
Complete development team for autonomous coding:
- `project-manager` - PRD lifecycle, issue selection
- `task-executor` - Analyze & route to workers
- `architect` - System design, API design
- `backend-dev` - API endpoints, business logic
- `frontend-dev` - React/Next components
- `database-dev` - Schema, migrations
- `qa-tester` - Testing, validation
- `motion-designer` - Animations, polish
- `infra-dev` - CI/CD, deployment
- `code-reviewer` - PR review, quality gates
- `knowledge-curator` - Update knowledge bases
- `product-planner` - Technical specs

### Content Team (5 workers)
Specialized content analysis workers:
- `content-brand` - Voice, messaging, tone
- `content-sales` - Conversion copy, CTAs
- `content-product` - Technical accuracy
- `content-legal` - Compliance, claims
- `content-shared` - Shared utilities (library)

### New Commands
- **`/search`** - Full-text search across threads, checkpoints, PRDs, workers
- **`/design-iterate`** - Design A/B testing with git branches
- **`/metrics`** - Worker execution metrics
- **`/cleanup`** - Audit and clean HQ
- **`/exit-plan`** - Force exit from plan mode

### Auto-Checkpoint
- Sessions auto-save to `workspace/threads/`
- Format: `T-{timestamp}-{slug}.json`
- Triggers: worker completion, git commit, file generation
- Never lose work to context limits

### Knowledge Bases
- `knowledge/hq-core/` - Thread schema, workspace patterns
- `knowledge/ai-security-framework/` - Security best practices
- `knowledge/design-styles/` - Design guidelines + swipes
- `knowledge/dev-team/` - Development patterns
- `knowledge/loom/` - Agent patterns reference
- Updated `knowledge/workers/` with templates

### Registry
- Upgraded to version 2.0 format
- Added team grouping
- Worker type taxonomy (CodeWorker, ContentWorker, SocialWorker, ResearchWorker, OpsWorker, Library)

---

## 2026-01-21

### PRD-First Planning
Added rules to redirect Claude's built-in planning to HQ's PRD system.

**Problem:** Claude Code triggers session-local plan mode for "complex" tasks. These plans live in `.claude/plans/`, are ephemeral, and compete with HQ's persistent PRD workflow.

**Solution:** Skills now redirect to `/newproject` when complex planning is needed. Plans belong in `prd.json` files that persist across sessions and integrate with `/ralph-loop`.

**Changes:**
- All skills: Redirect `EnterPlanMode` → suggest `/newproject` instead
- All skills: Redirect `TodoWrite` → PRD features track tasks

**Result:** Planning happens in the right place (PRD), not session-local files.
