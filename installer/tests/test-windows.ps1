# my-hq Installer Test Script for Windows
# Run this AFTER installation to verify everything works
#
# Usage:
#   .\test-windows.ps1
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

param(
    [string]$HqPath = "$env:LOCALAPPDATA\my-hq",
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$testResults = @()

# Colors for output
function Write-TestResult {
    param(
        [string]$Status,
        [string]$Message
    )

    switch ($Status) {
        "PASS" { Write-Host "[PASS] $Message" -ForegroundColor Green }
        "FAIL" { Write-Host "[FAIL] $Message" -ForegroundColor Red }
        "WARN" { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
        "INFO" { Write-Host "[INFO] $Message" -ForegroundColor Cyan }
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
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   my-hq Installer Verification Tests" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing installation at: $HqPath" -ForegroundColor Gray
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# System Info
Write-TestResult "INFO" "Windows Version: $([System.Environment]::OSVersion.VersionString)"
Write-TestResult "INFO" "Architecture: $env:PROCESSOR_ARCHITECTURE"
Write-Host ""

# ===== CORE DEPENDENCIES =====
Write-Host "--- Core Dependencies ---" -ForegroundColor White

$testResults += Test-Command "node --version" "Node.js installed" -MinVersion "18.0.0"
$testResults += Test-Command "npm --version" "npm installed" -MinVersion "8.0.0"
$testResults += Test-Command "claude --version" "Claude CLI installed"

Write-Host ""

# ===== MY-HQ DIRECTORY =====
Write-Host "--- my-hq Directory Structure ---" -ForegroundColor White

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
Write-Host "--- Shortcuts and Launchers ---" -ForegroundColor White

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

Write-Host ""

# ===== FUNCTIONALITY =====
Write-Host "--- Functionality Tests ---" -ForegroundColor White

# Test Claude help in my-hq context
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

# ===== OPTIONAL COMPONENTS =====
Write-Host "--- Optional Components ---" -ForegroundColor White

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
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Test Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$warnings = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count
$info = ($testResults | Where-Object { $_.Status -eq "INFO" }).Count
$total = $testResults.Count

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

Write-Host ""

if ($failed -gt 0) {
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "   INSTALLATION HAS ISSUES" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Failed tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  - $($_.Test): $($_.Output)" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
} elseif ($warnings -gt 0) {
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "   INSTALLATION OK WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    exit 0
} else {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "   INSTALLATION VERIFIED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    exit 0
}
