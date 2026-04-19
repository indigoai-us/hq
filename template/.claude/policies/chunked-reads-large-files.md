---
id: chunked-reads-large-files
title: Chunked Reads for Large Files
scope: global
trigger: before reading files over 500 lines
enforcement: soft
version: 1
created: 2026-03-31
source: brainstorm-session
---

## Rule

For files over 500 LOC, use the `offset` and `limit` parameters to read in sequential chunks. Never assume a single Read captured the complete file — the Read tool defaults to 2,000 lines maximum.

When editing a section of a large file:
1. First read the target section using offset/limit
2. Make the edit
3. Read back the edited section to verify

When doing codebase-wide analysis on a large file, read it in ~500-line chunks to ensure full coverage.

