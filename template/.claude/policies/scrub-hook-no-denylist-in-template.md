---
id: scrub-hook-no-denylist-in-template
title: Never copy scrub-denylist.yaml to template dir
scope: command
trigger: /publish-kit, pre-commit hook
enforcement: hard
version: 2
created: 2026-04-01
updated: 2026-04-02
source: back-pressure-failure
---

## Rule

NEVER copy `.claude/scrub-denylist.yaml` to the template dir (`repos/public/hq/template/`) during `/publish-kit`. The denylist contains real private terms in HQ but gets PII-scrubbed during sync, producing keys like `{company}: "{company}"`. When the pre-commit hook reads this scrubbed denylist, it extracts `{company}` as a search term and matches it against every `{company}` placeholder in the codebase — a self-referential false positive that blocks all commits.

The template's pre-commit hook must gracefully skip when no denylist is present (return empty pattern). Users create their own denylist with their real terms.

## Rationale

During v10.1.0 publish, the scrubbed denylist caused the pre-commit hook to flag every file containing `{company}` placeholders (which is nearly every file). Fixed by: (1) removing scrub-denylist.yaml from the sync target, (2) updating hook fallback to echo empty string and skip when no denylist found.
