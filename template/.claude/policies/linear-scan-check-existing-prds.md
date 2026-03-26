---
id: linear-scan-check-existing-prds
title: Linear scan must check existing PRDs before recommending new ones
scope: command
trigger: /{check-linear}, {product}-linear-scan scheduled task
enforcement: hard
---

## Rule

Before recommending a new PRD from a Linear scan, always check `companies/{company}/projects/` for existing PRDs that cover the same Linear issues. Use `ls companies/{company}/projects/` and read matching `prd.json` files to check `linearIssueId` fields against scan results.

## Rationale

**Why:** The 2026-03-18 scheduled scan recommended creating 6 PRDs. Exploration revealed 5 of 6 already existed — some fully executed (`passes: true`), some ready to run. Creating duplicate PRDs would have wasted time and created confusion.

**How to apply:** In any Linear scan workflow, after collecting open issues, cross-reference against existing PRDs before generating recommendations. Categorize items as: needs new PRD, has PRD ready to execute, has PRD already completed (needs Linear state cleanup).
