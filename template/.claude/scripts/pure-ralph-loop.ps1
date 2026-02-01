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

.PARAMETER Manual
    Run in manual mode (interactive TUI, manually close windows)
    Default is auto mode (uses -p flag, auto-exits)

.EXAMPLE
    # Auto mode (default) - fully autonomous
    .\pure-ralph-loop.ps1 -PrdPath "C:/my-hq/projects/my-project/prd.json" -TargetRepo "C:/my-hq"

    # Manual mode - see chain of thought, close windows manually
    .\pure-ralph-loop.ps1 -PrdPath "C:/my-hq/projects/my-project/prd.json" -TargetRepo "C:/my-hq" -Manual
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$PrdPath,

    [Parameter(Mandatory=$true)]
    [string]$TargetRepo,

    [string]$HqPath = "C:/my-hq",

    [switch]$Manual
)

# ============================================================================
# Configuration
# ============================================================================

$BasePromptPath = Join-Path $HqPath "prompts/pure-ralph-base.md"
$ProjectName = (Split-Path (Split-Path $PrdPath -Parent) -Leaf)
$LogDir = Join-Path $HqPath "workspace/orchestrator/$ProjectName"
$LogFile = Join-Path $LogDir "pure-ralph.log"
$LockFile = Join-Path $TargetRepo ".pure-ralph.lock"

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

function Create-LockFile {
    $lockContent = @{
        project = $ProjectName
        pid = $PID
        started_at = (Get-Date -Format "o")
    } | ConvertTo-Json
    $lockContent | Out-File -FilePath $LockFile -Encoding utf8
    Write-Log "Lock file created: $LockFile"
}

function Remove-LockFile {
    if (Test-Path $LockFile) {
        Remove-Item -Path $LockFile -Force
        Write-Log "Lock file removed: $LockFile"
    }
}

function Check-ExistingLock {
    if (Test-Path $LockFile) {
        try {
            $lockContent = Get-Content $LockFile -Raw | ConvertFrom-Json
            $lockProject = $lockContent.project
            $lockPid = $lockContent.pid
            $lockStarted = [DateTime]::Parse($lockContent.started_at)
            $duration = (Get-Date) - $lockStarted
            $durationStr = "{0:hh\:mm\:ss}" -f $duration

            Write-Host ""
            Write-Host "=== WARNING: Lock File Detected ===" -ForegroundColor Yellow
            Write-Host "Another pure-ralph loop may be running on this repo." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Project: $lockProject" -ForegroundColor Gray
            Write-Host "  PID: $lockPid" -ForegroundColor Gray
            Write-Host "  Started: $($lockContent.started_at)" -ForegroundColor Gray
            Write-Host "  Duration: $durationStr" -ForegroundColor Gray
            Write-Host ""

            # Check if process is still running
            $processRunning = $false
            try {
                $proc = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
                if ($proc) {
                    $processRunning = $true
                    Write-Host "  Process Status: RUNNING" -ForegroundColor Red
                } else {
                    Write-Host "  Process Status: NOT RUNNING (stale lock)" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  Process Status: NOT RUNNING (stale lock)" -ForegroundColor Yellow
            }
            Write-Host ""

            Write-Log "Existing lock file found for project '$lockProject' (PID: $lockPid, Duration: $durationStr)" "WARN"

            # Prompt user
            $response = Read-Host "Another pure-ralph is running. Continue anyway? (y/N)"
            if ($response -match "^[Yy]$") {
                Write-Log "User chose to continue despite existing lock" "WARN"
                Write-Host "Continuing... (existing lock will be overwritten)" -ForegroundColor Yellow
                return $true
            } else {
                Write-Log "User chose to abort due to existing lock" "INFO"
                Write-Host "Aborting." -ForegroundColor Red
                return $false
            }
        } catch {
            Write-Log "Could not parse lock file: $_" "WARN"
            # If we can't parse the lock file, ask the user
            $response = Read-Host "Lock file exists but couldn't be read. Continue anyway? (y/N)"
            if ($response -match "^[Yy]$") {
                return $true
            } else {
                return $false
            }
        }
    }
    return $true
}

function Get-TaskProgress {
    $prd = Get-Content $PrdPath -Raw | ConvertFrom-Json
    $total = $prd.features.Count
    $complete = ($prd.features | Where-Object { $_.passes -eq $true }).Count
    return @{ Total = $total; Complete = $complete; Remaining = $total - $complete }
}

function Build-Prompt {
    param([bool]$IsManual)

    # Read base prompt and substitute only PRD_PATH and TARGET_REPO
    $prompt = Get-Content $BasePromptPath -Raw
    $prompt = $prompt -replace '\{\{PRD_PATH\}\}', $PrdPath
    $prompt = $prompt -replace '\{\{TARGET_REPO\}\}', $TargetRepo

    # In manual mode, add instruction for user to close window
    if ($IsManual) {
        $prompt += @"


---

## IMPORTANT: Manual Mode

When you have completed the task and updated the PRD, output this message:

```
TASK COMPLETE - Please close this window to continue to the next task.
```

Do NOT exit automatically. Wait for the user to close the window.
"@
    }

    return $prompt
}

# ============================================================================
# Main Loop
# ============================================================================

$modeLabel = if ($Manual) { "MANUAL (interactive)" } else { "AUTO (autonomous)" }

Write-Host ""
Write-Host "=== Pure Ralph Loop ===" -ForegroundColor Cyan
Write-Host "PRD: $PrdPath" -ForegroundColor Gray
Write-Host "Target: $TargetRepo" -ForegroundColor Gray
Write-Host "Log: $LogFile" -ForegroundColor Gray
Write-Host "Mode: $modeLabel" -ForegroundColor $(if ($Manual) { "Yellow" } else { "Green" })
Write-Host ""
Write-Host "Same prompt every iteration. Claude picks the task." -ForegroundColor Yellow
Write-Host ""

Write-Log "Pure Ralph Loop started"
Write-Log "PRD: $PrdPath"
Write-Log "Target: $TargetRepo"
Write-Log "Mode: $modeLabel"

# Check for existing lock file (conflict detection)
if (-not (Check-ExistingLock)) {
    exit 1
}

# Create lock file to prevent concurrent execution
Create-LockFile

# Ensure lock file is removed on exit (success or failure)
try {
    # Build the prompt ONCE (only PRD_PATH and TARGET_REPO substituted)
    $prompt = Build-Prompt -IsManual $Manual
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

    if ($Manual) {
        Write-Host "Opening Claude in new window (MANUAL MODE)..." -ForegroundColor Cyan
        Write-Host ">>> Close the window when task completes to continue <<<" -ForegroundColor Yellow
    } else {
        Write-Host "Opening Claude in new window (AUTO MODE)..." -ForegroundColor Cyan
        Write-Host ">>> Window will close automatically when done <<<" -ForegroundColor Green
    }
    Write-Host ""

    Write-Log "Spawning Claude session"

    # Build the Claude command based on mode
    if ($Manual) {
        # Manual mode: interactive TUI, user closes window
        $claudeCmd = @"
cd '$TargetRepo'
Write-Host '=== Pure Ralph Session (MANUAL MODE) ===' -ForegroundColor Cyan
Write-Host 'Reading PRD, picking task, implementing...' -ForegroundColor Gray
Write-Host 'Close this window when done to continue the loop.' -ForegroundColor Yellow
Write-Host ''
claude --permission-mode bypassPermissions (Get-Content '$promptFile' -Raw)
"@
    } else {
        # Auto mode: -p flag, auto-exits
        $claudeCmd = @"
cd '$TargetRepo'
Write-Host '=== Pure Ralph Session (AUTO MODE) ===' -ForegroundColor Cyan
Write-Host 'Reading PRD, picking task, implementing...' -ForegroundColor Gray
Write-Host ''
claude -p --permission-mode bypassPermissions (Get-Content '$promptFile' -Raw)
Write-Host ''
Write-Host 'Session complete. Window closing in 3 seconds...' -ForegroundColor Green
Start-Sleep -Seconds 3
exit
"@
    }

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
}
finally {
    # Always remove lock file on exit (success or failure)
    Remove-LockFile
}
