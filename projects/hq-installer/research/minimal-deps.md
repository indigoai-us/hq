# Minimal Dependencies for my-hq

**Research Date:** 2026-01-30
**Task:** US-001 - Identify minimal dependency set

## Summary

For a **non-technical user** to use my-hq with basic functionality, only **2 dependencies** are required:

| Dependency | Required | Version | Purpose |
|------------|----------|---------|---------|
| Node.js | **Yes** | 18.0.0+ | Runtime for Claude CLI and HQ CLI |
| Claude CLI | **Yes** | Latest | AI agent execution |

## Detailed Analysis

### 1. Node.js - REQUIRED

**Why Required:**
- Claude CLI (`@anthropic-ai/claude-code`) is an npm package requiring Node.js
- HQ CLI (`modules/cli/package.json`) specifies `"engines": { "node": ">=18.0.0" }`
- All npm-based tooling depends on Node.js runtime

**Minimum Version:** 18.0.0 (LTS)

**Evidence:**
```json
// From modules/cli/package.json
"engines": {
  "node": ">=18.0.0"
}
```

### 2. Claude CLI - REQUIRED

**Why Required:**
- Core execution engine for all HQ slash commands
- Pure Ralph loop spawns Claude sessions via `claude` CLI command
- No alternative execution path exists

**Installation:** `npm install -g @anthropic-ai/claude-code`

**Evidence:**
- `.claude/scripts/pure-ralph-loop.ps1` invokes: `claude -p --permission-mode bypassPermissions`
- `.claude/commands/setup.md` lists Claude CLI as required

---

## Optional Dependencies

### 3. Git - OPTIONAL (but recommended for code workers)

**Features Requiring Git:**
- Pure Ralph loop branch management (`git checkout`, `git branch`)
- Design iteration workflow (`/design-iterate` command)
- Checkpointing and session state (`/checkpoint` captures git status)
- Worker execution context (current commit, dirty state)
- PR creation workflow (pushing to remote)

**Features NOT Requiring Git:**
- Basic slash commands (`/search`, `/cleanup`, `/setup`)
- Content workflows (`/contentidea`, `/suggestposts`)
- Worker definitions and knowledge bases (read-only)
- Manual file operations

**Recommendation:** Include for code-focused users, skip for content-only users.

### 4. GitHub CLI (gh) - OPTIONAL

**Features Requiring gh:**
- Automatic PR creation after Pure Ralph completion
- GitHub issue integration
- Code review workflows

**Graceful Degradation:**
```powershell
# From pure-ralph-loop.ps1
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghAvailable) {
    Write-Host "gh CLI not available - manual PR required"
}
```

**Recommendation:** Not required for installer. Pure Ralph works without it (manual PR creation).

### 5. qmd - OPTIONAL

**Features Requiring qmd:**
- Semantic search across HQ (`/search` command)
- Knowledge base indexing and embedding
- PRD discovery workflow

**Graceful Degradation:**
```bash
# From /search command
"qmd unavailable, falling back to grep"
```

**Recommendation:** Not required for core functionality. Falls back to grep-based search.

### 6. pnpm/npm - OPTIONAL (for development)

**Features Requiring pnpm/npm:**
- Building HQ CLI from source (`modules/cli/`)
- Running project typechecks and builds
- Installing worker-specific dependencies

**Recommendation:** Not required for end users. Only needed if developing/extending HQ.

---

## Installer Strategy

### Tier 1: Essential (Installer MUST include)
1. **Node.js 18+** - Embed or download during install
2. **Claude CLI** - Install via `npm install -g @anthropic-ai/claude-code`

### Tier 2: Recommended (Installer SHOULD offer)
3. **Git** - Optional checkbox, enabled by default for "developer" preset
4. **GitHub CLI** - Optional checkbox, only with Git

### Tier 3: Power User (Installer CAN mention)
5. **qmd** - Mention in post-install docs
6. **pnpm** - Mention in post-install docs for developers

---

## Authentication Requirements

| Dependency | Auth Method |
|------------|-------------|
| Claude CLI | Browser OAuth (claude.ai login) or API key |
| GitHub CLI | Browser OAuth (github.com login) |
| qmd | None (local tool) |

**Installer Flow:**
1. Install Node.js (silent)
2. Install Claude CLI (npm, silent)
3. Open browser for Claude OAuth (or allow skip for API key later)
4. Optionally install Git + gh CLI
5. Download/extract my-hq template
6. Launch setup wizard

---

## Excluded Dependencies

Per PRD metadata, these are explicitly NOT required:

| Dependency | Reason for Exclusion |
|------------|---------------------|
| Git | my-hq works without version control |
| GitHub CLI | Graceful fallback exists |

This aligns with the goal: **non-technical users, no terminal commands, under 5 minutes**.
