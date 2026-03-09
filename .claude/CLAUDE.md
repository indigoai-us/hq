# HQ

Personal OS for orchestrating work across companies, workers, and AI.

## Key Files

- `INDEX.md` - Directory map (load only for HQ infra tasks or when disoriented)
- `agents-profile.md` - {your-name}'s profile + style (load only for writing/comms tasks)
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
| `MAX_THINKING_TOKENS` | `10000` | Caps extended thinking (~70% reasoning cost savings) |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `50` | Triggers mandatory handoff at 50% context |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `haiku` | Subagents (Task tool) use Haiku (~90% cheaper than Opus) |

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
HQ_HOOK_PROFILE=minimal claude code

# Disable checkpoint nudges
HQ_DISABLED_HOOKS=auto-checkpoint-trigger claude code
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

Top-level: `.claude/commands/`, `agents.md`, `companies/`, `knowledge/{public,private}/`, `projects/`, `repos/{public,private}/`, `settings/`, `workers/{public,private}/`, `workspace/{checkpoints,orchestrator,reports,social-drafts}/`. Full tree: `knowledge/public/hq-core/quick-reference.md`

## Companies

{company-1}, {company-2}, {company-3}, personal, {company-7}, {company-8}, {company-4}, {company-6}, {company-5}, {company-9}, indigo. Each owns `settings/` (creds), `data/` (exports), `knowledge/` (symlink → own git repo). Details: `knowledge/public/hq-core/quick-reference.md`

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

## Skills

`.claude/skills/` is the canonical HQ skill tree. Do not duplicate skill definitions for Codex.

To expose HQ skills to Codex, install a single symlink bridge:
- `scripts/codex-skill-bridge.sh install` → creates `~/.codex/skills/hq` pointing at `.claude/skills/`
- New skills created under `.claude/skills/` become available to Codex without a sync step
- Inference: Codex may need a fresh session to notice a brand-new skill, but the filesystem bridge stays current

## Infrastructure-First

When work implies new infrastructure, scaffold it BEFORE doing the work:

| Signal | Action |
|--------|--------|
| New company | `/newcompany {slug}` — creates dir, manifest, knowledge repo, qmd collection |
| New worker needed | `/newworker` — scaffolds worker.yaml, auto-registers in registry + manifest |
| New knowledge base | Create repo in `repos/{pub|priv}/knowledge-{name}` → symlink → add to `modules/modules.yaml` |
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

**Shared** (`workers/public/`): frontend-designer, qa-tester, security-scanner, pretty-mermaid, exec-summary, accessibility-auditor, performance-benchmarker + dev-team (17) + content-team (5) + social-team (5) + gardener-team (3) + gemini-team (3) + knowledge-tagger + site-builder.
**Company** (`companies/{co}/workers/`): company-scoped workers. Full list: `workers/registry.yaml`.

**Worker-first rule:** Before specialized tasks (design, content writing, security, data analysis, deployment), check `workers/registry.yaml` for a matching worker. Use `/run {worker} {skill}` — workers carry domain instructions + learned rules. Only work directly if no suitable worker exists.

## Sub-Agent Rules

When spawning Task agents for story/task completion: each sub-agent MUST commit its own work before completing. The orchestrator should verify uncommitted changes after each sub-agent returns and commit them if the sub-agent failed to do so.

## File Locking

Story-scoped file flags prevent concurrent edit conflicts. Config: `settings/orchestrator.yaml`. Stories declare `files: []` in prd.json. `/execute-task` acquires locks in `{repo}/.file-locks.json` + state.json `checkedOutFiles` on start, releases on completion/failure. `/run-project` skips conflicting stories during task selection (configurable: `hard_block`, `soft_block`, `read_only_fallback`). Stale locks (dead PID + timeout) auto-cleaned.

## Commands

35+ commands in `.claude/commands/`. Company/niche commands moved to repo-level or workers. Full catalog: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Bases

Public: Ralph, workers, hq-core, dev-team, design-styles, projects, loom, ai-security-framework, testing, agent-browser, curious-minds, gemini-cli, pr, context-needs, project-context. Private: linear. Company-level: each at `companies/{co}/knowledge/`. Full list: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Repos

Every knowledge folder is its own git repo with independent versioning.

**Company knowledge** (`companies/{co}/knowledge/`): Embedded git repos — the `.git/` lives inside the directory. HQ gitignores the content. To commit: `cd companies/{co}/knowledge/ && git add && git commit && git push`.

**Shared knowledge** (`knowledge/public/`): Symlinks to `repos/public/knowledge-{name}/`. To commit: `cd` to the symlink target repo.

**Reading/searching:** Transparent. `qmd`, `Glob`, `Grep`, `Read` all work directly.

**Reading/searching:** Transparent. `qmd`, `Glob`, `Grep`, `Read` all work directly.

**Adding new knowledge:** Company: `git init` in `companies/{co}/knowledge/`. Shared: create repo in `repos/public/knowledge-{name}`, symlink to `knowledge/public/`. Register in `modules/modules.yaml`.

## Search (qmd)

HQ and active codebases are indexed with [qmd](https://github.com/tobi/qmd) for local semantic + full-text search.

**Collections:** `hq` (all HQ), `{product}` ({Product} monorepo), `{company-1}`, `{company-2}`, `{company-3}`, `personal` (per-company). Use `-c {collection}` to scope searches. When working on a specific company, prefer `-c {company}` to avoid cross-company results.

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

**Prefer qmd for codebase exploration.** Use Grep for exact pattern matching. Commands/skills scanning HQ must use `qmd vsearch` or `qmd search`, not Grep.

**`.ignore` file protects Grep** — HQ has a `.ignore` (ripgrep ignore) that blocks `repos/`, `node_modules/`, `**/.git/`. Grep from HQ root is safe. Glob from HQ root still times out — always pass a scoped `path:` to Glob.

**Never use Glob for prd.json or worker.yaml discovery.** Use `qmd search` or read index files directly (`manifest.yaml`, `registry.yaml`). Hook enforced — Glob with these patterns is blocked.

**Glob rules:**
- NEVER Glob for `prd.json` or `worker.yaml` — blocked by hook, use qmd or direct Read
- ALWAYS pass `path:` scoped to a subdirectory (`companies/`, `workers/`, `workspace/`)
- NEVER Glob from HQ root — `.ignore` does NOT protect Glob (only Grep)
- Parallel Glob calls: if one times out, ALL sibling tool calls in the same message die ("Sibling tool call errored")

**When in doubt:** `qmd search "project name"` finds files by topic without any timeout risk

## LSP (Language Server Protocol)

When `ENABLE_LSP_TOOL=1` is set, Claude Code has access to LSP tools for code intelligence — go-to-definition, find-references, type info, and hover. Prefer LSP over Grep for navigating codebases:

| Need | Use |
|------|-----|
| Find where a function is defined | LSP go-to-definition |
| Find all usages of a symbol | LSP find-references |
| Check type of a variable | LSP hover |
| Find string patterns across files | Grep (LSP can't do regex search) |

**Setup:** Add `export ENABLE_LSP_TOOL=1` to your shell profile (`~/.zshrc` or `~/.bashrc`), then restart Claude Code.

## Policies (Learned Rules)

Rules are stored as policy files — structured markdown with YAML frontmatter. Migrated from inline `## Learned Rules`.

**Directories (check before executing tasks):**
- `companies/{co}/policies/` — company-scoped rules
- `repos/{pub|priv}/{repo}/.claude/policies/` — repo-scoped rules
- `.claude/policies/` — cross-cutting + command-scoped rules

**Precedence:** company > repo > command > global. Hard enforcement blocks on violation; soft notes deviations.

**Spec:** `knowledge/public/hq-core/policies-spec.md`
**Template:** `companies/_template/policies/example-policy.md`

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

## Learned Rules

<!-- Max 25. Worker-scoped rules go in worker.yaml, not here. -->
<!-- Auto-managed by /learn. Manual: /remember -->

- **qmd collections**: hq, {product}, {company-1}, {company-2}, {company-3}, personal, {company-6}, indigo. Use `-c {co}` to scope
- **company isolation**: `manifest.yaml` enforced. Never cross-contaminate creds/knowledge/deploys
- **agent-browser**: CLI browser automation (v0.11.1). Skill at `.claude/skills/agent-browser/`. Auth states at `settings/{company}/browser-state/`. ALWAYS use agent-browser for ALL browser interactions — NEVER open headed browsers. Keep Playwright only for structured QA suites
- **vercel org mapping**: {Company-1} → `voyagesms`, {Company-2} → `{company-2}-c09fddff`, {Company-3} → `{company-3}-f0dc7e1b`, Personal → `{your-username}s-projects`. NEVER run `vercel` CLI without `--scope {org}`. Prefer `git push` for production deploys
- **gmail reply_email danger**: NEVER use `reply_email` to compose — it sends immediately. ALWAYS `draft_email` first. Plain text only
- **{company-2}-site no purple text**: NEVER use `text-primary` (purple) for text. All text must be foreground/grey tones. Purple reserved for backgrounds, borders, accent elements only
- **draft file content extraction**: NEVER send raw draft file content as a social post. Draft files have markdown metadata headers (`# Title`, `**Status:**`, `---`). ALWAYS strip everything above `---` separator before posting. For multi-option drafts, extract only the recommended option. Validate: if caption starts with `#` or contains `**Status:**`, abort.
- **Post-Bridge no test calls**: NEVER send test/exploratory API calls to production social accounts. When debugging API field names, read docs first — never send `{"caption":"test"}` to a live account. Build the full request locally, verify fields, and only call the API once with real content. Test posts publish immediately and cannot be deleted via API
- **supabase project deletion**: NEVER delete Supabase projects without confirming with user first. rose-flower was {Company-5}'s DB and was incorrectly deleted as "unused" on 2026-02-10. Always ask before deleting any Supabase/Vercel project
- **Glob requires scoped path**: ALWAYS pass `path:` to Glob scoped to a subdirectory (e.g. `projects/`, `workers/`). Glob from HQ root times out (`.ignore` doesn't protect it). Grep from HQ root is safe (`.ignore` blocks repos/node_modules). Parallel tool failures cascade — one timeout kills all siblings
- **knowledge diagrams**: When creating/editing knowledge files, ALWAYS use ` ```mermaid ` blocks for diagrams — never ASCII art. The {company-3}-hq-app renders Mermaid as interactive SVG with {Company-3} theming and click-to-zoom
- **holler apply deploy**: {company-4}.com (apply site) has NO GitHub auto-deploy. Must CLI deploy with BOTH project.json AND vercel.json swapped: `cp apps/apply/.vercel/project.json .vercel/project.json && mv vercel.json vercel.json.bak` → `vercel deploy --prod --scope {your-username}s-projects` → restore both. Root `vercel.json` has API buildCommand that breaks apply deploy. Running `vercel deploy` from `apps/apply/` dir doubles path (Vercel project rootDirectory=apps/apply). Push to BOTH remotes (`origin`=goldenthreadband, `{company-4}`).
- **model routing**: Workers declare `execution.model` in worker.yaml (opus/sonnet/haiku). `/execute-task` passes model to `Task()`. Stories can override via `model_hint` in prd.json. Default: opus. Metrics logged to `workspace/metrics/model-usage.jsonl`
- **post-bridge verify delivery**: After ANY Post-Bridge API call, ALWAYS use agent-browser to navigate to the actual social page and visually confirm the post is live. `status: "posted"` is unreliable. Also: ALWAYS check the target page with agent-browser BEFORE posting to confirm context and avoid duplicates. Never trust API status alone.
- **git branch before committing**: ALWAYS run `git branch --show-current` before committing to any repo. Never assume the current branch — inherited cwd or installs can silently land you on an unintended branch (e.g. feature/{company-3}-staging-cleanup instead of a clean branch). If wrong branch: create correct branch, cherry-pick, revert from wrong branch. <!-- 2026-02-19 -->
- **tauri dev deep link**: `pnpm tauri dev` runs a raw binary — it does NOT install to /Applications/ so macOS ignores its CFBundleURLSchemes. For deep links to work during dev: run `pnpm tauri build --debug`, copy .app to /Applications/, then `lsregister -f` it. Use `LSSetDefaultHandlerForURLScheme` via Swift if the Electron app still wins. <!-- 2026-02-19 -->
- **tauri tokio::spawn**: NEVER use `tokio::spawn` directly in Tauri app setup (e.g. in `setup` closure or `did_finish_launching`). Tokio runtime isn't initialized yet — causes panic "no reactor running". ALWAYS use `tauri::async_runtime::spawn` instead; it uses Tauri's managed runtime which is guaranteed to exist. <!-- 2026-02-19 -->
- **email subject ASCII only**: NEVER use special characters (em dash, curly quotes, Unicode punctuation) in email subject lines — they encode as garbled text. Plain ASCII only: hyphens not dashes, straight quotes. <!-- user-correction | 2026-02-19 -->
- **{company-3-domain} DNS via Route 53**: {company-3-domain} DNS is in AWS Route 53 (NOT Vercel). To add a subdomain: (1) add CNAME in Route 53 pointing to `cname.vercel-dns.com`, (2) add domain in Vercel dashboard under `{company-3}-f0dc7e1b` project settings. Vercel login for {company-3} team: GitHub auth as `{your-username}` — team@company.com has NO Vercel account. <!-- user-correction | 2026-02-19 -->
- **{Company-3} AWS creds**: AWS credentials for {Company-3} (Route 53, full infra) are in `companies/{company-3}/settings/.env` (AWS_ACCESS_KEY_ID/SECRET). Backup: 1Password `team-{company-3}ai.1password.com`. NEVER use these creds for non-{Company-3} work. NEVER delete any {Company-3} AWS/Vercel resources without explicit confirmation. Full infra docs: `companies/{company-3}/knowledge/infrastructure.md`. <!-- user-correction | 2026-02-19 -->
- **vercel custom domain deploy safety**: NEVER deploy to a production custom domain (e.g. token.{company-3-domain}, {company-4}.com) without explicit user confirmation. "Deploy to a temporary Vercel site" means a fresh Vercel project with only a .vercel.app URL — no custom domain aliases. Existing Vercel projects with custom domains are live production sites. <!-- user-correction | 2026-02-19 -->
- **Task() sub-agents lack MCP**: Sub-agents spawned via Task() don't inherit MCP server connections. Workers needing external tools (Codex, etc.) must use CLI via Bash, not MCP tools declared in worker.yaml. <!-- 2026-02-20 -->
- **Shopify 2026 auth**: No more permanent Admin API tokens from store admin (Jan 2026). New apps use Dev Dashboard + client_credentials grant: `POST https://{store}.myshopify.com/admin/oauth/access_token` with `client_id` + `client_secret`. Returns ephemeral `shpat_` token (24h expiry). The `shpss_` Storefront token from Dev Dashboard IS the `client_secret`. Store both in env, regenerate admin token on demand. <!-- 2026-02-20 -->
- **vercel preview SSO**: `vercel deploy --public` makes source public, NOT bypasses deployment protection (SSO). Vercel preview URLs always require login unless project-level protection is disabled. To test a preview without auth: run prod server locally (`npm run build && npm run start`). <!-- 2026-02-21 -->
- **Vercel domain team move**: When purchasing a domain via Vercel/Name.com, it can land in the wrong team/org. Check ownership with `GET /v6/domains/{domain}?teamId={teamId}` across all teams. Move between teams with `PATCH /v6/domains/{domain}?teamId={source}` body `{"op": "move-out", "destination": "{target_team_id}"}`. Cannot delete Vercel-purchased domains — must move them. <!-- 2026-02-20 -->
- **Vercel framework detection**: If Vercel project has `framework: null`, production builds deploy but serve 404 on all routes (even though build succeeds). Fix with `PATCH /v9/projects/{id}` setting `{"framework":"nextjs","installCommand":"pnpm install"}` then redeploy. Always verify framework is set after project creation. <!-- 2026-02-20 -->
- **pre-deploy domain check**: Before ANY Vercel deploy to a custom domain, ALWAYS (1) `curl -s` the live URL to see what's currently there, (2) check which Vercel project owns the domain (`GET /v6/domains/{domain}`), (3) read the relevant infra knowledge for domain registry. NEVER remove a domain from one project to assign it to another — add new routes within the existing project instead. <!-- 2026-02-20 -->
- **EAS build env vars**: EAS production builds do NOT inherit local `.env` files — `EXPO_PUBLIC_*` vars must be set on expo.dev or via CLI before building or the app crashes on launch. Set with: `eas env:create production --name KEY --value VALUE --visibility sensitive --scope project --non-interactive`. Use `sensitive` (NOT `secret`) for `EXPO_PUBLIC_*` vars — EAS rejects `secret` visibility for public-prefixed vars. Verify with `eas env:list production` before triggering build. <!-- 2026-02-21 -->
- **Vercel env var trailing newlines**: When piping values to `vercel env add`, ALWAYS use `printf` (no trailing newline) — NOT `echo`. `echo` appends `\n` to the value, causing API calls with those credentials to fail with 400 Bad Request. Diagnose with `vercel env pull` and inspect for `\n` in values. <!-- 2026-02-21 -->
- **E2E tests cover real user flows**: Write E2E tests that exercise the actual user flow — run the CLI, open the URL in Playwright, verify the page renders. Unit tests passing ≠ product works. <!-- e2e-cloud-testing -->
- **Test before marking complete**: Never mark a task `passes: true` without running tests AND verifying the feature works. <!-- e2e-cloud-testing -->
- **PRD test-first structure**: PRDs should include E2E tests per story, verification commands, and Phase 0 test infrastructure. <!-- e2e-cloud-testing -->
- **PRD baseBranch**: Include `metadata.baseBranch` so Pure Ralph creates feature branches from the correct base. <!-- e2e-cloud-testing -->
- **Script/schema compatibility**: When updating PRD schema (e.g. `features` → `userStories`), also update all scripts that consume PRDs. <!-- e2e-cloud-testing -->

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

### {Product} (`repos/private/{product}`)
**MANDATORY before any PR (enforced by hook):**
1. `bun run test` — must pass
2. `bun check` — must pass (TypeScript)
3. `bun lint` — must pass

**Use `/{product}-pr` command** (in {Product} repo's `.claude/commands/`) — direct `gh pr create` is blocked by PreToolUse hook.

**Code location rules:**
- Lambda code → `apps/function/src/` (NOT libs)
- Use `pgClient` with raw SQL (NOT Prisma) for Lambda db queries
- Use DynamoDB for ephemeral state (migration state, dead-letter)

**Parallel agent cleanup:** When running parallel agents for large-scale code removal, they miss files outside their assigned scope (e.g. schema files, session handling, component props, infra configs). ALWAYS run a comprehensive grep for all removed identifiers after parallel agents finish and before committing.

**Integration deprecation:** Removing an integration ID from `libs/db/src/constants/integration.ts` causes cascading TS errors — the `DatabaseEntity['integrations']['id']` union type flows through Supabase `.eq()` filters across many files. Fully remove the constant from the `Integration` object; `@deprecated` JSDoc on a const value still includes it in the union type.

**Full rules:** `repos/private/{product}/.claude/CLAUDE.md`
Repo: https://github.com/{github-org}/{product}

### {Company-2} CMO HQ (`repos/private/{company-2}-cmohq`)
- **Always commit and push** after completing work
- Provide GitHub link to commit after pushing
- Repo: https://github.com/{company-2}brand/{company-2}-cmohq

## Vercel Deployments

- Always verify the correct Vercel org/team before deploying (check with `vercel whoami` and `vercel teams ls`).
- Confirm framework detection is correct before deploying.
- If preview deploys are behind SSO, fall back to local testing immediately rather than debugging SSO.

## Auto-Learn (Build Activities)

When building HQ infrastructure, auto-capture structural changes via `/learn`. See **Infrastructure-First** section for the full creation checklist and reindex triggers.

**Why:** Fresh sessions discover resources via `qmd`, `registry.yaml`, and `projects/*/prd.json`. Global learned rules are reserved for cross-cutting safety rules. Worker-scoped rules go in `worker.yaml`.

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

**Knowledge repos:** When edits touch knowledge files (symlinked to `repos/`), commit those changes to the knowledge repo — not HQ git. See "Knowledge Repos" section above.

## Session Learnings

Before `/handoff` or `/checkpoint`, reflect on the session and extract reusable learnings:

1. **What to capture:** Mistakes that cost time, unexpected behaviors, patterns that worked well, gotchas about specific tools/APIs/files, workflow improvements
2. **What to skip:** Session-specific context, "task completed", things already in learned rules
3. **How:** Call `/learn` with each learning — it handles scoping, dedup, injection, and reindex
4. **When nothing learned:** Skip — not every session produces novel insights

## Auto-Handoff (PreCompact Hook)

A PreCompact hook fires when auto-compaction triggers (context window full). When you see the handoff nudge:

1. Finish current atomic action (don't leave files half-edited)
2. Run `/handoff` to preserve session state
3. Do NOT start new tasks — hand off first

**Fallback (instruction-based):** If you notice context is running low (many long turns, compaction has occurred), proactively run `/handoff` without waiting for the hook.
