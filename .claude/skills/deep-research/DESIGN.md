# Deep Research Skill -- Architecture Design

> Design document for `ghq-uik.1.2.1`
> Author: execute-task / content-direct
> Date: 2026-03-03

## 1. Overview

The deep-research skill autonomously searches the web, reads multiple sources, and produces a comprehensive markdown report with citations. It is modeled after the workflows used by ChatGPT Deep Research, Perplexity Deep Research, and open-source implementations like dzhng/deep-research and qx-labs/agents-deep-research.

Unlike those systems (which use custom APIs, multi-model orchestration, or proprietary search infrastructure), this skill operates within the Claude Code SKILL.md framework using only the built-in `WebSearch` and `WebFetch` tools. This constraint shapes every design decision below.

## 2. Prompt Flow

The skill follows a five-phase pipeline:

```
Query Clarification --> Search Plan --> Iterative Search/Read Loop --> Synthesis --> Report Generation
```

### Phase 1: Query Clarification

**Goal:** Ensure the research question is well-scoped before burning search tokens.

**Process:**
1. Parse the user's query for topic, scope, and constraints
2. Identify ambiguities (e.g., "AI safety" could mean alignment research or enterprise security)
3. Ask the user up to 2 clarifying questions if needed
4. If the query is already clear and specific, skip clarification and proceed

**Output:** A refined research question with explicit scope boundaries.

**Design Decision:** Limit to 2 clarifying questions maximum. Deep research tools like ChatGPT present a research plan for review but do not ask open-ended questions. Excessive clarification kills the "autonomous" feel. If the query is ambiguous, present the assumed interpretation and let the user correct it.

### Phase 2: Search Plan

**Goal:** Decompose the research question into searchable sub-topics.

**Process:**
1. Break the refined query into 3-7 research axes (sub-questions)
2. For each axis, generate 1-2 candidate search queries
3. Prioritize axes by likely information density (broad context first, specific details later)
4. Present the plan to the user for optional review (do not wait for approval -- proceed automatically unless the user intervenes)

**Output:** An ordered list of research axes with candidate search queries.

**Example:**
```
Research Question: "What are the most effective strategies for reducing LLM hallucinations in production?"

Axes:
1. Current state of LLM hallucination research (2024-2026)
2. RAG-based mitigation techniques
3. Fine-tuning and RLHF approaches to reduce hallucination
4. Prompt engineering strategies (chain-of-thought, self-consistency)
5. Production monitoring and detection systems
6. Industry case studies and benchmarks
```

**Design Decision:** Generate 3-7 axes, not more. Each axis maps to one search iteration. The number balances thoroughness against Claude's context window constraints. The axes are ordered so foundational/contextual information comes first, enabling the search loop to build understanding progressively.

### Phase 3: Iterative Search/Read Loop

**Goal:** Systematically gather information across all research axes, following leads as they emerge.

**Process (per iteration):**
1. Select the next unsearched axis (or a lead from a previous iteration)
2. Execute `WebSearch` with the candidate query
3. Evaluate search results: rank by relevance using title and URL signals
4. For the top 2-3 results, execute `WebFetch` to read the page content
5. Extract key findings, claims, and data points
6. Track the source (URL, title) alongside each extracted finding
7. Identify new leads: references, cited papers, mentioned tools, or related topics not yet covered
8. Decide whether to follow leads or move to the next axis

**Iteration Parameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `max_axes` | 5 | 3-7 | Number of research sub-topics |
| `max_iterations` | 10 | 5-15 | Total search iterations across all axes |
| `sources_per_search` | 3 | 2-5 | Pages to read per WebSearch |
| `max_lead_follows` | 3 | 1-5 | New leads to pursue beyond planned axes |

**Stopping Criteria:**

The loop exits when ANY of these conditions is met:
1. All planned axes have been searched
2. `max_iterations` reached
3. Diminishing returns detected: last 2 iterations produced no new substantive findings
4. Source convergence: multiple sources confirm the same findings with no new perspectives

**Lead-Following Strategy:**

Not all leads are worth following. Follow a lead only if:
- It directly addresses a gap in the current findings
- It is from a high-signal source (research paper, official documentation, well-known publication)
- It was referenced by 2+ already-read sources (triangulation signal)
- The `max_lead_follows` budget has not been exhausted

**Source Tracking Data Structure:**

Throughout the loop, maintain a sources list:
```
sources[] = {
  url: string,
  title: string,
  axis: string,          // which research axis this served
  findings: string[],    // key claims extracted from this source
  credibility: "high" | "medium" | "low",  // based on domain reputation
  accessed_at: ISO8601
}
```

**Design Decision:** The iterative loop is the core differentiator from a simple "search and summarize." Commercial deep research agents (ChatGPT, Perplexity) use reinforcement learning-trained models that learned when to search deeper vs. move on. We approximate this with explicit stopping heuristics: diminishing returns detection and source convergence. The fixed iteration budget (`max_iterations=10`) prevents runaway token consumption while still allowing meaningful depth. The `sources_per_search=3` default keeps WebFetch calls manageable -- each call spawns a secondary LLM conversation, so cost scales linearly.

### Phase 4: Synthesis

**Goal:** Organize raw findings into a coherent narrative structure.

**Process:**
1. Group findings by theme (which may differ from the original axes)
2. Identify consensus views vs. conflicting perspectives
3. Highlight gaps: topics where sources were sparse or contradictory
4. Rank findings by evidence strength (number of corroborating sources)
5. Build a report outline with section headings

**Design Decision:** Synthesis is a separate phase from report generation. This mirrors the multi-agent pattern used in production deep research systems where a "synthesizer agent" aggregates findings before a "writer agent" produces the report. In our single-agent SKILL.md context, these are sequential steps in the same prompt, but the conceptual separation ensures the skill does not start writing before it has organized its thinking.

### Phase 5: Report Generation

**Goal:** Produce a well-structured markdown report with inline citations and a source list.

**Process:**
1. Write each section following the outline from Phase 4
2. Insert inline citations as footnotes `[1]` linked to the source list
3. Include direct quotes sparingly (only for key definitions or notable claims)
4. Add an executive summary at the top (written last, after all sections)
5. Append the full source list with URLs
6. Save the report to the user-specified output path

## 3. Markdown Report Template

```markdown
# {Report Title}

> Deep research report generated on {date}
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

{Continue for each theme identified during synthesis.}

## N. Gaps and Limitations

{Topics where evidence was thin, contradictory, or absent. Areas that would benefit from further research.}

## Sources

| # | Title | URL | Accessed |
|---|-------|-----|----------|
| 1 | {Source Title} | {URL} | {date} |
| 2 | {Source Title} | {URL} | {date} |
| ... | ... | ... | ... |
```

### Citation Format

**Inline citations** use bracketed numbers: `[1]`, `[2]`, `[1, 3]` for multiple sources supporting the same claim.

**Source table** uses a numbered markdown table at the end. Each source includes:
- Sequential number (matching inline citations)
- Page/article title
- Full URL
- Access date

**Design Decision:** Footnote-style `[N]` citations over hyperlink-style `[text](url)` for several reasons:
1. Footnotes are scannable -- readers can verify claim density at a glance
2. The source table provides a single audit point for all references
3. Multiple citations per claim are cleaner: `[1, 3, 7]` vs. three inline links
4. This matches academic and analyst report conventions, which is the target audience for deep research output

### Section Guidelines

- **Executive Summary**: Always present. Written after all other sections. 2-4 paragraphs maximum.
- **Thematic Sections**: 3-7 sections. Each section covers one major theme. Sub-sections (`###`) for detailed breakdowns.
- **Gaps and Limitations**: Always present. Honest about what the research did not find or could not verify. This section builds trust in the report's claims.
- **Sources**: Always present. Every source cited inline must appear here. No uncited sources.

## 4. Iterative Search Strategy -- Detailed Design

### Search Query Construction

Good search queries are specific and use domain terminology. The skill should:
- Include year qualifiers for time-sensitive topics (`"LLM hallucination 2025 2026"`)
- Use site-specific operators when targeting known repositories (`site:arxiv.org`, `site:github.com`)
- Avoid overly broad queries (more than 3-4 words of genuine search terms)
- Reformulate queries that return poor results (different terms, more/less specific)

### Source Quality Heuristics

Since we cannot programmatically check domain authority, use proxy signals:
- **High credibility**: `.gov`, `.edu`, `arxiv.org`, official documentation sites, established publications (Nature, IEEE, ACM, major tech company blogs)
- **Medium credibility**: Well-known tech blogs, popular developer platforms (Dev.to, Medium with known authors), Wikipedia (for factual claims, not opinions)
- **Low credibility**: Unknown blogs, content farms, sites with excessive ads/popups (detected via WebFetch returning low-quality content)

### Diminishing Returns Detection

After each iteration, evaluate whether new findings were produced:
- **Substantive finding**: A new claim, data point, or perspective not already in the sources list
- **Redundant finding**: A claim already captured from a previous source
- If the last 2 iterations produced only redundant findings, trigger the diminishing returns stop condition

### Context Window Management

The iterative loop accumulates findings across iterations. To prevent context overflow:
- Store findings as concise bullet points, not full paragraphs
- Discard low-relevance findings before the next iteration
- Track source metadata (URL, title) separately from finding text
- If approaching context limits, skip remaining axes and proceed to synthesis

## 5. Output Path Handling

### User-Specified Path

The skill asks the user where to save the report. Options:

1. **User provides a full path**: Save there directly
   ```
   /path/to/reports/llm-hallucinations.md
   ```

2. **User provides a directory**: Generate a filename from the query
   ```
   /path/to/reports/ --> /path/to/reports/deep-research-llm-hallucinations-2026-03-03.md
   ```

3. **User provides nothing (default)**: Save to current working directory
   ```
   ./deep-research-{slugified-query}-{date}.md
   ```

### Filename Generation

When auto-generating filenames:
- Prefix: `deep-research-`
- Query slug: first 5 significant words, lowercased, hyphenated
- Date: `YYYY-MM-DD`
- Extension: `.md`

Example: `deep-research-llm-hallucination-reduction-strategies-2026-03-03.md`

## 6. Design Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Single-agent architecture (no sub-agents) | SKILL.md runs as one prompt. Sub-agents add complexity and cost without clear benefit for a research workflow that is inherently sequential. |
| D2 | Max 2 clarifying questions | Preserves the "autonomous" feel. ChatGPT deep research presents a plan, not an interrogation. |
| D3 | 3-7 research axes | Balances thoroughness against context window and token cost. |
| D4 | Fixed iteration budget (default 10) | Prevents runaway searches. Parameter-driven stopping is reliable; content-based stopping is aspirational. |
| D5 | Diminishing returns heuristic | Approximates the RL-trained "when to stop" behavior of commercial agents with explicit rules. |
| D6 | Footnote-style citations `[N]` | Academic/analyst convention. Better for multi-source claims. Scannable. |
| D7 | Separate synthesis and report phases | Mirrors multi-agent pattern (synthesizer + writer). Prevents writing before thinking. |
| D8 | Sources table over inline links | Single audit point. Cleaner for dense citations. Matches the report's professional tone. |
| D9 | Lead-following budget (default 3) | Allows serendipitous discovery without derailing the plan. Budget prevents rabbit holes. |
| D10 | WebSearch + WebFetch only | These are the built-in Claude Code tools. No external APIs, no MCP servers required. Maximizes portability. |
| D11 | Gaps and Limitations section always present | Builds trust. Honest research acknowledges what it does not know. |
| D12 | Default output path is cwd | Sensible default. User can override. No configuration needed for quick use. |

## 7. Comparison with Commercial Deep Research Agents

| Capability | ChatGPT DR | Perplexity DR | This Skill |
|-----------|-----------|--------------|------------|
| Multi-agent orchestration | Yes (specialized sub-agents) | Yes (parallel researchers) | No (single SKILL.md prompt) |
| Parallel search | Yes | Yes (5+ concurrent) | No (sequential WebSearch calls) |
| RL-trained search strategy | Yes (end-to-end RL) | Yes (TTC framework) | No (explicit heuristics) |
| Source file upload | Yes | Yes | No (web only) |
| Interactive mid-research steering | Yes | Limited | No (runs autonomously) |
| Citation format | Inline links | Inline links + source list | Footnotes + source table |
| Report length | 5-10 pages | 2-5 pages | 3-7 sections (variable) |
| Execution time | 5-30 minutes | 2-4 minutes | Depends on iteration count |
| Cost | Subscription tier | Subscription tier | Claude Code token usage |

### Key Trade-offs

**We gain:** Zero infrastructure. No API keys beyond Claude. Works anywhere Claude Code runs. Full control over the output format. Integrates natively with GHQ skill system.

**We lose:** Parallelism (sequential searches are slower). RL-optimized search strategy (we use heuristics). Multi-modal analysis (no image/PDF deep parsing). Interactive steering (the skill runs to completion).

## 8. Integration with GHQ Skill System

### Skill Identity

- **Directory**: `.claude/skills/deep-research/`
- **File**: `SKILL.md`
- **Skill ID**: `deep-research` (inferred from directory name)
- **Type**: Execution skill (not composition -- it does not chain other skills)

### Invocation

The skill is invoked via Claude Code's skill system. The user triggers it with:
```
/deep-research "What are the most effective strategies for reducing LLM hallucinations?"
```

Or naturally:
```
Research the current state of LLM hallucination mitigation techniques and write a report.
```

### Dependencies

- **Tools required**: `WebSearch`, `WebFetch` (built into Claude Code)
- **External dependencies**: None
- **GHQ dependencies**: None (standalone skill)

### Output Artifacts

1. Markdown report file (saved to user-specified or default path)
2. Console output summarizing the research process (axes searched, sources found, report path)
