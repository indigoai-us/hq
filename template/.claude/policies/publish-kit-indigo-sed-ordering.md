---
id: publish-kit-{company}-sed-ordering
title: Use denylist exceptions to preserve indigoai-us during scrubbing
scope: command
trigger: /publish-kit
enforcement: hard
created: 2026-04-02
updated: 2026-04-03
---

## Rule

The scrub function uses a **two-phase approach** driven by `.claude/scrub-denylist.yaml`:

1. **Replace phase**: Apply all company/product/person/domain/repo replacements (including `\bindigo\b` → `{company}`)
2. **Restore phase**: Read the `exceptions` section from the denylist and restore any corrupted terms (e.g. `indigoai-us` → `indigoai-us`)

The exceptions section in the denylist is the **single source of truth** for what to protect. Never hardcode restore passes in the scrub function — add entries to `exceptions:` instead.

After scrubbing, verify: `grep -ri 'indigoai-us' template/` — must return 0 results.

## Rationale

The `indigoai-us` GitHub org and npm scope must remain literal in the public template. A naive `s/{company}/{company}/g` corrupts it to `indigoai-us`. The exceptions-based restore is data-driven — new collisions are fixed by adding a denylist entry, not editing code. Validated during v10.3.0 and v10.4.0 publishes.
