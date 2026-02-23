# Changelog

## v6.4.0 (2026-02-23)

Company-scoped projects, file lock acquisition, policy loading, and new commands.

### Added

- **/launch-brand** — DTC brand launch command: interactive interview → company scaffold → execution-ready PRD with 10 stories, all in one session.
- **/imessage** — Send iMessage to saved contacts via Messages.app.
- **/execute-task — File lock acquisition** (step 5.5) — Acquires file locks on start, releases on completion/failure. Conflict modes: `hard_block`, `soft_block`, `read_only_fallback`.
- **/execute-task — Policy loading** (step 5.6) — Loads applicable policies from company, repo, and global directories before worker execution.
- **/execute-task — Dynamic file lock expansion** (step 6d.5) — Workers can touch more files than predicted; locks expand dynamically.
- **/execute-task — File lock release on failure** (step 8.0) — Locks released even on task failure to prevent orphaned locks.
- **/execute-task — iMessage notify** (step 7c.5) — Optional completion notifications to contacts whose `context` includes the project.
- **/execute-task — Linear comments** (step 7a.6) — Comment on Linear issues with @mentions on state changes.
- **/run-project — Board sync** (step 4.5) — Sync project status to `board.json` on start and completion.
- **/run-project — File lock conflict check** (step 5a.1) — Skip stories with file conflicts during task selection.
- **/run-project — Linear comments** (step 5a.6) — Comment on issues during state transitions.
- **/prd — Board sync** (step 5.5) — Upsert project entry in `board.json` after PRD creation.
- **/prd — `files` field** — Story schema now includes `files: []` for file lock tracking.

### Changed

- **/execute-task** — Company-scoped project resolution: searches `companies/*/projects/` first, then `projects/` fallback.
- **/prd** — Company-scoped project creation at `companies/{co}/projects/{name}/`. Infrastructure pre-check now creates embedded repos (`git init` in `companies/{co}/knowledge/`).
- **/prd** — STOP after creation + handoff. Hard block on implementation in same session. MANDATORY file creation rule added.
- **/run-project** — Company-scoped project resolution. Auto-reanchor now re-reads policies (not learned rules). Board sync on completion.
- **/newworker** — Updated paths for company-scoped workers (`companies/{co}/workers/{id}/`).
- **/checkpoint** — Knowledge repo git state check now supports embedded repos (not just symlinks).
- **CLAUDE.md — Policies** — Three-directory structure (company > repo > global) with precedence and spec reference.
- **CLAUDE.md — Learning System** — Migrated from inline injection to policy file creation.
- **CLAUDE.md — Knowledge Repos** — Clarified embedded vs symlinked repos.

---

## v6.3.0 (2026-02-21)

Policies, file locking, Glob safety hook, and safe settings.json migration.

### Added

- **CLAUDE.md — Policies** — Company-scoped standing rules (`companies/{co}/policies/`) with hard/soft enforcement. Proactive directives that override default behavior. Template at `companies/_template/policies/example-policy.md`.
- **CLAUDE.md — File Locking** — Story-scoped file flags prevent concurrent edit conflicts in multi-agent projects. Config via `settings/orchestrator.yaml`, locks in `.file-locks.json`.
- **Glob safety hook** — PreToolUse hook (`block-hq-glob.sh`) blocks Glob from HQ root, preventing 20s+ timeouts from symlinked repos. Suggests scoped paths instead.
- **companies/_template/policies/** — Policy template for `/newcompany` scaffolding. YAML frontmatter (id, title, scope, trigger, enforcement) + markdown body.
- **/update-hq — settings.json merge** — New 5b-SETTINGS section with JSON-aware hook merging. Preserves user permissions and custom hooks, adds new hook entries from upstream without overwriting.

### Changed

- **CLAUDE.md — Company Isolation** — Added Linear credentials cross-posting guard: validate `workspace` field matches expected company before any Linear API call.
- **CLAUDE.md — Learned Rules** — 4 new rules: pre-deploy domain check, EAS build env vars, Vercel env var trailing newlines, model routing.
- **`.claude/settings.json`** — Added PreToolUse hook entry for Glob safety.
- **/update-hq** — Added settings.json special handling (5b-SETTINGS section), template directory handling, updated step numbering.

---

## v6.2.0 (2026-02-20)

New CLAUDE.md behavioral sections and expanded learned rules.

### Added

- **CLAUDE.md — Session Handoffs** — Explicit handoff workflow: commit first, write handoff.json, update INDEX, create thread. Never plan mode during handoff.
- **CLAUDE.md — Corrections & Accuracy** — Apply user corrections exactly as stated. No re-interpretation or paraphrasing.
- **CLAUDE.md — Sub-Agent Rules** — Sub-agents must commit own work before completing. Orchestrator verifies uncommitted changes.
- **CLAUDE.md — Git Workflow Rules** — Branch verification, merge-over-rebase for diverged branches, hook bypass during merge/rebase, no accidental main commits.
- **CLAUDE.md — Vercel Deployments** — Org/team verification, framework detection checks, SSO fallback to local testing.

### Changed

- **CLAUDE.md — Learned Rules** — 6 new rules: Vercel custom domain deploy safety, Task() sub-agents lack MCP, Shopify 2026 auth, Vercel preview SSO, Vercel domain team move, Vercel framework detection. Max cap raised 10 → 25.

---

## v6.1.0 (2026-02-20)

Codex CLI integration — fixes codex workers not actually calling OpenAI Codex in the pipeline.

### Changed

- **`/execute-task`** — Added inline Codex review step (6c.5) that runs `codex review --uncommitted` directly via Bash instead of spawning a sub-agent. Deterministic — cannot be skipped. Added pre-flight `which codex` check (step 2.5) with graceful degradation. Codex debugger auto-recovery now uses CLI when available.
- **codex-reviewer** — All 3 skills (review-code, improve-code, apply-best-practices) rewritten from MCP tool calls to Codex CLI (`codex review`, `codex exec --full-auto`). Worker YAML updated: MCP section replaced with CLI config.
- **codex-coder** — All 3 skills (generate-code, implement-feature, scaffold-component) rewritten from MCP to `codex exec --full-auto` via Bash.
- **codex-debugger** — All 3 skills (debug-issue, root-cause-analysis, fix-bug) rewritten from MCP to Codex CLI. Root-cause-analysis uses `codex exec --sandbox read-only` for analysis-only mode.
- **codex-engine** — Description updated. MCP server kept for standalone use but no longer required for pipeline execution.

### Fixed

- **Codex workers actually call Codex now** — Previously, Task() sub-agents didn't inherit MCP server connections, so codex-reviewer/coder/debugger could never access their MCP tools. They either skipped the phase or ran as Claude-only reviews. CLI-based approach works because Bash is always available to sub-agents.

## v6.0.0 (2026-02-19)

Major release: 5 worker teams (39 workers), gardener audit system, new commands.

### Added — Worker Teams

- **Dev Team (16 workers)** — Full development team now included (was removed in v5.0.0). Project manager, task executor, architect, backend/frontend/database devs, QA, motion designer, infra dev, code reviewer, knowledge curator, product planner, plus codex workers (coder, reviewer, debugger, engine).
- **Content Team (5 workers)** — Content analysis pipeline: brand voice, sales copy, product accuracy, legal compliance, shared utilities.
- **Social Team (5 workers)** — Social media pipeline: strategist, reviewer, publisher, verifier, shared utilities.
- **PR Team (6 workers)** — Public relations pipeline: strategist, writer, outreach, monitor, coordinator, shared utilities.
- **Gardener Team (3 workers)** — HQ content audit & cleanup: garden-scout (fast scan), garden-auditor (deep validation), garden-curator (execute actions). See `/garden` command.

### Added — Standalone Workers

- **frontend-designer** — Bold UI generation using Anthropic skill
- **qa-tester** — Automated website testing with Playwright + agent-browser
- **security-scanner** — Security scanning and vulnerability detection
- **pretty-mermaid** — Mermaid diagram rendering with 14 themes

### Added — Commands

- **`/garden`** — Multi-worker audit pipeline for detecting stale content, duplicates, orphans, INDEX drift, and conflicts. Three-phase (scout→audit→curate) with human approval gates. Scope by company, directory, or full HQ sweep.
- **`/startwork`** — Lightweight session entry point: pick company or project, gather minimal context.
- **`/newcompany`** — Scaffold a new company with full infrastructure (dirs, manifest, knowledge repo, qmd collection).
- **`/bootcamp-student`** — Onboard new students with full pipeline (DB, PRD, deck).

### Changed

- **`workers/registry.yaml`** — Version 7.0. Now includes all 39 public workers across 5 teams plus 4 standalone workers.
- **`.claude/CLAUDE.md`** — Updated with gardener-team, company manifest, knowledge repo patterns, learned rules system, auto-checkpoint/handoff hooks.
- **22 existing commands refreshed** — Various improvements to `/checkemail`, `/checkpoint`, `/cleanup`, `/decide`, `/email`, `/execute-task`, `/handoff`, `/learn`, `/metrics`, `/newworker`, `/nexttask`, `/prd`, `/reanchor`, `/recover-session`, `/remember`, `/run`, `/run-project`, `/search`, `/search-reindex`.
- **Knowledge bases expanded** — New: agent-browser specs, PR knowledge, curious-minds. Updated: Ralph, hq-core, dev-team, design-styles, loom, workers, projects.

### Breaking

- Registry version 6.0 → 7.0 with restructured worker paths and team groupings. If you have custom workers, merge carefully.
- Dev team workers re-added (removed in v5.0.0). If you built custom equivalents, review for conflicts.

---

## v5.5.2 (2026-02-17)

### Added
- **Auto-checkpoint hooks** — PostToolUse hooks detect git commits and report/draft generation, nudge Claude to write lightweight thread files automatically. No more manual `/checkpoint` after every commit.
- **Auto-handoff hook** — PreCompact hook fires when context window fills, nudges Claude to run `/handoff` before state is lost.
- `.claude/hooks/auto-checkpoint-trigger.sh` — PostToolUse detection script
- `.claude/hooks/auto-handoff-trigger.sh` — PreCompact detection script
- `.claude/settings.json` — Hook registration (PostToolUse + PreCompact)

### Changed
- `/checkpoint` — New step 1: checks for recent auto-checkpoint (<5 min) and upgrades it to full checkpoint instead of duplicating
- `/cleanup` — Added 14-day auto-checkpoint purge (separate from 30-day manual thread archival)
- `CLAUDE.md` — Replaced aspirational Auto-Checkpoint/Auto-Handoff sections with concrete hook-backed procedures
- `knowledge/hq-core/thread-schema.md` — Added `type` field (`checkpoint` | `auto-checkpoint` | `handoff`) and lightweight auto-checkpoint schema variant

---

## v5.5.1 (2026-02-17)

### Changed
- `/setup` — `repos/public/` and `repos/private/` creation promoted to strict, first step in Phase 2. Removed duplicate `mkdir` calls.
- `/update-hq` — Added repos directory validation to Phase 4 pre-flight. Creates missing `repos/public/` and `repos/private/` during migration.

---

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
