---
title: "Knowledge Entry Versioning and Evolution Strategies"
category: knowledge-maintenance
tags: ["knowledge-management", "maintenance", "zettelkasten", "personal-knowledge", "staleness"]
source: "https://notes.andymatuschak.org/Evergreen_notes, https://articles.chatnexus.io/knowledge-base/temporal-rag-handling-time-sensitive-information-i/, https://www.dsebastien.net/personal-knowledge-management-at-scale-analyzing-8-000-notes-and-64-000-links/, https://anthonytd.com/blog/pkm-best-practices/"
confidence: 0.78
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Three strategies for evolving knowledge entries when understanding changes: rewrite in place, append with dated sections, or fork with deprecation links.

## The Core Decision

When an entry's understanding changes fundamentally, choose based on how much the old content still holds value:

| Strategy | When to Use | Tradeoff |
|----------|-------------|----------|
| **Rewrite in place** | Old understanding was wrong or superseded entirely | Clean and canonical; history lost (rely on git) |
| **Append with dated sections** | Old understanding was correct in context; new context emerged | Preserves temporal evidence; can become unwieldy |
| **Fork (new entry + deprecation link)** | The concept has split into two distinct, valid subtopics | Best navigability; costs more entries to maintain |

## Rewrite In Place

The **evergreen notes** philosophy (Andy Matuschak) favors this approach: notes are living documents meant to evolve. The premise is that a note's *current best understanding* is what matters, and git history preserves what was believed before.

**When to rewrite:**
- The prior understanding was factually wrong (not just incomplete)
- The topic hasn't split — it's the same concept with better insight
- The entry is short enough that a clean rewrite is cheaper than surgical edits

**Practice:** Update `updated_at`, revise body, optionally add a `## Changelog` section at the bottom for significant conceptual pivots.

## Append with Dated Sections

Useful when the old content remains valid for a specific time window or context, and the new content adds a different perspective rather than replacing one.

```markdown
## As of 2024

[Original understanding...]

## Update: 2026-03

New research shows X, which changes the implication for Y. The 2024 model
still applies to legacy systems running version < 3.
```

**When to append:**
- Temporal validity matters (e.g., "this was true in v1, this is true in v2")
- The entry is used as a reference others link to — disrupting its canonical form breaks links
- The change is additive, not corrective

## Fork with Deprecation Link

When a concept genuinely splits into two separate, non-overlapping topics, forking prevents a single entry from becoming ambiguous.

```markdown
<!-- In the original entry -->
> **Superseded**: This entry covers the pre-2025 approach. For the current
> strategy, see [New Entry Title](../new-entry-slug.md).
```

The original entry can be archived (minimal updates) or kept active if both subtopics are still relevant.

**When to fork:**
- The original question has two distinct, correct answers depending on context
- You find yourself using "on the other hand" more than twice in one entry
- The entry length is tripling to accommodate divergent cases

## Practical Heuristics for GHQ

1. **Default to rewrite** — git preserves history; entries should be canonical, not archaeological.
2. **Use append sparingly** — only when temporal context is the point (e.g., tracking a fast-moving field).
3. **Fork only on genuine conceptual splits** — not for "I know more now." Forking creates maintenance debt.
4. **Always update `updated_at`** — the timestamp signals the entry has been revisited.
5. **Link superseded entries** — if an entry is deprecated in favor of another, add a prominent `> Superseded by: [link]` callout at the top.

## Confidence Decay Integration

When rewriting, assess whether the new understanding warrants a confidence score change. An entry rewritten because new contradicting evidence emerged should temporarily drop confidence until corroborated by additional sources.

See also: [Production Confidence Decay Models](production-confidence-decay-models.md), [Content Pruning and Archival](content-pruning-and-archival.md)
