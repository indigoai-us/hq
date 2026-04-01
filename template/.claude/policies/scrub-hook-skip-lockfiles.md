---
id: scrub-hook-skip-lockfiles
title: Pre-commit scrub hook must skip lock files
scope: command
trigger: /publish-kit, pre-commit hook
enforcement: hard
---

## Rule

The pre-commit scrub-check hook MUST skip `package-lock.json` and `bun.lockb` files. SHA-512 integrity hashes in these files contain random base64 strings that coincidentally match short denylist terms (e.g. `vsAMBMER` matches `{company}` pattern).

## Rationale

During v9.0.0 publish, 11 false positives in `package-lock.json` files blocked the commit. All were npm integrity hashes containing letter sequences that matched denylist company names as substrings.

## How to apply

Hook skip list includes: `scrub-denylist`, `pre-commit-scrub-check`, `CHANGELOG.md`, `package-lock.json`, `bun.lockb`.
