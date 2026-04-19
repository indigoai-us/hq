---
id: bun-overrides-devtool-conflict
title: Bun Overrides Apply to DevTools Internal Dependencies
scope: repo
trigger: when adding devDependencies that have their own dependency on an overridden package
enforcement: soft
version: 1
created: 2026-03-31
source: session-learning
---

## Rule

Bun's `overrides` in package.json apply project-wide — including to devtools' internal dependencies. When a devtool (e.g. knip) requires a different version of an overridden package (e.g. zod), the override catches it and causes runtime failures.

Before adding new devDependencies, check if they depend on any package listed in the project's `overrides` block. If there's a version conflict, either:
1. Use an alternative tool without that dependency
2. Run the tool via a separate package.json / workspace that doesn't inherit the override

Example: knip v5/v6 requires `zod/mini` (Zod v4.1+), but {PRODUCT} overrides zod to 3.25.76 (Zod v4 preview with different export paths). Result: `ERR_PACKAGE_PATH_NOT_EXPORTED`. Fix: use ts-unused-exports instead.

