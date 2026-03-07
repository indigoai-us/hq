# scan-and-prioritize

Scan observation files, diff against the knowledge tree, and generate prioritized research questions.

## Arguments

`$ARGUMENTS` = optional filter (e.g., domain name to scope the scan)

## Inputs

- **Observations:** `workspace/curiosity/observations/*.yaml`
- **Knowledge tree:** `knowledge/knowledge-tree.yaml`
- **Existing queue:** `workspace/curiosity/queue.yaml`

## Process

### 1. Load observations

Read all YAML files from `workspace/curiosity/observations/`. Each observation has:

```yaml
type: knowledge_gap | stale_revalidation | coverage_gap | pattern_gap
signal: "Human-readable description of what was observed"
domain: "e.g., hq-core, testing, integrations"
source_thread: "thread ID or session reference"
timestamp: "ISO 8601"
```

If `$ARGUMENTS` specifies a domain, filter observations to only that domain. Otherwise process all.

### 2. Load knowledge tree

Read `knowledge/knowledge-tree.yaml`. This contains a hierarchical taxonomy of all knowledge entries with domains, categories, and individual entries (path, summary, confidence, tags, related).

### 3. Detect gaps

For each observation, determine the gap type and check if the knowledge tree already covers the topic:

**knowledge_gap** — The observation references a topic with no matching entry in the knowledge tree. Search the tree for entries whose domain, tags, or summary relate to the observation signal.

**stale_revalidation** — The observation notes that existing knowledge may be outdated. Find the matching knowledge tree entry and check its `confidence` field. Low confidence (<0.5) or missing confidence reinforces the gap.

**coverage_gap** — The observation notes a domain or category that has very few entries relative to its importance. Count entries in the referenced domain/category in the knowledge tree.

**pattern_gap** — The observation notes a recurring pattern that is not documented. Search the `knowledge/patterns/` domain in the tree for related entries.

### 4. Score priorities

For each detected gap, compute a priority score using three factors:

```
priority_score = frequency * impact * staleness_factor
```

- **frequency** (1-10): Count how many observations reference this same gap area. 1 observation = 1, 2-3 = 3, 4-6 = 5, 7-9 = 7, 10+ = 10
- **impact** (1-10): Count distinct companies and projects mentioned across those observations. 1 entity = 2, 2-3 = 5, 4+ = 10. If no company/project context, default to 3
- **staleness_factor** (1.0-3.0): Days since the earliest observation for this gap. <7 days = 1.0, 7-14 = 1.5, 14-30 = 2.0, 30+ = 3.0

Normalize the final score to 0-100 range: `min(100, frequency * impact * staleness_factor)`

### 5. Deduplicate against existing queue

Read `workspace/curiosity/queue.yaml`. For each new gap:

1. Check all `open` and `in_progress` questions in the queue
2. Compare the new gap's domain and signal text against existing questions
3. A question is a "substantial overlap" if:
   - Same domain AND signal text shares 3+ significant keywords (ignoring stopwords)
   - OR the new gap's observation references the same knowledge tree entries
4. If overlap found:
   - Add the new observation file references to the existing question's `source_observations`
   - Recalculate `priority_score` with the merged observation set
   - Update `updated_at` timestamp
   - Do NOT create a new question
5. If no overlap: create a new question entry

### 6. Write queue

Append new questions to `workspace/curiosity/queue.yaml`. Each question:

```yaml
- id: "Q-YYYYMMDD-HHMMSS-NNN"  # NNN = sequence within this scan run
  question: "Clear, specific research question"
  type: knowledge_gap | stale_revalidation | coverage_gap | pattern_gap
  domain: "domain from observation"
  priority_score: 0-100
  source_observations:
    - "observations/filename1.yaml"
    - "observations/filename2.yaml"
  created_at: "ISO 8601"
  updated_at: "ISO 8601"
  status: open
```

Sort the full queue by priority_score descending (highest priority first) when writing.

## Output

After writing the queue, print a summary:

```
Scan complete:
- Observations processed: N
- New questions generated: N
- Existing questions updated (merged): N
- Total open questions in queue: N
- Top 3 questions:
  1. [score] question text
  2. [score] question text
  3. [score] question text
```

## Rules

- NEVER research or investigate gaps — only detect and score them
- NEVER delete questions from the queue — append only, status edits only
- NEVER modify observation files — read only
- Always deduplicate before appending
- If no observations exist, report "No observations found" and exit cleanly
- Use Glob with scoped `path:` to find observation files (never from HQ root)
- All IDs must be unique — use timestamp + sequence number
