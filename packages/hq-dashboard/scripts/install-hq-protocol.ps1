# install-hq-protocol.ps1
# Registers the hq:// protocol handler in the Windows Registry (current user, no admin needed).
#
# Usage:
#   .\install-hq-protocol.ps1                          # Install (auto-discovers hq-launcher.bat)
#   .\install-hq-protocol.ps1 -LauncherPath "C:\..."   # Install with custom path
#   .\install-hq-protocol.ps1 -Uninstall               # Remove registration

param(
    [string]$LauncherPath,
    [switch]$Uninstall
)

$regPath = "HKCU:\Software\Classes\hq"

if ($Uninstall) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force
        Write-Host "hq:// protocol handler removed." -ForegroundColor Yellow
    } else {
        Write-Host "hq:// protocol handler not found." -ForegroundColor Gray
    }
    exit 0
}

# Auto-discover launcher
if (-not $LauncherPath) {
    $LauncherPath = Join-Path $PSScriptRoot "hq-launcher.bat"
}

if (-not (Test-Path $LauncherPath)) {
    Write-Error "Launcher not found at: $LauncherPath"
    exit 1
}

$LauncherPath = (Resolve-Path $LauncherPath).Path

# Create registry entries
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:HQ Protocol"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""

$shellPath = "$regPath\shell\open\command"
New-Item -Path $shellPath -Force | Out-Null
Set-ItemProperty -Path $shellPath -Name "(Default)" -Value "`"$LauncherPath`" `"%1`""

Write-Host "hq:// protocol handler registered." -ForegroundColor Green
Write-Host "Launcher: $LauncherPath" -ForegroundColor Gray
Write-Host ""
Write-Host "Test: Open a browser and navigate to hq://launch?project=test&name=Test" -ForegroundColor Cyan
