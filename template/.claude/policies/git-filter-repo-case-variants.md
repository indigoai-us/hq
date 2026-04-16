---
id: git-filter-repo-case-variants
title: git-filter-repo requires explicit case variants
scope: command
trigger: /publish-kit, git history scrub
enforcement: hard
---

## Rule

When using `git filter-repo --replace-text`, add explicit replacement rules for EVERY case variant of each term (lowercase, Capitalized, UPPERCASE). The tool does exact literal matching — `{team-member}` does NOT match `{team-member}` or `{TEAM-MEMBER}`.

## How to apply

Build replacement files with all three cases for every denylist term: `literal:term==>`, `literal:Term==>`, `literal:TERM==>`.
