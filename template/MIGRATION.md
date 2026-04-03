# Migration Guide

Instructions for updating existing HQ installations to new versions.

---

## Migrating to v10.3.0 (from v10.2.0)

Minor release. No breaking changes.

### New Skill

Copy the `land` skill directory:

```bash
cp -r template/.claude/skills/land/ your-hq/.claude/skills/land/
```

### New Policies

Copy these 12 policies from `template/.claude/policies/`:

```bash
for p in hq-alert-baseline-calibration hq-announce-before-irreversible hq-confirm-creative-direction hq-fix-root-cause-not-symptoms hq-never-swallow-errors hq-no-production-testing hq-post-parallel-build-verify hq-pr-single-concern prd-files-match-acs-for-swarm run-project-name-matches-dir run-project-sigkill-retry scrub-hook-no-denylist-in-template; do
  cp "template/.claude/policies/${p}.md" "your-hq/.claude/policies/${p}.md"
done
```

### Updated Commands

Review and merge changes to:
- `.claude/commands/run-project.md` (new `--inline` execution mode)
- `.claude/commands/update-hq.md` (rewritten for indigoai-us/hq)
- `.claude/commands/hq-growth-dashboard.md` (updated repo references)

### Breaking Changes
- (none this release)

---

## Migrating to v10.2.0 (from v10.1.0)

Minor release. No breaking changes.

### New: Codex App Skill Discovery

All 30 HQ skills now include `agents/openai.yaml` for Codex UI rendering. To add them:

```bash
# Copy agents/openai.yaml into each skill dir
for d in starter-kit/.claude/skills/*/agents/; do
  skill=$(basename "$(dirname "$d")")
  mkdir -p "your-hq/.claude/skills/${skill}/agents"
  cp "${d}openai.yaml" "your-hq/.claude/skills/${skill}/agents/openai.yaml"
done
```

Or regenerate from your own SKILL.md files:

```bash
cp starter-kit/scripts/generate-openai-yaml.sh your-hq/scripts/
bash your-hq/scripts/generate-openai-yaml.sh
```

### Updated: Codex Skill Bridge

Copy the updated bridge script:

```bash
cp starter-kit/scripts/codex-skill-bridge.sh your-hq/scripts/codex-skill-bridge.sh
chmod +x your-hq/scripts/codex-skill-bridge.sh
bash your-hq/scripts/codex-skill-bridge.sh install
```

This adds the `.agents/skills/` discovery paths that Codex now prefers over `.codex/skills/`.

### Updated Files

Run `/update-hq` or manually merge changes to:
- Multiple commands, policies, hooks, and knowledge bases
- `CLAUDE.md`, `USER-GUIDE.md`

---

## Migrating to v10.1.0 (from v10.0.0)

Minor release. No breaking changes.

### New: Getting Started Education Kit

Copy the new knowledge directory to your HQ:

```bash
cp -R starter-kit/knowledge/public/getting-started/ your-hq/knowledge/public/getting-started/
```

This adds 3 onboarding guides (quick-start-guide, cheatsheet, learning-path) that `/setup` now references.

### Updated: `/setup` Command

Copy the updated setup command:

```bash
cp starter-kit/.claude/commands/setup.md your-hq/.claude/commands/setup.md
```

The setup flow now includes a welcome phase, educational bridges, and auto-opens the quick-start-guide after completion.

### New Policies

Copy these 4 new policies:

```bash
for p in bun-overrides chunked-reads clipboard-file-protocol deconflict-postbridge-schedule; do
  cp "starter-kit/.claude/policies/${p}.md" "your-hq/.claude/policies/${p}.md"
done
```

### Updated Files

Run `/update-hq` or manually merge changes to:
- Multiple commands, policies, workers, and knowledge bases
- `CLAUDE.md`, `USER-GUIDE.md`, `modules.yaml`

---

## Migrating to v10.0.0 (from v9.0.0)

Minor release. No breaking changes.

### New: Obsidian Vault
Copy `.obsidian/` to your HQ root. Open in Obsidian — works out of the box. See `knowledge/public/hq-core/obsidian-setup.md` for details.

Add to your `.gitignore`:
```
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/
.obsidian/themes/
.obsidian/community-plugins.json
```

### New Command
- `/hq-growth-dashboard` — copy `.claude/commands/hq-growth-dashboard.md`

### New Hook
- `protect-core.sh` — copy `.claude/hooks/protect-core.sh`, `chmod +x`

### Updated Files
Run `/update-hq` or manually merge changes to:
- 16 commands, 4 skills, 30+ policies, 4 hooks, 5 workers
- `CLAUDE.md`, `USER-GUIDE.md`, `modules.yaml`

### Removed
- Delete `.claude/policies/qa-screenshot-isolation.md` (replaced by `image-context-isolation.md`)

---

## Migrating to v9.0.0 (from v8.x)

This is a major release. Three new directories are introduced.

### New: Skills (`.claude/skills/`)

Copy the entire `.claude/skills/` directory from the starter-kit. This adds 30 design, code quality, and workflow skills that power commands like `/polish`, `/investigate`, `/audit`, etc.

```bash
cp -R starter-kit/.claude/skills/ your-hq/.claude/skills/
```

### New: Policies (`.claude/policies/`)

Copy the entire `.claude/policies/` directory. These are 89 structured workflow rules covering git safety, Vercel gotchas, Supabase patterns, orchestrator guardrails, and more.

```bash
cp -R starter-kit/.claude/policies/ your-hq/.claude/policies/
```

### New: Infrastructure Files

Copy these files to your HQ root:

| File | Purpose |
|------|---------|
| `.ignore` | Ripgrep config — blocks `repos/`, `node_modules/` from Grep |
| `settings/orchestrator.yaml` | Swarm/file-locking config for `/run-project` |
| `USER-GUIDE.md` | Command reference + worker guide |
| `modules/modules.yaml` | Knowledge module registry |
| `scripts/codex-skill-bridge.sh` | Codex ↔ Claude skill bridge |
| `scripts/audit-log.sh` | Structured audit log utility |
| `scripts/resize-screenshot.sh` | Screenshot resize (used by hook) |

### Updated Files

Review and merge changes to all existing commands, workers, and knowledge. The easiest approach:

```bash
# From your HQ root, with starter-kit cloned alongside:
rsync -avL --ignore-existing starter-kit/.claude/commands/ .claude/commands/
rsync -avL --ignore-existing starter-kit/workers/public/ workers/public/
rsync -avL --ignore-existing starter-kit/knowledge/ knowledge/public/
```

### Breaking Changes
- None — all additions are backward-compatible

---

## Migrating to v8.2.0 (from v8.1.x)

### New Commands
Copy these files from starter-kit to your HQ:
- `.claude/commands/document-release.md`
- `.claude/commands/investigate.md`
- `.claude/commands/retro.md`

### New Hook
Copy to your HQ:
- `.claude/hooks/block-inline-story-impl.sh` — run `chmod +x` after copying

### Updated Commands
Review and merge changes to these 19 commands:
- `audit.md`, `brainstorm.md`, `cleanup.md`, `execute-task.md`, `garden.md`
- `harness-audit.md`, `model-route.md`, `prd.md`, `reanchor.md`, `recover-session.md`
- `remember.md`, `review-plan.md`, `run-project.md`, `run.md`, `search-reindex.md`
- `search.md`, `startwork.md`, `update-hq.md`, `review.md`, `understand-project.md`

### Updated Hooks
Replace these hooks (run `chmod +x` after copying):
- `.claude/hooks/auto-checkpoint-trigger.sh`
- `.claude/hooks/hook-gate.sh`
- `.claude/hooks/observe-patterns.sh`

### Updated Scripts
Replace:
- `.claude/scripts/run-project.sh` — adds story test runner + codex model hints

### New Workers
Copy these directories to `workers/`:
- `workers/impeccable-designer/`
- `workers/paper-designer/`

Update `workers/registry.yaml` — version bumped to v10.0 with 45 public workers.

### New Knowledge
Copy these to `knowledge/`:
- `knowledge/impeccable/` (new knowledge base)
- `knowledge/design-styles/formulas/` (new subtree)
- `knowledge/agent-browser/tauri-testing.md`
- `knowledge/hq/handoff-templates.md`
- `knowledge/hq/knowledge-taxonomy.md`

### Removed
- Delete `.claude/commands/imessage.md` if present (personal command, removed from starter-kit)

### PII Scrub
This release scrubbed all company-specific references. If you forked from an earlier version, review your files for any {PRODUCT}/{Product}/{company} references and replace with generic placeholders.

### Breaking Changes
- None

---

## Migrating to v8.1.1 (from v8.1.0)

### New directories (create manually)
Existing installs need to create these directories:
```bash
mkdir -p repos/public repos/private
mkdir -p companies/_template/policies
mkdir -p settings data modules scripts
mkdir -p workspace/learnings workspace/reports
```

### New files
Copy from starter-kit to your HQ:
- `companies/_template/policies/example-policy.md`
- `companies/manifest.yaml` (if you don't already have one)
- `.ignore` (ripgrep ignore — prevents Grep from scanning repos/)
- `.claude/commands/review.md`
- `.claude/commands/review-plan.md`
- `.claude/skills/review/` (entire directory)
- `.claude/skills/review-plan/` (entire directory)

### Updated hooks
Replace these files:
- `.claude/hooks/auto-checkpoint-trigger.sh`

### No breaking changes

---

## Migrating to v8.1.0 (from v8.0.x)

### Updated run-project.sh (full replace)
Major upgrade: 3-layer passes detection, swarm retry tracking, per-story branch isolation, project reanchor, codex autofix, macOS timeout fallback.
```bash
cp starter-kit/.claude/scripts/run-project.sh .claude/scripts/run-project.sh
# or if you keep it at scripts/run-project.sh:
cp starter-kit/.claude/scripts/run-project.sh scripts/run-project.sh
chmod +x .claude/scripts/run-project.sh  # or scripts/run-project.sh
```

### Updated Commands (15 files)
```bash
for f in run-project prd audit cleanup garden model-route reanchor recover-session remember run search search-reindex startwork update-hq; do
  cp starter-kit/.claude/commands/$f.md .claude/commands/
done
```

### Updated CLAUDE.md
Three changes to merge:
1. **Token table** — `MAX_THINKING_TOKENS` → `31999`, new `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` row
2. **Linear rules 11 & 12** — Default assignee by team + no-orphan-issues
```bash
diff .claude/CLAUDE.md starter-kit/.claude/CLAUDE.md
```

### `/prd` — Behavioral Change
`/prd` now uses a 7-batch question flow (was 4-batch). The interview is more thorough with separate batches for Users/Current State, Data/Architecture, Integrations, and Quality/Shipping. No schema changes — existing prd.json files are fully compatible.

### Migration Steps
1. Replace `run-project.sh` and `chmod +x`
2. Copy 15 updated commands
3. Merge 3 CLAUDE.md changes (token table, Linear rules)
4. Run `/search-reindex`

### Breaking Changes
- (none)

---

## Migrating to v8.0.0 (from v7.0.0)

### Updated Commands (9 files)
These commands now include policy loading. Copy from starter-kit to your HQ:
```bash
for f in audit handoff harness-audit learn model-route prd run-project run startwork; do
  cp starter-kit/.claude/commands/$f.md .claude/commands/
done
```

### New Command (1 file)
```bash
cp starter-kit/.claude/commands/strategize.md .claude/commands/
```

### Updated CLAUDE.md
The Policies section now includes a **Standard Policy Loading Protocol**. Review and merge:
```bash
diff .claude/CLAUDE.md starter-kit/.claude/CLAUDE.md
```
Key addition: 5-step protocol for commands to load company → repo → global policies, plus list of implementing commands.

### Updated run-project.sh
Major upgrade: swarm mode (parallel story execution), worktree isolation, signal trapping, headless doc sweep, budget caps removed. Copy:
```bash
cp starter-kit/.claude/scripts/run-project.sh .claude/scripts/run-project.sh
# or if you keep it at scripts/run-project.sh:
cp starter-kit/.claude/scripts/run-project.sh scripts/run-project.sh
chmod +x scripts/run-project.sh
```

### Updated execute-task.md
Self-owned lock skip for swarm mode + single-writer pattern (orchestrator writes `passes`). Already included in the 9-file copy above.

### New: orchestrator.yaml
Swarm configuration. Copy to your settings dir:
```bash
cp starter-kit/settings/orchestrator.yaml settings/orchestrator.yaml
```

### `/learn` — Breaking Behavioral Change
`/learn` now creates **policy files** (structured markdown with YAML frontmatter) as its primary output instead of injecting rules into `worker.yaml` or `CLAUDE.md`. Existing learned rules in worker.yaml files still work but new learnings will be written as policy files in:
- `companies/{co}/policies/` (company scope)
- `repos/{repo}/.claude/policies/` (repo scope)
- `.claude/policies/` (global/command scope)

No action needed — old rules remain valid. New rules will be policy files.

---

## Migrating to v7.0.0 (from v6.5.1)

### New Hooks (3 files)
Copy to `.claude/hooks/` and make executable:
```bash
cp starter-kit/.claude/hooks/hook-gate.sh .claude/hooks/
cp starter-kit/.claude/hooks/detect-secrets.sh .claude/hooks/
cp starter-kit/.claude/hooks/observe-patterns.sh .claude/hooks/
chmod +x .claude/hooks/hook-gate.sh .claude/hooks/detect-secrets.sh .claude/hooks/observe-patterns.sh
```

### Settings.json — Hook Rewiring (BREAKING)
Your `.claude/settings.json` hooks are rewired through `hook-gate.sh`. This is a **breaking change** if you have custom hooks.

**Before (v6.5.1):**
```json
{ "matcher": "Glob", "hooks": [{ "type": "command", "command": ".claude/hooks/block-hq-glob.sh" }] }
```

**After (v7.0.0):**
```json
{ "matcher": "Glob", "hooks": [{ "type": "command", "command": ".claude/hooks/hook-gate.sh block-hq-glob .claude/hooks/block-hq-glob.sh" }] }
```

Copy the full `settings.json` from starter-kit, or manually rewire each hook through `hook-gate.sh`. Two new hooks added:
- PreToolUse Bash → `hook-gate.sh detect-secrets .claude/hooks/detect-secrets.sh`
- Stop → `hook-gate.sh observe-patterns .claude/hooks/observe-patterns.sh`

### New Script
```bash
mkdir -p scripts/
cp starter-kit/scripts/audit-log.sh scripts/
chmod +x scripts/audit-log.sh
```

### Updated Script
Replace `.claude/scripts/run-project.sh` with the full v7.0.0 version (1390 lines). Includes audit log integration and `--tmux` mode.

### New Commands (9 files)
Copy to `.claude/commands/`:
- `audit.md`, `brainstorm.md`, `dashboard.md`, `goals.md`, `harness-audit.md`, `idea.md`, `model-route.md`, `quality-gate.md`, `tdd.md`

### Updated Commands (3 files)
Review and merge:
- `execute-task.md` — Checkout guard (section 2.6) prevents concurrent story execution
- `prd.md` — Brainstorm detection (steps 3.5 + 5.5)
- `run-project.md` — Worked example, `--tmux` flag

### New Workers (4 dirs)
Copy to `workers/`:
- `accessibility-auditor/` — WCAG 2.2 AA auditing
- `exec-summary/` — McKinsey SCQA executive summaries
- `performance-benchmarker/` — Core Web Vitals + k6 load testing
- `dev-team/reality-checker/` — Final quality gate

### Registry Update
Replace `workers/registry.yaml`. Version 8.0 → 9.0. If you have custom workers, merge them into the `# Add your workers below` section.

### Removed Workers
Delete these directories if present (were private/company-specific, leaked in v6.0.0):
- `workers/pr-shared/`, `pr-strategist/`, `pr-writer/`, `pr-outreach/`, `pr-monitor/`, `pr-coordinator/`

### Knowledge Cleanup
- Delete `knowledge/hq/` if present (duplicate of `knowledge/hq-core/`)
- Copy `knowledge/hq-core/handoff-templates.md` from starter-kit

### CLAUDE.md Updates

**New sections to add:**
1. **Token Optimization** (after Context Diet) — Env var cost controls
2. **Hook Profiles** (after Token Optimization) — Runtime hook configuration

**Sections to update:**
- **Workers** — Add accessibility-auditor, exec-summary, performance-benchmarker, reality-checker. Remove pr-team. Dev Team 16→17
- **Commands count** — Update to 35+

### Migration Steps
1. Copy 3 new hooks and `chmod +x`
2. Update `settings.json` (hook-gate rewiring)
3. Copy `scripts/audit-log.sh` and `chmod +x`
4. Replace `.claude/scripts/run-project.sh`
5. Copy 9 new commands
6. Merge 3 updated commands
7. Copy 4 new worker directories
8. Delete 6 PR team worker directories
9. Update `workers/registry.yaml` (merge custom workers)
10. Delete `knowledge/hq/` duplicate
11. Merge CLAUDE.md sections (Token Optimization, Hook Profiles)
12. Run `/search-reindex`

### Breaking Changes
- `settings.json` hooks now route through `hook-gate.sh` — direct hook commands no longer work without the gate
- PR team workers removed — if you use them, keep your local copies
- `knowledge/hq/` deleted — use `knowledge/hq-core/` instead

---

## Migrating to v6.5.1 (from v6.5.0)

### New Files
- `.claude/hooks/block-hq-grep.sh` — Grep safety hook
- `.claude/hooks/warn-cross-company-settings.sh` — Cross-company settings warning
- `workers/dev-team/context-manager/` — Context management worker (4 skills)

### Updated Files
- `.claude/CLAUDE.md` — New LSP section
- `.claude/settings.json` — Added Grep and Read PreToolUse hooks
- `README.md` — LSP setup in prerequisites

### CLAUDE.md Updates

**New section to add (after Search):**
- **LSP** — When `ENABLE_LSP_TOOL=1` is set, prefer LSP tools over Grep for code navigation

### Settings.json Updates
Add these to your `PreToolUse` hooks array:
```json
{
  "matcher": "Grep",
  "hooks": [{ "type": "command", "command": ".claude/hooks/block-hq-grep.sh", "timeout": 5 }]
},
{
  "matcher": "Read",
  "hooks": [{ "type": "command", "command": ".claude/hooks/warn-cross-company-settings.sh", "timeout": 5 }]
}
```

### Removed Commands
- `/checkemail` — Moved to private (requires personal Gmail config)
- `/email` — Moved to private (requires personal Gmail config)

If you use these commands, keep your local copies. They are no longer part of the public starter kit.

### Breaking Changes
- (none)

---

## Migrating to v6.5.0 (from v6.4.0)

### New Workers
Copy these directories from starter-kit to your HQ `workers/public/`:
- `workers/gemini-coder/` — Gemini CLI code generation
- `workers/gemini-reviewer/` — Gemini CLI code review
- `workers/gemini-frontend/` — Gemini CLI frontend generation
- `workers/knowledge-tagger/` — Knowledge document classification
- `workers/site-builder/` — Local business website builder

Update `workers/registry.yaml` to include the new entries.

### New Knowledge Bases
Copy from starter-kit to your HQ `knowledge/public/`:
- `knowledge/gemini-cli/` — Gemini CLI integration docs

### Updated Commands
Review and merge changes to:
- `.claude/commands/execute-task.md` — Refined codex-reviewer, back-pressure handling
- `.claude/commands/prd.md` — Company Anchor (Step 0), Beads sync (Step 7)
- `.claude/commands/run-project.md` — Externalized to bash script, CLI flags
- `.claude/commands/handoff.md` — Knowledge update step (0b)
- `.claude/commands/learn.md` — Target-file injection, cap enforcement, global promotion
- `.claude/commands/startwork.md` — Company knowledge loading, Vercel context
- `.claude/commands/checkemail.md` — Email-triage app integration
- `.claude/commands/email.md` — 4-phase triage, Linear/PRD creation


### CLAUDE.md Updates

**New sections to add:**
1. **Skills** (after Company Isolation) — `.claude/skills/` tree with Codex bridge
2. **Policies (Learned Rules)** (before Core Principles) — Policy file directories and precedence

**Sections to update:**
- **Company Isolation** — Add manifest infrastructure routing fields, 3-step operation protocol, credential access reference
- **Workers** — Update counts for social-team (5), pr-team (6), gardener-team (3), gemini-team (3), knowledge-tagger, site-builder
- **Search rules** — Add PRD/worker/company discovery rows, Glob blocking rule
- **Knowledge Repos** — Add embedded git repo pattern, `Reading/searching` note
- **Knowledge Bases** — Add: agent-browser, curious-minds, gemini-cli, pr, context-needs, project-context
- **Infrastructure-First** — Update `/prd` path to company-scoped
- **Commands count** — Update to 35+

### Breaking Changes
- `/run-project` now delegates to `scripts/run-project.sh`. If you don't have this script, the command falls back to in-session execution.

---

## Migrating to v6.4.0 (from v6.3.0)

### New Commands
Copy these files from starter-kit to your HQ:
- `.claude/commands/imessage.md` — Send iMessage to contacts

### Updated Commands
Review and merge changes to:
- `.claude/commands/execute-task.md` — File lock acquisition (5.5), policy loading (5.6), dynamic lock expansion (6d.5), lock release on failure (8.0), iMessage notify (7c.5), Linear comments (7a.6), company-scoped project resolution
- `.claude/commands/prd.md` — Company-scoped projects (`companies/{co}/projects/`), `files` field in story schema, board sync (5.5), mandatory creation rule, STOP after creation
- `.claude/commands/run-project.md` — Company-scoped resolution, board sync (4.5), file lock conflict check (5a.1), Linear comments (5a.6), policy re-read in auto-reanchor
- `.claude/commands/newworker.md` — Company-scoped worker paths
- `.claude/commands/checkpoint.md` — Embedded repo support in knowledge state capture

### CLAUDE.md Updates

**Policies section** — Replace with three-directory structure:
```
Before executing tasks, load applicable policies from all three directories:
1. companies/{co}/policies/ — company-scoped rules
2. repos/{repo}/.claude/policies/ — repo-scoped rules
3. .claude/policies/ — cross-cutting + command-scoped rules
Precedence: company > repo > command > global
```

**Learning System section** — Update to reflect policy-file-based approach (learnings → policy files, not inline injection).

**Knowledge Repos section** — Distinguish embedded company repos from symlinked shared repos.

**Commands count** — Update "23 commands" → "24 commands".

### Breaking Changes
- `/prd` now creates projects at `companies/{co}/projects/{name}/` instead of `projects/{name}/`. Root `projects/` is fallback for personal/HQ-only projects.
- `/prd` now requires `/handoff` after creation — no implementation in same session.

---

## Migrating to v6.3.0 (from v6.2.0)

### New Files
- `.claude/hooks/block-hq-glob.sh` — Glob safety hook (blocks Glob from HQ root to prevent timeouts)
- `companies/_template/policies/example-policy.md` — Policy template for `/newcompany` scaffolding

### Updated Files
- `.claude/CLAUDE.md` — 2 new sections (Policies, File Locking) + expanded Company Isolation + 4 new learned rules
- `.claude/settings.json` — New PreToolUse hook for Glob safety
- `.claude/commands/update-hq.md` — settings.json merge logic (5b-SETTINGS), template directory handling

### New CLAUDE.md Sections
Add these sections to your `.claude/CLAUDE.md`:

1. **Policies** (after Company Isolation) — Company-scoped standing rules with hard/soft enforcement
2. **File Locking** (after Sub-Agent Rules) — Concurrent edit prevention for multi-agent projects

### New Company Isolation Rules
Add to your `## Company Isolation` section:
- `NEVER use Linear credentials from a different company's settings`
- `Before any Linear API call, validate: config.json workspace field matches expected company`

### New Learned Rules
Add to your `## Learned Rules` section:
- `pre-deploy domain check` — Always check live URL and domain ownership before deploying to custom domains
- `EAS build env vars` — EAS production builds don't inherit local .env; set EXPO_PUBLIC_* via CLI
- `Vercel env var trailing newlines` — Use printf not echo when piping to vercel env add
- `model routing` — Workers declare execution.model in worker.yaml; stories can override via model_hint

### Glob Safety Hook
1. Copy `.claude/hooks/block-hq-glob.sh` to your HQ
2. Make executable: `chmod +x .claude/hooks/block-hq-glob.sh`
3. Add to your `.claude/settings.json` under `hooks`:
   ```json
   "PreToolUse": [
     {
       "matcher": "Glob",
       "hooks": [
         {
           "type": "command",
           "command": ".claude/hooks/block-hq-glob.sh",
           "timeout": 5
         }
       ]
     }
   ]
   ```

### Migration Steps
1. Copy `.claude/hooks/block-hq-glob.sh` and make executable
2. Merge PreToolUse section into your `.claude/settings.json` (or let `/update-hq` handle it — v6.3.0 adds JSON-aware settings merge)
3. Merge 2 new CLAUDE.md sections: Policies, File Locking
4. Add 2 new Company Isolation rules
5. Add 4 new learned rules to your Learned Rules section
6. Copy `companies/_template/policies/example-policy.md` for policy scaffolding
7. Update `.claude/commands/update-hq.md` for safe settings.json migration in future upgrades
8. Run `/search-reindex`

### Breaking Changes
- (none)

---

## Migrating to v6.2.0 (from v6.1.0)

### Updated Files
Merge changes to:
- `.claude/CLAUDE.md` — 5 new behavioral sections + 6 new learned rules

### New CLAUDE.md Sections
Add these sections to your `.claude/CLAUDE.md`:

1. **Session Handoffs** (after Context Diet) — Handoff workflow rules
2. **Corrections & Accuracy** (after Session Handoffs) — User correction handling
3. **Sub-Agent Rules** (after Workers) — Multi-agent commit coordination
4. **Git Workflow Rules** (before Project Repos - Commit Rules) — Git hygiene
5. **Vercel Deployments** (after Project Repos - Commit Rules) — Deploy safety

### New Learned Rules
Add to your `## Learned Rules` section:
- `vercel custom domain deploy safety` — Never deploy to production custom domains without confirmation
- `Task() sub-agents lack MCP` — Sub-agents can't use MCP tools, use CLI instead
- `Shopify 2026 auth` — Ephemeral tokens via client_credentials grant
- `vercel preview SSO` — `--public` doesn't bypass SSO; use local testing
- `Vercel domain team move` — API for moving domains between Vercel teams
- `Vercel framework detection` — `framework: null` causes 404s on all routes

### Migration Steps
1. Merge 5 new sections from starter-kit `.claude/CLAUDE.md` into yours
2. Add 6 new learned rules to your `## Learned Rules` section
3. Update `<!-- Max -->` comment to 25
4. Run `/search-reindex`

### Breaking Changes
- (none)

---

## Migrating to v6.1.0 (from v6.0.0)

### Prerequisites
- Codex CLI installed: `npm install -g @openai/codex` (or `brew install codex`)
- Codex authenticated: `codex login`
- If Codex CLI is not available, the pipeline degrades gracefully (warns and skips Codex phases)

### Updated Commands
Replace in `.claude/commands/`:
- `execute-task.md` — New inline Codex review step + pre-flight check

### Updated Workers
Replace these directories in `workers/dev-team/`:
- `codex-reviewer/` — Skills rewritten from MCP to CLI
- `codex-coder/` — Skills rewritten from MCP to CLI
- `codex-debugger/` — Skills rewritten from MCP to CLI
- `codex-engine/package.json` — Updated description only

### Breaking Changes
- **MCP server no longer used by pipeline** — If you had custom integrations calling the codex-engine MCP server from within worker phases, those will need to switch to `codex review` / `codex exec` CLI calls. The MCP server still works for standalone use via `/run`.

---

## Migrating to v6.0.0 (from v5.5.x)

### New Commands
Copy to `.claude/commands/`:
- `garden.md` — Multi-worker HQ content audit & cleanup
- `startwork.md` — Lightweight session entry
- `newcompany.md` — Scaffold new company infrastructure
- `{custom-command}.md` — Student onboarding pipeline

### Updated Commands
Review and merge changes to all existing commands — 22 commands were refreshed. Key ones:
- `execute-task.md` — Worker pipeline updates
- `run-project.md` — Orchestration improvements
- `cleanup.md` — New audit checks
- `prd.md` — Enhanced discovery flow

### New Worker Teams
Copy these directories to `workers/`:
- `workers/dev-team/` — Full 16-worker development team (architect, backend-dev, frontend-dev, database-dev, QA, etc.)
- `workers/content-brand/`, `content-sales/`, `content-product/`, `content-legal/`, `content-shared/` — Content pipeline
- `workers/social-shared/`, `social-strategist/`, `social-reviewer/`, `social-publisher/`, `social-verifier/` — Social pipeline
- `workers/pr-shared/`, `pr-strategist/`, `pr-writer/`, `pr-outreach/`, `pr-monitor/`, `pr-coordinator/` — PR pipeline
- `workers/gardener-team/` — Content audit team (garden-scout, garden-auditor, garden-curator)
- `workers/frontend-designer/`, `qa-tester/`, `security-scanner/`, `pretty-mermaid/` — Standalone workers

### Registry Update
Replace `workers/registry.yaml` with the new v7.0 version. If you have custom workers, merge them into the `# Add your workers below` section at the bottom.

### Knowledge Updates
Copy updated knowledge directories:
- `knowledge/agent-browser/` (new)
- `knowledge/pr/` (new)
- `knowledge/curious-minds/` (new)
- All existing knowledge dirs refreshed

### CLAUDE.md Update
Review and merge `.claude/CLAUDE.md` — significant additions including gardener team, learned rules system, company isolation rules.

### Breaking Changes
- Registry version 6.0 → 7.0. Worker paths restructured. Custom workers need manual merge.
- Dev team workers re-included (were removed in v5.0.0). If you built custom equivalents, check for conflicts.

---

## Migrating to v5.5.1 (from v5.5.0)

### Updated Commands
Review and merge changes to:
- `.claude/commands/setup.md` — repos directory now created as first step in Phase 2
- `.claude/commands/update-hq.md` — repos validation added to pre-flight checks

### New Directories
If missing, create:
```bash
mkdir -p repos/public repos/private
```
These are required for all code, knowledge, and project repos.

### Breaking Changes
- (none)

---

## Migrating to v5.5.0 (from v5.4.0)

### New Command
Copy to `.claude/commands/`:
- `recover-session.md` — Recover dead sessions that hit context limits

### Renamed Command
- `.claude/commands/migrate.md` → `.claude/commands/update-hq.md` — Same functionality, friendlier name

### Updated Files
- `.claude/CLAUDE.md` — Merge the new "Communication" commands section, add `/recover-session` to Session Management, replace `/migrate` with `/update-hq` in System table

### Migration Steps
1. Copy `.claude/commands/recover-session.md`
2. Rename `.claude/commands/migrate.md` to `.claude/commands/update-hq.md` (or copy fresh from starter-kit)
3. Update your `.claude/CLAUDE.md` command count and tables
4. Run `/search-reindex`

### Breaking Changes
- `/migrate` renamed to `/update-hq` — if you have scripts or docs referencing `/migrate`, update them

---

## Migrating to v5.4.0 (from v5.3.0)

### New Commands
Copy these files from starter-kit to your HQ:
- `.claude/commands/checkemail.md` — Inbox cleanup with auto-archive + triage
- `.claude/commands/decide.md` — Batch decision UI for human-in-the-loop workflows
- `.claude/commands/email.md` — Multi-account Gmail management

### Updated Commands
Review and merge changes to these 12 commands:
- `.claude/commands/run-project.md` — **Important:** Anti-plan directive added to sub-agent prompt
- `.claude/commands/execute-task.md` — **Important:** Anti-plan rule added to Rules section
- `.claude/commands/checkpoint.md`, `cleanup.md`, `handoff.md`, `metrics.md`, `newworker.md`, `reanchor.md`, `remember.md`, `run.md`, `search.md`, `search-reindex.md`

### New Knowledge
Copy the new knowledge files:
- `knowledge/hq-core/quick-reference.md`
- `knowledge/hq-core/starter-kit-compatibility-contract.md`
- `knowledge/hq-core/desktop-claude-code-integration.md`
- `knowledge/hq-core/desktop-company-isolation.md`
- `knowledge/hq-core/hq-structure-detection.md`
- `knowledge/hq-core/hq-desktop/` (entire directory — 12 spec files for HQ Desktop)

### Updated Knowledge
Review and merge:
- `knowledge/hq-core/index-md-spec.md`
- `knowledge/hq-core/thread-schema.md`
- `knowledge/workers/skill-schema.md`
- `knowledge/workers/state-machine.md`
- `knowledge/workers/README.md`
- `knowledge/projects/README.md`

### Updated Workers
- `workers/dev-team/codex-coder/worker.yaml`
- `workers/dev-team/codex-debugger/worker.yaml` + `skills/debug-issue.md`
- `workers/dev-team/codex-reviewer/worker.yaml` + `skills/apply-best-practices.md` + `skills/improve-code.md`

### Breaking Changes
- (none this release)

---

## Migrating to v5.2.0 (from v5.1.0)

### What Changed
`/setup` now checks for GitHub CLI and Vercel CLI, and scaffolds knowledge as symlinked git repos instead of plain directories. README expanded with prerequisites and knowledge repo guide.

### Updated Files
Copy from starter kit:
- `.claude/commands/setup.md` — Rewritten with CLI checks (gh, vercel) and knowledge repo scaffolding
- `.claude/CLAUDE.md` — Knowledge Repos section expanded with step-by-step commands
- `README.md` — Prerequisites table, Knowledge Repos section, updated directory tree

### For Existing HQ Users
If your knowledge is already in plain directories (not symlinked repos), no action needed — everything still works. To adopt the repo pattern for an existing knowledge base:

1. Move: `mv knowledge/{name} repos/public/knowledge-{name}`
2. Init: `cd repos/public/knowledge-{name} && git init && git add . && git commit -m "init" && cd -`
3. Symlink: `ln -s ../../repos/public/knowledge-{name} knowledge/{name}`

### CLI Tools
If you don't have them yet:
- `brew install gh && gh auth login` (GitHub CLI — for PRs, repo management)
- `npm install -g vercel && vercel login` (Vercel — for deployments, optional)

### Migration Steps
1. Copy updated `setup.md`, `CLAUDE.md`, `README.md`
2. Optionally install `gh` and `vercel` CLIs
3. Optionally convert knowledge directories to symlinked repos (instructions above)
4. Run `/search-reindex`

### Breaking Changes
- (none — all changes are additive)

---

## Migrating to v5.1.0 (from v5.0.0)

### What Changed
Context Diet: lazy-loading rules reduce context burn at session start. Commands updated to write recent threads to a dedicated file instead of bloating INDEX.md.

### Updated Files
Copy from starter kit:
- `.claude/CLAUDE.md` — Merge the new "Context Diet" section (after Key Files) into yours
- `.claude/commands/checkpoint.md` — Step 7 now writes to `workspace/threads/recent.md`
- `.claude/commands/handoff.md` — Step 4 now writes to `workspace/threads/recent.md`
- `.claude/commands/reanchor.md` — New "When to Use" section

Updated knowledge:
- `knowledge/Ralph/11-team-training-guide.md`
- `knowledge/hq-core/index-md-spec.md`
- `knowledge/hq-core/thread-schema.md`
- `knowledge/workers/README.md`, `skill-schema.md`, `state-machine.md`, `templates/base-worker.yaml`
- `knowledge/projects/README.md`

### New File
Create `workspace/threads/recent.md` — this is where `/checkpoint` and `/handoff` now write the recent threads table.

### Optional: Slim INDEX.md
If your INDEX.md is large (200+ lines), consider trimming it to just the directory map and navigation table. Move workers, commands, companies tables out (they're already in CLAUDE.md). Move recent threads list to `workspace/threads/recent.md`.

### Migration Steps
1. Merge Context Diet section from starter kit's `.claude/CLAUDE.md` into yours
2. Copy updated `checkpoint.md`, `handoff.md`, `reanchor.md`
3. Create `workspace/threads/recent.md` (can be empty — next checkpoint/handoff populates it)
4. Copy updated knowledge files
5. Run `/search-reindex`

### Breaking Changes
- (none — all changes are additive)

---

## Migrating to v5.0.0 (from v4.0.0)

### What Changed
Major restructure: bundled workers removed (build your own), simplified setup, new `/personal-interview` command. Commands updated with Linear integration, enhanced search, and codebase exploration.

### New Command
Copy to `.claude/commands/`:
- `personal-interview.md` — Deep interview to populate profile + voice style

### New Worker Structure
- `workers/sample-worker/` — Example worker to copy and customize
- `workers/registry.yaml` — Now contains only the sample worker + commented template

### Removed (from starter kit)
These directories are deleted in v5.0.0. **If you use them, keep your existing copies**:
- `workers/dev-team/` (12 workers)
- `workers/content-brand/`, `content-sales/`, `content-product/`, `content-legal/`, `content-shared/`
- `workers/security-scanner/`
- `starter-projects/` (personal-assistant, social-media, code-worker)

### Updated Files
Copy from starter kit:
- `.claude/commands/setup.md` — Rewritten (simplified to 3 phases)
- `.claude/commands/execute-task.md` — Linear sync, qmd codebase exploration
- `.claude/commands/handoff.md` — Auto-commit HQ changes
- `.claude/commands/prd.md` — Target repo scanning
- `.claude/commands/run-project.md` — Linear sync
- `.claude/commands/search.md` — Company auto-detection
- `.claude/commands/search-reindex.md` — Multi-collection docs
- `.claude/commands/cleanup.md` — Genericized INDEX paths
- `.claude/commands/reanchor.md` — Genericized company paths
- `.claude/CLAUDE.md` — Merge carefully: new structure, 18 commands, sample-worker
- `workers/registry.yaml` — v5.0

Updated knowledge:
- `knowledge/Ralph/11-team-training-guide.md`
- `knowledge/hq-core/index-md-spec.md`
- `knowledge/projects/README.md`
- `knowledge/workers/README.md`, `skill-schema.md`

### Migration Steps
1. Copy `.claude/commands/personal-interview.md` (new)
2. Copy updated commands (setup, execute-task, handoff, prd, run-project, search, search-reindex, cleanup, reanchor)
3. Copy `workers/sample-worker/` directory (new example worker)
4. Merge `.claude/CLAUDE.md` — update structure tree, commands table, workers section
5. **If using bundled workers**: keep your existing `workers/dev-team/`, `workers/content-*/` directories — they still work
6. **If NOT using bundled workers**: delete old worker directories, copy new `workers/registry.yaml`
7. Copy updated knowledge files
8. Delete `starter-projects/` if present
9. Run `/search-reindex`

### Breaking Changes
- All bundled workers removed from starter kit. Existing copies in your HQ still work.
- `/setup` no longer offers starter project selection. Use `/prd` + `/newworker`.
- `workers/registry.yaml` format unchanged but contents stripped to sample-worker only.

---

## Migrating to v4.0.0 (from v3.3.0)

### What Changed
Major architecture upgrade: INDEX.md navigation system, knowledge repos (independent git repos), automated learning pipeline (`/learn`), and significant command updates.

### New Command
Copy to `.claude/commands/`:
- `learn.md` — Automated learning pipeline (captures learnings, injects rules into source files, deduplicates)

### New Knowledge Files
Copy to `knowledge/`:
- `Ralph/11-team-training-guide.md` — Team training guide
- `hq-core/checkpoint-schema.json` — Checkpoint data format
- `hq-core/index-md-spec.md` — INDEX.md specification

### Updated Files
All 13 existing public commands have been refreshed. Copy from starter kit:
- `.claude/commands/*.md` (all public commands)
- `.claude/CLAUDE.md` (major rewrite — merge carefully with your customizations)
- `workers/registry.yaml` (v4.0)

Updated workers:
- `workers/dev-team/code-reviewer/skills/review-pr.md`
- `workers/dev-team/frontend-dev/worker.yaml`
- `workers/dev-team/qa-tester/worker.yaml`
- `workers/dev-team/task-executor/skills/validate-completion.md`

Updated knowledge:
- `knowledge/hq-core/thread-schema.md`
- `knowledge/workers/README.md`
- `knowledge/workers/skill-schema.md`
- `knowledge/workers/state-machine.md`
- `knowledge/projects/README.md`

### Removed
- `knowledge/pure-ralph/` — Delete this directory. Pure Ralph patterns have been merged into the Ralph methodology core.

### New Features to Adopt

**INDEX.md System:** Create INDEX.md files at key directories. See `knowledge/hq-core/index-md-spec.md` for spec. Commands like `/checkpoint`, `/handoff`, `/prd` auto-update them.

**Knowledge Repos (Optional):** Knowledge folders can be independent git repos symlinked into HQ. See "Knowledge Repos" section in CLAUDE.md.

**Learning System:** `/learn` and `/remember` now inject rules directly into source files. Add a `## Learned Rules` section to your CLAUDE.md and `## Rules` sections to your commands.

### Migration Steps
1. Copy `.claude/commands/learn.md` (new command)
2. Copy all updated `.claude/commands/*.md`
3. Merge `.claude/CLAUDE.md` — add INDEX.md System, Knowledge Repos, Learning System, Auto-Learn, and Search rules sections
4. Copy `workers/registry.yaml`
5. Copy new knowledge files (`Ralph/11-team-training-guide.md`, `hq-core/checkpoint-schema.json`, `hq-core/index-md-spec.md`)
6. Copy updated knowledge and worker files
7. Delete `knowledge/pure-ralph/`
8. Run `/search-reindex`
9. Run `/cleanup --reindex` to generate INDEX.md files

### Breaking Changes
- `knowledge/pure-ralph/` removed — if you reference it, update to `knowledge/Ralph/`

---

## Migrating to v3.3.0 (from v3.2.0)

### What Changed
Commands split into public (16) and private (15). Only generic, reusable commands ship in the starter kit now. Content, design, and company-specific commands are private.

### New Feature: Auto-Handoff
Claude auto-runs `/handoff` at 70% context usage. This is in `.claude/CLAUDE.md` — copy the "Auto-Handoff (Context Limit)" section to yours.

### Removed Commands (now private)
If you use any of these, keep your existing copies — they just won't be in future starter kit releases:
- Content: `contentidea`, `suggestposts`, `scheduleposts`, `preview-post`, `post-now`, `humanize`
- Design: `generateimage`, `svg`, `style-american-industrial`, `design-iterate`
- System: `publish-kit`, `pure-ralph`, `hq-sync`

### Migration Steps
1. Copy `.claude/CLAUDE.md` from starter kit (or merge the Auto-Handoff section into yours)
2. Copy refreshed `.claude/commands/*.md` for the 16 public commands
3. Copy `workers/registry.yaml`
4. Run `/search-reindex`

### Breaking Changes
- (none — removed commands still work if you keep your local copies)

---

## Migrating to v3.2.0 (from v3.1.0)

### New Skills
Copy this file to `.claude/commands/`:
- `remember.md` — Capture learnings when things don't work right

### Updated Files
All 28 existing commands have been refreshed. Copy from starter kit to your HQ:
- `.claude/commands/*.md` (all public commands)
- `.claude/CLAUDE.md`
- `workers/registry.yaml`

### Breaking Changes
- (none)

### Migration Steps
1. Copy `.claude/commands/remember.md` to your HQ
2. Optionally update other commands by copying from starter kit
3. Run `/search-reindex` to include new command in search

---

## Migrating to v3.1.0 (from v3.0.0)

### Breaking Changes
- **`/newproject` removed** -- Merged into `/prd`. Delete `.claude/commands/newproject.md` from your HQ.
- **prd.json now required** -- `/run-project` and `/execute-task` require `projects/{name}/prd.json` with a `userStories` array. README.md is no longer accepted as a fallback.
- **`features` key deprecated** -- If your prd.json files use `"features"` instead of `"userStories"`, rename the key. Also rename `"acceptance_criteria"` to `"acceptanceCriteria"` (camelCase).

### Updated Skills
Replace these files in `.claude/commands/`:
- `prd.md` -- **Major rewrite.** Now outputs both `prd.json` (source of truth) and `README.md` (derived). Includes orchestrator registration, beads sync, and execution choice.
- `run-project.md` -- Strict prd.json validation on load. Hard stop if missing.
- `execute-task.md` -- Same strict validation.
- `newworker.md` -- `/newproject` references updated to `/prd`
- `nexttask.md` -- `/newproject` reference updated to `/prd`

### Migration Steps
1. Delete `.claude/commands/newproject.md`
2. Copy updated `prd.md`, `run-project.md`, `execute-task.md`, `newworker.md`, `nexttask.md`
3. If you have prd.json files using `"features"`, rename to `"userStories"` and `"acceptance_criteria"` to `"acceptanceCriteria"`
4. If you have projects with only README.md (no prd.json), run `/prd {project}` to generate the JSON

---

## Migrating to v3.0.0 (from v2.1.0)

### New Skills
Copy these files to your `.claude/commands/`:
- `humanize.md` - Remove AI writing patterns from drafts
- `pure-ralph.md` - External terminal orchestrator for autonomous PRD execution
- `svg.md` - Generate minimalist abstract white line SVG graphics
- `search-reindex.md` - Reindex and re-embed HQ for qmd search

### Updated Skills
The following skills have significant updates. Review and merge:
- `search.md` - **Breaking:** Complete rewrite to qmd-powered search (BM25, semantic, hybrid). Includes grep fallback if qmd is not installed.
- `handoff.md` - Added step 4: search index update (`qmd update && qmd embed`)
- `run-project.md` - Updated orchestration pattern with inline worker pipeline execution
- `execute-task.md` - Worker names aligned with dev-team IDs (`backend-dev`, `frontend-dev`, `dev-qa-tester`, etc.); added `content` task type

### New Knowledge
Copy these directories to your `knowledge/`:
- `pure-ralph/` - Branch workflow, learnings
- `hq/` - Checkpoint schema
- `projects/` - Project creation guidelines and templates
- `design-styles/ethereal-abstract.md` - Ethereal abstract style guide
- `design-styles/liminal-portal.md` - Liminal portal style guide

### Install qmd (Optional)
[qmd](https://github.com/tobi/qmd) powers the new `/search` command with semantic + full-text search.

```bash
# Install qmd (requires Go)
go install github.com/tobi/qmd@latest

# Index your HQ
cd ~/Documents/HQ
qmd update && qmd embed
```

If qmd is not installed, `/search` falls back to grep-based search.

### Breaking Changes
- `/search` syntax changed from grep-based to qmd queries. Install qmd or use the built-in fallback.

---

## Migrating to v2.1.0 (from v2.0.0)

### New Skills
Copy these files to your `.claude/commands/`:
- `generateimage.md` - Generate images via Gemini Nano Banana
- `post-now.md` - Post to X/LinkedIn immediately
- `preview-post.md` - Preview drafts, select images, approve posting
- `publish-kit.md` - Sync your HQ to hq-starter-kit

### Updated Skills
The following skills have significant updates. Review and merge:
- `contentidea.md` - Enhanced multi-platform workflow with:
  - Image generation per approved style (7 styles)
  - Visual prompt patterns organized by theme
  - Anti-AI slop rules (humanizer section)
  - Preview site sync workflow
- `scheduleposts.md` - Improved queue management
- `style-american-industrial.md` - Expanded monochrome variant with CSS variables
- `metrics.md`, `run.md`, `search.md`, `suggestposts.md` - Generalized examples

### New Directories (if using image generation)
```
workspace/social-drafts/images/   # Generated images for posts
repos/private/social-drafts/      # Preview site (optional)
```

### Breaking Changes
None in this release.

---

## Migrating to v2.0.0 (from v1.x)

### Major Changes
v2.0.0 is a significant upgrade with new project orchestration and 18 workers.

### New Directories
Create these if missing:
```
workspace/
  threads/          # Auto-saved sessions
  orchestrator/     # Project state
  learnings/        # Captured insights
  content-ideas/    # Idea inbox
social-content/
  drafts/
    x/              # X/Twitter drafts
    linkedin/       # LinkedIn drafts
```

### New Skills
Copy all files from `.claude/commands/`.

### New Workers
Copy `workers/dev-team/` and `workers/content-*/` directories.

### Knowledge Bases
Copy new knowledge directories:
- `knowledge/hq-core/`
- `knowledge/ai-security-framework/`
- `knowledge/design-styles/`
- `knowledge/dev-team/`

### Registry Update
Replace `workers/registry.yaml` with the new v2.0 format.

### Breaking Changes
- Registry format changed (version: "2.0")
- Thread format changed (see `knowledge/hq-core/thread-schema.md`)
- `/ralph-loop` renamed to `/run-project`

---

## General Update Process

1. **Backup your HQ** before updating
2. **Diff files** before overwriting - preserve your customizations
3. **Merge knowledge** - don't overwrite, combine with your additions
4. **Test skills** after copying to ensure they work with your setup
