---
id: hq-glob-scoped-path
title: Always Scope Glob with Path Parameter
scope: global
trigger: when using the Glob tool
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

ALWAYS pass `path:` to Glob scoped to a subdirectory (e.g. `projects/`, `workers/`). Glob from HQ root times out (`.ignore` doesn't protect it). Grep from HQ root is safe (`.ignore` blocks repos/node_modules). Parallel tool failures cascade — one timeout kills all siblings.

