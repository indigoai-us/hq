---
id: paper-text-width
title: Paper MCP — always set explicit width on Text nodes
scope: tool
trigger: mcp__paper__write_html
enforcement: soft
created: 2026-03-19
source: {your-project}/US-001 design session
---

## Rule

When writing HTML via Paper MCP (`write_html`), always set an explicit `width` property on Text nodes (e.g. `width: 260px; text-align: center`). Without explicit width, Paper breaks words mid-character (e.g. "OPTIONAL" → "OPTIONA L", "Home" → "Hom e").

Also set `flexShrink: 0` on parent frames of text that must not compress (chips, buttons, labels).

