---
title: "All hooks belong in settings.json, not settings.local.json"
category: ghq-core
tags: ["hooks", "claude-code"]
source: conversation
confidence: 0.9
created_at: 2026-03-19T00:00:00Z
updated_at: 2026-03-19T00:00:00Z
---

Claude Code hooks should be defined in `.claude/settings.json` (checked into the repo) rather than `.claude/settings.local.json` (user-local, gitignored). This ensures hooks are portable across machines and sessions. `settings.local.json` should only contain permissions and user-specific overrides. When multiple hook events need the same behavior (e.g. PreCompact and Stop both triggering learning capture), use a single shared script rather than duplicating.
