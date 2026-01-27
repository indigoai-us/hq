<#
.SYNOPSIS
    Pure Ralph Loop - Canonical external orchestrator

.DESCRIPTION
    Runs the SAME prompt in a loop. Claude picks the task.
    Fresh context per iteration. Loop until all tasks pass.

.PARAMETER PrdPath
    Full path to the PRD JSON file

.PARAMETER TargetRepo
    Full path to the target repository

.EXAMPLE
    .\pure-ralph-loop.ps1 -PrdPath "C:/my-hq/projects/my-project/prd.json" -TargetRepo "C:/my-hq"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$PrdPath,

    [Parameter(Mandatory=$true)]
    [string]$TargetRepo,

    [string]$HqPath = "C:/my-hq"
)

# ============================================================================
# Configuration
# ============================================================================

$BasePromptPath = Join-Path $HqPath "prompts/pure-ralph-base.md"
$ProjectName = (Split-Path (Split-Path $PrdPath -Parent) -Leaf)
$LogDir = Join-Path $HqPath "workspace/orchestrator/$ProjectName"
$LogFile = Join-Path $LogDir "pure-ralph.log"

# Create log directory
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# ============================================================================
# Functions
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $entry

    switch ($Level) {
        "ERROR"   { Write-Host $entry -ForegroundColor Red }
        "WARN"    { Write-Host $entry -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $entry -ForegroundColor Green }
        default   { Write-Host $entry }
    }
}

function Get-TaskProgress {
    $prd = Get-Content $PrdPath -Raw | ConvertFrom-Json
    $total = $prd.features.Count
    $complete = ($prd.features | Where-Object { $_.passes -eq $true }).Count
    return @{ Total = $total; Complete = $complete; Remaining = $total - $complete }
}

function Build-Prompt {
    # Read base prompt and substitute only PRD_PATH and TARGET_REPO
    $prompt = Get-Content $BasePromptPath -Raw
    $prompt = $prompt -replace '\{\{PRD_PATH\}\}', $PrdPath
    $prompt = $prompt -replace '\{\{TARGET_REPO\}\}', $TargetRepo
    return $prompt
}

# ============================================================================
# Main Loop
# ============================================================================

Write-Host ""
Write-Host "=== Pure Ralph Loop ===" -ForegroundColor Cyan
Write-Host "PRD: $PrdPath" -ForegroundColor Gray
Write-Host "Target: $TargetRepo" -ForegroundColor Gray
Write-Host "Log: $LogFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Same prompt every iteration. Claude picks the task." -ForegroundColor Yellow
Write-Host ""

Write-Log "Pure Ralph Loop started"
Write-Log "PRD: $PrdPath"
Write-Log "Target: $TargetRepo"

# Build the prompt ONCE (only PRD_PATH and TARGET_REPO substituted)
$prompt = Build-Prompt
$promptFile = Join-Path $LogDir "current-prompt.md"
$prompt | Out-File -FilePath $promptFile -Encoding utf8

Write-Log "Prompt built and saved to $promptFile"

$iteration = 0
$maxIterations = 50

while ($iteration -lt $maxIterations) {
    $iteration++

    $progress = Get-TaskProgress

    Write-Host ""
    Write-Host "--- Iteration $iteration ---" -ForegroundColor Cyan
    Write-Log "Iteration $iteration - Progress: $($progress.Complete)/$($progress.Total)"

    # Check if all done
    if ($progress.Remaining -eq 0) {
        Write-Host ""
        Write-Host "=== ALL TASKS COMPLETE ===" -ForegroundColor Green
        Write-Log "All tasks complete!" "SUCCESS"
        break
    }

    Write-Host "Tasks remaining: $($progress.Remaining)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opening Claude in new window..." -ForegroundColor Cyan
    Write-Host ">>> WATCH CLAUDE WORK IN THE NEW WINDOW <<<" -ForegroundColor Green
    Write-Host ""

    Write-Log "Spawning Claude session"

    # Launch Claude in a NEW window with the SAME prompt
    # The window will close automatically when Claude exits
    $claudeCmd = @"
cd '$TargetRepo'
Write-Host '=== Pure Ralph Session ===' -ForegroundColor Cyan
Write-Host 'Reading PRD, picking task, implementing...' -ForegroundColor Gray
Write-Host ''
claude --permission-mode bypassPermissions (Get-Content '$promptFile' -Raw)
Write-Host ''
Write-Host 'Session complete. Window closing in 3 seconds...' -ForegroundColor Green
Start-Sleep -Seconds 3
exit
"@

    # Start new window and WAIT for it to close
    $proc = Start-Process powershell -ArgumentList "-Command", $claudeCmd -PassThru

    Write-Host "Waiting for Claude session (PID: $($proc.Id))..." -ForegroundColor Gray
    $proc.WaitForExit()

    Write-Log "Claude session ended"

    # Brief pause before next iteration
    Start-Sleep -Seconds 2
}

if ($iteration -ge $maxIterations) {
    Write-Log "Safety limit reached ($maxIterations iterations)" "WARN"
}

# Final summary
$progress = Get-TaskProgress
Write-Host ""
Write-Host "=== Final Summary ===" -ForegroundColor Cyan
Write-Host "Completed: $($progress.Complete)/$($progress.Total) tasks" -ForegroundColor $(if ($progress.Remaining -eq 0) { "Green" } else { "Yellow" })
Write-Host "Log: $LogFile" -ForegroundColor Gray

Write-Log "Loop ended. Final: $($progress.Complete)/$($progress.Total) complete"
