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

## INDEX.md System

Hierarchical INDEX.md files provide a navigable map of HQ. Read parent INDEX before diving into subdirectories.

**Key indexes:** `projects/INDEX.md`, `workspace/orchestrator/INDEX.md`, `companies/*/knowledge/INDEX.md`, `workers/*/INDEX.md`, `knowledge/public/INDEX.md`, `workspace/reports/INDEX.md`

**Spec:** `knowledge/public/hq-core/index-md-spec.md`
**Rebuild all:** `/cleanup --reindex`
**Auto-updated by:** `/checkpoint`, `/handoff`, `/reanchor`, `/prd`, `/run-project`, `/newworker`, content commands

## Structure

Top-level: `.claude/commands/`, `agents.md`, `companies/`, `knowledge/{public,private}/`, `projects/`, `repos/{public,private}/`, `settings/`, `workers/{public,private}/`, `workspace/{checkpoints,orchestrator,reports,social-drafts}/`. Full tree: `knowledge/public/hq-core/quick-reference.md`

## Companies

{company-1}, {company-2}, {company-3}, personal, {company-7}, {company-8}, {company-4}, {company-6}, {company-5}, {company-9}. Each owns `settings/` (creds), `data/` (exports), `knowledge/` (symlink → own git repo). Details: `knowledge/public/hq-core/quick-reference.md`

## Company Isolation

Manifest: `companies/manifest.yaml` — maps each company → repos, settings, workers, knowledge, deploy targets.

**Rules:**
- Infer active company from context: cwd, worker being run, files being accessed, project repo
- Before accessing company-scoped resources (settings/, knowledge/, repos/), verify ownership per manifest
- NEVER read/use credentials from a different company's settings
- NEVER mix company knowledge in outputs (e.g. {Company-2} brand guidelines in a {Company-1} report)
- NEVER deploy to a company's Vercel project / GitHub repo from a different company's context
- When task spans multiple companies (rare), explicitly acknowledge cross-company scope and handle each separately
- Public workers (dev-team, content-team, qa) are company-agnostic — inherit active company from invocation context
- All private workers declare `company:` in worker.yaml and registry.yaml

## Infrastructure-First

When work implies new infrastructure, scaffold it BEFORE doing the work:

| Signal | Action |
|--------|--------|
| New company | `/newcompany {slug}` — creates dir, manifest, knowledge repo, qmd collection |
| New worker needed | `/newworker` — scaffolds worker.yaml, auto-registers in registry + manifest |
| New knowledge base | Create repo in `repos/{pub|priv}/knowledge-{name}` → symlink → add to `modules/modules.yaml` |
| New project | `/prd` — creates `projects/{name}/` with prd.json + README |
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

Public: frontend-designer, qa-tester, security-scanner + dev-team (16) + content-team (5). Private: cfo-{company}, {company}-analyst, cmo-{company}, cmo-{company}, x-{your-handle}, invoices. Full list: `knowledge/public/hq-core/quick-reference.md` or `workers/registry.yaml`.

**Worker-first rule:** Before specialized tasks (design, content writing, security, data analysis, deployment), check `workers/registry.yaml` for a matching worker. Use `/run {worker} {skill}` — workers carry domain instructions + learned rules. Only work directly if no suitable worker exists.

## Commands

22 commands in `.claude/commands/`. Company/niche commands moved to repo-level or workers. Full catalog: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Bases

Public: Ralph, workers, hq-core, dev-team, design-styles, projects, loom, ai-security-framework. Private: linear. Company-level: each at `companies/{co}/knowledge/`. Full list: `knowledge/public/hq-core/quick-reference.md`

## Knowledge Repos

Every knowledge folder is its own git repo, symlinked into HQ. This enables independent versioning, sharing, and publishing per knowledge base.

**Convention:** Repos live in `repos/public/` or `repos/private/`. Symlinks in `knowledge/` and `companies/*/knowledge` point to them. The symlinks are tracked by HQ git; the repo contents are gitignored.

**Reading/searching:** Transparent. `qmd`, `Glob`, `Grep`, `Read` all follow symlinks.

**Committing knowledge changes:** Changes show in `git status` of the *target repo* (not HQ). To commit:
1. `cd` to the symlink target (e.g. `repos/public/knowledge-ralph/`)
2. `git add`, `git commit`, `git push` in that repo

**Repo inventory:** See `knowledge/public/hq-core/quick-reference.md`

**Adding new knowledge:** Create repo in `repos/{public|private}/knowledge-{name}`, symlink into the appropriate knowledge path, add to `modules/modules.yaml`.

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
| Find files by path pattern | `Glob` with scoped `path:` | `Glob pattern="*/prd.json" path="projects/"` |
| Exact pattern match in code | `Grep` (works from HQ root) | `import.*AuthService` with `glob: "*.ts"` |
| Validate structured files | `grep` in Bash | Checking YAML fields, git branch filtering |

**Prefer qmd for codebase exploration.** Use Grep for exact pattern matching. Commands/skills scanning HQ must use `qmd vsearch` or `qmd search`, not Grep.

**`.ignore` file protects Grep** — HQ has a `.ignore` (ripgrep ignore) that blocks `repos/`, `node_modules/`, `**/.git/`. Grep from HQ root is safe. Glob from HQ root still times out — always pass a scoped `path:` to Glob.

**Glob rules:**
- ALWAYS pass `path:` scoped to a subdirectory (`projects/`, `workers/`, `workspace/`)
- NEVER Glob from HQ root — `.ignore` does NOT protect Glob (only Grep)
- Parallel Glob calls: if one times out, ALL sibling tool calls in the same message die ("Sibling tool call errored")

**When in doubt:** `qmd search "project name"` finds files by topic without any timeout risk

## Learned Rules

<!-- Max 10. Worker-scoped rules go in worker.yaml, not here. -->
<!-- Auto-managed by /learn. Manual: /remember -->

- **qmd collections**: hq, {product}, {company-1}, {company-2}, {company-3}, personal, {company-6}. Use `-c {co}` to scope
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

## Learning System

Learnings are rules injected directly into the files they govern:
- Worker rules → `worker.yaml` `instructions:` block
- Command rules → command `.md` `## Rules` section
- Knowledge rules → relevant knowledge file (commit to that file's knowledge repo after injection)
- Global rules → this file `## Learned Rules`

- `/learn` captures and classifies learnings automatically after task execution
- `/remember` delegates to `/learn` — user corrections always promote to Tier 1

Event log: `workspace/learnings/*.json` (append-only, for analysis/dedup).

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
