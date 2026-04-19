---
id: hq-cmd-stage-kit-settings-json-direct-edit
title: stage-kit cannot stage .claude/settings.json — edit the template directly
scope: command
trigger: When a user asks `/stage-kit` to ship changes to `.claude/settings.json` or `.claude/settings.local.json`
enforcement: soft
public: true
version: 1
created: 2026-04-17
updated: 2026-04-17
source: user-correction
---

## Rule

`/stage-kit`'s Path Remapping table has no row for `.claude/settings.json` or `.claude/settings.local.json`. Attempting `/stage-kit --item .claude/settings.json` will reject at step S1 (path validation) because there is no source→destination mapping.

When the target change is settings-related:

1. Edit `repos/public/hq/template/.claude/settings.json` **directly** with Edit/Write — it is not core.yaml-locked at the template location.
2. Run the scrub-verification checks from stage-kit S3/S4/S6 manually against the edited destination file:
   - Denylist pattern grep
   - `{your-name}` literal grep
   - `ggshield secret scan path` (if installed)
3. Commit inside `repos/public/hq/` (the template lives in a nested git repo — HQ root `git status` will not see the change).

`/publish-kit` will pick up the edited template on the next release.

