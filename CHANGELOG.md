# Changelog

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
- `/generateimage`, `/svg`, `/style-american-industrial`, `/mj-abacus`, `/design-iterate` — moved to private (design tools)
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
