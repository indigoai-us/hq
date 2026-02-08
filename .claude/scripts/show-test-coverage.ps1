<#
.SYNOPSIS
    Displays E2E test coverage dashboard from test-coverage.jsonl.

.DESCRIPTION
    Reads workspace/metrics/test-coverage.jsonl and displays a formatted dashboard
    showing per-project test coverage, pass rates, trends, and alerts. Integrates
    with the /metrics --tests command.

.PARAMETER Project
    Optional. Filter to a specific project name.

.PARAMETER Days
    Optional. Show only metrics from the last N days. Default: 30.

.PARAMETER HqRoot
    Root of the HQ directory. Defaults to the current directory.

.PARAMETER PassRateThreshold
    Minimum acceptable pass rate percentage. Default: 80.

.EXAMPLE
    .\.claude\scripts\show-test-coverage.ps1

.EXAMPLE
    .\.claude\scripts\show-test-coverage.ps1 -Project my-project -Days 7

.EXAMPLE
    .\.claude\scripts\show-test-coverage.ps1 -PassRateThreshold 90
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$Project = "",

    [Parameter(Mandatory = $false)]
    [int]$Days = 30,

    [Parameter(Mandatory = $false)]
    [string]$HqRoot = (Get-Location).Path,

    [Parameter(Mandatory = $false)]
    [double]$PassRateThreshold = 80
)

# --- Locate data file ---

$coveragePath = Join-Path (Join-Path (Join-Path $HqRoot "workspace") "metrics") "test-coverage.jsonl"

if (-not (Test-Path $coveragePath)) {
    Write-Host ""
    Write-Host "No test coverage data found." -ForegroundColor Yellow
    Write-Host "  Expected: $coveragePath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Collect test metrics first:" -ForegroundColor Gray
    Write-Host '  .\.claude\scripts\collect-test-metrics.ps1 -ResultsPath path\to\agent-results.json -Project my-project' -ForegroundColor White
    Write-Host ""
    exit 0
}

# --- Parse JSONL ---

$entries = @()
$cutoffDate = (Get-Date).AddDays(-$Days).ToUniversalTime()

$lines = Get-Content -Path $coveragePath -Encoding UTF8
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
        continue
    }

    try {
        $entry = $trimmed | ConvertFrom-Json

        # Filter by date
        $entryDate = [DateTime]::Parse($entry.ts).ToUniversalTime()
        if ($entryDate -lt $cutoffDate) {
            continue
        }

        # Filter by project
        if ($Project -ne "" -and $entry.project -ne $Project) {
            continue
        }

        $entries += $entry
    } catch {
        Write-Host "WARNING: Skipping malformed line: $trimmed" -ForegroundColor Yellow
    }
}

if ($entries.Count -eq 0) {
    Write-Host ""
    Write-Host "No test coverage data found for the specified filters." -ForegroundColor Yellow
    if ($Project -ne "") {
        Write-Host "  Project: $Project" -ForegroundColor Gray
    }
    Write-Host "  Period: last $Days days" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

# --- Group by project ---

$projectGroups = $entries | Group-Object -Property { $_.project }

# --- Display header ---

Write-Host ""
$periodLabel = "last $Days days"
Write-Host "E2E Test Coverage ($periodLabel)" -ForegroundColor Cyan
Write-Host ([string]::new([char]0x2550, 55)) -ForegroundColor Cyan
Write-Host ""

$alerts = @()
$overallTotal = 0
$overallPassed = 0

foreach ($group in $projectGroups | Sort-Object Name) {
    $projName = $group.Name
    $runs = $group.Group | Sort-Object { [DateTime]::Parse($_.ts) }
    $latestRun = $runs[-1]

    Write-Host "  $projName" -ForegroundColor White

    # Latest run stats
    $total = [int]$latestRun.total
    $passed = [int]$latestRun.passed
    $failed = [int]$latestRun.failed
    $skipped = [int]$latestRun.skipped
    $flaky = [int]$latestRun.flaky
    $passRate = [double]$latestRun.pass_rate
    $durationMs = [int]$latestRun.duration_ms
    $critPassed = [int]$latestRun.critical_passed
    $critTotal = [int]$latestRun.critical_total

    $overallTotal += $total
    $overallPassed += $passed

    # Test counts
    $countParts = @("$total total")
    if ($passed -gt 0) { $countParts += "$passed passed" }
    if ($failed -gt 0) { $countParts += "$failed failed" }
    if ($skipped -gt 0) { $countParts += "$skipped skipped" }
    if ($flaky -gt 0) { $countParts += "$flaky flaky" }
    Write-Host "    Tests: $($countParts -join ' | ')" -ForegroundColor Gray

    # Pass rate with alert
    $rateColor = if ($passRate -lt $PassRateThreshold) { "Red" } else { "Green" }
    $rateAlert = if ($passRate -lt $PassRateThreshold) { "  [!!! BELOW ${PassRateThreshold}% THRESHOLD]" } else { "" }
    Write-Host "    Pass Rate: ${passRate}%${rateAlert}" -ForegroundColor $rateColor

    if ($passRate -lt $PassRateThreshold) {
        $alerts += "[!] $projName pass rate ${passRate}% is below ${PassRateThreshold}% threshold"
    }

    # Critical path
    if ($critTotal -gt 0) {
        $critColor = if ($critPassed -lt $critTotal) { "Red" } else { "Green" }
        Write-Host "    Critical: ${critPassed}/${critTotal} passed" -ForegroundColor $critColor
        if ($critPassed -lt $critTotal) {
            $alerts += "[!] $projName has critical path test failures: ${critPassed}/${critTotal}"
        }
    }

    # Trend (last 3 runs)
    if ($runs.Count -ge 2) {
        $trendRuns = if ($runs.Count -ge 3) { $runs[-3..-1] } else { $runs[-2..-1] }
        $trendValues = $trendRuns | ForEach-Object { "$([double]$_.pass_rate)%" }
        $trendStr = $trendValues -join " -> "

        # Check for declining trend
        $trendColor = "Gray"
        if ($runs.Count -ge 3) {
            $r1 = [double]$trendRuns[0].pass_rate
            $r2 = [double]$trendRuns[1].pass_rate
            $r3 = [double]$trendRuns[2].pass_rate
            if ($r3 -lt $r2 -and $r2 -lt $r1) {
                $trendColor = "Yellow"
                $trendStr += " (declining)"
                $alerts += "[!] $projName pass rate is declining over last 3 runs"
            } elseif ($r3 -gt $r2 -and $r2 -gt $r1) {
                $trendColor = "Green"
                $trendStr += " (improving)"
            }
        }
        Write-Host "    Trend: $trendStr" -ForegroundColor $trendColor
    } else {
        Write-Host "    Trend: (insufficient data - need 2+ runs)" -ForegroundColor Gray
    }

    # Duration
    $durationSec = [math]::Round($durationMs / 1000, 1)
    Write-Host "    Duration: ${durationSec}s" -ForegroundColor Gray

    # Run count
    Write-Host "    Runs: $($runs.Count) in period" -ForegroundColor Gray

    Write-Host ""
}

# --- Overall summary ---

Write-Host ([string]::new([char]0x2500, 55)) -ForegroundColor Gray

$overallRate = if ($overallTotal -gt 0) { [math]::Round(($overallPassed / $overallTotal) * 100, 1) } else { 0.0 }
$overallColor = if ($overallRate -lt $PassRateThreshold) { "Red" } else { "Green" }

Write-Host "  Overall: $overallTotal tests | ${overallRate}% pass rate" -ForegroundColor $overallColor

# --- Alerts ---

if ($alerts.Count -gt 0) {
    Write-Host ""
    Write-Host "  ALERTS:" -ForegroundColor Red
    foreach ($alert in $alerts) {
        Write-Host "    $alert" -ForegroundColor Red
    }
}

Write-Host ""
exit 0
