---
id: hq-cmd-publish-kit-narrative-context-stripping
title: Publish-Kit Must Strip Narrative Context (Not Just Tokens)
scope: command
trigger: /publish-kit policy sync (full release or patch mode)
enforcement: soft
version: 1
created: 2026-04-13
updated: 2026-04-13
source: session-learning
---

## Rule

After denylist token scrubbing (phase 1 replace + phase 2 restore), apply **structural context stripping** to every synced policy file before verification. Two scrub layers compose:

1. **Token-level (denylist):** replaces known terms — company names, person names, domains, repos → placeholders. Handles WHAT is mentioned.
2. **Narrative-level (context strip):** detects incident markers (date patterns, dollar amounts, session references, scrubbed-but-specific placeholders) and removes entire sections (`## Rationale`, `learned_from:` frontmatter). Handles HOW it's described.

Both layers are required. Token scrubbing alone leaves incident narratives intact — "a $10k/mo client ({company} Brands Group)" passes denylist verification but leaks business context.

