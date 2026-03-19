---
title: "Information Barriers and Compliance for Consultants"
category: knowledge-segregation
tags: ["security", "compliance", "knowledge-management", "enterprise"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Information barriers (historically called "Chinese walls") are organizational controls that prevent the flow of confidential information between different parts of an entity. Originally from finance (preventing conflicts between advisory and trading divisions), the concept applies directly to consultants and freelancers working across competing or sensitive clients.

## Relevance to AI-Assisted Work

When using AI coding assistants across multiple clients:

1. **NDA obligations**: Most consulting agreements prohibit sharing client information with third parties. An AI assistant that retains context from client A while working on client B creates a potential NDA breach — even if the "sharing" is only within the consultant's own tooling.

2. **Competitive sensitivity**: Two clients in the same industry may have proprietary approaches. Cross-pollination through AI suggestions (e.g., "I've seen a pattern like this...") could expose trade secrets.

3. **Audit trail**: Some regulated industries require demonstrable information barriers. Being able to show that your AI tooling enforces segregation may be a compliance requirement.

## Open Questions

- Whether AI assistant memory constitutes "information sharing" under typical NDA language is legally untested territory.
- How to balance the legitimate benefit of general knowledge accumulation (learning patterns, not specifics) against segregation requirements.
- Whether technical controls (directory isolation, collection scoping) are sufficient for compliance, or whether policy/process controls are also needed.
