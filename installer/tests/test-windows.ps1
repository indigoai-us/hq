# my-hq Installer Test Script for Windows
# Run this AFTER installation to verify everything works
#
# Usage:
#   .\test-windows.ps1
#   .\test-windows.ps1 -CI   # Run in CI mode (no GUI, skip OAuth)
#
# Environment variables:
#   CI=true              - Enable CI mode
#   GITHUB_ACTIONS=true  - Enable CI mode (GitHub Actions detection)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

param(
    [string]$HqPath = "$env:LOCALAPPDATA\my-hq",
    [switch]$Verbose,
    [switch]$CI
)

$ErrorActionPreference = "Continue"
$testResults = @()

# CI Detection
$IsCI = $CI -or $env:CI -eq 'true' -or $env:GITHUB_ACTIONS -eq 'true' -or $env:TF_BUILD -eq 'True' -or $env:JENKINS_URL -ne $null

# Cleanup handler for temp files
$script:TempFiles = @()
function Register-TempFile {
    param([string]$Path)
    $script:TempFiles += $Path
}

function Invoke-Cleanup {
    foreach ($file in $script:TempFiles) {
        if (Test-Path $file) {
            Remove-Item -Path $file -Force -ErrorAction SilentlyContinue
        }
    }
}

# Register cleanup on script exit
$null = Register-ObjectEvent -InputObject ([System.AppDomain]::CurrentDomain) -EventName ProcessExit -Action { Invoke-Cleanup } -ErrorAction SilentlyContinue

# Trap for cleanup on failure
trap {
    Invoke-Cleanup
    Write-Host "[ERROR] Script terminated unexpectedly: $_" -ForegroundColor Red
    exit 1
}

# Colors for output (disabled in CI for cleaner logs)
function Write-TestResult {
    param(
        [string]$Status,
        [string]$Message
    )

    if ($IsCI) {
        # Plain text output for CI
        Write-Host "[$Status] $Message"
    } else {
        switch ($Status) {
            "PASS" { Write-Host "[PASS] $Message" -ForegroundColor Green }
            "FAIL" { Write-Host "[FAIL] $Message" -ForegroundColor Red }
            "WARN" { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
            "INFO" { Write-Host "[INFO] $Message" -ForegroundColor Cyan }
            "SKIP" { Write-Host "[SKIP] $Message" -ForegroundColor Magenta }
        }
    }
}

function Test-Command {
    param(
        [string]$Command,
        [string]$Description,
        [string]$MinVersion = $null
    )

    try {
        $result = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0 -or $result) {
            # Check minimum version if specified
            if ($MinVersion -and $result -match '(\d+\.\d+\.\d+)') {
                $actualVersion = [version]$matches[1]
                $requiredVersion = [version]$MinVersion

                if ($actualVersion -lt $requiredVersion) {
                    Write-TestResult "FAIL" "$Description - Version $actualVersion < required $MinVersion"
                    return @{
                        Test = $Description
                        Status = "FAIL"
                        Output = "Version $actualVersion is below minimum $MinVersion"
                    }
                }
            }

            Write-TestResult "PASS" "$Description"
            if ($Verbose) { Write-Host "       Output: $result" -ForegroundColor Gray }
            return @{
                Test = $Description
                Status = "PASS"
                Output = $result
            }
        } else {
            Write-TestResult "FAIL" "$Description"
            return @{
                Test = $Description
                Status = "FAIL"
                Output = "Exit code: $exitCode"
            }
        }
    } catch {
        Write-TestResult "FAIL" "$Description - $($_.Exception.Message)"
        return @{
            Test = $Description
            Status = "FAIL"
            Output = $_.Exception.Message
        }
    }
}

function Test-PathExists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (Test-Path $Path) {
        Write-TestResult "PASS" $Description
        return @{
            Test = $Description
            Status = "PASS"
            Output = $Path
        }
    } else {
        Write-TestResult "FAIL" $Description
        return @{
            Test = $Description
            Status = "FAIL"
            Output = "Path not found: $Path"
        }
    }
}

# Header
Write-Host ""
if (-not $IsCI) {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   my-hq Installer Verification Tests" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
} else {
    Write-Host "============================================"
    Write-Host "   my-hq Installer Verification Tests (CI Mode)"
    Write-Host "============================================"
}
Write-Host ""
Write-Host "Testing installation at: $HqPath"
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
if ($IsCI) {
    Write-Host "Mode: CI (skipping OAuth and GUI-dependent tests)"
}
Write-Host ""

# System Info
Write-TestResult "INFO" "Windows Version: $([System.Environment]::OSVersion.VersionString)"
Write-TestResult "INFO" "Architecture: $env:PROCESSOR_ARCHITECTURE"
Write-Host ""

# ===== CORE DEPENDENCIES =====
if (-not $IsCI) {
    Write-Host "--- Core Dependencies ---" -ForegroundColor White
} else {
    Write-Host "--- Core Dependencies ---"
}

$testResults += Test-Command "node --version" "Node.js installed" -MinVersion "18.0.0"
$testResults += Test-Command "npm --version" "npm installed" -MinVersion "8.0.0"

# Claude CLI - in CI, not being installed is OK (network restrictions)
$claudeResult = $null
try {
    $claudeVersion = claude --version 2>&1
    if ($LASTEXITCODE -eq 0 -or $claudeVersion) {
        Write-TestResult "PASS" "Claude CLI installed"
        $claudeResult = @{Test = "Claude CLI installed"; Status = "PASS"; Output = $claudeVersion}
    } else {
        if ($IsCI) {
            Write-TestResult "INFO" "Claude CLI not installed (expected in CI - npm network access may be restricted)"
            $claudeResult = @{Test = "Claude CLI installed"; Status = "INFO"; Output = "Not installed (CI environment)"}
        } else {
            Write-TestResult "FAIL" "Claude CLI not installed"
            $claudeResult = @{Test = "Claude CLI installed"; Status = "FAIL"; Output = "Not installed"}
        }
    }
} catch {
    if ($IsCI) {
        Write-TestResult "INFO" "Claude CLI not installed (expected in CI - npm network access may be restricted)"
        $claudeResult = @{Test = "Claude CLI installed"; Status = "INFO"; Output = "Not installed (CI environment)"}
    } else {
        Write-TestResult "FAIL" "Claude CLI not installed - $($_.Exception.Message)"
        $claudeResult = @{Test = "Claude CLI installed"; Status = "FAIL"; Output = $_.Exception.Message}
    }
}
$testResults += $claudeResult

Write-Host ""

# ===== MY-HQ DIRECTORY =====
if (-not $IsCI) {
    Write-Host "--- my-hq Directory Structure ---" -ForegroundColor White
} else {
    Write-Host "--- my-hq Directory Structure ---"
}

$testResults += Test-PathExists $HqPath "my-hq directory exists"

# Required files
$requiredFiles = @(
    @{Path = ".claude\CLAUDE.md"; Desc = "CLAUDE.md configuration"},
    @{Path = "agents.md"; Desc = "agents.md profile"},
    @{Path = "USER-GUIDE.md"; Desc = "USER-GUIDE.md documentation"}
)

foreach ($file in $requiredFiles) {
    $fullPath = Join-Path $HqPath $file.Path
    $testResults += Test-PathExists $fullPath $file.Desc
}

# Required directories
$requiredDirs = @(
    @{Path = "workers"; Desc = "workers directory"},
    @{Path = "projects"; Desc = "projects directory"},
    @{Path = "workspace"; Desc = "workspace directory"}
)

foreach ($dir in $requiredDirs) {
    $fullPath = Join-Path $HqPath $dir.Path
    $testResults += Test-PathExists $fullPath $dir.Desc
}

Write-Host ""

# ===== SHORTCUTS =====
if (-not $IsCI) {
    Write-Host "--- Shortcuts and Launchers ---" -ForegroundColor White
} else {
    Write-Host "--- Shortcuts and Launchers ---"
}

# In CI, shortcuts are GUI-dependent and may not exist
if ($IsCI) {
    Write-TestResult "SKIP" "Start Menu shortcuts (skipped in CI - no GUI environment)"
    $testResults += @{Test = "Start Menu folder"; Status = "SKIP"; Output = "Skipped in CI"}
    Write-TestResult "SKIP" "Desktop shortcut (skipped in CI - no GUI environment)"
    $testResults += @{Test = "Desktop shortcut"; Status = "SKIP"; Output = "Skipped in CI"}
} else {
    # Start Menu
    $startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\my-hq"
    if (Test-Path $startMenuPath) {
        $testResults += @{Test = "Start Menu folder"; Status = "PASS"; Output = $startMenuPath}
        Write-TestResult "PASS" "Start Menu folder exists"

        # Check for shortcuts
        $shortcuts = Get-ChildItem -Path $startMenuPath -Filter "*.lnk" -ErrorAction SilentlyContinue
        if ($shortcuts.Count -gt 0) {
            Write-TestResult "PASS" "Start Menu shortcuts found: $($shortcuts.Count)"
            $testResults += @{Test = "Start Menu shortcuts"; Status = "PASS"; Output = "$($shortcuts.Count) shortcuts"}
        } else {
            Write-TestResult "WARN" "No shortcuts in Start Menu folder"
            $testResults += @{Test = "Start Menu shortcuts"; Status = "WARN"; Output = "No shortcuts found"}
        }
    } else {
        Write-TestResult "WARN" "Start Menu folder not found (may be in different location)"
        $testResults += @{Test = "Start Menu folder"; Status = "WARN"; Output = "Not found"}
    }

    # Desktop shortcut
    $desktopShortcut = "$env:USERPROFILE\Desktop\my-hq.lnk"
    if (Test-Path $desktopShortcut) {
        Write-TestResult "PASS" "Desktop shortcut exists"
        $testResults += @{Test = "Desktop shortcut"; Status = "PASS"; Output = $desktopShortcut}
    } else {
        Write-TestResult "WARN" "Desktop shortcut not found"
        $testResults += @{Test = "Desktop shortcut"; Status = "WARN"; Output = "Not found"}
    }
}

Write-Host ""

# ===== FUNCTIONALITY =====
if (-not $IsCI) {
    Write-Host "--- Functionality Tests ---" -ForegroundColor White
} else {
    Write-Host "--- Functionality Tests ---"
}

# Test Claude help in my-hq context (only if Claude is installed)
$claudeInstalled = $false
try {
    $null = Get-Command claude -ErrorAction Stop
    $claudeInstalled = $true
} catch {
    $claudeInstalled = $false
}

if ($claudeInstalled) {
    if (Test-Path $HqPath) {
        try {
            Push-Location $HqPath
            $helpOutput = claude --help 2>&1
            if ($helpOutput -match "claude" -or $helpOutput -match "Usage") {
                Write-TestResult "PASS" "Claude CLI works in my-hq directory"
                $testResults += @{Test = "Claude CLI in my-hq"; Status = "PASS"; Output = "Works"}
            } else {
                Write-TestResult "FAIL" "Claude CLI help output unexpected"
                $testResults += @{Test = "Claude CLI in my-hq"; Status = "FAIL"; Output = $helpOutput}
            }
        } catch {
            Write-TestResult "FAIL" "Claude CLI error: $($_.Exception.Message)"
            $testResults += @{Test = "Claude CLI in my-hq"; Status = "FAIL"; Output = $_.Exception.Message}
        } finally {
            Pop-Location
        }
    } else {
        Write-TestResult "FAIL" "Claude CLI in my-hq (my-hq directory does not exist)"
        $testResults += @{Test = "Claude CLI in my-hq"; Status = "FAIL"; Output = "my-hq directory does not exist"}
    }
} else {
    if ($IsCI) {
        Write-TestResult "SKIP" "Claude CLI in my-hq (Claude not installed in CI)"
        $testResults += @{Test = "Claude CLI in my-hq"; Status = "SKIP"; Output = "Claude not installed"}
    } else {
        Write-TestResult "FAIL" "Claude CLI in my-hq (Claude not installed)"
        $testResults += @{Test = "Claude CLI in my-hq"; Status = "FAIL"; Output = "Claude not installed"}
    }
}

# Skip OAuth verification in CI (requires browser)
if ($IsCI) {
    Write-TestResult "SKIP" "OAuth authentication (skipped in CI - requires browser)"
    $testResults += @{Test = "OAuth authentication"; Status = "SKIP"; Output = "Skipped in CI"}
}

# Check PATH includes Node/npm
$pathCheck = $env:PATH -split ';' | Where-Object { $_ -match 'node|npm' }
if ($pathCheck) {
    Write-TestResult "PASS" "Node.js/npm in PATH"
    $testResults += @{Test = "PATH configuration"; Status = "PASS"; Output = $pathCheck -join '; '}
} else {
    Write-TestResult "WARN" "Node.js not explicitly found in PATH (may still work)"
    $testResults += @{Test = "PATH configuration"; Status = "WARN"; Output = "Not found in PATH"}
}

Write-Host ""

# ===== HQ FUNCTIONALITY VERIFICATION =====
if (-not $IsCI) {
    Write-Host "--- HQ Functionality Verification ---" -ForegroundColor White
} else {
    Write-Host "--- HQ Functionality Verification ---"
}

# Verify .claude/commands directory exists with slash commands
$commandsPath = Join-Path $HqPath ".claude\commands"
if (Test-Path $commandsPath) {
    $commandFiles = Get-ChildItem -Path $commandsPath -Filter "*.md" -ErrorAction SilentlyContinue
    if ($commandFiles.Count -gt 0) {
        Write-TestResult "PASS" "Slash commands directory exists with $($commandFiles.Count) commands"
        $testResults += @{Test = "Slash commands"; Status = "PASS"; Output = "$($commandFiles.Count) command files found"}

        # Check for essential commands
        $essentialCommands = @("setup.md", "checkpoint.md", "handoff.md", "run.md")
        $missingCommands = @()
        foreach ($cmd in $essentialCommands) {
            $cmdPath = Join-Path $commandsPath $cmd
            if (-not (Test-Path $cmdPath)) {
                $missingCommands += $cmd
            }
        }
        if ($missingCommands.Count -eq 0) {
            Write-TestResult "PASS" "Essential slash commands present (setup, checkpoint, handoff, run)"
            $testResults += @{Test = "Essential commands"; Status = "PASS"; Output = "All essential commands found"}
        } else {
            Write-TestResult "WARN" "Missing essential commands: $($missingCommands -join ', ')"
            $testResults += @{Test = "Essential commands"; Status = "WARN"; Output = "Missing: $($missingCommands -join ', ')"}
        }
    } else {
        Write-TestResult "FAIL" "Slash commands directory empty"
        $testResults += @{Test = "Slash commands"; Status = "FAIL"; Output = "No command files found"}
    }
} else {
    Write-TestResult "FAIL" "Slash commands directory not found"
    $testResults += @{Test = "Slash commands"; Status = "FAIL"; Output = "Directory not found: $commandsPath"}
}

# Verify CLAUDE.md contains expected HQ content
$claudeMdPath = Join-Path $HqPath ".claude\CLAUDE.md"
if (Test-Path $claudeMdPath) {
    $claudeMdContent = Get-Content $claudeMdPath -Raw -ErrorAction SilentlyContinue
    if ($claudeMdContent) {
        # Check for essential HQ markers in CLAUDE.md
        $hqMarkers = @(
            @{Pattern = "HQ"; Desc = "HQ reference"},
            @{Pattern = "workers"; Desc = "Workers reference"},
            @{Pattern = "projects"; Desc = "Projects reference"},
            @{Pattern = "/run"; Desc = "Run command reference"}
        )
        $foundMarkers = 0
        foreach ($marker in $hqMarkers) {
            if ($claudeMdContent -match $marker.Pattern) {
                $foundMarkers++
            }
        }
        if ($foundMarkers -eq $hqMarkers.Count) {
            Write-TestResult "PASS" "CLAUDE.md contains valid HQ configuration ($foundMarkers/$($hqMarkers.Count) markers)"
            $testResults += @{Test = "CLAUDE.md content"; Status = "PASS"; Output = "All HQ markers found"}
        } elseif ($foundMarkers -gt 0) {
            Write-TestResult "WARN" "CLAUDE.md partially configured ($foundMarkers/$($hqMarkers.Count) markers)"
            $testResults += @{Test = "CLAUDE.md content"; Status = "WARN"; Output = "$foundMarkers of $($hqMarkers.Count) markers found"}
        } else {
            Write-TestResult "FAIL" "CLAUDE.md does not contain expected HQ configuration"
            $testResults += @{Test = "CLAUDE.md content"; Status = "FAIL"; Output = "No HQ markers found"}
        }
    } else {
        Write-TestResult "FAIL" "CLAUDE.md is empty or unreadable"
        $testResults += @{Test = "CLAUDE.md content"; Status = "FAIL"; Output = "Empty or unreadable"}
    }
} else {
    Write-TestResult "FAIL" "CLAUDE.md not found for content verification"
    $testResults += @{Test = "CLAUDE.md content"; Status = "FAIL"; Output = "File not found"}
}

# Verify workers directory has worker definitions
$workersPath = Join-Path $HqPath "workers"
if (Test-Path $workersPath) {
    $workerFiles = Get-ChildItem -Path $workersPath -Recurse -Filter "*.yaml" -ErrorAction SilentlyContinue
    $workerMdFiles = Get-ChildItem -Path $workersPath -Recurse -Filter "*.md" -ErrorAction SilentlyContinue
    $totalWorkerFiles = $workerFiles.Count + $workerMdFiles.Count
    if ($totalWorkerFiles -gt 0) {
        Write-TestResult "PASS" "Workers directory contains $totalWorkerFiles worker definition files"
        $testResults += @{Test = "Worker definitions"; Status = "PASS"; Output = "$totalWorkerFiles files found"}
    } else {
        Write-TestResult "WARN" "Workers directory exists but no worker definitions found"
        $testResults += @{Test = "Worker definitions"; Status = "WARN"; Output = "No .yaml or .md files"}
    }
} else {
    Write-TestResult "FAIL" "Workers directory not found"
    $testResults += @{Test = "Worker definitions"; Status = "FAIL"; Output = "Directory not found"}
}

# Test HQ is ready for Claude (comprehensive readiness check)
$hqReady = $true
$hqReadyIssues = @()

# Check all critical components
if (-not (Test-Path (Join-Path $HqPath ".claude\CLAUDE.md"))) { $hqReady = $false; $hqReadyIssues += "Missing CLAUDE.md" }
if (-not (Test-Path (Join-Path $HqPath "agents.md"))) { $hqReady = $false; $hqReadyIssues += "Missing agents.md" }
if (-not (Test-Path (Join-Path $HqPath ".claude\commands"))) { $hqReady = $false; $hqReadyIssues += "Missing commands directory" }
if (-not (Test-Path (Join-Path $HqPath "workers"))) { $hqReady = $false; $hqReadyIssues += "Missing workers directory" }
if (-not (Test-Path (Join-Path $HqPath "workspace"))) { $hqReady = $false; $hqReadyIssues += "Missing workspace directory" }

if ($hqReady) {
    Write-TestResult "PASS" "HQ is fully configured and ready for Claude operations"
    $testResults += @{Test = "HQ readiness"; Status = "PASS"; Output = "All critical components present"}
} else {
    Write-TestResult "FAIL" "HQ is not ready: $($hqReadyIssues -join ', ')"
    $testResults += @{Test = "HQ readiness"; Status = "FAIL"; Output = $hqReadyIssues -join ', '}
}

Write-Host ""

# ===== OPTIONAL COMPONENTS =====
if (-not $IsCI) {
    Write-Host "--- Optional Components ---" -ForegroundColor White
} else {
    Write-Host "--- Optional Components ---"
}

# Setup wizard
$wizardPath = Join-Path $HqPath "setup-wizard.ps1"
if (Test-Path $wizardPath) {
    Write-TestResult "PASS" "Setup wizard script exists"
    $testResults += @{Test = "Setup wizard"; Status = "PASS"; Output = $wizardPath}
} else {
    Write-TestResult "INFO" "Setup wizard script not found (may be in different location)"
    $testResults += @{Test = "Setup wizard"; Status = "INFO"; Output = "Not found"}
}

# Update checker
$updatePath = Join-Path $HqPath "check-updates.ps1"
if (Test-Path $updatePath) {
    Write-TestResult "PASS" "Update checker script exists"
    $testResults += @{Test = "Update checker"; Status = "PASS"; Output = $updatePath}
} else {
    Write-TestResult "INFO" "Update checker script not found"
    $testResults += @{Test = "Update checker"; Status = "INFO"; Output = "Not found"}
}

# Version file
$versionPath = Join-Path $HqPath ".hq-version"
if (Test-Path $versionPath) {
    $version = Get-Content $versionPath -Raw
    Write-TestResult "PASS" "Version file exists: $($version.Trim())"
    $testResults += @{Test = "Version file"; Status = "PASS"; Output = $version.Trim()}
} else {
    Write-TestResult "INFO" "Version file not found"
    $testResults += @{Test = "Version file"; Status = "INFO"; Output = "Not found"}
}

Write-Host ""

# ===== SUMMARY =====
if (-not $IsCI) {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   Test Summary" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
} else {
    Write-Host "============================================"
    Write-Host "   Test Summary"
    Write-Host "============================================"
}
Write-Host ""

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$warnings = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count
$info = ($testResults | Where-Object { $_.Status -eq "INFO" }).Count
$skipped = ($testResults | Where-Object { $_.Status -eq "SKIP" }).Count
$total = $testResults.Count

if (-not $IsCI) {
    Write-Host "Total Tests: $total" -ForegroundColor White
    Write-Host "Passed:      $passed" -ForegroundColor Green
    if ($failed -gt 0) {
        Write-Host "Failed:      $failed" -ForegroundColor Red
    } else {
        Write-Host "Failed:      $failed" -ForegroundColor Gray
    }
    if ($warnings -gt 0) {
        Write-Host "Warnings:    $warnings" -ForegroundColor Yellow
    } else {
        Write-Host "Warnings:    $warnings" -ForegroundColor Gray
    }
    Write-Host "Info:        $info" -ForegroundColor Cyan
    Write-Host "Skipped:     $skipped" -ForegroundColor Magenta
} else {
    Write-Host "Total Tests: $total"
    Write-Host "Passed:      $passed"
    Write-Host "Failed:      $failed"
    Write-Host "Warnings:    $warnings"
    Write-Host "Info:        $info"
    Write-Host "Skipped:     $skipped"
}

Write-Host ""

# Determine overall result
$overallResult = "pass"
$overallMessage = "All tests passed"
if ($failed -gt 0) {
    $overallResult = "fail"
    $overallMessage = "One or more tests failed"
} elseif ($warnings -gt 0) {
    $overallResult = "pass_with_warnings"
    $overallMessage = "Tests passed with warnings"
}

# Build failed tests list
$failedTestsList = @()
$testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
    $failedTestsList += @{
        name = $_.Test
        output = $_.Output
    }
}

# Output structured JSON summary for CI parsing
$jsonSummary = @{
    timestamp = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
    environment = @{
        os = "windows"
        ci = $IsCI
        hq_path = $HqPath
        windows_version = [System.Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
    }
    results = @{
        total = $total
        passed = $passed
        failed = $failed
        warnings = $warnings
        info = $info
        skipped = $skipped
    }
    overall = @{
        result = $overallResult
        message = $overallMessage
        exit_code = if ($failed -gt 0) { 1 } else { 0 }
    }
    failed_tests = $failedTestsList
}

Write-Host ""
Write-Host "--- JSON Summary ---"
$jsonOutput = $jsonSummary | ConvertTo-Json -Depth 4 -Compress:$false
Write-Host $jsonOutput
Write-Host ""

if ($failed -gt 0) {
    if (-not $IsCI) {
        Write-Host "============================================" -ForegroundColor Red
        Write-Host "   INSTALLATION HAS ISSUES" -ForegroundColor Red
        Write-Host "============================================" -ForegroundColor Red
    } else {
        Write-Host "============================================"
        Write-Host "   INSTALLATION HAS ISSUES"
        Write-Host "============================================"
    }
    Write-Host ""
    Write-Host "Failed tests:"
    $testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  - $($_.Test): $($_.Output)"
    }
    Write-Host ""

    # Diagnostic info on failure
    if ($IsCI) {
        Write-Host "--- Diagnostic Info ---"
        Write-Host "PATH: $env:PATH"
        Write-Host "HQ_PATH exists: $(Test-Path $HqPath)"
        if (Test-Path $HqPath) {
            Write-Host "HQ_PATH contents:"
            Get-ChildItem $HqPath -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)" }
        }
    }

    Invoke-Cleanup
    exit 1
} elseif ($warnings -gt 0) {
    if (-not $IsCI) {
        Write-Host "============================================" -ForegroundColor Yellow
        Write-Host "   INSTALLATION OK WITH WARNINGS" -ForegroundColor Yellow
        Write-Host "============================================" -ForegroundColor Yellow
    } else {
        Write-Host "============================================"
        Write-Host "   INSTALLATION OK WITH WARNINGS"
        Write-Host "============================================"
    }
    Write-Host ""
    Invoke-Cleanup
    exit 0
} else {
    if (-not $IsCI) {
        Write-Host "============================================" -ForegroundColor Green
        Write-Host "   INSTALLATION VERIFIED SUCCESSFULLY" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
    } else {
        Write-Host "============================================"
        Write-Host "   INSTALLATION VERIFIED SUCCESSFULLY"
        Write-Host "============================================"
    }
    Write-Host ""
    Invoke-Cleanup
    exit 0
}
