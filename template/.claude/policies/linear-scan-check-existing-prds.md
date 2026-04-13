---
id: linear-scan-check-existing-prds
title: Linear scan must check existing PRDs before recommending new ones
scope: command
trigger: /check-linear-voyage, voyage-linear-scan scheduled task
enforcement: hard
---

## Rule

Before recommending a new PRD from a Linear scan, always check `companies/{company}/projects/` for existing PRDs that cover the same Linear issues. Use `ls companies/{company}/projects/` and read matching `prd.json` files to check `linearIssueId` fields against scan results.
