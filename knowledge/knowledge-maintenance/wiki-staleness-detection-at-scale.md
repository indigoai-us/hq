---
title: "Wiki Staleness Detection at Scale"
category: knowledge-maintenance
tags: ["knowledge-management", "maintenance", "staleness", "community", "automation"]
source: https://en.wikipedia.org/wiki/Template:Update, https://en.wikipedia.org/wiki/Template:Update_after, https://wiki.archlinux.org/title/Template:Out_of_date, https://wiki.archlinux.org/title/Help:Procedures, https://www.researchgate.net/publication/303857127_Automatic_Detection_of_Outdated_Information_in_Wikipedia_Infoboxes, https://arxiv.org/abs/2508.03728
confidence: 0.82
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

How Wikipedia, Arch Wiki, and MDN detect and surface outdated content at scale — templates, community processes, and emerging automation.

## Core Pattern: Explicit Flagging via Templates

All three wikis converge on a **flagging-first** approach: editors mark pages rather than systems detecting staleness autonomously. Flags drain into maintenance categories, where contributors pick up the work.

| Wiki | Template | Behavior |
|------|----------|----------|
| Wikipedia | `{{Update}}` | Adds page to `Category:Wikipedia articles in need of updating` |
| Wikipedia | `{{Update after|YYYY-MM-DD}}` | Invisible until the date; then surfaces automatically — a bot fills in the date if left blank |
| Wikipedia | `{{Outdated as of|YYYY}}` | Marks content as outdated since a specific year |
| Arch Wiki | `{{Out of date}}` | Adds to `Category:Pages flagged with Template:Out of date`; tracked in maintenance stats |
| MDN | GitHub issues / PRs | No template system; staleness handled via issue tracker and contributor PRs |

## Wikipedia's Temporal Staleness Hooks

`{{Update after|2025-03-01}}` is Wikipedia's most automated mechanism:
- Invisible to readers until the trigger date
- On or after the date, the template renders a visible update banner
- Bots backfill the date if the editor left it blank
- Pages land in dated subcategories (e.g., `Category:Articles to be updated as of March 2025`)

This is essentially a **scheduled future alert** baked into content at write time — the author who knows something will expire annotates it proactively.

## Wikipedia's Infobox Staleness Research

Automated research (2023 EDBT paper) showed:
- ~3,362 infobox fields per week are flagged as potentially stale by ML systems
- Infoboxes are highest-density staleness vectors because they contain structured facts (population, GDP, year of release) that change frequently
- Research systems flag fields for human review rather than auto-correcting them

## Arch Wiki: Structured Community Process

Arch Wiki separates staleness into two stages:
1. **Recent changes patrolling** — watch new/modified pages for problems as they appear
2. **Report solving** — process the backlog of flagged articles

Flagged pages appear in `Special:WhatLinksHere/Template:Out of date` and in maintenance statistics. The maintenance team tracks resolution rate as a health metric. Editors are encouraged to add the specific concern as a template argument to help the next editor know *what* is outdated.

## MDN: GitHub-Native, Compat Data Automated

MDN Web Docs has no dedicated staleness template system. Instead:
- **Browser Compatibility Data (BCD)** is a separate open-source dataset (`@mdn/browser-compat-data`) maintained with automated tooling — the `mdn-bcd-collector` runs tests in real browsers to detect stale compat entries
- **Prose content** staleness is handled via GitHub issues and community PRs, with Mozilla/Google/Samsung staff acting as primary maintainers
- Content changes land as pull requests with mandatory review before merge

This means MDN has **automated staleness detection for structured data** (compat tables) but relies on human-in-the-loop for prose freshness.

## WiNELL: LLM-Based Automated Updates (2025 Research)

WiNELL (Wikipedia Never-Ending Updating with LLM Agents) represents the frontier of automation:
- Multi-agent framework: web search → fact aggregation → edit suggestion → human review
- Editor models fine-tuned on Wikipedia's edit history to match human editing patterns
- Outperforms GPT-4o on key information coverage and editing efficiency
- Still requires human review before changes land — not fully autonomous

## Lessons for GHQ Knowledge Maintenance

| Pattern | GHQ Application |
|---------|-----------------|
| Temporal hooks at write time | Add `expires_at` frontmatter field when writing time-sensitive entries |
| Structured backlog | Use `.queue.jsonl` to track entries needing re-research |
| Confidence decay over time | Lower `confidence` on old entries as a staleness proxy (see staleness-detection-and-confidence-decay.md) |
| Compat-style data separation | Keep volatile structured data (versions, dates) separate from prose to enable targeted updates |
| Community patrolling | Regular review passes (weekly scan, monthly confidence review) |
