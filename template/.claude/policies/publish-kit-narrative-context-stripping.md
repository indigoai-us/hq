---
id: hq-cmd-publish-kit-narrative-context-stripping
title: Publish-Kit Must Strip Narrative Context (Not Just Tokens)
scope: command
trigger: /publish-kit policy sync (full release or patch mode)
enforcement: soft
version: 2
created: 2026-04-13
updated: 2026-04-16
source: session-learning
---

## Rule

After denylist token scrubbing (phase 1 replace + phase 2 restore), apply **structural context stripping** to every synced policy file before verification. Two scrub layers compose:

1. **Token-level (denylist):** replaces known terms — company names, person names, domains, repos → placeholders. Handles WHAT is mentioned.
2. **Narrative-level (context strip):** detects incident markers (date patterns, dollar amounts, session references, scrubbed-but-specific placeholders) and removes entire sections (`## Rationale`, `learned_from:` frontmatter). Handles HOW it's described.

Both layers are required. Token scrubbing alone leaves incident narratives intact — "a $10k/mo client ({company} Brands Group)" passes denylist verification but leaks business context.

**Patch-release applicability:** structural context stripping is mandatory on every policy file copied to `template/.claude/policies/` — in both full-release mode AND patch mode. When a sibling session stages new policies into the target repo, re-run the strip pass on those staged files before committing. Never assume a staged/pre-populated policy has already been stripped. Verification: `grep -c '^## Rationale' template/.claude/policies/*.md` must return 0 across all non-example files before branch push.

