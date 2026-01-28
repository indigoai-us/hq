---
description: /publish-kit
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash, AskUserQuestion
argument-hint: [version]
---

# /publish-kit

Sync your HQ → hq-starter-kit with PII scrubbing, changelog, and migration guide.

## Usage
```
/publish-kit [version]    # e.g. /publish-kit 2.1.0
```

## Paths
- **Source:** Your HQ (`~/Documents/HQ/`)
- **Target:** `repos/public/hq-starter-kit/`

## What to Sync

| Category | Source | Notes |
|----------|--------|-------|
| Skills | `.claude/commands/*.md` where `visibility: public` | Filter by frontmatter |
| Workers | `workers/public/` | Entire public dir |
| Knowledge | `knowledge/public/` | Entire public dir |
| Config | `.claude/CLAUDE.md` | Scrubbed version |
| Registry | `workers/registry.yaml` | Filter to `visibility: public` entries only |

Everything else is excluded by default — only public/ dirs and public-visibility commands are synced.

## PII Scrubbing Rules

Apply these replacements to all synced files:

```
/Users/{username}/       → ~/
{your-real-name}         → {your-name}
{your-company-1}         → {company}
{your-company-2}         → {company}
@{company}.com           → @example.com
sk-[a-zA-Z0-9]{20,}      → {api-key}
ghp_[a-zA-Z0-9]{20,}     → {github-token}
Bearer [a-zA-Z0-9]{20,}  → Bearer {token}
xoxb-[a-zA-Z0-9-]+       → {slack-token}
```

## Execution Steps

### 1. Version Check
If no version provided, prompt user:
```
What version? (current: v2.0.0, suggest: 2.1.0)
```

### 2. Diff Analysis
Compare HQ vs starter-kit:

```bash
# Skills diff
diff -rq .claude/commands/ repos/public/hq-starter-kit/.claude/commands/ 2>/dev/null || true

# Workers diff
diff -rq workers/public/dev-team/ repos/public/hq-starter-kit/workers/public/dev-team/ 2>/dev/null || true
```

Present changes:
```
## Changes for v2.1.0

### Added
- /generateimage - Image generation
- /post-now - Post to X/LinkedIn immediately
- /preview-post - Preview drafts with images

### Modified
- /contentidea - Enhanced workflow
- /scheduleposts - Updated timing logic

### Removed
- (none)
```

### 3. PII Scan
For each file to sync:
1. Read content
2. Check for PII patterns
3. If PII found, show user the matches and proposed scrubs
4. Get approval before proceeding

```
## PII Found in .claude/commands/contentidea.md

Line 42: "/Users/{username}/Documents/HQ"
  → Scrub to: "~/Documents/HQ"

Line 78: "{your-real-name}"
  → Scrub to: "{your-name}"

[Approve scrubs?] (y/n)
```

### 4. Copy Files
For each approved file:
1. Read from HQ
2. Apply PII scrubbing
3. Write to starter-kit

Preserve starter-kit-only files (don't delete them).

### 5. Generate Changelog Entry

Append to `repos/public/hq-starter-kit/CHANGELOG.md`:

```markdown
## [2.1.0] - 2026-01-26

### Added
- `/generateimage` - Generate images via image generation tool
- `/post-now` - Post approved content to X or LinkedIn immediately
- `/preview-post` - Preview social drafts, select images, approve for posting

### Changed
- `/contentidea` - Enhanced multi-platform content workflow
- `/scheduleposts` - Improved timing and context awareness

### Fixed
- (none)
```

### 6. Generate Migration Guide

If breaking changes, append to `repos/public/hq-starter-kit/MIGRATION.md`:

```markdown
## Migrating to v2.1.0

### New Skills
Copy these files from starter-kit to your HQ:
- `.claude/commands/generateimage.md`
- `.claude/commands/post-now.md`
- `.claude/commands/preview-post.md`

### Updated Skills
Review and merge changes to:
- `.claude/commands/contentidea.md`
- `.claude/commands/scheduleposts.md`

### Breaking Changes
- (none this release)
```

### 7. Commit and Push

```bash
cd repos/public/hq-starter-kit
git add -A
git commit -m "release: v2.1.0

- Add /generateimage, /post-now, /preview-post
- Update /contentidea, /scheduleposts
"
git tag v2.1.0
git push origin main --tags
```

### 8. Output

```
## Published v2.1.0

Changes pushed to: https://github.com/{your-username}/hq-starter-kit

Create release: https://github.com/{your-username}/hq-starter-kit/releases/new?tag=v2.1.0

### Files Updated
- .claude/commands/generateimage.md (new)
- .claude/commands/post-now.md (new)
- .claude/commands/preview-post.md (new)
- .claude/commands/contentidea.md (modified)
- .claude/commands/scheduleposts.md (modified)
- CHANGELOG.md (updated)
- MIGRATION.md (updated)
```

## Safeguards

1. **Always diff first** - Show what will change before doing anything
2. **PII review required** - User must approve scrubbed content
3. **No deletions** - Only add/update, never delete starter-kit files
4. **Backup on conflict** - If file exists in both and differs, show diff first
