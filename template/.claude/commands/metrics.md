---
description: View worker execution metrics
allowed-tools: Bash, Read
argument-hint: [worker-id] [--days N]
visibility: public
---

# /metrics - Worker Observability

View worker execution metrics and statistics.

**Arguments:** $ARGUMENTS

## Usage

```bash
/metrics                      # Summary of all workers
/metrics cfo-{company}      # Metrics for specific worker
/metrics --days 7             # Last 7 days only
/metrics cfo-{company} mrr  # Specific worker + skill
```

## Metrics File

Location: `workspace/metrics/metrics.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-01-23T14:30:52.000Z","worker":"cfo-{company}","skill":"mrr","duration_ms":5000,"status":"completed","files":1}
```

## Fields

| Field | Description |
|-------|-------------|
| `ts` | ISO8601 timestamp |
| `worker` | Worker ID |
| `skill` | Skill executed |
| `duration_ms` | Execution time in milliseconds |
| `status` | `completed` or `error` |
| `files` | Number of files created/modified |
| `error` | Error message (if status=error) |

## Process

1. **Read metrics file**
   ```bash
   cat workspace/metrics/metrics.jsonl
   ```

2. **Filter by arguments**
   - If worker-id provided: filter to that worker
   - If --days N: filter to last N days
   - If skill provided: filter to that skill

3. **Calculate statistics**
   - Total runs
   - Success rate
   - Average duration
   - Most used skills

4. **Display summary**

   ```
   Worker Metrics (last 30 days)
   ═══════════════════════════════════════════════════

   cfo-{company}
     Runs: 45 (98% success)
     Avg duration: 3.2s
     Top skills: mrr (20), pnl (12), cash-position (8)

   x-{your-handle}
     Runs: 23 (100% success)
     Avg duration: 8.5s
     Top skills: suggestposts (15), scheduleposts (8)

   {company}-analyst
     Runs: 12 (92% success)
     Avg duration: 15.3s
     Top skills: anomaly-check (10), forecast (2)

   ───────────────────────────────────────────────────
   Total: 80 runs | 97% success | 6.2s avg
   ```

## Detailed View

For specific worker:

```
/metrics cfo-{company}

cfo-{company} Metrics (last 30 days)
═══════════════════════════════════════════════════

Skills:
  mrr             20 runs   2.1s avg   100% success
  pnl             12 runs   4.5s avg   100% success
  cash-position    8 runs   3.8s avg    88% success
  burn-rate        5 runs   2.9s avg   100% success

Recent runs:
  2026-01-23 14:30   mrr           completed   2.1s
  2026-01-23 09:15   pnl           completed   4.2s
  2026-01-22 16:00   cash-position error       0.5s
  2026-01-22 11:30   mrr           completed   2.3s

Errors (1):
  2026-01-22 16:00 cash-position: "QuickBooks token expired"
```

## Notes

- Metrics auto-appended by PostToolsHook after each skill run
- File is append-only JSONL for efficiency
- Rotate/archive manually if file grows large
