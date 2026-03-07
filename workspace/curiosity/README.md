# Curiosity Engine

Self-improving knowledge system for HQ. Detects knowledge gaps from sessions, prioritizes research questions, investigates them, and grows the knowledge base autonomously.

## How It Works

```
Sessions emit observations --> observations/ directory
                                    |
                                    v
              Curiosity cycle scans + deduplicates
                                    |
                                    v
              Research questions added to queue.yaml
                                    |
                                    v
              Top questions investigated (qmd search + knowledge creation)
                                    |
                                    v
              New knowledge files written with confidence frontmatter
                                    |
                                    v
              knowledge-tree rebuilt, metrics updated
                                    |
                                    v
              knowledge-decay.sh applies time-based confidence decay
```

## Files

| File | Purpose |
|------|---------|
| `observations/*.yaml` | Raw gap signals from sessions, learnings, and CLAUDE.md rules |
| `queue.yaml` | Prioritized research question queue (append-only, status-tracked) |
| `metrics.yaml` | Cumulative metrics across all cycles |
| `cron-state.yaml` | When the cycle last ran and when it's next due |
| `cycles/*.yaml` | Per-cycle reports with investigation details |
| `README.md` | This file |

## Scripts

| Script | Purpose | Run from |
|--------|---------|----------|
| `scripts/build-knowledge-tree.sh` | Scans all knowledge .md files, generates `knowledge/knowledge-tree.yaml` and `.md` | `C:\hq` |
| `scripts/knowledge-decay.sh` | Applies confidence decay to knowledge files with frontmatter based on weeks since last validation | `C:\hq` |

## Running Manually

### Full Curiosity Cycle

Use the `/curiosity-cycle` slash command, which:
1. Scans observations for new gap signals
2. Deduplicates against existing queue questions
3. Prioritizes by frequency x impact x staleness
4. Investigates top 3 questions (search existing knowledge, create/consolidate if missing)
5. Updates queue statuses, writes cycle report, updates metrics

### Individual Steps

```bash
# Rebuild knowledge tree (after adding/editing knowledge files)
cd C:/hq && bash scripts/build-knowledge-tree.sh

# Run confidence decay (applies time-based decay to frontmatter)
cd C:/hq && bash scripts/knowledge-decay.sh
# Dry run:
cd C:/hq && bash scripts/knowledge-decay.sh --dry-run
```

## Autonomous Cron

The cycle runs daily at 06:00 UTC. If missed (e.g., HQ not running), `/startwork` detects the gap and runs a catch-up cycle.

State tracked in `cron-state.yaml`:
- `last_run` -- timestamp of last completed cycle
- `next_scheduled` -- when the next cycle is due
- `missed_runs` -- count of missed cycles since last successful run
- `status` -- `idle`, `running`, or `error`

## Adding Manual Observations

To flag a knowledge gap manually, create a YAML file in `observations/`:

```yaml
# observations/manual-YYYYMMDD-description.yaml
type: knowledge_gap  # or: correction, stale_revalidation, coverage_gap, pattern_gap, worker_limitation
domain: integrations  # knowledge domain
signal: "Description of what's missing or wrong"
source_file: optional/path/to/related/file
detected_at: "2026-03-06T12:00:00Z"
frequency: 1
impact: high  # low, medium, high, critical
```

The next curiosity cycle will pick it up, create a research question, and investigate.

## Observation Types

| Type | Meaning | Source |
|------|---------|--------|
| `knowledge_gap` | Knowledge that should exist but doesn't | Sessions hitting dead ends, zero-result searches |
| `correction` | Knowledge that was wrong | User corrections, /learn with fixes |
| `stale_revalidation` | Knowledge that may be outdated | confidence decay below threshold |
| `coverage_gap` | Domain with no knowledge at all | Knowledge tree analysis |
| `pattern_gap` | Reusable pattern not yet documented | Repeated ad-hoc solutions |
| `worker_limitation` | Worker missing a skill or tool | Worker execution failures |

## Priority Scoring

Questions are scored 0-100 based on:
- **Frequency** -- How many observations point to this gap (more = higher priority)
- **Impact** -- How critical the gap is (critical=40, high=30, medium=20, low=10)
- **Staleness** -- How long the gap has existed without being addressed

## Knowledge File Frontmatter

Knowledge files created by the curiosity engine include:

```yaml
---
confidence: 0.9        # 0.0-1.0, decays over time
last_validated: "2026-03-06"  # Reset on revalidation
decay_rate: 0.02       # Confidence lost per week (default 0.02)
tags: [topic1, topic2]
related:
  - knowledge/path/to/related.md
---
```

`knowledge-decay.sh` reduces confidence weekly. Files below 0.5 emit revalidation observations. Files below 0.3 get a warning banner.

## Metrics

`metrics.yaml` tracks:
- Total cycles run, questions resolved, knowledge growth rate
- Top gap domains (where the most unresolved questions exist)
- Observation type distribution
- Sensor recalibration weights (reduced for observation types that produce low-value questions)
