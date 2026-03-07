# investigate-gap

Pull the top open question from the queue, research it, write or update a knowledge file, and mark resolved.

## Arguments

`$ARGUMENTS` = optional question ID to investigate (if omitted, picks the highest-priority open question)

## Inputs

- **Queue:** `workspace/curiosity/queue.yaml`
- **Knowledge tree:** `knowledge/knowledge-tree.yaml`
- **Knowledge base:** `knowledge/` (all domains)

## Process

### 1. Select question

Read `workspace/curiosity/queue.yaml`.

- If `$ARGUMENTS` provides a question ID, select that question (must have status `open`)
- Otherwise, select the first question with `status: open` (queue is sorted by priority_score descending)
- If no open questions exist, report "No open questions in queue" and exit cleanly

Set the selected question's `status` to `in_progress` and write the queue back.

### 2. Research — existing knowledge first

**Step 2a: qmd search**

```bash
qmd vsearch "{question text}" --json -n 10
```

Review the results. If existing knowledge files substantially answer the question:
- The gap may be a coverage/indexing issue rather than missing knowledge
- Note the existing files that cover this topic
- Proceed to Step 4 (write findings) with a note that existing coverage was found

**Step 2b: qmd keyword search**

```bash
qmd search "{key terms from question}" --json -n 10
```

Look for additional relevant files that semantic search may have missed.

### 3. Research — external sources (if needed)

If existing knowledge does NOT adequately answer the question:

**Step 3a: Web search**

Use the WebSearch tool to find authoritative information on the topic. Prefer:
- Official documentation
- Technical blog posts from reputable sources
- Recent sources (within last 12 months)

**Step 3b: WebFetch for details**

If web search finds promising URLs, use WebFetch to read the full content of the most relevant 2-3 pages.

### 4. Write or update knowledge file

Based on research findings, either create a new knowledge file or update an existing one.

**New file:**

- Place in the appropriate domain directory under `knowledge/`
- Match the domain from the question (e.g., domain "testing" -> `knowledge/testing/`)
- If the domain doesn't map to an existing directory, use `knowledge/patterns/` for patterns or create a subdirectory if it clearly fits
- Include confidence frontmatter:

```markdown
---
confidence: 0.9
tags: [domain, relevant, tags]
created_at: "ISO 8601"
source: "curiosity-engine/investigate-gap"
question_id: "Q-..."
---

# Title

Content based on research findings...

## Sources

- List of sources consulted
```

**Update existing file:**

- If an existing file partially covers the topic, add a new section or update existing sections
- Update the `confidence` field in frontmatter to 0.9
- Add a `last_validated` timestamp to frontmatter
- Preserve existing content; append new findings

### 5. Update knowledge tree

After writing/updating a knowledge file, update `knowledge/knowledge-tree.yaml`:

- If new file: add an entry under the appropriate domain and category
- Include: path, summary, confidence (0.9), tags, related entries
- If updated file: update the confidence and any changed metadata

### 6. Resolve the question

Edit the question in `workspace/curiosity/queue.yaml`:

```yaml
status: resolved
resolved_at: "ISO 8601"
resolution_note: "Brief description of what was found/written"
knowledge_file: "path/to/written/or/updated/file.md"
```

Do NOT delete the question — only update its fields.

## Output

After resolving, print a summary:

```
Investigation complete:
- Question: [question text]
- Priority score: [score]
- Research method: [qmd only | qmd + web]
- Action taken: [created new file | updated existing file]
- Knowledge file: [path]
- Confidence set to: 0.9
- Queue status: resolved
```

## Rules

- NEVER scan for new gaps — only investigate the selected question
- NEVER modify observation files
- NEVER delete questions from the queue — edit status fields only
- Always search existing knowledge (qmd) BEFORE web search
- Always update the knowledge tree after writing/updating knowledge files
- Set confidence to 0.9 for all new/updated entries (not 1.0 — leave room for human validation)
- If research is inconclusive, set status to `wont_fix` with a resolution_note explaining why
- Commit knowledge file changes to the appropriate git repo (knowledge repos have their own git)
- Use Glob with scoped `path:` for any file searches
