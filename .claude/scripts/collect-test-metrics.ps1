<#
.SYNOPSIS
    Collects E2E test metrics from agent-results.json and appends to test-coverage.jsonl.

.DESCRIPTION
    Parses an agent-results.json file (produced by process-results.js from Playwright
    test output) and appends a structured summary line to workspace/metrics/test-coverage.jsonl.
    This integrates E2E test data into the /metrics system for trend tracking and alerting.

    The agent-results.json schema (from US-011):
    {
      summary: { total, passed, failed, skipped, flaky, duration },
      status: "passed" | "failed",
      failures: [...],
      passed: [...],
      meta: { timestamp, baseUrl, executionMode, playwrightVersion }
    }

.PARAMETER ResultsPath
    Path to the agent-results.json file to process.

.PARAMETER Project
    Project name/slug to associate with this test run.

.PARAMETER HqRoot
    Root of the HQ directory. Defaults to the current directory.

.EXAMPLE
    .\.claude\scripts\collect-test-metrics.ps1 -ResultsPath tests/e2e/agent-results.json -Project my-project

.EXAMPLE
    .\.claude\scripts\collect-test-metrics.ps1 -ResultsPath C:\repos\app\agent-results.json -Project hq-cloud -HqRoot C:\hq-e2e
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ResultsPath,

    [Parameter(Mandatory = $true)]
    [string]$Project,

    [Parameter(Mandatory = $false)]
    [string]$HqRoot = (Get-Location).Path
)

# --- Validate inputs ---

if (-not (Test-Path $ResultsPath)) {
    Write-Host "ERROR: agent-results.json not found: $ResultsPath" -ForegroundColor Red
    exit 1
}

# --- Parse agent-results.json ---

try {
    $results = Get-Content -Path $ResultsPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: Failed to parse JSON from ${ResultsPath}: $_" -ForegroundColor Red
    exit 1
}

# Validate required fields
if (-not $results.summary) {
    Write-Host "ERROR: agent-results.json missing 'summary' field" -ForegroundColor Red
    exit 1
}

$summary = $results.summary

# --- Calculate pass rate ---

$total = [int]($summary.total)
$passed = [int]($summary.passed)
$failed = [int]($summary.failed)
$skipped = [int]($summary.skipped)
$flaky = [int]($summary.flaky)
$durationMs = [int]($summary.duration)

if ($total -eq 0) {
    Write-Host "WARNING: No tests found in agent-results.json" -ForegroundColor Yellow
    $passRate = 0.0
} else {
    # Pass rate = passed / (total - skipped) * 100
    $denominator = $total - $skipped
    if ($denominator -eq 0) {
        $passRate = 0.0
    } else {
        $passRate = [math]::Round(($passed / $denominator) * 100, 1)
    }
}

# --- Count critical path tests ---

# Critical path tests are identified by convention in the passed/failures arrays.
# We count tests from the passed and failures arrays that originated from
# critical-path scenarios. Since agent-results.json doesn't directly track
# criticalPath, we count all passed and failed tests as a baseline.
# Projects using PRD e2eTests with criticalPath markers should extend this.
$criticalPassed = 0
$criticalTotal = 0

# If the results contain a criticalPath breakdown (extended schema), use it
if ($results.PSObject.Properties['criticalPath']) {
    $criticalPassed = [int]($results.criticalPath.passed)
    $criticalTotal = [int]($results.criticalPath.total)
} else {
    # Fallback: treat all tests as critical (conservative default)
    $criticalPassed = $passed
    $criticalTotal = $total - $skipped
}

# --- Build metrics entry ---

$timestamp = if ($results.meta -and $results.meta.timestamp) {
    $results.meta.timestamp
} else {
    (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$entry = @{
    ts              = $timestamp
    project         = $Project
    total           = $total
    passed          = $passed
    failed          = $failed
    skipped         = $skipped
    flaky           = $flaky
    pass_rate       = $passRate
    duration_ms     = $durationMs
    status          = $results.status
    source          = (Split-Path $ResultsPath -Leaf)
    critical_passed = $criticalPassed
    critical_total  = $criticalTotal
}

$jsonLine = $entry | ConvertTo-Json -Compress

# --- Ensure output directory exists ---

$metricsDir = Join-Path (Join-Path $HqRoot "workspace") "metrics"
if (-not (Test-Path $metricsDir)) {
    New-Item -ItemType Directory -Path $metricsDir -Force | Out-Null
}

$outputPath = Join-Path $metricsDir "test-coverage.jsonl"

# --- Append to JSONL ---

Add-Content -Path $outputPath -Value $jsonLine -Encoding UTF8

# --- Output summary ---

Write-Host ""
Write-Host "Test Coverage Collected" -ForegroundColor Cyan
Write-Host "  Project:    $Project" -ForegroundColor White
Write-Host "  Total:      $total tests" -ForegroundColor White
Write-Host "  Passed:     $passed" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  Failed:     $failed" -ForegroundColor Red
} else {
    Write-Host "  Failed:     $failed" -ForegroundColor White
}
Write-Host "  Skipped:    $skipped" -ForegroundColor White
Write-Host "  Flaky:      $flaky" -ForegroundColor Yellow
Write-Host "  Pass Rate:  ${passRate}%" -ForegroundColor $(if ($passRate -lt 80) { "Red" } else { "Green" })
Write-Host "  Critical:   ${criticalPassed}/${criticalTotal}" -ForegroundColor $(if ($criticalPassed -lt $criticalTotal) { "Red" } else { "Green" })
Write-Host "  Duration:   $([math]::Round($durationMs / 1000, 1))s" -ForegroundColor White
Write-Host ""
Write-Host "  Appended to: $outputPath" -ForegroundColor Gray

# --- Alert on low pass rate ---

if ($passRate -lt 80) {
    Write-Host ""
    Write-Host "  [ALERT] Pass rate ${passRate}% is below 80% threshold!" -ForegroundColor Red
    Write-Host ""
}

if ($criticalPassed -lt $criticalTotal) {
    Write-Host "  [ALERT] Critical path tests failing: ${criticalPassed}/${criticalTotal} passed" -ForegroundColor Red
    Write-Host ""
}

exit 0
