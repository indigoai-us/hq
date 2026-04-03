---
id: publish-kit-pii-verification
title: Verify PII scrub completeness before opening publish-kit PR
scope: command
trigger: /publish-kit, publish-kit, template sync
enforcement: hard
created: 2026-04-02
source: pr-review
learned_from: "Stefan's review of PR #25 (release/v10.3.0) found 30+ PII leaks that passed through publish-kit scrub"
---

## Rule

After running the scrub pass in `/publish-kit` and before opening the PR:

1. **Run verification grep** against ALL denylist terms:
   ```bash
   grep -riE "Corey|corey-epstein|coreyepstein|Empire OS|Curious Minds|34528|34531" template/ .claude/CLAUDE.md --include='*.md' --include='*.yaml'
   ```
   This must return **0 results**. If any match, fix before proceeding.

2. **Check scrub-denylist.yaml completeness** — every person name, product name, and account ID referenced in HQ must have an entry. Run the denylist patterns against `template/` as a second pass.

3. **Scan knowledge files separately** — knowledge files in `template/knowledge/` are frequently missed by the scrub because they contain documentation examples (code blocks, tables, file paths) where names appear in non-obvious contexts. Grep knowledge files with `-rn` to catch table cells, code comments, and YAML values.

4. **Account IDs are numeric** — they won't match word-based scrub patterns. Explicitly check for any 5-digit numbers that match known Post-Bridge account IDs.

5. **Linter interaction** — the pre-commit linter does partial scrubbing that can conflict with manual edits. After any linter runs, re-verify account IDs and placeholder consistency (linter may revert `{account-id}` back to the raw number, or turn `{product}` into `{Company}`).

## Rationale

PR #25 (v10.3.0) passed through publish-kit with 30+ PII instances: person names (Corey, corey-epstein) in 15 knowledge files, product names (Empire OS, Curious Minds) in 7 policy rationales, account IDs (34528, 34531) in 3 policies + 1 worker template, and an email address. The scrub-denylist.yaml was missing person entries and product entries. Stefan caught these in review. This gate prevents PII from reaching the public PR.
