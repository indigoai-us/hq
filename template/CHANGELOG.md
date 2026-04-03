# Changelog

## [10.4.0] — 2026-04-03

### Added
- **9 new Codex-ready skills** — `brainstorm`, `execute-task`, `handoff`, `learn`, `prd`, `run`, `run-project`, `search`, `startwork` — each with `SKILL.md` + `agents/openai.yaml` for dual Claude Code / Codex discovery
- **Codex dual-format documentation** — CLAUDE.md now documents the skill structure, adaptation rules, and `codex-skill-bridge.sh status` coverage tool
- **Denylist exceptions mechanism** — `scrub-denylist.yaml` now supports an `exceptions` section for terms that must survive scrubbing (e.g. `indigoai-us`)
- **Codex conversion step** in `/publish-kit` — Step 4.5 verifies all synced skills have `agents/openai.yaml`

### Changed
- `scripts/codex-skill-bridge.sh` — enhanced with `commands_with_skills_count()`, `print_coverage_report()`, and symlink support in `openai_yaml_count()`
- `scripts/run-project.sh` — refreshed with latest orchestrator improvements
- 154 policies synced (scope-filtered: global, command, cross-cutting only)
- Skill coverage: 39/40 skills now Codex-ready (97%)

## [10.3.0] — 2026-04-02

### Added
- **`land` skill** — land a PR: monitor CI, resolve review issues, merge, verify production
- **12 new policies** — frustration-prevention rules (announce before irreversible, confirm creative direction, fix root cause not symptoms, never swallow errors, no production testing, post-parallel build verify, PR single concern, alert baseline calibration), plus orchestrator improvements (prd-files-match-acs-for-swarm, run-project-name-matches-dir, run-project-sigkill-retry, scrub-hook-no-denylist-in-template)

### Changed
- `/run-project` — added `--inline` execution mode for plan-first, in-session sequential story execution
- `/update-hq` — rewritten to pull from indigoai-us/hq (replaces starter-kit references)
- `/hq-growth-dashboard` — updated for indigoai-us/hq repo references
- All commands, policies, and hooks refreshed with latest content

## [10.2.0] — 2026-04-02

### Added
- 17 missing workers copied from hq-starter-kit: accessibility-auditor, exec-summary, frontend-designer, gemini-designer, gemini-stylist, gemini-ux-auditor, gstack-sprint, impeccable-designer, paper-designer, performance-benchmarker, pretty-mermaid, qa-tester, social-publisher, social-reviewer, social-shared, social-strategist, social-verifier

### Changed
- template/ canonicalized as single source of truth for HQ content (hq-starter-kit archived)
- core.yaml version bumped to 10.2.0

## v10.2.0 (2026-04-01)

Codex app compatibility — all 30 HQ skills now discoverable from OpenAI Codex via `agents/openai.yaml` metadata and modernized `.agents/skills/` bridge paths.

### Added
- **`agents/openai.yaml` for all 30 skills** — Codex app can now render skill names and descriptions in its UI. Each file contains `display_name` + `short_description` extracted from SKILL.md frontmatter
- **`scripts/generate-openai-yaml.sh`** — batch generator to create `agents/openai.yaml` from SKILL.md for any new skills. Supports `--dry-run` and `--force` flags
- **`.agents/skills/` bridge path** — Codex's primary discovery path (`~/.agents/skills/hq`) now supported alongside legacy `~/.codex/skills/hq`
- **Repo-level `.agents/skills/` bridge** — skills discoverable when running Codex from within HQ directory

### Changed
- **`scripts/codex-skill-bridge.sh`** — now manages 5 bridges (added global `.agents/skills/`, repo `.agents/skills/`). Status output shows openai.yaml coverage count
- Updated commands, policies, hooks, knowledge bases, and CLAUDE.md
- Worker configs refreshed

### Removed
- (none)

## v10.1.0 (2026-04-01)

Onboarding education kit + setup command overhaul. New users now get training materials and a guided first week.

### Added
- **Getting Started education kit** (`knowledge/public/getting-started/`) — 3 guides that ship with every HQ install:
  - `quick-start-guide.md` — What HQ is, the Core Loop, daily workflow, key concepts, rules of thumb
  - `cheatsheet.md` — One-page daily reference card (commands, cadence, troubleshooting)
  - `learning-path.md` — 11-module self-paced progression from beginner to advanced
- **4 new policies**: `bun-overrides`, `chunked-reads`, `clipboard-file-protocol`, `deconflict-postbridge-schedule`

### Changed
- **`/setup` command overhauled** — now an educational onboarding experience:
  - Phase 0: Welcome block explaining the 1000-employee analogy
  - Toolkit bridge after dependency checks (what each tool does)
  - Context bridge after identity collection (why HQ learns who you are)
  - Phase 4: Education Kit section with auto-open of quick-start-guide
  - "Your First Week" roadmap (Day 1 + Week 1 tasks)
- **Multiple commands updated**: `/audit`, `/cleanup`, `/garden`, `/prd`, `/quality-gate`, `/reanchor`, `/run-project`, `/startwork`, and others
- CLAUDE.md, USER-GUIDE.md, modules.yaml refreshed
- Knowledge bases updated (agent-browser, hq-core, hq-desktop specs)
- Worker configs updated

### Removed
- (none)

## v10.0.0 (2026-03-31)

Obsidian vault integration, new policies, command updates, and scrub hardening.

### Added
- **Obsidian vault config** (`.obsidian/`) — pre-configured doc viewer with graph colors, CSS snippet, folder exclusions, bookmarks. Open HQ in Obsidian for instant browsing
- `/hq-growth-dashboard` — pull HQ growth metrics (npm downloads, GitHub stars)
- `protect-core.sh` hook — prevents edits to core infrastructure files
- **15 new policies**: `agent-browser-react-false-positives`, `articles-blog-first`, `bulk-sed-exception-ordering`, `cio-browser-navigation`, `dual-codex-review-pattern`, `git-filter-repo-case-variants`, `hq-docker-build-platform-amd64`, `hq-docker-in-docker-path-translation`, `hq-nextjs-clean-types-after-page-delete`, `hq-swarm-rust-hub-files`, `hq-telegram-single-poller`, `hq-tmux-plan-approval-dance`, `hq-use-neon-not-vercel-postgres`, `hq-verify-shared-files-after-parallel-agents`, `image-context-isolation`
- `obsidian-setup.md` knowledge doc in hq-core

### Changed
- **16 commands** updated: `/audit`, `/cleanup`, `/garden`, `/harness-audit`, `/model-route`, `/prd`, `/reanchor`, `/recover-session`, `/remember`, `/run-project`, `/run`, `/search-reindex`, `/search`, `/startwork`, `/understand-project`, `/update-hq`
- **4 skills** updated: `ascii-graphic`, `colorize`, `consolidate`, `social-graphic`
- **30+ policies** updated with latest learned rules
- **5 workers** updated: `accessibility-auditor`, `content-brand`, `content-legal`, `content-product`, `content-sales`
- **4 hooks** updated: `auto-checkpoint-trigger`, `hook-gate`, `observe-patterns`, `screenshot-resize-trigger`
- `CLAUDE.md`, `USER-GUIDE.md`, `modules.yaml`, `audit-log.sh` refreshed
- Scrub denylist expanded with `{company}` and `{company}`

### Removed
- `qa-screenshot-isolation.md` policy (replaced by `image-context-isolation`)

## v9.0.0 (2026-03-25)

Major expansion: skills, policies, and infrastructure blueprints now included in the kit.

### Added
- **30 skills** in `.claude/skills/` — `adapt`, `agent-browser`, `animate`, `arrange`, `ascii-graphic`, `audit`, `bolder`, `clarify`, `colorize`, `consolidate`, `critique`, `delight`, `distill`, `document-release`, `extract`, `frontend-design`, `harden`, `investigate`, `normalize`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `retro`, `review`, `review-plan`, `social-graphic`, `teach-impeccable`, `typeset`
- **26 gstack skills** — `g-autoplan`, `g-benchmark`, `g-canary`, `g-careful`, `g-codex`, `g-cso`, `g-design-consultation`, `g-design-review`, `g-document-release`, `g-freeze`, `g-gstack-upgrade`, `g-guard`, `g-investigate`, `g-land-and-deploy`, `g-office-hours`, `g-plan-ceo-review`, `g-plan-design-review`, `g-plan-eng-review`, `g-qa`, `g-qa-only`, `g-retro`, `g-review`, `g-setup-browser-cookies`, `g-setup-deploy`, `g-ship`, `g-unfreeze`. Credit: [Garry Tan](https://github.com/garrytan/gstack) (Y Combinator)
- **89 policies** in `.claude/policies/` — workflow rules, safety guards, tool-specific gotchas (git, Vercel, Supabase, Linear, Clerk, Expo, orchestrator, and more)
- `.ignore` — ripgrep ignore config, critical for Grep hygiene in HQ
- `settings/orchestrator.yaml` — swarm/file-locking/state-machine config for `/run-project`
- `USER-GUIDE.md` — command reference, worker guide, and typical session walkthrough
- `modules/modules.yaml` — knowledge module registry for `qmd` search integration
- `scripts/codex-skill-bridge.sh` — Codex ↔ Claude skill bridge installer
- `scripts/audit-log.sh` — structured audit log utility
- `scripts/resize-screenshot.sh` — screenshot resize utility (used by `screenshot-resize-trigger.sh` hook)

### Changed
- Updated all existing commands, workers, knowledge, hooks to latest HQ state
- CLAUDE.md refreshed with current structure and guidance

## v8.2.0 (2026-03-23)

New commands, workers, knowledge, and a comprehensive PII/company scrub across all files.

### Added
- `/document-release` — Post-ship documentation sync for README, CLAUDE.md, architecture docs
- `/investigate` — Iron Law debugging with structured root cause analysis
- `/retro` — Project/session retrospective with pattern surfacing
- `block-inline-story-impl.sh` hook — prevents inline story implementation outside `/execute-task`
- `impeccable-designer` worker — quality-obsessed design with full Impeccable skill chain
- `paper-designer` worker — bidirectional Paper Desktop design bridge via MCP
- `knowledge/impeccable/` — Impeccable design system knowledge base
- `knowledge/design-styles/formulas/` — design formula templates (app, print, slides, social)
- `knowledge/hq/handoff-templates.md` + `knowledge-taxonomy.md`
- `knowledge/agent-browser/tauri-testing.md` — Tauri app testing guide
- Story test runner in `run-project.sh` — cumulative regression guard after each story

### Changed
- 19 commands updated with latest improvements
- `review.md` + `understand-project.md` synced from upstream
- `auto-checkpoint-trigger.sh`, `hook-gate.sh`, `observe-patterns.sh` updated
- `run-project.sh` — codex model hints, story test runner, HQ_EXECUTING_STORY env var
- All Ralph, ai-security-framework, agent-browser, design-styles, dev-team, gemini-cli, loom knowledge updated
- Registry bumped to v10.0 with 45 public workers

### Removed
- `/imessage` command (personal, not generic)
- All {PRODUCT}/{Product}/{Product} references scrubbed from CLAUDE.md, commands, workers, knowledge
- {Product} Linear Integration section removed from CLAUDE.md
- {PRODUCT} Project Repos commit rules section removed from CLAUDE.md
- All company-specific examples replaced with generic placeholders

### Security
- Full PII scrub pass across 753 files
- ggshield secret scan — zero findings

## v8.1.1 (2026-03-12)

Fix missing scaffold directories — new installs now get the full canonical HQ folder structure.

### Fixed

- **Installer template** — Added missing directories: `repos/{public,private}`, `companies/`, `settings/`, `data/`, `modules/`, `scripts/`, `workspace/{learnings,reports}`
- **macOS .pkg builder** — `prepare_payload()` now creates all canonical directories (was missing 9)
- **`.ignore` file** — New installs now include ripgrep ignore for `repos/`, `node_modules/`, `**/.git/` (prevents Grep slowdowns)

### Added

- **`/review`** — Paranoid pre-landing code review with two-pass analysis (CRITICAL/INFORMATIONAL)
- **`/review-plan`** — Structured plan review with scope modes (EXPANSION / HOLD / REDUCTION)
- **`companies/_template/`** — Policy template and starter `manifest.yaml` included in new installs
- **`repos/{public,private}/`** — Added to starter-kit repo root

### Changed

- **Template CLAUDE.md** — Structure section updated to show full directory tree (13 dirs, was 7)
- **`auto-checkpoint-trigger.sh`** — Updated hook logic

## v8.1.0 (2026-03-12)

Ralph loop reliability — in-session mode default, 3-layer passes detection, swarm retry tracking, per-story branch isolation, project reanchor, and 10+ reliability fixes.

### Added

- **`/run-project` — In-session mode default** — Stories run as Task() sub-agents within the current Claude session (faster, no process overhead). Headless bash mode via `--bash` flag.
- **`/run-project` — `--codex-autofix` flag** — Auto-fix P1/P2 codex review findings via targeted `claude -p` agent with 300s timeout.
- **`/run-project` — Context safety limits** — Auto-handoff after 6 stories or 70% context ceiling.
- **`/run-project` — Project Reanchor** — Every 3 completed stories, evaluates remaining stories for spec drift. Writes reanchor report.
- **`run-project.sh` — 3-layer passes detection** — Layer 1 (JSON parse) → Layer 2 (full-file scan for task_id+status pairs) → Layer 3 (git heuristic: commits after checkout + declared files touched). Replaces simple grep fallback.
- **`run-project.sh` — Swarm retry tracking** — `_swarm_retry_get()`/`_swarm_retry_inc()` with max 2 retries per story. Exhausted stories filtered from new batch selection.
- **`run-project.sh` — Per-story branch isolation** — `project-branch--story-slug` naming avoids "already checked out" conflicts in swarm mode.
- **`run-project.sh` — Full commit-range cherry-pick** — Uses `merge-base` to capture all worktree commits, not just HEAD.
- **`run-project.sh` — Stale PID cleanup** — Dead PIDs from crashed processes cleaned from `current_tasks` on startup.
- **`run-project.sh` — macOS timeout fallback** — `gtimeout` → `perl -e alarm` chain for bash 3.2 compatibility.
- **`run-project.sh` — Mandatory termination protocol** — Stricter sub-agent JSON output enforcement ("LAST output must be JSON only").

### Changed

- **`/prd` — 7-batch interview** — Expanded from 4 to 7 question batches (Users/Current State, Data/Architecture, Integrations, Quality/Shipping as separate batches). Dynamic question enrichment from company policies and repo scan.
- **CLAUDE.md — Token optimization** — `MAX_THINKING_TOKENS` bumped to 31999. Added `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` env var.
- **CLAUDE.md — Linear rules 11 & 12** — Default assignee by team + no-orphan-issues enforcement.
- **13 commands PII-scrubbed** — audit, cleanup, garden, model-route, reanchor, recover-session, remember, run, search, search-reindex, startwork, update-hq refreshed.

### Fixed

- `run-project.sh` — `files_changed` JSON validation in `update_state_completed()`
- `run-project.sh` — Empty PID → null (was crash on empty string)
- `run-project.sh` — `date -u` flag for BSD date UTC correctness
- `run-project.sh` — Per-story branch cleanup after worktree merge (was leaking branches)
- `run-project.sh` — `process_swarm_completion()` receives `start_epoch` for Layer 3 git heuristic

---

## v8.0.1 (2026-03-10)

### Fixed

- **`run-project.sh` — bash 3.2 crash** — 8 `local` declarations outside functions caused `set -e` to exit the script on macOS (bash 3.2). Affected swarm dispatch, sequential retry-skip, and project completion code paths. Replaced with plain variable assignments.
- **`run-project.sh` — worktree self-removal** — When `branchName` matches the repo's current checkout (e.g., both are `main`), `ensure_worktree()` now detects this and skips worktree setup instead of "reusing" the main repo as a worktree. Prevents `cleanup_worktree()` from attempting to `git worktree remove` the main working directory on exit.

## v8.0.0 (2026-03-10)

Policy-first system — all major commands now scan and enforce policies. `/learn` rewrite creates policy files as primary output. 1 new command (`/strategize`), smarter regression gates.

### Added

- **Standard Policy Loading Protocol** (CLAUDE.md) — 5-step protocol for all commands to load company → repo → global policies. Documents which commands implement it.
- **`/startwork` — Policy scan** (Step 2.5) — Sessions now load applicable policies on startup. Displays policy counts + hard-enforcement rule titles in orientation block.
- **`/run-project` — Pre-Loop policy loading** — Orchestrator loads company + repo + global policies before entering the Ralph loop. Hard-enforcement policies block the loop if violated.
- **`/prd` — Repo policy loading** — PRD creation now checks `{repoPath}/.claude/policies/` for repo-scoped constraints (commit hooks, deploy procedures, code location rules).
- **`/run` — Policy loading** (Step 1b) — Worker execution loads company policies from worker path context and repo policies if applicable.
- **`/learn` — Scan existing policies** (Step 4.5) — Before creating new rules, scans existing policy files for updates. Prevents duplicate policies.
- **`/learn` — Policy file output** — Primary output is now structured policy files (YAML frontmatter + Rule + Rationale) in scope-appropriate directories. Worker.yaml injection retained as fallback for worker-specific learnings only.
- **`run-project.sh` — Regression baseline** — Captures pre-existing error counts on first gate run. Only flags errors above baseline as regressions, preventing false positives in repos with pre-existing issues.
- **`run-project.sh` — Headless doc sweep** — `run_doc_sweep()` runs `claude -p` to update 4 documentation layers (internal docs, external docs, repo knowledge, company knowledge) after project completion. Replaces interactive doc-sweep-flag.json.
- **`run-project.sh` — Swarm mode** (`--swarm [N]`) — Parallel story execution via git worktrees. Pre-acquires file locks, dispatches eligible stories as background `claude -p` processes, monitors PIDs with periodic check-ins, cherry-picks commits sequentially. Stories without `files[]` are never swarmed.
- **`run-project.sh` — Signal trapping** — `cleanup_on_signal()` catches SIGINT/SIGTERM, kills swarm children, releases locks/checkouts, sets state to "paused".
- **`run-project.sh` — Worktree isolation** — Each project gets its own git worktree for branch isolation. `check_repo_conflict()` detects concurrent orchestrators on the same repo. `ensure_worktree()` / `cleanup_worktree()` manage lifecycle.
- **`settings/orchestrator.yaml` — Swarm config** — New `swarm:` section with `max_concurrency`, `checkin_interval_seconds`, `require_files_declared`.
- **New command** — `/strategize` for strategic prioritization with optional deep review.

### Changed

- **`/learn`** — Major rewrite: policy files are now primary output (was worker.yaml/CLAUDE.md injection). Step 3 scope resolution targets policy directories. Step 5 creates structured policy files per `policies-spec.md`. CLAUDE.md `## Learned Rules` reserved for global promotion of critical rules only.
- **`/startwork`** — Now policy-aware: loads company, repo, and global policies during session startup.
- **`/run-project`** — Now policy-aware: loads policies before first task, passes to sub-agents.
- **`/prd`** — Now loads repo policies in addition to company policies during PRD creation.
- **`/run`** — Now policy-aware: determines company from worker path and loads applicable policies.
- **`/audit`**, **`/handoff`**, **`/harness-audit`**, **`/model-route`** — Various improvements.
- **`run-project.sh`** — Regression gates upgraded with baseline comparison. Headless doc sweep. Swarm mode (+716 lines). Signal trapping. Worktree isolation. Budget caps removed.
- **`/execute-task`** — Self-owned lock skip (orchestrator pre-acquires for swarm). Orchestrator writes `passes` (single-writer pattern).
- **CLAUDE.md** — Added Standard Policy Loading Protocol to Policies section. Updated command count to 44+.

---

## v7.0.0 (2026-03-09)

Hook profiles, audit logging, 9 new commands, 4 new workers, full Ralph orchestrator.

### Added

- **Hook Profiles** — Runtime-configurable hook system via `HQ_HOOK_PROFILE` env var (minimal/standard/strict). All hooks route through `hook-gate.sh`. Disable individual hooks via `HQ_DISABLED_HOOKS`.
- **Token Optimization** (CLAUDE.md) — `MAX_THINKING_TOKENS`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, `CLAUDE_CODE_SUBAGENT_MODEL` env var documentation.
- **`hook-gate.sh`** — Profile routing hub for all hooks. Reads `HQ_HOOK_PROFILE` and `HQ_DISABLED_HOOKS` before delegating.
- **`detect-secrets.sh`** — PreToolUse hook blocks API keys, tokens, and credentials in bash commands.
- **`observe-patterns.sh`** — Stop hook captures session pattern analysis on conversation end.
- **`scripts/audit-log.sh`** — Audit log engine: append, query, summary. JSONL storage at `workspace/metrics/audit-log.jsonl`.
- **9 new commands** — `/audit`, `/brainstorm`, `/dashboard`, `/goals`, `/harness-audit`, `/idea`, `/model-route`, `/quality-gate`, `/tdd`.
- **4 new workers** — `accessibility-auditor` (WCAG 2.2 AA), `exec-summary` (McKinsey SCQA), `performance-benchmarker` (Core Web Vitals + k6), `reality-checker` (final quality gate).

### Changed

- **`settings.json`** — All hooks rewired through `hook-gate.sh`. Added PreToolUse Bash → `detect-secrets`, Stop → `observe-patterns`.
- **`run-project.sh`** — Full Ralph orchestrator (1390 lines). Audit log integration, `--tmux` mode, session ID tracking.
- **`/execute-task`** — Checkout guard prevents concurrent story execution.
- **`/prd`** — Brainstorm detection (steps 3.5 + 5.5) redirects to `/brainstorm` when appropriate.
- **`/run-project`** — Worked example, `--tmux` flag documentation.
- **CLAUDE.md** — Added Token Optimization + Hook Profiles sections. Updated workers section (+4 workers). Updated command count to 35+.
- **`workers/registry.yaml`** — Version 8.0 → 9.0. Added 4 new workers. Updated counts: Standalone 6→9, Dev Team 16→17.
- **README.md** — Updated What's New to v7.0.0, command count 18→35+, new directory structure with hooks/.

### Removed

- **PR team workers (6)** — `pr-shared`, `pr-strategist`, `pr-writer`, `pr-outreach`, `pr-monitor`, `pr-coordinator` removed (private/company-specific).
- **`knowledge/hq/`** — Duplicate of `knowledge/hq-core/`, deleted.

---

## v6.5.1 (2026-03-07)

LSP support, hook improvements, and command cleanup.

### Added
- **LSP section** (CLAUDE.md) — Guidance for using LSP tools (go-to-definition, find-references, type info) over grep when `ENABLE_LSP_TOOL=1` is set
- **LSP setup** (README) — Prerequisites section with setup instructions for enabling LSP
- **Grep safety hook** — PreToolUse hook (`block-hq-grep.sh`) for HQ root grep protection
- **Cross-company settings hook** — PreToolUse hook (`warn-cross-company-settings.sh`) warns when reading settings from wrong company context
- **context-manager worker** — Discover, maintain, and audit project context (4 skills: audit, discover, learn, update)

### Removed
- `/checkemail` — Moved to private (requires personal Gmail config)
- `/email` — Moved to private (requires personal Gmail config)

---

## v6.5.0 (2026-03-06)

Enhanced company isolation, new worker teams, expanded knowledge, and command updates.

### Added

- **Skills section** (CLAUDE.md) — `.claude/skills/` tree with Codex symlink bridge for cross-tool skill sharing.
- **Policies (Learned Rules) section** (CLAUDE.md) — Standalone section documenting policy file directories and precedence for programmatic rule storage.
- **Gemini workers** (3) — `gemini-coder`, `gemini-reviewer`, `gemini-frontend` for Gemini CLI-based code generation, review, and frontend work.
- **knowledge-tagger worker** — Auto-classify and tag knowledge documents.
- **site-builder worker** — Local business website builder.
- **gemini-cli knowledge base** — Gemini CLI integration docs.
- **New knowledge bases indexed** — agent-browser, curious-minds, pr, context-needs, project-context added to CLAUDE.md knowledge list.

### Changed

- **Company Isolation** (CLAUDE.md) — Expanded with manifest infrastructure routing fields (`services`, `vercel_team`, `aws_profile`, `dns_zones`), 3-step operation protocol, credential access policy reference, and stricter hard rules.
- **Workers** (CLAUDE.md) — Updated counts to include social-team (5), pr-team (6), gardener-team (3), gemini-team (3), knowledge-tagger, site-builder.
- **Knowledge Repos** (CLAUDE.md) — Clarified embedded git repo pattern for company knowledge. Added `Reading/searching` note.
- **Search rules** (CLAUDE.md) — Added rows for PRD discovery, worker yaml lookup, and company manifest lookup. Added Glob blocking rule for `prd.json`/`worker.yaml` patterns.
- **Infrastructure-First** (CLAUDE.md) — Updated `/prd` to reference company-scoped project paths.
- **Commands count** (CLAUDE.md) — Updated from 24 to 35+.
- **/execute-task** — Refined codex-reviewer inline pattern, improved back-pressure error handling.
- **/prd** — Company Anchor (Step 0) for automatic company scoping from arguments. Beads sync (Step 7).
- **/run-project** — Externalized to `scripts/run-project.sh` bash orchestrator with CLI flags (--max-budget, --model, --timeout, --retry-failed, --verbose). Process-level isolation via `claude -p`.
- **/handoff** — Added knowledge update step (0b) for documenting domain knowledge in company knowledge bases.
- **/learn** — Updated to inject rules into target files (worker.yaml, command .md, knowledge files, CLAUDE.md) with cap enforcement and global promotion.
- **/startwork** — Enhanced with company knowledge loading and Vercel project context.
- **/checkemail** — Email-triage app integration with queue/response JSON schema and Tauri desktop UI.
- **/email** — Expanded cleanup workflow with 4-phase triage, Linear ticket creation, and PRD creation for deferred items.
---

## v6.4.0 (2026-02-23)

Company-scoped projects, file lock acquisition, policy loading, and new commands.

### Added

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
- **`/{custom-command}`** — Onboard new students with full pipeline (DB, PRD, deck).

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
