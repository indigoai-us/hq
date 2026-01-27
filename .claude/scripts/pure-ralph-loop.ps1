<#
.SYNOPSIS
    Pure Ralph Loop - External terminal orchestrator for autonomous PRD execution

.DESCRIPTION
    Runs the canonical Ralph loop: one task per fresh Claude session,
    updates PRD on completion, commits each task atomically.

.PARAMETER PrdPath
    Full path to the PRD JSON file

.PARAMETER TargetRepo
    Full path to the target repository (where work happens)

.PARAMETER HqPath
    Path to HQ directory (defaults to C:/my-hq)

.EXAMPLE
    .\pure-ralph-loop.ps1 -PrdPath "C:/my-hq/projects/my-project/prd.json" -TargetRepo "C:/my-project"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$PrdPath,

    [Parameter(Mandatory=$true)]
    [string]$TargetRepo,

    [Parameter(Mandatory=$false)]
    [string]$HqPath = "C:/my-hq"
)

# ============================================================================
# Configuration
# ============================================================================

$BasePromptPath = Join-Path $HqPath "prompts/pure-ralph-base.md"
$ProjectName = (Split-Path (Split-Path $PrdPath -Parent) -Leaf)
$LogDir = Join-Path $HqPath "workspace/orchestrator/$ProjectName"
$LogFile = Join-Path $LogDir "pure-ralph.log"

# ============================================================================
# Logging Functions
# ============================================================================

function Initialize-Logging {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "`n=========================================="
    Add-Content -Path $LogFile -Value "Pure Ralph Loop Started: $timestamp"
    Add-Content -Path $LogFile -Value "PRD: $PrdPath"
    Add-Content -Path $LogFile -Value "Target: $TargetRepo"
    Add-Content -Path $LogFile -Value "==========================================`n"
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $logEntry

    # Also output to console with color
    switch ($Level) {
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        "WARN"  { Write-Host $logEntry -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
        default { Write-Host $logEntry }
    }
}

# ============================================================================
# PRD Functions
# ============================================================================

function Get-Prd {
    if (-not (Test-Path $PrdPath)) {
        Write-Log "PRD not found: $PrdPath" "ERROR"
        exit 1
    }
    return Get-Content $PrdPath -Raw | ConvertFrom-Json
}

function Get-NextTask {
    param($Prd)

    foreach ($task in $Prd.features) {
        # Skip already passing tasks
        if ($task.passes -eq $true) {
            continue
        }

        # Check dependencies
        $depsOk = $true
        if ($task.dependsOn) {
            foreach ($depId in $task.dependsOn) {
                $depTask = $Prd.features | Where-Object { $_.id -eq $depId }
                if (-not $depTask -or $depTask.passes -ne $true) {
                    $depsOk = $false
                    break
                }
            }
        }

        if ($depsOk) {
            return $task
        }
    }

    return $null
}

function Get-TaskProgress {
    param($Prd)
    $total = $Prd.features.Count
    $completed = ($Prd.features | Where-Object { $_.passes -eq $true }).Count
    return @{
        Total = $total
        Completed = $completed
        Remaining = $total - $completed
    }
}

# ============================================================================
# Prompt Building
# ============================================================================

function Build-TaskPrompt {
    param($Task, $Prd)

    # Read base prompt
    if (-not (Test-Path $BasePromptPath)) {
        Write-Log "Base prompt not found: $BasePromptPath" "ERROR"
        exit 1
    }

    $basePrompt = Get-Content $BasePromptPath -Raw

    # Replace placeholders
    $prompt = $basePrompt
    $prompt = $prompt -replace '\{\{TARGET_REPO\}\}', $TargetRepo
    $prompt = $prompt -replace '\{\{PRD_PATH\}\}', $PrdPath
    $prompt = $prompt -replace '\{\{TASK_ID\}\}', $Task.id
    $prompt = $prompt -replace '\{\{TASK_TITLE\}\}', $Task.title

    # Get context from prior completed tasks
    $priorContext = @()
    foreach ($t in $Prd.features) {
        if ($t.passes -eq $true -and $t.notes) {
            $priorContext += "- $($t.id): $($t.notes)"
        }
    }

    # Build full prompt with task details
    $fullPrompt = @"
$prompt

Execute task $($Task.id) from $PrdPath.

Context from prior tasks:
$($priorContext -join "`n")

Read the PRD, implement $($Task.id) ($($Task.title)), then update the PRD.

Return JSON: {success: boolean, summary: string, files_modified: array, notes: string}
"@

    return $fullPrompt
}

# ============================================================================
# Task Execution
# ============================================================================

function Invoke-Task {
    param($Task, $Prd)

    Write-Log "Starting task: $($Task.id) - $($Task.title)"
    Write-Log "Acceptance criteria:"
    foreach ($ac in $Task.acceptance_criteria) {
        Write-Log "  - $ac"
    }

    # Build the prompt
    $prompt = Build-TaskPrompt -Task $Task -Prd $Prd

    # Create temp file for prompt (handles multi-line better)
    $promptFile = Join-Path $env:TEMP "pure-ralph-prompt-$(Get-Random).txt"
    $prompt | Out-File -FilePath $promptFile -Encoding utf8

    Write-Log "Spawning fresh Claude session (interactive mode)..."

    try {
        # Change to target repo directory
        Push-Location $TargetRepo

        # Run claude INTERACTIVELY (no -p flag) so user can watch
        # Using --permission-mode bypassPermissions for autonomous execution
        $promptContent = Get-Content $promptFile -Raw

        Write-Host "`n========================================" -ForegroundColor Magenta
        Write-Host "  LAUNCHING CLAUDE FOR: $($Task.id)" -ForegroundColor Magenta
        Write-Host "  A new terminal window will open - watch Claude work there!" -ForegroundColor Gray
        Write-Host "========================================`n" -ForegroundColor Magenta

        # Write prompt to a persistent file so claude can read it
        $taskPromptFile = Join-Path $LogDir "task-$($Task.id)-prompt.md"
        $promptContent | Out-File -FilePath $taskPromptFile -Encoding utf8

        # Launch claude in a NEW terminal window so user can watch the TUI
        # The -NoExit keeps the window open after completion
        $claudeCmd = "cd '$TargetRepo'; claude --permission-mode bypassPermissions (Get-Content '$taskPromptFile' -Raw)"

        Write-Host "Opening new terminal for Claude session..." -ForegroundColor Cyan
        Write-Host "Prompt saved to: $taskPromptFile" -ForegroundColor Gray

        # Start new PowerShell window and WAIT for it to complete
        $proc = Start-Process powershell -ArgumentList "-NoExit", "-Command", $claudeCmd -PassThru

        Write-Host "Waiting for Claude session to complete (PID: $($proc.Id))..." -ForegroundColor Yellow
        Write-Host ">>> SWITCH TO THE NEW WINDOW TO WATCH CLAUDE WORK <<<" -ForegroundColor Green

        $proc.WaitForExit()

        Write-Host "`n========================================" -ForegroundColor Magenta
        Write-Host "  CLAUDE SESSION END: $($Task.id)" -ForegroundColor Magenta
        Write-Host "========================================`n" -ForegroundColor Magenta

        Pop-Location

        # Log completion
        Write-Log "Claude session completed"
        $result = "Interactive session completed"

        # Clean up temp file
        Remove-Item $promptFile -Force -ErrorAction SilentlyContinue

        return @{
            Success = $true
            Output = $result
        }
    }
    catch {
        Pop-Location
        Write-Log "Task execution failed: $_" "ERROR"
        Remove-Item $promptFile -Force -ErrorAction SilentlyContinue
        return @{
            Success = $false
            Output = $_.Exception.Message
        }
    }
}

# ============================================================================
# Beads Integration
# ============================================================================

$BeadsAvailable = $false

function Test-BeadsCli {
    <#
    .SYNOPSIS
        Checks if the beads CLI (bd) is available
    #>
    try {
        $null = Get-Command "bd" -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Initialize-Beads {
    param($Prd)
    <#
    .SYNOPSIS
        Syncs PRD tasks to beads on loop start
    #>

    if (-not $script:BeadsAvailable) {
        return
    }

    Write-Log "Syncing PRD tasks to beads..."

    foreach ($task in $Prd.features) {
        $beadId = "$ProjectName-$($task.id)"
        $status = if ($task.passes -eq $true) { "done" } else { "todo" }

        try {
            # Create or update bead for this task
            # Using bd add with --id for idempotent creation
            $null = bd add --id $beadId --title "$($task.id): $($task.title)" --status $status 2>&1
            Write-Log "  Synced bead: $beadId ($status)"
        }
        catch {
            Write-Log "  Failed to sync bead: $beadId - $_" "WARN"
        }
    }

    Write-Log "Beads sync complete" "SUCCESS"
}

function Update-BeadStatus {
    param(
        [string]$TaskId,
        [string]$Status  # "in-progress", "done", "blocked"
    )
    <#
    .SYNOPSIS
        Updates a bead's status when task state changes
    #>

    if (-not $script:BeadsAvailable) {
        return
    }

    $beadId = "$ProjectName-$TaskId"

    try {
        $null = bd update $beadId --status $status 2>&1
        Write-Log "Updated bead $beadId to $Status"
    }
    catch {
        Write-Log "Failed to update bead: $beadId - $_" "WARN"
    }
}

# ============================================================================
# Learnings Aggregation
# ============================================================================

$LearningsPath = Join-Path $HqPath "knowledge/pure-ralph/learnings.md"

function Aggregate-Learnings {
    param($Prd)

    Write-Log "Aggregating learnings from completed project..."

    # Extract learnings from task notes
    $learnings = @{
        Workflow = @()
        Technical = @()
        Gotchas = @()
    }

    foreach ($task in $Prd.features) {
        if ($task.passes -eq $true -and $task.notes) {
            $note = $task.notes

            # Categorize based on keywords in notes
            if ($note -match "workflow|process|method|approach|pattern") {
                $learnings.Workflow += @{
                    TaskId = $task.id
                    Title = $task.title
                    Note = $note
                }
            }
            if ($note -match "implement|code|script|function|api|json|file") {
                $learnings.Technical += @{
                    TaskId = $task.id
                    Title = $task.title
                    Note = $note
                }
            }
            if ($note -match "error|issue|gotcha|pitfall|careful|avoid|warning") {
                $learnings.Gotchas += @{
                    TaskId = $task.id
                    Title = $task.title
                    Note = $note
                }
            }
        }
    }

    # Update learnings file if it exists
    if (Test-Path $LearningsPath) {
        $date = Get-Date -Format "yyyy-MM-dd"
        $taskCount = $Prd.features.Count
        $learningCount = $learnings.Workflow.Count + $learnings.Technical.Count + $learnings.Gotchas.Count

        # Append to aggregation log
        $logEntry = "| $date | $ProjectName | $taskCount | $learningCount patterns extracted |"

        $content = Get-Content $LearningsPath -Raw
        if ($content -match "<!-- Automatically updated when projects complete -->") {
            # Find the table and append a new row
            $tablePattern = "(\| Date \| Project \| Tasks \| Learnings Added \|[\r\n]+\|[-|]+\|[\r\n]+(?:\|[^\r\n]+\|[\r\n]+)*)"
            if ($content -match $tablePattern) {
                $newContent = $content -replace $tablePattern, "`$1$logEntry`n"
                Set-Content -Path $LearningsPath -Value $newContent -NoNewline
            }
        }

        Write-Log "Updated learnings aggregation log" "SUCCESS"
    } else {
        Write-Log "Learnings file not found at $LearningsPath - skipping aggregation" "WARN"
    }

    # Log summary
    Write-Log "Learnings extracted - Workflow: $($learnings.Workflow.Count), Technical: $($learnings.Technical.Count), Gotchas: $($learnings.Gotchas.Count)"
}

# ============================================================================
# Main Loop
# ============================================================================

function Start-RalphLoop {
    Initialize-Logging

    Write-Host "`n=== Pure Ralph Loop ===" -ForegroundColor Cyan
    Write-Host "PRD: $PrdPath" -ForegroundColor Gray
    Write-Host "Target: $TargetRepo" -ForegroundColor Gray
    Write-Host "Log: $LogFile" -ForegroundColor Gray

    # Check for beads CLI availability
    $script:BeadsAvailable = Test-BeadsCli
    if ($script:BeadsAvailable) {
        Write-Host "Beads CLI: " -NoNewline -ForegroundColor Gray
        Write-Host "available" -ForegroundColor Green
        Write-Log "Beads CLI (bd) detected - task tracking enabled"

        # Initial sync of PRD tasks to beads
        $prd = Get-Prd
        Initialize-Beads -Prd $prd
    } else {
        Write-Host "Beads CLI: " -NoNewline -ForegroundColor Gray
        Write-Host "not installed (optional)" -ForegroundColor Yellow
        Write-Log "Beads CLI (bd) not found - continuing without task tracking"
    }

    Write-Host ""

    $loopCount = 0
    $maxLoops = 50  # Safety limit

    while ($loopCount -lt $maxLoops) {
        $loopCount++

        # Reload PRD each iteration (it gets updated by claude)
        $prd = Get-Prd
        $progress = Get-TaskProgress -Prd $prd

        Write-Host "`n--- Iteration $loopCount ---" -ForegroundColor Cyan
        Write-Log "Iteration $loopCount - Progress: $($progress.Completed)/$($progress.Total) tasks complete"

        # Check if all done
        if ($progress.Remaining -eq 0) {
            Write-Log "All tasks completed!" "SUCCESS"
            Write-Host "`n=== Project Complete ===" -ForegroundColor Green
            Write-Host "All $($progress.Total) tasks completed successfully." -ForegroundColor Green

            # Aggregate learnings on project completion
            Aggregate-Learnings -Prd $prd

            break
        }

        # Get next task
        $task = Get-NextTask -Prd $prd

        if (-not $task) {
            Write-Log "No eligible tasks found. Some tasks may be blocked by dependencies." "WARN"
            Write-Host "`nBlocked: No tasks have all dependencies met." -ForegroundColor Yellow
            Write-Host "Check PRD for dependency issues." -ForegroundColor Yellow
            break
        }

        Write-Host "`nExecuting: $($task.id) - $($task.title)" -ForegroundColor Yellow

        # Update bead to in-progress
        Update-BeadStatus -TaskId $task.id -Status "in-progress"

        # Execute the task
        $result = Invoke-Task -Task $task -Prd $prd

        if ($result.Success) {
            Write-Log "Task $($task.id) execution completed" "SUCCESS"
            # Update bead to done (PRD update happens in Claude session)
            Update-BeadStatus -TaskId $task.id -Status "done"
        } else {
            Write-Log "Task $($task.id) execution had issues" "WARN"
            # Update bead to blocked
            Update-BeadStatus -TaskId $task.id -Status "blocked"
        }

        # Brief pause between tasks
        Start-Sleep -Seconds 2
    }

    if ($loopCount -ge $maxLoops) {
        Write-Log "Safety limit reached ($maxLoops iterations)" "WARN"
    }

    # Final summary
    $prd = Get-Prd
    $progress = Get-TaskProgress -Prd $prd

    Write-Host "`n=== Final Summary ===" -ForegroundColor Cyan
    Write-Host "Completed: $($progress.Completed)/$($progress.Total) tasks" -ForegroundColor $(if ($progress.Remaining -eq 0) { "Green" } else { "Yellow" })
    Write-Host "Log file: $LogFile" -ForegroundColor Gray

    Write-Log "Loop ended. Final state: $($progress.Completed)/$($progress.Total) tasks complete"
}

# ============================================================================
# Entry Point
# ============================================================================

# Validate inputs
if (-not (Test-Path $PrdPath)) {
    Write-Host "Error: PRD not found at $PrdPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $TargetRepo)) {
    Write-Host "Error: Target repo not found at $TargetRepo" -ForegroundColor Red
    exit 1
}

# Run the loop
Start-RalphLoop
