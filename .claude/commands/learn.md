---
description: Capture session learnings as knowledge entries and queue gaps for research
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /learn — Session Learning Capture

Reflect on the current conversation and distill durable insights into the knowledge base. Quality over quantity — aim for 1-5 entries per session, never capture trivial or ephemeral information.

## Step 1: Reflect on the Session

Review what has been discussed, decided, discovered, or corrected. Identify candidates in these categories:

- **User corrections** (highest value): The user explicitly said something was wrong or provided a better approach. Confidence: 0.9.
- **Decisions and rationale**: A deliberate choice was made with reasoning. Confidence: 0.7.
- **Technical insights**: Something non-obvious discovered during implementation. Confidence: 0.7.
- **New facts or patterns**: Learned something about a tool, API, codebase, or domain. Confidence: 0.5-0.7.
- **Inferences**: Connections drawn that weren't explicitly stated. Confidence: 0.5.

Skip the following — they are not durable knowledge:
- Ephemeral debugging info (stack traces, temp file paths)
- Temporary state or one-off commands
- Things that are already obvious from code/docs
- Sensitive information (API keys, passwords, personal data — NEVER capture these)

## Step 2: Process Each Insight

For each candidate (1-5 per session):

### a. Formulate title and summary
Write a concise title (slug-friendly) and a one-paragraph summary capturing the insight and why it matters.

### b. Dedup check
Run two searches to catch duplicates regardless of phrasing:
```bash
qmd query "{title}" -n 3 --json
qmd query "{one-sentence summary of the insight}" -n 3 --json
```

Use the **highest similarity score** across both result sets for the same file. Then apply tiered thresholds:

| Score | Action |
|-------|--------|
| **> 0.9** | **Duplicate.** Already known. Skip and note in the report. |
| **0.7–0.9** | **Overlap.** Read the matching entry to confirm. If the new insight adds meaningfully, update the existing entry. Otherwise skip. |
| **< 0.7** | **Novel.** Create a new entry. |

When evaluating matches, read the top-scoring existing entry to confirm the overlap is real — don't rely solely on the similarity score.

**Tag merging**: When updating an existing entry, union the new tags with the existing tags — don't discard existing tags. Remove duplicates.

### c. Write knowledge entry (if novel)
Create `knowledge/{category}/{slug}.md` with this format:

```markdown
---
title: "{Concise Title}"
category: {category}
tags: ["{tag1}", "{tag2}", "{tag3}"]
source: conversation
confidence: {0.5|0.7|0.9}
created_at: {ISO 8601 timestamp}
updated_at: {ISO 8601 timestamp}
---

{One-paragraph summary of the insight, including context and why it matters.}
```

Frontmatter must conform to the schema in `knowledge/meta/format-spec.md`.

#### Category validation

Before choosing a category, list existing ones:

```bash
ls -d knowledge/*/
```

**Prefer an existing category.** Only create a new one when the insight genuinely doesn't fit any existing category. If the category is new, briefly justify the choice in the report summary.

### Tagging Guidelines

Tags are the faceted dimension of the knowledge base — they enable cross-cutting discovery that the category hierarchy cannot.

- **Orthogonal**: Each tag should represent an independent dimension. Don't duplicate the category (e.g., no `architecture` tag on entries already in `knowledge/architecture/`).
- **3-6 tags per entry**: Enough for discovery, not so many that they lose signal.
- **Controlled vocabulary**: Prefer reusing existing tags over inventing synonyms.
- **Stable naming**: Use lowercase, hyphenated terms (`knowledge-management` not `KM` or `knowledgeManagement`).

#### Auto-suggest tags

Before assigning tags, retrieve the current vocabulary:

```bash
./tools/tag-inventory.sh
```

From the output, **pick 3-6 existing tags that fit** the new entry. Only introduce a new tag when no existing tag covers the concept. If introducing a new tag, verify it isn't a synonym of an existing one (e.g., don't create `agent-loops` when `agent-loop` exists).

### d. Handle contradictions
If the new insight contradicts existing knowledge, do NOT silently overwrite. Queue a curiosity item to resolve the conflict:

```bash
npx tsx tools/queue-curiosity.ts --question "Resolve conflict: {existing insight} vs {new insight}" --source outcome_gap --priority 7 --context "Session learning contradicted existing knowledge"
```

Contradictions are valuable signals — never ignore them.

## Step 3: Queue Unanswered Questions

For questions that came up during the session but were not resolved:

```bash
npx tsx tools/queue-curiosity.ts --question "{question}" --source knowledge_gap --priority 5 --context "{brief description of why this came up}"
```

### Queue Outcome Gaps

When the session revealed that reality didn't match expectations (a tool behaved differently than documented, a pattern failed where it usually works, an assumption was proven wrong):

```bash
npx tsx tools/queue-curiosity.ts \
  --question "Why did {actual} happen instead of {expected}?" \
  --source outcome_gap \
  --priority 7 \
  --context "Observation: {what happened}. Expected: {X}. Actual: {Y}."
```

Outcome gaps are high-value research targets (priority 7) because they reveal where mental models are wrong. The structured expected-vs-actual format helps `/research` produce targeted answers.

## Step 4: Reindex

After all writes are complete:

```bash
npx tsx tools/reindex.ts
```

## Step 5: Report Summary

Output a structured summary:

```
## Session Learnings Captured

Knowledge entries written:
- {title} -> knowledge/{category}/{slug}.md (confidence: {N})

Knowledge entries updated:
- {title} -> knowledge/{category}/{slug}.md (reason: {what changed})

Curiosity items queued:
- {question} (source: {source}, priority: {N})

Skipped (already known):
- {title}
```

If nothing was worth capturing, say so honestly — an empty report is better than noise.

## Rules

- **Quality over quantity**: One high-confidence insight beats five vague ones.
- **User corrections are gold**: Always confidence 0.9. The user knows their own system.
- **No sensitive data**: Never capture API keys, passwords, tokens, or personal data.
- **Always reindex**: Run `npx tsx tools/reindex.ts` after writing entries.
- **Contradictions are signals**: Queue them for resolution, don't suppress them.
- **Integration**: The PreCompact hook should suggest running `/learn` before context is lost. If context is filling up, prioritize capturing learnings before they disappear.
