---
title: "Knowledge Sanitization Patterns: Extracting Reusable Insights from Proprietary Context"
category: knowledge-segregation
tags: ["knowledge-management", "personal-knowledge", "information-architecture", "production-patterns"]
source: "https://cacm.acm.org/research/knowledge-management-with-patterns/, https://www.researchgate.net/publication/222821534_Dealing_with_abstraction_Case_study_generalisation_as_a_method_for_eliciting_design_patterns, https://i2insights.org/2023/03/28/patterns-for-co-creation/, https://higherlogicdownload.s3.amazonaws.com/INFORMS/de42775c-d517-4dcb-a43b-8947076689d2/UploadedFiles/U2hsneORR3eln9OVylkz_Loubna%20Echajari%20-%20Loubna_Echajari_Developing%20knowledge%20codification%20to%20learn%20from%20rare%20and%20complex%20experiences.pdf"
confidence: 0.82
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Techniques for stripping proprietary context from work-derived knowledge to produce shareable, reusable patterns.

## The Core Problem

Knowledge captured during client or employer work embeds two layers:

1. **The proprietary layer** — client names, internal product names, team structures, revenue figures, unreleased roadmaps, NDA-covered decisions.
2. **The pattern layer** — the structural insight: *what kind of problem this was, what forces shaped it, what class of solution worked.*

The pattern layer is generally safe to share and reuse. The proprietary layer must stay locked to the company scope. Sanitization is the process of separating the two.

## Abstraction-Level Taxonomy

| Level | Description | Example |
|-------|-------------|---------|
| **Incident** | Raw event, fully proprietary | "Acme's auth service went down 2024-11-12 due to a race in the token refresh flow" |
| **Case** | De-identified but specific | "A B2B SaaS auth service failed due to a race in the token refresh flow" |
| **Pattern** | Forces + solution, no company context | "When a token refresh endpoint is called concurrently, implement idempotency keys or a request coalescer to prevent race conditions" |
| **Principle** | Meta-level heuristic | "Race conditions at auth boundaries require idempotency, not retry logic" |

Move from Incident → Pattern. Stop before losing the actionable specificity.

## Sanitization Patterns

### 1. Role-Based Entity Replacement

Replace named entities with their functional role:

| Proprietary | Sanitized |
|-------------|-----------|
| "Indigo's signal pipeline" | "a real-time event ingestion pipeline" |
| "Hassaan approved the decision" | "the tech lead approved the decision" |
| "our Q2 migration" | "a schema migration under a release freeze" |

Preserve *structural* properties (scale, timing constraints, team topology) while removing identity.

### 2. Problem-Forces-Solution Frame (Pattern Language)

Derived from Christopher Alexander's pattern language methodology. Force each insight through three questions:

- **What context triggers this problem?** *(when does this situation arise?)*
- **What forces are in tension?** *(why is the naive solution wrong?)*
- **What solution resolves the forces?** *(what makes this approach better?)*

Writing to this frame naturally expels proprietary context because client-specific details don't answer any of the three questions.

### 3. Case Study Generalisation

From HCI design-pattern research: identify *salient features* across comparable cases rather than documenting a single case in depth. Ask: "What would make this pattern true for a different company in the same situation?" Properties that don't generalise belong in the proprietary layer.

### 4. The Litmus Test

Before writing any detail into a general knowledge entry, ask:

> "Could a team at a completely different company, working on a structurally similar problem, use this sentence?"

If no → it belongs in the company-scoped knowledge. If yes → it's safe for the general layer.

### 5. Abstraction Vocabulary Substitution

Maintain a personal substitution map for recurring proprietary terms:

```
{company name} → "the organization" / "the client"
{product name} → "the platform" / "the service"
{team name}    → "the platform team" / "the infra team"
{client name}  → "the enterprise customer"
```

This makes sanitization fast and consistent when writing entries under time pressure.

## GHQ Application

GHQ's two-layer knowledge structure maps directly to this:

```
companies/{slug}/knowledge/    ← proprietary layer (incident + case level)
companies/ghq/knowledge/       ← general layer (pattern + principle level)
```

When `/learn` captures a session, the default question should be: *"Is this insight company-specific, or does it describe a structural pattern that any team could use?"*

- If company-specific: write to `companies/{slug}/knowledge/{category}/`
- If structural: sanitize and write to `companies/ghq/knowledge/{category}/`
- If both: write the incident to the company layer, write the abstracted pattern to `ghq` layer, and link from the company entry via a `see_also` reference or inline note.

## Follow-Up Areas

- **Automated sanitization via LLM**: prompt a subagent to extract the pattern layer from a raw session note — output should explicitly name which details were removed and why.
- **Dual-write discipline**: building a habit of writing both layers immediately, while memory is fresh, rather than trying to sanitize later.
- **Validation**: have someone unfamiliar with the company read the general entry and confirm no proprietary context leaks through.
