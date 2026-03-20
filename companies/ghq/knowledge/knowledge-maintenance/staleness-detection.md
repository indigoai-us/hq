---
title: "Staleness Detection and Confidence Decay"
category: knowledge-maintenance
tags: ["knowledge-management", "maintenance", "staleness", "confidence", "information-architecture", "personal-knowledge"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

How to identify knowledge entries that have become outdated, and models for systematically tracking entry freshness.

## Indicators of Staleness

**Time-based**: Entries not updated within a domain-appropriate window. Fast-moving domains (AI/ML, security) may stale in weeks; stable domains (mathematics, design principles) in years.

**Confidence erosion**: Low-confidence entries (blueprint stubs at 0.5) that were never upgraded by research are candidates for review or removal.

**Source decay**: Entries citing sources that are no longer accessible (dead links, deprecated docs) need re-verification.

**Contradiction by newer entries**: When a newer entry disagrees with an older one, the older entry needs review.

**Zero retrieval**: Entries that never appear in search results may be poorly written, miscategorized, or covering topics nobody queries.

## Confidence Decay Models

**Linear decay**: Reduce confidence by a fixed amount per time period. Simple but doesn't reflect domain volatility.

**Domain-aware decay**: Tag entries with a `volatility` estimate. High-volatility entries (tool versions, API details) decay faster than low-volatility ones (design patterns, mathematical proofs).

**Event-triggered decay**: Major events (new tool versions, paradigm shifts) trigger re-evaluation of affected entries rather than relying on time alone.

## Practical Implementation

For a markdown-based system like GHQ:

1. **Staleness query**: Filter entries where `updated_at` is older than a threshold (e.g., 90 days for high-volatility tags)
2. **Confidence audit**: List all entries with confidence < 0.6 that haven't been updated recently
3. **Dead link check**: Scan `## Sources` sections for HTTP URLs and verify they resolve
4. **Review queue**: Feed stale entries into a prioritized review queue, ordered by confidence × retrieval frequency
