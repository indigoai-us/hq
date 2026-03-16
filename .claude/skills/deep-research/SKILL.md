---
name: deep-research
description: Autonomous web research that produces comprehensive markdown reports with citations
---

# Deep Research

Autonomous web research skill. Searches the web, reads multiple sources, and produces a structured markdown report with footnote-style citations.

Uses only built-in `WebSearch` and `WebFetch` tools. No external APIs, no MCP servers required.

## Invocation

```
/deep-research "What are the most effective strategies for reducing LLM hallucinations?"
```

Arguments: `{query}` -- the research question (required).

## Process

Follow these six phases in order. Do not skip phases.

### Phase 1: Query Clarification

1. Parse the user's query for topic, scope, and constraints
2. Identify ambiguities (e.g., "AI safety" could mean alignment research or enterprise security)
3. If the query is ambiguous, present your assumed interpretation and ask the user to confirm or correct -- maximum 2 clarifying questions
4. If the query is already clear and specific, skip clarification and proceed immediately
5. Output: a refined research question with explicit scope boundaries

### Phase 2: Search Plan

1. Decompose the refined query into 3-7 research axes (sub-questions)
2. For each axis, generate 1-2 candidate search queries
3. Prioritize axes: broad context first, specific details later
4. Present the plan to the user but proceed automatically -- do not wait for approval unless the user intervenes

Example axes for "LLM hallucination reduction strategies":
```
1. Current state of LLM hallucination research (2024-2026)
2. RAG-based mitigation techniques
3. Fine-tuning and RLHF approaches
4. Prompt engineering strategies (chain-of-thought, self-consistency)
5. Production monitoring and detection systems
6. Industry case studies and benchmarks
```

### Phase 3: Iterative Search/Read Loop

This is the core of the skill. Execute iteratively, not as a single-shot search.

**Per iteration:**

1. Select the next unsearched axis (or a lead from a previous iteration)
2. Execute `WebSearch` with the candidate query
3. Evaluate results: rank by relevance using title and URL signals
4. For the top 2-3 results, execute `WebFetch` to read page content
5. Extract key findings, claims, and data points as concise bullet points
6. Track the source (URL, title, access date) alongside each finding
7. Identify new leads: references, cited papers, mentioned tools, related topics
8. Decide whether to follow a lead or move to the next axis

**Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max axes | 5 | Number of research sub-topics |
| Max iterations | 10 | Total search iterations across all axes |
| Sources per search | 3 | Pages to read per WebSearch |
| Max lead follows | 3 | New leads to pursue beyond planned axes |

**Stopping criteria** -- exit the loop when ANY condition is met:

1. All planned axes have been searched
2. Max iterations (10) reached
3. Diminishing returns: last 2 iterations produced no new substantive findings
4. Source convergence: multiple sources confirm the same findings with no new perspectives

**Lead-following rules** -- follow a lead only if:

- It directly addresses a gap in current findings
- It comes from a high-signal source (research paper, official docs, established publication)
- It was referenced by 2+ already-read sources
- The lead-follow budget (3) has not been exhausted

**Source quality heuristics:**

- **High credibility**: `.gov`, `.edu`, `arxiv.org`, official documentation, established publications (Nature, IEEE, ACM, major tech company engineering blogs)
- **Medium credibility**: Well-known tech blogs, popular developer platforms, Wikipedia (for facts)
- **Low credibility**: Unknown blogs, content farms, sites returning low-quality content via WebFetch

**Source tracking** -- maintain throughout the loop:

```
For each source, track:
  - url
  - title
  - axis (which research axis it served)
  - findings (key claims extracted)
  - credibility (high / medium / low)
  - accessed_at (date)
```

**Search query construction tips:**

- Include year qualifiers for time-sensitive topics ("LLM hallucination 2025 2026")
- Use domain terminology, not casual language
- Reformulate queries that return poor results with different terms or specificity
- Keep queries focused: 3-4 genuine search terms

**Context management:**

- Store findings as concise bullets, not full paragraphs
- Discard low-relevance findings before the next iteration
- If approaching context limits, skip remaining axes and proceed to synthesis

### Phase 4: Synthesis

1. Group findings by theme (themes may differ from the original axes)
2. Identify consensus views vs. conflicting perspectives
3. Highlight gaps: topics where sources were sparse or contradictory
4. Rank findings by evidence strength (number of corroborating sources)
5. Build a report outline with section headings

Do not start writing the report yet. Organize your thinking first.

### Phase 5: Link Validation

Before writing the report, verify that all cited URLs are accessible.

1. For each unique URL in the source tracker, attempt a `WebFetch` request
2. Mark each URL as **live** or **dead** based on the response:
   - **Live**: WebFetch returns content (any non-error response)
   - **Dead**: WebFetch returns an error, timeout, or empty content
3. For dead links:
   - Attempt one retry with the URL (transient failures happen)
   - If still dead, search for an alternative source covering the same finding using `WebSearch`
   - If an alternative is found and confirms the finding, replace the dead URL with the new one
   - If no alternative is found, flag the finding as **[unverified -- original source unavailable]** in the report
4. Remove any source from the tracker that is both dead and has no replacement
5. Re-number citations if sources were removed to maintain sequential ordering
6. Log a summary: `{N} sources validated, {M} dead links found, {R} replaced, {D} removed`

**Validation budget:** Do not spend more than one WebFetch call per URL (plus one retry for dead links). This phase should be fast.

### Phase 6: Report Generation

1. Ask the user where to save the report:
   - If user provides a full file path: save there
   - If user provides a directory: generate filename as `deep-research-{query-slug}-{YYYY-MM-DD}.md`
   - If user provides nothing: save to `knowledge/deep-research-reports/deep-research-{query-slug}-{YYYY-MM-DD}.md` in cwd
2. Write each section following the outline from Phase 4, using only validated sources from Phase 5
3. Insert inline citations as footnotes `[1]`, `[2]`, or `[1, 3]` for multiple sources
4. Write the executive summary last, after all sections are complete
5. Append the source table
6. Save the report to the determined path
7. Confirm the save path to the user

**Filename generation:** prefix `deep-research-`, first 5 significant words of query lowercased and hyphenated, date `YYYY-MM-DD`, extension `.md`.

## Report Template

The generated report MUST follow this structure:

```markdown
# {Report Title}

> Deep research report generated on {YYYY-MM-DD}
> Query: "{original user query}"

## Executive Summary

{2-4 paragraph overview of key findings, major themes, and notable conclusions}

## Table of Contents

- [1. {Section Title}](#1-section-title)
- [2. {Section Title}](#2-section-title)
- ...
- [N. Gaps and Limitations](#n-gaps-and-limitations)
- [Sources](#sources)

## 1. {First Thematic Section}

{Narrative text with inline citations [1], [2].}

{Sub-sections as needed using ### headings.}

## 2. {Second Thematic Section}

...

## N. Gaps and Limitations

{Topics where evidence was thin, contradictory, or absent.
Areas that would benefit from further research.}

## Sources

| # | Title | URL | Accessed |
|---|-------|-----|----------|
| 1 | {Source Title} | {URL} | {YYYY-MM-DD} |
| 2 | {Source Title} | {URL} | {YYYY-MM-DD} |
```

### Citation Rules

- Inline citations use bracketed numbers: `[1]`, `[2]`, `[1, 3, 7]`
- Every inline citation number must have a corresponding entry in the Sources table
- No uncited sources in the Sources table -- every entry must be referenced at least once
- The Gaps and Limitations section is always present
- The Executive Summary is always present and written last

### Section Guidelines

- **Executive Summary**: 2-4 paragraphs maximum. Written after all other sections.
- **Thematic Sections**: 3-7 sections. Each covers one major theme. Use `###` sub-sections for detailed breakdowns.
- **Gaps and Limitations**: Honest about what the research could not find or verify.
- **Sources**: Table format. Sequential numbering matching inline citations.

## Rules

- Always use `WebSearch` for search and `WebFetch` for reading sources -- no other tools for research
- Never fabricate citations -- every cited claim must come from a WebFetch-read source
- Never skip the iterative search loop -- single-shot search is not acceptable
- Track sources from the first search onwards -- do not reconstruct citations from memory
- Present the search plan before starting research but proceed without waiting for approval
- Limit clarifying questions to 2 maximum -- preserve the autonomous feel
- Always include Gaps and Limitations -- honest research acknowledges unknowns
- Never skip link validation -- all cited URLs must be verified before the report is finalized
- Dead links must be replaced or flagged -- never include a dead URL in the final Sources table without marking it
- Save the report file and confirm the path to the user
- Respect copyright: use original wording in the report, do not reproduce large chunks of source text

## Output

- Markdown report file saved to user-specified or default path
- Console summary: axes searched, sources found, iterations used, report path
- Link validation summary: sources validated, dead links found, replacements made, removals
