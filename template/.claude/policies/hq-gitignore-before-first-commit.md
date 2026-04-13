---
id: hq-gitignore-before-first-commit
title: Create .gitignore before first commit in new projects
scope: global
trigger: scaffolding a new project with git init
enforcement: hard
version: 1
created: 2026-02-23
updated: 2026-02-23
source: back-pressure-failure
---

## Rule

ALWAYS create `.gitignore` (with `node_modules/`, `.next/`, `.vercel/`, build artifacts) BEFORE running `git init && git add -A && git commit`. If build artifacts enter git history, GitHub rejects pushes for large files and the only fix is nuking `.git` and reinitializing.

## Rationale

During {product}-competitive-intel scaffolding, `npm install` + `npm run build` ran before git init. The first commit captured `node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node` (100.35 MB), exceeding GitHub's 100 MB limit. Even after removing with `git rm --cached`, the object remained in history. Required full `.git` directory deletion and reinitialization to push.
