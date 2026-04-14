---
id: hook-macos-case-paths
title: Hooks must use case-insensitive path matching on macOS
scope: global
trigger: writing hooks that check file paths
enforcement: soft
version: 1
created: 2026-03-18
updated: 2026-03-18
source: debugging
---

## Rule

When writing bash hooks that compare file paths (e.g. checking if a path is inside `repos/`), always use case-insensitive matching or pattern-based checks (e.g. `*/repos/private/*`) instead of prefix matching against a hardcoded `HQ_ROOT`.

macOS is case-insensitive but `pwd` may return a different casing than the hardcoded path. Example: `pwd` returns `~/Documents/hq` but `HQ_ROOT` is set to `~/Documents/HQ` — string comparison fails silently.

**Safe pattern:** lowercase both sides with `tr '[:upper:]' '[:lower:]'` before comparing, or match on a case-stable segment like `*/repos/private/*`.

