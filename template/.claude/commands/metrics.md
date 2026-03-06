---
description: View worker execution metrics and test coverage
allowed-tools: Bash, Read
argument-hint: [worker-id|--tests] [--days N]
visibility: public
---

# /metrics - Worker Observability

View worker execution metrics, statistics, and test coverage.

**Arguments:** $ARGUMENTS

## Usage

```bash
/metrics                      # Summary of all workers + test coverage
/metrics {worker-id}          # Metrics for specific worker
/metrics --days 7             # Last 7 days only
/metrics {worker-id} mrr      # Specific worker + skill
/metrics --tests              # Test coverage only
/metrics --tests {project}    # Test coverage for specific project
```

## Metrics File

Location: `workspace/metrics/metrics.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-01-23T14:30:52.000Z","worker":"{worker-id}","skill":"mrr","duration_ms":5000,"status":"completed","files":1}
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

   {worker-id}
     Runs: 45 (98% success)
     Avg duration: 3.2s
     Top skills: mrr (20), pnl (12), cash-position (8)

   {worker-id}
     Runs: 23 (100% success)
     Avg duration: 8.5s
     Top skills: suggestposts (15), scheduleposts (8)

   {worker-id}
     Runs: 12 (92% success)
     Avg duration: 15.3s
     Top skills: anomaly-check (10), forecast (2)

   ───────────────────────────────────────────────────
   Total: 80 runs | 97% success | 6.2s avg
   ```

## Detailed View

For specific worker:

```
/metrics {worker-id}

{worker-id} Metrics (last 30 days)
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

---

## Test Coverage Metrics

### Test Metrics File

Location: `workspace/metrics/test-coverage.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-02-02T07:48:41.131Z","project":"hq-installer","suite":"e2e","total":21,"passed":21,"failed":0,"skipped":0,"flaky":0,"duration_ms":7358,"source":"installer/tests/e2e/agent-results.json"}
```

### Test Fields

| Field | Description |
|-------|-------------|
| `ts` | ISO8601 timestamp of test run |
| `project` | Project name (from PRD or folder) |
| `suite` | Test suite name (e.g., "e2e", "unit") |
| `total` | Total number of tests |
| `passed` | Number of passing tests |
| `failed` | Number of failed tests |
| `skipped` | Number of skipped tests |
| `flaky` | Number of flaky tests (passed on retry) |
| `duration_ms` | Total execution time in milliseconds |
| `source` | Path to source results file |

### Process for --tests

1. **Read test coverage file**
   ```bash
   cat workspace/metrics/test-coverage.jsonl
   ```

2. **Filter by arguments**
   - If project provided: filter to that project
   - If --days N: filter to last N days

3. **Calculate statistics**
   - Pass rate: (passed / total) * 100
   - Trend: compare to previous run
   - Coverage alert: warn if pass rate < 80%

4. **Display summary**

   ```
   Test Coverage (last 30 days)
   ═══════════════════════════════════════════════════

   hq-installer
     Latest: 21/21 tests passing (100%) ✓
     Trend: ● ● ● ● ● (last 5 runs: 100% 100% 100% 95% 100%)
     Avg duration: 7.4s

   protofit (example)
     Latest: 45/50 tests passing (90%)
     Trend: ● ● ○ ● ● (last 5 runs: 90% 95% 85% 92% 88%)
     Avg duration: 15.2s

   ───────────────────────────────────────────────────
   Total: 66/71 tests | 93% pass rate | 11.3s avg

   ⚠ ALERT: No projects below 80% threshold
   ```

### Collecting Test Metrics

Run after E2E tests to record metrics:

```bash
pwsh .claude/scripts/collect-test-metrics.ps1
```

Or fetch from GitHub Actions:

```bash
# Download latest test results
gh run download $(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId') -n e2e-results-json

# Process and record
pwsh .claude/scripts/collect-test-metrics.ps1
```

### Coverage Alerts

**Threshold: 80%**

If any project's pass rate drops below 80%, display alert:

```
⚠ COVERAGE ALERT: protofit at 75% (below 80% threshold)
   Failed tests: 12 | Last passing: 2026-01-30
   Action: Review failures before merging
```

### Trend Tracking

Trends show last 5 test runs per project:
- ● = 100% pass rate
- ◐ = 80-99% pass rate
- ○ = Below 80% pass rate (alert)

### Adding New Projects

Edit `.claude/scripts/collect-test-metrics.ps1` to add:

```powershell
$testResultPaths = @(
    @{ Project = "hq-installer"; Path = "installer/tests/e2e/agent-results.json" }
    @{ Project = "protofit"; Path = "apps/protofit/tests/e2e/agent-results.json" }
    # Add more projects here
)
```
