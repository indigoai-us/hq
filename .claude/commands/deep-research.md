---
description: Deep multi-phase web research — ~20 searches, iterative, HQ-aware
allowed-tools: Bash, Read, WebSearch, WebFetch, AskUserQuestion
argument-hint: [company] <research question or topic>
visibility: public
---

# /deep-research - Deep Research

Multi-phase research that maps a topic broadly, digs into subtopics and contradictions, reads full
authoritative sources, and synthesizes a comprehensive answer. Starts with internal HQ context,
then conducts ~20 web searches across four iterative phases.

**Input:** $ARGUMENTS

---

## Step 0: Parse Input & Company Anchor

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys. If the first word
of `$ARGUMENTS` exactly matches a company slug:

1. **Set `{co}`** = matched slug. Strip from `$ARGUMENTS` — remaining text is the research question
2. **Announce:** "Anchored on **{co}**"
3. **Set qmd scope** — if company has `qmd_collections` in manifest, record that collection

**If no match** → full `$ARGUMENTS` is the research question. No company anchor.

**Classify the question type** (determines synthesis structure in Step 7):

- **Factual** — "What is the current state of X?" / "How does Y work?" → answer + evidence
- **Comparative** — "X vs Y" / "Should I use X or Y?" → comparison matrix
- **Analytical** — "Why did X happen?" / "What are the implications of Y?" → argument + evidence
- **Exploratory** — "What are the best approaches to X?" / "What exists in the space of Y?" → landscape

If the question is fewer than 5 words or genuinely ambiguous (could mean two very different things),
use one `AskUserQuestion` to clarify scope. Otherwise proceed immediately — do not ask for permission.

---

## Step 1: HQ Search

Search internal knowledge before touching the web. HQ may already have relevant context,
prior research, company-specific decisions, or known constraints.

**If company-anchored with a qmd collection:**
```bash
qmd vsearch "{research question keywords}" -c {collection} --json -n 8
qmd search "{research question keywords}" -c {collection} --json -n 8
```

**If no company anchor:**
```bash
qmd vsearch "{research question keywords}" --json -n 10
```

**For each result with score > 0.5:** Read the file. Extract directly relevant facts, decisions, or constraints.

**Announce HQ findings compactly:**
```
HQ context:
- {finding 1 — one line, with source file}
- {finding 2}
- {none found, proceeding to web}
```

This internal context anchors the research:
- Avoid recommending things HQ has already ruled out
- Surface contradictions between HQ decisions and web findings
- Build on existing knowledge rather than duplicating it

---

## Step 2: Phase 1 — Broad Landscape (3-4 WebSearch)

Goal: map the topic space. Do NOT try to answer the question yet. Learn what the relevant
subtopics, actors, debates, and terminology are.

**Search strategy:**
- Search 1: The question phrased directly as a web query
- Search 2: "{topic} overview 2025" or "{topic} guide" — authoritative explainers
- Search 3: "{topic} comparison" or "{topic} alternatives" or "{topic} tradeoffs" — debates
- Search 4: "{topic} problems" or "{topic} criticism" or "{topic} limitations" — critical perspective (never skip this)

**For each search:** Scan titles and snippets. Record into source ledger:
- URL + title + one-line takeaway
- Mark as: `to-fetch` (promising, needs full read) or `snippet-only` (snippet is enough)

Do NOT WebFetch yet — breadth first.

**Print brief progress:**
```
Phase 1 complete (4 searches). Mapping subtopics and gaps...
```

---

## Step 3: Gap Analysis

This step drives the entire targeted phase. Do not skip.

From Phase 1 results, extract:

**Subtopics** that appeared in multiple results — structural sub-questions for a complete answer.

**Contradictions** — cases where sources disagree. These need targeted follow-up.

**Knowledge gaps** — things the question implies but Phase 1 didn't cover. If results are all
from 2022 or older, "recency" is a gap.

**Jargon** — terms or concepts that kept appearing but weren't explained.

Format this as internal working memory:
```
SUBTOPICS: [list]
CONTRADICTIONS: [list]
GAPS: [list]
TERMS_TO_CLARIFY: [list]
```

Do not print the full gap list — it's working memory that drives Phase 2.

---

## Step 4: Phase 2 — Targeted Deep-Dive (10-12 WebSearch)

One or two searches per gap, subtopic, or contradiction from Step 3.
Each search should be more specific than Phase 1 queries.

**Search allocation:**
- 2-3 searches for the most important subtopics (most central to answering the question)
- 1-2 searches per major contradiction
- 1 search per major knowledge gap
- 1 search for recency if Phase 1 sources were old ("{topic} latest 2025" or "{topic} changelog 2025")
- 1-2 reserve searches for unexpected findings during this phase

**Alternative query tactics when results are poor:**
- Try different phrasing (question form vs keyword form)
- Add "reddit" or "hacker news" for practitioner experience vs marketing content
- Add "case study" for real-world implementations
- Add a year to force recent results
- If same 3-4 domains keep appearing, add those to `blocked_domains` to surface new sources

**Continue updating source ledger.** Mark the best 5-6 sources as `priority-fetch`.

**Print progress every 4 searches:**
```
Phase 2: {N}/12 searches done. {M} sources queued for deep read.
```

---

## Step 5: Phase 3 — Deep Reading (5-6 WebFetch)

Fetch and fully read the 5-6 highest-value sources from the ledger.

**Selection criteria:**
1. Most authoritative source on the core question (official docs, canonical posts, research papers)
2. Best source for each major subtopic if not covered by (1)
3. Best source representing the critical/opposing view
4. Most recent primary source (ensures synthesis isn't stale)
5. Best practitioner source (Reddit, HN, case study) if available

**For each WebFetch:**
- Use a focused prompt that extracts what matters for the research question
- Record: URL, key claims, specific numbers/dates/versions, notable quotes (under 15 words)
- Add to source ledger with full annotation

**If a WebFetch returns error or paywall:**
- Note as unreachable in ledger
- Move to next `priority-fetch` — don't count failed fetches against the budget

**Print progress:**
```
Phase 3: Deep-read {N}/6 sources.
```

---

## Step 6: Phase 4 — Verification (2-3 WebSearch)

Do not skip verification. This separates research from summarization.

**Verification targets:**
- The most specific factual claim central to the answer — verify it's current
- Any claim where sources disagreed — find a third source to resolve
- The most surprising or counterintuitive finding — verify it's not an outlier

**If confirmed:** Note in ledger.
**If contradicted:** Update synthesis accordingly.
**If inconclusive:** Mark the claim as uncertain in synthesis.

---

## Step 7: Synthesize & Output

Print the final answer inline in chat. No files saved.

**Output structure varies by question type (classified in Step 0):**

### Factual questions:
```
## {Research Question}

### The Answer
{Direct 1-3 sentence answer. Most important thing upfront.}

### Key Findings
{3-7 findings organized logically. Each is 2-4 sentences with evidence.
Cite sources inline with [N] notation matching Sources list.}

### Nuances & Caveats
{What the simple answer misses. Conditions under which it changes.
Disagreements between sources and how they were resolved.}

### Sources
1. [Title](URL) — {one-line contribution}
2. [Title](URL) — {one-line contribution}
...
```

### Comparative questions:
```
## {X} vs {Y}: {Research Question}

### Bottom Line
{1-2 sentence verdict. Does not hedge without reason.}

### Comparison

| Dimension | {X} | {Y} |
|-----------|-----|-----|
| {dimension 1} | {X value} | {Y value} |
| {dimension 2} | ... | ... |
...

### When to Choose {X}
{Specific conditions.}

### When to Choose {Y}
{Specific conditions.}

### Non-Obvious Findings
{1-2 findings that would not be obvious from a quick search — the deep research value-add.}

### Sources
1. [Title](URL) — {contribution}
...
```

### Analytical questions:
```
## {Research Question}

### Summary
{2-3 sentence analytical conclusion.}

### Evidence & Reasoning
{Argument organized by evidence thread. Each cites sources.}

### Counterarguments & Limitations
{What a skeptic would say. Where evidence is thin.}

### Confidence Assessment
{How confident is this synthesis — based on source quality, recency, agreement/disagreement.}

### Sources
1. [Title](URL) — {contribution}
...
```

### Exploratory questions:
```
## {Research Question}

### Landscape Overview
{2-3 sentences framing the space.}

### Key Players / Approaches / Options
{Each: name, what it is, who uses it, key tradeoff.}

### Emerging Trends
{What's changing. What's gaining or losing traction.}

### Recommendations
{Given the landscape, what would a thoughtful practitioner do? Specific, not generic.}

### Sources
1. [Title](URL) — {contribution}
...
```

---

## Rules

- **HQ first, web second** — always run qmd before any WebSearch. HQ context anchors the research
- **No file output** — prints inline only. Never write files. User can run `/knowledge-capture` after to persist
- **1 AskUserQuestion max** — only if question is genuinely ambiguous. Never ask permission to start
- **4-phase loop is mandatory** — do not skip phases. The loop is the point
- **Breadth before depth** — Phase 1 must complete before any WebFetch. Never fetch in Phase 1
- **Gap analysis drives Phase 2** — Phase 2 searches must derive from the gap list, not from re-querying the original question with different words
- **Verify before synthesizing** — Phase 4 verification must happen before the final output
- **Alternative queries on poor results** — rephrase, add "reddit"/"hacker news", add "case study", add year, block overrepresented domains
- **Track sources throughout** — maintain a running source ledger. Only list sources that were actually read
- **Copyright compliance** — max one quote per source, under 15 words, in quotation marks. Never reproduce paragraphs
- **Company isolation** — if anchored, scope qmd to company collection. Never mix company knowledge
- **Confidence is honest** — if sources disagreed or evidence was thin, say so. Never present uncertain findings as settled
- **Do NOT use TodoWrite or EnterPlanMode** — this command executes directly
- **Progress notes are brief** — one line per phase completion. Do not narrate every search
- **Question type determines output structure** — use the matching template, do not default to factual for all questions
- **~20 searches total** — budget across phases: 3-4 broad + 10-12 targeted + 2-3 verification. Adjust within range based on topic complexity
