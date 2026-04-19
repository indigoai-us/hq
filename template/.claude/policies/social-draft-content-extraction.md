---
id: hq-social-draft-content-extraction
title: Extract Post Body from Social Draft Markdown Files
scope: global
trigger: When reading workspace/social-drafts/**/*.md or companies/*/data/social-drafts/**/*.md to post content
enforcement: hard
version: 1
created: 2026-02-26
updated: 2026-02-26
source: task-completion
---

## Rule

Social draft files use this format:
```
# Title line

**Status:** Draft
**Type:** ...
**Created:** ...

---

[actual post content]
```

To extract clean post body, split on `\n---\n` (with newlines on both sides) and take `parts[1].strip()`. Do NOT use `split('---', 2)` and `parts[2]` — most files have only ONE `---` separator, making `parts[2]` unavailable and causing fallback to full file text (which includes metadata headers).

Python one-liner:
```python
parts = re.split(r'\n---+\n', text, maxsplit=1)
content = parts[1].strip() if len(parts) == 2 else text.strip()
```

