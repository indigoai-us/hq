---
description: Run one full curiosity cycle — decay, tree, scan, investigate, feedback, reindex
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
argument-hint: [--catch-up]
visibility: public
---

# /curiosity-cycle - Run One Full Curiosity Cycle

Orchestrates the complete virtuous cycle: decay scoring, knowledge tree rebuild, gap scanning, investigation of top questions, feedback computation, and reindexing.

## Arguments

**`$ARGUMENTS`**

- Empty or no arg: run one cycle immediately
- `--catch-up`: process up to 3 missed cycles (used by /startwork integration)

## Process

### 0. Read and update cron state

Read `workspace/curiosity/cron-state.yaml`. If it does not exist, create it with defaults (last_run: never, frequency: daily, status: idle, missed_runs: 0).

If `status` is `running`, check if it's stale (last_run_start older than 2 hours). If stale, reset to idle and proceed. If not stale, report "A cycle is already running" and exit.

Set `status: running` and write the file back immediately.

**Catch-up mode:** If `$ARGUMENTS` contains `--catch-up`:
1. Calculate how many cycles were missed: if `last_run` is `never`, missed = 1. Otherwise, compute days between `last_run` and now, divide by frequency interval (1 day for "daily"). missed = floor(days_elapsed / interval) - but cap at 3.
2. If missed <= 0, report "No missed cycles" and set status back to idle. Exit.
3. Run the cycle steps below `missed` times (max 3). Between each cycle iteration, briefly note "Cycle N of M".

If NOT catch-up mode, run the cycle steps exactly once.

### 1. Knowledge decay

Run the decay script:

```bash
cd C:/hq && bash scripts/knowledge-decay.sh
```

This updates confidence scores on knowledge files and emits observations for files dropping below 0.5. If the script fails, log the error but continue to the next step.

### 2. Build knowledge tree

Run the tree generator:

```bash
cd C:/hq && bash scripts/build-knowledge-tree.sh
```

This scans all knowledge files and rebuilds `knowledge/knowledge-tree.yaml` and `knowledge/knowledge-tree.md`. If the script fails, log the error but continue.

### 3. Scan and prioritize (inline — from curiosity-engine/scan-and-prioritize)

Perform gap detection and question generation inline:

1. Read all YAML files from `workspace/curiosity/observations/` using Glob (scoped to that directory).
2. Read `knowledge/knowledge-tree.yaml` for the current taxonomy.
3. Read `workspace/curiosity/queue.yaml` for existing questions.
4. For each observation, determine the gap type and check if the knowledge tree already covers the topic:
   - **knowledge_gap** — no matching entry in the tree for this topic
   - **stale_revalidation** — matching entry has low confidence (<0.5)
   - **coverage_gap** — domain/category has very few entries relative to importance
   - **pattern_gap** — recurring pattern not documented in `knowledge/patterns/`
5. Score each gap: `priority_score = frequency * impact * staleness_factor` (see `workers/curiosity-engine/skills/scan-and-prioritize.md` for the full scoring rubric).
6. Deduplicate against existing open/in_progress questions in the queue — merge observations for overlapping questions rather than creating duplicates.
7. Append new questions to `workspace/curiosity/queue.yaml` with format:
   ```yaml
   - id: "Q-YYYYMMDD-HHMMSS-NNN"
     question: "Clear research question"
     type: knowledge_gap | stale_revalidation | coverage_gap | pattern_gap
     domain: "domain"
     priority_score: 0-100
     source_observations: ["observations/file.yaml"]
     created_at: "ISO 8601"
     updated_at: "ISO 8601"
     status: open
   ```
8. Sort the full queue by priority_score descending.
9. Print a scan summary (observations processed, new questions, total open).

**Rules:** Never research gaps here — only detect and score. Never delete questions. Never modify observation files.

### 4. Investigate top 3 open questions (inline — from curiosity-engine/investigate-gap)

For each of the top 3 open questions in the queue (sorted by priority_score descending):

1. Select the question and set its `status` to `in_progress` in the queue file.
2. **Research existing knowledge first:**
   ```bash
   qmd vsearch "{question text}" --json -n 10
   qmd search "{key terms}" --json -n 10
   ```
3. If existing knowledge does NOT adequately answer the question, use WebSearch and WebFetch for external research.
4. Based on findings, create a new knowledge file or update an existing one:
   - Place in appropriate domain directory under `knowledge/`
   - Include confidence frontmatter (confidence: 0.9, tags, created_at, source: curiosity-engine)
5. Update `knowledge/knowledge-tree.yaml` with the new or updated entry.
6. Mark the question as `resolved` in queue.yaml with `resolved_at`, `resolution_note`, and `knowledge_file` fields.

**Context check:** Before each investigation, assess remaining context window. If context is running low, skip remaining investigations — complete current step, update cron-state, and checkpoint. Better to investigate 1-2 thoroughly than 3 poorly.

**Rules:** Never scan for new gaps here. Never delete questions. Always search existing knowledge (qmd) before web search. Set confidence to 0.9 (not 1.0). If research is inconclusive, set status to `wont_fix` with explanation.

### 5. Compute feedback (inline — from curiosity-engine/compute-feedback)

Compute cycle metrics and write reports:

1. Count observations processed (all files in `workspace/curiosity/observations/`), grouped by type.
2. Analyze the queue: count questions by status (generated, resolved, wont_fix, open, in_progress).
3. Read `knowledge/knowledge-tree.yaml` — count total entries. Compare against previous cycle report in `workspace/curiosity/cycles/` for coverage delta.
4. Track confidence changes by comparing current knowledge tree confidence values against previous cycle's snapshot.
5. Write cycle report to `workspace/curiosity/cycles/{YYYY-MM-DD}.yaml` with all metrics.
6. Update `workspace/curiosity/metrics.yaml`:
   - Increment total_cycles
   - Update total_questions_resolved, avg_questions_per_cycle, knowledge_growth_rate
   - Re-rank top_gap_domains
   - Update observation_type_distribution
7. **Sensor recalibration:** For each observation type with 3+ total questions and wont_fix_rate > 50%, reduce its weight by 0.8x (floor 0.2). If wont_fix_rate < 20% and weight < 1.0, increase by 1.1x (ceiling 1.0).
8. Print feedback summary.

### 6. Reindex

```bash
qmd update 2>/dev/null || true
```

### 7. Update cron state

Read `workspace/curiosity/cron-state.yaml` and update:

```yaml
last_run: "{current ISO 8601 timestamp}"
next_scheduled: "{tomorrow at same hour as last next_scheduled, or now + 24h}"
missed_runs: 0
status: idle
last_error: null
```

If any step failed with an error that prevented completion:

```yaml
status: error
last_error: "Brief description of what failed"
```

Even on error, update `last_run` so the cycle doesn't retry immediately.

## Error Handling

- Each step (1-6) is independent. If one fails, log the error and continue to the next step.
- Step 7 (cron state update) always runs, even if earlier steps failed.
- If a catastrophic error occurs (can't read/write cron-state.yaml), report the error clearly.
- The cycle is interruptible: if context is running low, finish the current step, update cron-state with what was completed, and suggest running `/curiosity-cycle` again to continue.

## Rules

- Execute all logic inline — do NOT spawn sub-agents or call /run
- Cap investigate-gap at 3 questions maximum per cycle
- Never delete observations or queue entries
- All file writes use absolute paths
- If scripts (knowledge-decay.sh, build-knowledge-tree.sh) don't exist or fail, skip gracefully
- After completion, do NOT auto-commit — the caller decides when to commit
