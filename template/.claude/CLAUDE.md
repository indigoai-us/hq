# HQ

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `INDEX.md` - Directory map (load only for HQ infra tasks or when disoriented)
- `agents-profile.md` - Corey's profile + style (load only for writing/comms tasks)
- `agents-companies.md` - Company contexts + roles (load only when company routing needed)
- `USER-GUIDE.md` - Commands, workers, typical session
- `workers/registry.yaml` - Worker index

## Context Diet

Minimize context burn on session start:
- Do NOT read INDEX.md, agents files, or company knowledge unless task requires it
- Do NOT run qmd searches "to orient" — search only with a specific question
- For repo coding tasks: go directly to repo. HQ context rarely needed
- For worker execution: load only worker.yaml — it has its own knowledge pointers
- When unsure what to load: ask user, don't explore
- Prefer `workspace/threads/handoff.json` (7 lines) over INDEX.md for session state

## Token Optimization

Env vars in `.claude/settings.json` control cost defaults:

| Env var | Value | Why |
|---------|-------|-----|
| `MAX_THINKING_TOKENS` | `20000` | Caps extended thinking from 31,999 → 20,000 (~37% reasoning cost savings) |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `80` | Triggers mandatory handoff at 80% context (compaction can't be blocked — handoff preserves state) |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `sonnet` | Subagents (Task tool) use Sonnet (~60% cheaper than Opus, better quality than Haiku) |

Switch models mid-session with `/model opus` for complex reasoning. Toggle thinking with Option+T.

## Hook Profiles

Runtime-configurable hook execution via environment variables (no settings.json edits needed).

**Profiles** (set via `HQ_HOOK_PROFILE` env var):

| Profile | Hooks | Use Case |
|---------|-------|----------|
| `minimal` | block-hq-glob, block-hq-grep, warn-cross-company-settings, detect-secrets | Critical safety only (no checkpoint nudges) |
| `standard` | All minimal + auto-checkpoint-trigger, auto-handoff-trigger, observe-patterns | Default (all current hooks active) |
| `strict` | All standard + future quality/format hooks | Development/testing (reserved) |

**Default:** `standard` (all hooks active)

**Disable individual hooks** (comma-separated):
```
HQ_DISABLED_HOOKS=auto-checkpoint-trigger,auto-handoff-trigger
```

**Usage examples:**
```bash
# Minimal mode (safety hooks only)
HQ_HOOK_PROFILE=minimal bash -c 'claude code ...'

# Disable checkpoint nudges
HQ_DISABLED_HOOKS=auto-checkpoint-trigger claude code

# Combine
HQ_HOOK_PROFILE=standard HQ_DISABLED_HOOKS=auto-handoff-trigger claude code
```

**Technical:** All hooks route through `.claude/hooks/hook-gate.sh` which reads profile/disabled lists before delegating.

## Session Handoffs

When preparing a session handoff: always commit all pending changes first, write a handoff.json with current progress state (completed stories, remaining work, blockers), update INDEX files, and create a thread file. Never enter plan mode during handoff — execute steps directly.

## Corrections & Accuracy

When the user corrects factual content (pricing, session descriptions, product details), apply the correction exactly as stated. Do not re-interpret or paraphrase the user's correction. If unsure, quote back what you'll write and confirm before committing.

## INDEX.md System

Hierarchical INDEX.md files provide a navigable map of HQ. Read parent INDEX before diving into subdirectories.

**Key indexes:** `projects/INDEX.md`, `workspace/orchestrator/INDEX.md`, `companies/*/knowledge/INDEX.md`, `workers/*/INDEX.md`, `knowledge/public/INDEX.md`, `workspace/reports/INDEX.md`

**Spec:** `knowledge/public/hq-core/index-md-spec.md`
**Rebuild all:** `/cleanup --reindex`
**Auto-updated by:** `/checkpoint`, `/handoff`, `/reanchor`, `/prd`, `/run-project`, `/newworker`, content commands

## Structure

Top-level: `.claude/commands/`, `agents.md`, `companies/`, `knowledge/{public,private}/`, `projects/` (personal/HQ only), `repos/{public,private}/`, `settings/` (shared only — post-bridge, orchestrator), `workers/public/`, `workspace/{checkpoints,orchestrator,reports,social-drafts}/`. Each company is self-contained: `companies/{co}/{knowledge,settings,data,workers,repos,projects}/`. Full tree: `knowledge/public/hq-core/quick-reference.md`

## Companies

{company}, {company}, personal, {company}, {company}, {company}, {company}, {company}, {company}, {company}, {company}, {company}, {company}, hpo. Each is self-contained: `settings/` (creds), `data/` (exports), `knowledge/` (embedded git repo), `workers/` (company-scoped), `repos/` (symlinks to canonical clones), `projects/` (PRDs). Details: `knowledge/public/hq-core/quick-reference.md`

## Company Isolation

Manifest: `companies/manifest.yaml` — maps each company → repos, workers, knowledge, deploy targets, infrastructure.

**Manifest fields for infrastructure routing:**
- `services` — which credential types the company has (aws, linear, slack, etc.)
- `vercel_team` — Vercel scope ID for deploys (`--scope {team}`)
- `aws_profile` — AWS CLI profile name (`AWS_PROFILE={profile}`)
- `dns_zones` — domain → Route 53 hosted zone ID mapping

**Before any company-scoped operation:**
1. Identify active company from context (cwd, repo → manifest lookup, domain, worker)
2. Read `companies/{co}/policies/` — company policies have service-specific instructions
3. Use manifest infrastructure fields — don't guess Vercel scopes, AWS profiles, or zone IDs

**Hard rules:**
- NEVER read/use credentials from a different company's settings
- NEVER try another company's credentials as "fallback" — if the right company's creds fail, stop and ask
- NEVER paste secrets inline in bash commands — use `AWS_PROFILE=`, env files, or config refs
- NEVER deploy to a company's Vercel project / GitHub repo from a different company's context
- NEVER mix company knowledge in outputs
- NEVER use Linear credentials from a different company's settings
- Before any Linear API call, validate: config.json `workspace` field matches expected company
- If prd.json `linearCredentials` path doesn't match active company per manifest, ABORT and warn
- When task spans multiple companies (rare), explicitly acknowledge cross-company scope

**Credential access:** See policy `credential-access-protocol.md`. Always: manifest lookup → company policies → company settings. Never guess.

**Hook:** `warn-cross-company-settings.sh` (PreToolUse on Read) warns when reading a company's settings that doesn't match current cwd context.

## Sensitive Path Deny Lists

Sensitive system paths are blocked from Read access via `settings.json` deny rules: `~/.ssh/**`, `~/.aws/credentials`, `~/.aws/config`, `~/.gnupg/**`, `~/.env`, `~/.netrc`. These protect SSH keys, AWS credentials, GPG secrets, and local environment files. User can override with explicit approval when prompted. Company credential isolation is handled separately by hooks (see Company Isolation section).

## {Product} Linear Integration

All {PRODUCT}/{Product}/{Company} work tracked in Linear (workspace: `voyage`). Same hierarchy: Initiatives > Projects > Issues > Sub-issues.

**Creds:** `companies/{company}/settings/linear/credentials.json`
**Config:** `companies/{company}/settings/linear/config.json` (team IDs, state IDs, initiative IDs, members)
**Teams:** DEV (Development), AGE (Agent-Ops), GTM, PROD (Product), CX, OPS, LIVOPS (Live Ops), STYLE (Design), HR
**API:** `https://api.linear.app/graphql` — queries at `knowledge/private/linear/graphql-queries.md`

### Team Routing

| Work type | Team |
|-----------|------|
| Platform/infra/Lambda/DB/SST/ECS/code | DEV |
| Agent-ops/HQ tooling/dashboards | AGE |
| GTM/marketing/analytics/pixels/CAPI | GTM |
| Product specs/features/roadmap | PROD |
| Customer support/CX dashboards | CX |
| Operations/billing/TAM/finance | OPS |
| Live ops/monitoring/incidents | LIVOPS |
| Design/UI/brand | STYLE |

### Rules

1. **`/prd` → create Linear project + issues**: On {Company}/{Product} PRD creation, create Linear project (linked to best-fit initiative), create issue per story, store IDs in prd.json
2. **`/execute-task` → sync state + comment**: Set issue In Progress on start, Done on completion. Comment with status + @mention reviewers when done
3. **`/run-project` → sync project state + comment**: Set Linear project "started" on first task. Comment on state transitions
4. **Team routing**: Use table above. When in doubt, default to DEV
5. **Initiative grouping**: Reuse existing (CDP Migration, {PRODUCT}.ai, Build Faster, Deliver More Value, Capture TAM, Automate Internal Ops, Grow Wallet Share). Only create new for genuinely new strategic themes
6. **prd.json fields**: `metadata.linearProjectId`, `metadata.linearCredentials` (must point to `companies/{company}/...`), per-story `linearIssueId`
7. **Best-effort**: Linear sync never blocks execution. Log errors, skip on failure
8. **No retroactive sync**: Don't create Linear objects for archived/completed projects
9. **Commenting on state changes**: When issue → In Review, comment mentioning relevant reviewer(s). When blocked/needs resolution, comment with context + @mention. Use member IDs from config.json `members` block, fall back to display name
10. **Cross-posting guard**: NEVER use another company's Linear creds for {Product} work. Validate `workspace: "voyage"` in config before any API call

### Triage

`/check-linear-voyage` — interactive triage for {Product} workspace. Enforces company isolation.

## Infrastructure-First

When work implies new infrastructure, scaffold it BEFORE doing the work:

| Signal | Action |
|--------|--------|
| New company | `/newcompany {slug}` — creates dir, manifest, knowledge repo, qmd collection |
| New worker needed | `/newworker` — scaffolds worker.yaml in `companies/{co}/workers/`, registers in registry + manifest |
| New knowledge base | For company: `git init` in `companies/{co}/knowledge/`. For shared: create repo in `repos/public/knowledge-{name}` → symlink to `knowledge/public/`. Add to `modules/modules.yaml` |
| New project | `/prd` — creates `companies/{co}/projects/{name}/` with prd.json + README |
| New repo | Clone to `repos/{pub|priv}/` → add to `manifest.yaml` → add qmd collection |

**Post-infrastructure checklist (mandatory after ANY creation):**
1. `manifest.yaml` — verify no `null` values for company entry
2. `workers/registry.yaml` — verify new workers registered
3. `modules/modules.yaml` — verify new knowledge repos registered
4. `qmd update 2>/dev/null || true` — reindex search
5. Regenerate affected INDEX.md files

**Always reindex (`qmd update 2>/dev/null || true`) after:**
- Creating/modifying workers, knowledge, commands, projects
- Completion of `/newworker`, `/prd`, `/learn`, `/cleanup`, `/handoff`, `/execute-task`, `/run-project`
- Git commits touching `knowledge/`, `workers/`, `.claude/commands/`, `projects/`

## Workers

**Shared** (`workers/public/`): frontend-designer, qa-tester, security-scanner, pretty-mermaid, exec-summary, accessibility-auditor, performance-benchmarker + dev-team (17) + content-team (5) + social-team (5) + pr-team (6) + gardener-team (3) + gemini-team (3) + knowledge-tagger + site-builder.
**Company** (`companies/{co}/workers/`): {company} (6), {company}/PR (6), personal (3), {company} (2), {company} (1). Full list: `workers/registry.yaml`.

**Worker-first rule:** Before specialized tasks (design, content writing, security, data analysis, deployment), check `workers/registry.yaml` for a matching worker. Use `/run {worker} {skill}` — workers carry domain instructions + learned rules. Only work directly if no suitable worker exists.

## Policies

Before executing tasks, load applicable policies from all three directories:
1. `companies/{co}/policies/` — company-scoped rules (infer company from context)
2. `repos/{repo}/.claude/policies/` — repo-scoped rules (if working inside a repo)
3. `.claude/policies/` — cross-cutting + command-scoped rules

Hard enforcement policies block on violation; soft enforcement policies note deviations.

**Spec:** `knowledge/public/hq-core/policies-spec.md`
**Template:** `companies/_template/policies/example-policy.md`
**Format:** YAML frontmatter (id, title, scope, trigger, enforcement) + `## Rule` + `## Rationale`
**Precedence:** company > repo > command > global

**Standard Policy Loading Protocol (for all commands):**
When a command resolves a company and/or repo context:
1. Company: `companies/{co}/policies/` — read all (skip `example-policy.md`)
2. Repo: `{repoPath}/.claude/policies/` — read all (if dir exists)
3. Global: `.claude/policies/` — filter by `trigger` field relevance to current task
4. Hard-enforcement → must follow; soft-enforcement → note deviations
5. Display policy count in any orientation/status output
Commands implementing this: `/startwork`, `/run-project`, `/execute-task`, `/prd`, `/run`, `/learn`

## Sub-Agent Rules

When spawning Task agents for story/task completion: each sub-agent MUST commit its own work before completing. The orchestrator should verify uncommitted changes after each sub-agent returns and commit them if the sub-agent failed to do so.

## File Locking

Story-scoped file flags prevent concurrent edit conflicts. Config: `settings/orchestrator.yaml`. Stories declare `files: []` in prd.json. `/execute-task` acquires locks in `{repo}/.file-locks.json` + state.json `checkedOutFiles` on start, releases on completion/failure. `/run-project` skips conflicting stories during task selection (configurable: `hard_block`, `soft_block`, `read_only_fallback`). Stale locks (dead PID + timeout) auto-cleaned.

## Commands

44 commands in `.claude/commands/` (and growing). Company/niche commands moved to repo-level or workers. Full catalog: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Bases

Public: Ralph, workers, hq-core, dev-team, design-styles, projects, loom, ai-security-framework, agent-browser, curious-minds, gemini-cli. Private: linear. Company-level: each at `companies/{co}/knowledge/`. Full list: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Repos

Every knowledge folder is its own git repo with independent versioning.

**Company knowledge** (`companies/{co}/knowledge/`): Embedded git repos — the `.git/` lives inside the directory. HQ gitignores the content. To commit: `cd companies/{co}/knowledge/ && git add && git commit && git push`.

**Shared knowledge** (`knowledge/public/`): Symlinks to `repos/public/knowledge-{name}/`. To commit: `cd` to the symlink target repo.

**Reading/searching:** Transparent. `qmd`, `Glob`, `Grep`, `Read` all work directly.

**Adding new knowledge:** Company: `git init` in `companies/{co}/knowledge/`. Shared: create repo in `repos/public/knowledge-{name}`, symlink to `knowledge/public/`. Register in `modules/modules.yaml`.

## Skills

`.claude/skills/` is the canonical HQ skill tree. Do not duplicate skill definitions for Codex.

Use a bridge instead of copying files:
- `scripts/codex-skill-bridge.sh install` creates `~/.codex/skills/hq` pointing at `.claude/skills/`
- The same install also mirrors `.claude/` into project-local `.codex/claude` and exposes `.claude/commands/` as project-local `.codex/prompts`
- New skills created under `.claude/skills/` become available to Codex without a sync step
- New command files created under `.claude/commands/` become available to Codex through the prompt bridge without a sync step
- Inference: Codex may need a fresh session to notice brand-new bridged content, but the filesystem bridge stays current

## Search (qmd)

HQ and active codebases are indexed with [qmd](https://github.com/tobi/qmd) for local semantic + full-text search.

**Collections:** `hq` (all HQ), `{product}` ({PRODUCT} monorepo), `{company}`, `{company}`, `personal` (per-company). Use `-c {collection}` to scope searches. When working on a specific company, prefer `-c {company}` to avoid cross-company results.

**When to search:** Before any planning, research, or context-gathering task, search with `qmd` first. This includes codebase exploration — use qmd for conceptual search instead of Grep.

**Commands (run via Bash tool):**
- `qmd search "<query>" --json -n 10` — BM25 keyword search (fast, default)
- `qmd vsearch "<query>" --json -n 10` — semantic/conceptual search
- `qmd query "<query>" --json -n 10` — hybrid BM25 + vector + re-ranking (best quality, slower)
- Add `-c {collection}` to scope to a specific collection (e.g. `-c {product}`)

**Slash commands:** `/search <query>`, `/search-reindex`

### Search rules (all commands/skills must follow)

| Need | Tool | Example |
|------|------|---------|
| Find HQ content by topic | `qmd search` or `qmd vsearch` | "Find knowledge about Stripe integration" |
| Find code by concept | `qmd vsearch -c {product}` | "where auth middleware is defined" |
| Find project PRD | `qmd search` or direct `Read` | `qmd search "project-name prd.json" --json -n 5` |
| Find worker yaml | `Read workers/registry.yaml` → path | Never Glob — registry has all paths |
| Find companies | `Read companies/manifest.yaml` | Never Glob — manifest lists all companies |
| Find files by path pattern | `Glob` with scoped `path:` | `Glob pattern="*.ts" path="repos/private/{product}/apps/"` |
| Exact pattern match in code | `Grep` (works from HQ root) | `import.*AuthService` with `glob: "*.ts"` |
| Validate structured files | `grep` in Bash | Checking YAML fields, git branch filtering |

**Never use Glob for prd.json or worker.yaml discovery.** Use `qmd search` or read index files directly (`manifest.yaml`, `registry.yaml`). Hook enforced — Glob with these patterns is blocked.

**Prefer qmd for codebase exploration.** Use Grep for exact pattern matching. Commands/skills scanning HQ must use `qmd vsearch` or `qmd search`, not Grep.

**`.ignore` file protects Grep** — HQ has a `.ignore` (ripgrep ignore) that blocks `repos/`, `node_modules/`, `**/.git/`. Grep from HQ root is safe. Glob from HQ root still times out — always pass a scoped `path:` to Glob.

**Glob rules:**
- NEVER Glob for `prd.json` or `worker.yaml` — blocked by hook, use qmd or direct Read
- ALWAYS pass `path:` scoped to a subdirectory (`companies/`, `workers/`, `workspace/`)
- NEVER Glob from HQ root — `.ignore` does NOT protect Glob (only Grep)
- Parallel Glob calls: if one times out, ALL sibling tool calls in the same message die ("Sibling tool call errored")

**When in doubt:** `qmd search "project name"` finds files by topic without any timeout risk

## Policies (Learned Rules)

Rules are stored as policy files — structured markdown with YAML frontmatter. Migrated from inline `## Learned Rules` on 2026-02-22.

**Directories (check before executing tasks):**
- `companies/{co}/policies/` — company-scoped rules
- `repos/{pub|priv}/{repo}/.claude/policies/` — repo-scoped rules
- `.claude/policies/` — cross-cutting + command-scoped rules

**Precedence:** company > repo > command > global. Hard enforcement blocks on violation; soft notes deviations.

**Spec:** `knowledge/public/hq-core/policies-spec.md`
**Template:** `companies/_template/policies/example-policy.md`

## Learning System

Learnings are captured as **policy files** in scope-appropriate directories:
- Company rules → `companies/{co}/policies/{slug}.md`
- Repo rules → `repos/{pub|priv}/{repo}/.claude/policies/{slug}.md`
- Command rules → `.claude/policies/{slug}.md` (with `scope: command`)
- Cross-cutting rules → `.claude/policies/{slug}.md`

- `/learn` captures, classifies, and writes policy files automatically after task execution
- `/remember` delegates to `/learn` — user corrections get `enforcement: hard`

Event log: `workspace/learnings/*.json` (append-only, for analytics/dedup).

## Git Workflow Rules

- Always verify which branch you're on before committing.
- Prefer merge over rebase when a branch is significantly behind (50+ commits).
- If lint-staged or git hooks cause issues during merge/rebase, disable them temporarily with `--no-verify` rather than fighting through repeated failures.
- Never commit to local main when intending to work on a feature branch.

## Project Repos - Commit Rules

### {PRODUCT} (`repos/private/{product}`)
**MANDATORY before any PR (enforced by hook):**
1. `bun run test` — must pass
2. `bun check` — must pass (TypeScript)
3. `bun lint` — must pass

**Use `/{product}-pr` command** (in {PRODUCT} repo's `.claude/commands/`) — direct `gh pr create` is blocked by PreToolUse hook.

**Code location rules:**
- Lambda code → `apps/function/src/` (NOT libs)
- Use `pgClient` with raw SQL (NOT Prisma) for Lambda db queries
- Use DynamoDB for ephemeral state (migration state, dead-letter)

**Parallel agent cleanup:** When running parallel agents for large-scale code removal, they miss files outside their assigned scope (e.g. schema files, session handling, component props, infra configs). ALWAYS run a comprehensive grep for all removed identifiers after parallel agents finish and before committing.

**Sub-agent import paths:** Sub-agents consistently get relative import paths wrong when creating files in unfamiliar directory structures (e.g. `../../hooks/` instead of `../hooks/`). ALWAYS run `bun check` after sub-agent edits to catch broken imports before proceeding.

**Integration deprecation:** Removing an integration ID from `libs/db/src/constants/integration.ts` causes cascading TS errors — the `DatabaseEntity['integrations']['id']` union type flows through Supabase `.eq()` filters across many files. Fully remove the constant from the `Integration` object; `@deprecated` JSDoc on a const value still includes it in the union type.

**Full rules:** `repos/private/{product}/.claude/CLAUDE.md`
Repo: https://github.com/{org}/{repo}

## Vercel Deployments

- Always verify the correct Vercel org/team before deploying (check with `vercel whoami` and `vercel teams ls`).
- Confirm framework detection is correct before deploying.
- If preview deploys are behind SSO, fall back to local testing immediately rather than debugging SSO.

## Auto-Learn (Build Activities)

When building HQ infrastructure, auto-capture structural changes via `/learn`. See **Infrastructure-First** section for the full creation checklist and reindex triggers.

**Why:** Fresh sessions discover resources via `qmd`, `registry.yaml`, and `companies/{co}/projects/*/prd.json`. Global learned rules are reserved for cross-cutting safety rules. Worker-scoped rules go in `worker.yaml`.

## Auto-Checkpoint (PostToolUse Hook)

PostToolUse hooks on Bash and Write tool calls detect checkpoint-worthy events and inject an `AUTO-CHECKPOINT REQUIRED` nudge. When you see this nudge, **immediately write a lightweight thread file** and continue working.

**Triggers (hook-detected):**
- Git commit (Bash tool with `git commit`)
- File generation to `workspace/reports/`, `workspace/social-drafts/`, `companies/*/data/`

**Also checkpoint after (instruction-based, no hook):**
- Worker skill completion (via `/run`) — write auto-checkpoint before reporting results

**Lightweight auto-checkpoint format:**
```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-auto-{slug}",
  "version": 1,
  "type": "auto-checkpoint",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "workspace_root": "~/Documents/HQ",
  "cwd": "current/working/dir",
  "git": {
    "branch": "main",
    "current_commit": "abc1234",
    "dirty": false
  },
  "conversation_summary": "1 sentence of what just happened",
  "files_touched": ["relative/paths"],
  "metadata": {
    "title": "Auto: brief description",
    "tags": ["auto-checkpoint"],
    "trigger": "git-commit | file-generation | worker-completion"
  }
}
```

**Do NOT** on auto-checkpoints: rebuild INDEX files, update `recent.md`, run `qmd update`, write legacy checkpoint files. Just write the JSON and move on.

**Knowledge repos:** When edits touch knowledge files (`companies/{co}/knowledge/` or `knowledge/public/`), commit those changes to the knowledge repo — not HQ git. See "Knowledge Repos" section above.

## Session Learnings

Before `/handoff` or `/checkpoint`, reflect on the session and extract reusable learnings:

1. **What to capture:** Mistakes that cost time, unexpected behaviors, patterns that worked well, gotchas about specific tools/APIs/files, workflow improvements
2. **What to skip:** Session-specific context, "task completed", things already in learned rules
3. **How:** Call `/learn` with each learning — it handles scoping, dedup, injection, and reindex
4. **When nothing learned:** Skip — not every session produces novel insights

## Auto-Handoff (PreCompact Hook)

A PreCompact hook fires at 80% context. Autocompact cannot be fully disabled in Claude Code — no off switch exists. The hook forces an immediate `/handoff` to preserve state before compaction destroys context.

**When you see the handoff banner: STOP immediately.**

1. Save any mid-edit file (don't leave partial edits)
2. Run `/handoff` RIGHT NOW
3. Do NOT continue working, do NOT "finish quickly"
4. The next session picks up where you left off

**Fallback (instruction-based):** If you notice context is running low (many long turns, compaction has occurred), proactively run `/handoff` without waiting for the hook.

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Test before ship** - If you can't verify it works, you can't ship it
5. **E2E tests prove it works** - Unit tests check code; E2E tests check the product

## E2E Testing Standards

For deployable projects (web, API, CLI):
- E2E tests verify the product works, not just the code
- Tests are back-pressure in the Ralph loop (fail = task incomplete)
- Knowledge base: `knowledge/public/testing/` (templates, infra guides, agent-browser)
- PRDs include optional `e2eTests` per story
- Workers use `e2e-testing` skill for writing/running tests

**Full guide:** `knowledge/public/testing/e2e-cloud.md`
