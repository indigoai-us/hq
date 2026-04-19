---
id: pre-refactor-hygiene
title: Pre-Refactor Dead Code Cleanup
scope: global
trigger: before multi-file structural refactors
enforcement: soft
version: 1
created: 2026-03-31
source: brainstorm-session
---

## Rule

Before structural refactors on files >300 LOC, first remove dead code in a separate commit:
1. Unused imports
2. Unused/dead exports
3. Unused props and parameters
4. Debug logs (`console.log`, `console.debug`)
5. Commented-out code blocks
6. Orphaned type definitions

Commit this cleanup separately before starting the real refactor. This preserves token budget — dead code accelerates context compaction without contributing to the task.

After any refactor touching >5 files, run the project's dead code scanner (e.g. `bun run deadcode` in {PRODUCT}) on affected files to catch newly orphaned exports.

