---
id: hq-orchestrator-lockfile-sync
title: Run npm install in orchestrator completion flow
scope: command
trigger: run-project completion flow, after all stories pass
enforcement: hard
version: 1
created: 2026-03-19
updated: 2026-03-19
source: back-pressure-failure
---

## Rule

After all stories complete in run-project.sh, run `npm install` (or equivalent package manager install) in the project repo and commit the updated lockfile before the completion flow finishes. Sub-agents add dependencies to package.json during story execution but don't always regenerate the lockfile. Vercel and CI do clean installs from the lockfile — stale lockfiles cause "Module not found" build failures.

## Rationale

{company}-workspace-cloud: 23 stories completed, all 4 Vercel deploys failed with "Module not found" for bcryptjs, pg, stripe, recharts, @anthropic-ai/sdk, qrcode, otpauth. Root cause: sub-agents running `claude -p` added packages to package.json but package-lock.json was never regenerated. Local dev worked because node_modules was cached. Required manual `npm install` + commit to unblock deploys.
