# Migration Guide

Instructions for updating existing HQ installations to new versions.

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
