---
id: hq-qa-screenshot-isolation
title: Sub-agent screenshot isolation for multi-page audits
scope: global
trigger: browser-based QA audits, site audits, page walkthroughs, design review, g-qa, g-qa-only, g-design-review
enforcement: hard
version: 1
created: 2026-03-24
updated: 2026-03-24
source: back-pressure-failure
---

## Rule

When auditing 5+ pages, ALL screenshot viewing MUST go through sub-agents to avoid the Claude API many-image 2000px dimension limit.

### Pattern: sub-agent screenshot isolation

1. Parent takes screenshot to file: `agent-browser screenshot /tmp/audit-{page}.jpg --full`
2. Parent runs resize safety net: `bash scripts/resize-screenshot.sh /tmp/audit-{page}.jpg`
3. Parent spawns Explore agent with prompt: `Read /tmp/audit-{page}.jpg and analyze for [specific criteria]. Return text findings only.`
4. Agent returns text report — parent never loads the image
5. Parent aggregates text findings across pages

### Tool-specific rules

| Tool | Multi-page audit approach |
|------|--------------------------|
| agent-browser | Screenshot to file → resize → sub-agent Read + analyze |
| MCP preview (`preview_screenshot`) | AVOID — returns image directly into parent context. Use `preview_snapshot` + `preview_inspect` instead (text-based, zero image overhead) |
| Chrome MCP (`computer screenshot`) | AVOID — returns image directly. Use `read_page` / `find` instead |
| MCP preview (single-page check) | OK if total session images < 15 |

### Screenshot budget

- Max 2 screenshots per page (desktop + mobile)
- Set env: `AGENT_BROWSER_SCREENSHOT_FORMAT=jpeg AGENT_BROWSER_SCREENSHOT_QUALITY=80`
- After every `agent-browser screenshot`: run `bash scripts/resize-screenshot.sh <path>`

### Exceptions

- Single-page checks (< 5 pages): direct screenshot viewing in parent is fine
- Debugging a specific visual bug: direct viewing OK if session image count is low

## Rationale

Claude API enforces 2000px max dimension per image when ~20+ images accumulate in conversation ("many-image mode"). Sub-agents have isolated context windows — each sees only 1-2 images, never triggering the limit. The parent session accumulates zero images, allowing unlimited page audits.
