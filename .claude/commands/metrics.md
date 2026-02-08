---
description: View worker execution metrics and E2E test coverage
allowed-tools: Bash, Read
argument-hint: [worker-id] [--days N] [--tests] [--tests --project NAME]
visibility: public
---

# /metrics - Worker Observability

View worker execution metrics, statistics, and E2E test coverage.

**Arguments:** $ARGUMENTS

## Usage

```bash
/metrics                      # Summary of all workers
/metrics cfo-{company}        # Metrics for specific worker
/metrics --days 7             # Last 7 days only
/metrics cfo-{company} mrr    # Specific worker + skill
/metrics --tests              # E2E test coverage summary
/metrics --tests --project X  # Test coverage for specific project
```

## Metrics File

Location: `workspace/metrics/metrics.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-01-23T14:30:52.000Z","worker":"cfo-{company}","skill":"mrr","duration_ms":5000,"status":"completed","files":1}
```

## Test Coverage File

Location: `workspace/metrics/test-coverage.jsonl`

Each line is a JSON object representing a test run:

```json
{"ts":"2026-02-08T10:00:00.000Z","project":"my-project","total":10,"passed":9,"failed":1,"skipped":0,"flaky":0,"pass_rate":90.0,"duration_ms":45000,"status":"passed","source":"agent-results.json","critical_passed":5,"critical_total":5}
```

### Test Coverage Fields

| Field | Description |
|-------|-------------|
| `ts` | ISO8601 timestamp of the test run |
| `project` | Project name/slug |
| `total` | Total number of tests |
| `passed` | Number of tests that passed |
| `failed` | Number of tests that failed |
| `skipped` | Number of tests skipped |
| `flaky` | Number of flaky tests (passed after retry) |
| `pass_rate` | Pass rate as percentage (0-100) |
| `duration_ms` | Total test duration in milliseconds |
| `status` | Overall status: `passed` or `failed` |
| `source` | Source file (e.g., `agent-results.json`) |
| `critical_passed` | Critical path tests that passed |
| `critical_total` | Total critical path tests |

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

   x-{your-name}
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

## --tests Flag: E2E Test Coverage

When `--tests` is passed, display test coverage metrics instead of worker metrics.

### Collection

Collect test metrics from `agent-results.json` files:

```powershell
.\.claude\scripts\collect-test-metrics.ps1 -ResultsPath path\to\agent-results.json -Project my-project
```

### Display

Show test coverage dashboard:

```powershell
.\.claude\scripts\show-test-coverage.ps1
.\.claude\scripts\show-test-coverage.ps1 -Project my-project
.\.claude\scripts\show-test-coverage.ps1 -Days 7
```

### Test Coverage Display

```
E2E Test Coverage
═══════════════════════════════════════════════════

my-project
  Tests: 10 total | 9 passed | 1 failed | 0 skipped
  Pass Rate: 90.0%  [!!! BELOW 80% THRESHOLD]
  Critical: 5/5 passed
  Trend: 90% -> 95% -> 90% (last 3 runs)
  Duration: 45.0s

other-project
  Tests: 25 total | 25 passed | 0 failed | 0 skipped
  Pass Rate: 100.0%
  Critical: 8/8 passed
  Trend: 100% -> 100% -> 100% (last 3 runs)
  Duration: 120.5s

───────────────────────────────────────────────────
Overall: 35 tests | 97.1% pass rate
ALERTS:
  [!] my-project pass rate 90.0% is below 80% threshold
```

### Alerts

The test coverage display triggers alerts when:
- Pass rate drops below **80%** for any project
- Critical path tests fail
- Pass rate trend is declining (3+ consecutive drops)

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
- Test coverage collected via `collect-test-metrics.ps1` from `agent-results.json` files
- Test coverage stored in `workspace/metrics/test-coverage.jsonl` (same JSONL convention)
- Alert threshold for pass rate is 80% (configurable in `show-test-coverage.ps1`)
