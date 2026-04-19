---
id: publish-kit-source-is-strict-allowlist
title: publish-kit source scope is a strict allowlist — never traverse owner-private dirs
scope: command
command: publish-kit
trigger: when /publish-kit or /stage-kit resolves its source set, or when the publish walker enumerates paths to sync into repos/public/hq/template/
enforcement: hard
public: true
version: 1
created: 2026-04-18
updated: 2026-04-18
source: user-correction
---

## Rule

publish-kit MUST treat its source scope as a **strict allowlist** of HQ-core paths. The walker never traverses owner-private top-level directories. The target directory `repos/public/hq/template/` is **rebuilt from scratch** on every full release (see Stage 0 in `.claude/commands/publish-kit.md`) — no overlay-without-delete, no drift across releases.

### In-scope (allowlist)

The walker MAY include only these top-level source paths:

**Core HQ infrastructure:**
- `.claude/commands/*.md` (filter: `visibility: public`)
- `.claude/policies/*.md` (filter: `scope: global` or `scope: command`, with opt-in `public: true` for globals; apply Policy Context Stripping)
- `.claude/skills/*/` (filter: has `SKILL.md`, not a symlink, not `g-*`)
- `.claude/hooks/*.sh`
- `.claude/scripts/*.sh`
- `.claude/CLAUDE.md`
- `.claude/settings.json` (filter: `outputStyle` + new `env` keys; permissions/hooks stay target-specific)
- `.claude/scrub-denylist.yaml` (thin defensive form)
- `workers/public/**` (entire tree; filter `registry.yaml` to `visibility: public` only)
- `knowledge/public/**` (entire tree)
- `modules/modules.yaml` (scrub company-specific entries)
- `scripts/*.sh` (named allowlist — see publish-kit.md "What to Sync" table)
- `prompts/` (entire dir — prompt templates for orchestrator)
- `USER-GUIDE.md`
- `.ignore`

**Named single-file remaps:**
- `workspace/orchestrator/monitor-project.sh` → `.claude/scripts/monitor-project.sh` (only file under `workspace/` that is ever published)

**Starter scaffolds (intentional, user-approved 2026-04-18):**
- `starter-projects/` (entire dir — bootstrap templates for consumers)
- `companies/_template/` (scaffold dir only; `companies/manifest.yaml` ships as a single-entry `personal` starter)
- `contacts/_example.yaml` (example contact schema)
- `prompts/pure-ralph-base.md` (covered by `prompts/` above)
- `tools/queue-curiosity.ts`, `tools/reindex.ts`, `tools/tag-inventory.sh` (kit-level tools)
- `settings/orchestrator.yaml`, `settings/pure-ralph.json` (default starter configs; scrub before ship)
- Empty-dir `.gitkeep` scaffolds under `workspace/{drafts,checkpoints,scratch,threads,learnings,orchestrator,reports}/`, `social-content/{images,drafts/x,drafts/linkedin}/`, `data/journal/`, `projects/`, `repos/{private,public}/`

### Never-traverse (denylist — hard block)

The walker MUST NEVER read from, copy from, or emit any file under:

- `companies/*/` except the explicit starter carve-out `companies/_template/` and a minimal `companies/manifest.yaml` (personal starter only)
- `projects/*/` except intentionally-named starter projects published through `starter-projects/` (real owner PRDs under `projects/` are **never** shipped)
- `workspace/*/` except the named single-file remap `workspace/orchestrator/monitor-project.sh` (no other files from `workspace/` may ship — no reports, content-ideas, ralph-test, insights, etc.)
- `social-content/drafts/*.md`, `social-content/drafts/**/*.png`, `social-content/images/*` (only `.gitkeep` scaffolds of these dirs may ship)
- `repos/private/**`, `repos/public/**` (only the `.gitkeep`-scaffolded empty dirs may ship)
- `agents-profile.md`, `agents-companies.md`, `INDEX.md` (owner-scoped)
- `.obsidian/**` (owner Obsidian vault state — always leak)
- `.claude/settings.local.json` (owner-local overrides)
- `.cache_ggshield`, `.DS_Store`, any other dotcache or OS cruft

### Target directory discipline (rebuild-from-scratch)

Stage 0 of `/publish-kit` (full release mode) MUST:

1. Assert `$TEMPLATE_DIR = repos/public/hq/template` is within a git repo
2. `rm -rf "$TEMPLATE_DIR"` then `mkdir -p "$TEMPLATE_DIR"` — blank slate
3. Emit every file purely from the allowlist walk
4. Let the resulting git diff against the prior HEAD reveal adds/updates/deletes naturally (no need to track deletions separately)

This ensures the target tree is a **pure function** of the source allowlist. Drift becomes impossible by construction: any file in the target that isn't emitted by the walker simply doesn't survive to the next release.

**Patch mode (`--item ...`)** still operates file-by-file and may overlay into the target without the rebuild; patch mode inherits the allowlist but skips Stage 0.

