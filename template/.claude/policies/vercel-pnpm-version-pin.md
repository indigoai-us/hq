---
id: hq-vercel-pnpm-version-pin
title: Pin pnpm version in packageManager for Vercel deploys
scope: global
trigger: deploying any pnpm project to Vercel
enforcement: hard
version: 1
created: 2026-03-11
updated: 2026-03-11
source: back-pressure-failure
---

## Rule

ALWAYS add `"packageManager": "pnpm@X.Y.Z"` to `package.json` for any pnpm project deployed to Vercel. Without this field, Vercel auto-selects pnpm version "based on project creation date" — which may pick pnpm 10.x even when the lockfile is v9.0 format. This causes `--frozen-lockfile` to fail with specifier mismatch errors.

After adding new dependencies to `package.json`, ALWAYS run `pnpm install` locally to update the lockfile before pushing. Vercel CI uses `--frozen-lockfile` by default, so any mismatch between `package.json` specifiers and lockfile specifiers will fail the build.

