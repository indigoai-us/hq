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
Run:
```bash
qmd vsearch "{title}" -n 1
```
If the top result has similarity > 0.9, this is already known. Skip it and note in the report. If similarity is 0.7-0.9, consider whether the new insight adds meaningfully — if so, update the existing entry instead of creating a new one.

### c. Write knowledge entry (if novel)
Create `knowledge/{category}/{slug}.md` with this format:

```markdown
---
title: "{Concise Title}"
tags: [tag1, tag2]
created: {YYYY-MM-DD}
source: conversation  # or "observation"
confidence: {0.5|0.7|0.9}
---

{One-paragraph summary of the insight, including context and why it matters.}
```

Choose an appropriate category directory. Create it if it doesn't exist. Good categories: `tools`, `patterns`, `architecture`, `workflow`, `domain/{area}`.

### d. Handle contradictions
If the new insight contradicts existing knowledge, do NOT silently overwrite. Queue a curiosity item to resolve the conflict:

```bash
npx tsx scripts/queue-curiosity.ts --question "Resolve conflict: {existing insight} vs {new insight}" --source outcome_gap --priority 7 --context "Session learning contradicted existing knowledge"
```

Contradictions are valuable signals — never ignore them.

## Step 3: Queue Unanswered Questions

For questions that came up during the session but were not resolved:

```bash
npx tsx scripts/queue-curiosity.ts --question "{question}" --source knowledge_gap --priority 5 --context "{brief description of why this came up}"
```

## Step 4: Reindex

After all writes are complete:

```bash
npx tsx scripts/reindex.ts
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
- **Always reindex**: Run `npx tsx scripts/reindex.ts` after writing entries.
- **Contradictions are signals**: Queue them for resolution, don't suppress them.
- **Integration**: The PreCompact hook should suggest running `/learn` before context is lost. If context is filling up, prioritize capturing learnings before they disappear.
