---
id: hq-core-protect-bypass-inline
title: Core Protection Bypass Requires Inline Env Var
scope: global
trigger: when editing locked core files (core.yaml locked list)
enforcement: hard
version: 1
created: 2026-04-12
updated: 2026-04-12
source: session-learning
---

## Rule

The `HQ_BYPASS_CORE_PROTECT=1` env var must be passed **inline** with the command that modifies the file (e.g., `HQ_BYPASS_CORE_PROTECT=1 sed -i '' '...' .claude/CLAUDE.md`). Setting it via `export` in a prior Bash tool call has no effect — each hook runs in its own subprocess spawned by the harness, not from prior shell sessions. The Edit tool cannot carry env vars at all; use Bash with `sed` or similar when bypassing core protection.

