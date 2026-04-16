---
id: vercel-git-disconnect-cwd
title: Always cd to target repo before vercel git disconnect
scope: global
trigger: before running vercel git disconnect or vercel link
enforcement: hard
created: 2026-03-11
---

## Rule

NEVER run `vercel git disconnect` or `vercel link` from HQ root or any directory other than the target repo. These commands operate on the `.vercel/project.json` in the current working directory — running from the wrong dir will disconnect/link the wrong Vercel project.

Always: `cd {repo-path} && vercel git disconnect ...`

