# =============================================================================
# HQ Update Checker for Windows
# Checks GitHub releases for new versions and offers to download/install
# =============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$HQDir = "$env:LOCALAPPDATA\hq",

    [Parameter(Mandatory=$false)]
    [switch]$Silent = $false,

    [Parameter(Mandatory=$false)]
    [switch]$AutoInstall = $false
)

# Configuration
$GITHUB_REPO = "indigoai-us/hq"
$RELEASES_API = "https://api.github.com/repos/$GITHUB_REPO/releases/latest"
$VERSION_FILE = Join-Path $HQDir ".hq-version"
$UPDATE_CHECK_FILE = Join-Path $HQDir ".last-update-check"

# Colors
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }

# =============================================================================
# Get current installed version
# =============================================================================
function Get-CurrentVersion {
    if (Test-Path $VERSION_FILE) {
        return (Get-Content $VERSION_FILE -Raw).Trim()
    }

    # Try to get version from NSIS uninstall registry
    $uninstallKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\hq"
    if (Test-Path $uninstallKey) {
        $version = (Get-ItemProperty $uninstallKey).DisplayVersion
        if ($version) {
            return $version
        }
    }

    # Default version if not found
    return "1.0.0"
}

# =============================================================================
# Save current version
# =============================================================================
function Save-CurrentVersion {
    param([string]$Version)

    $Version | Out-File -FilePath $VERSION_FILE -Encoding UTF8 -NoNewline
}

# =============================================================================
# Check if we should skip update check (rate limiting)
# =============================================================================
function Should-SkipCheck {
    if (-not (Test-Path $UPDATE_CHECK_FILE)) {
        return $false
    }

    $lastCheck = Get-Content $UPDATE_CHECK_FILE -Raw
    $lastCheckDate = [DateTime]::ParseExact($lastCheck.Trim(), "yyyy-MM-dd", $null)
    $today = Get-Date -Format "yyyy-MM-dd"
    $todayDate = [DateTime]::ParseExact($today, "yyyy-MM-dd", $null)

    # Only check once per day
    return $lastCheckDate -ge $todayDate
}

# =============================================================================
# Record update check time
# =============================================================================
function Record-CheckTime {
    $today = Get-Date -Format "yyyy-MM-dd"
    $today | Out-File -FilePath $UPDATE_CHECK_FILE -Encoding UTF8 -NoNewline
}

# =============================================================================
# Compare versions (returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
# =============================================================================
function Compare-Versions {
    param(
        [string]$Version1,
        [string]$Version2
    )

    # Remove 'v' prefix if present
    $v1 = $Version1 -replace '^v', ''
    $v2 = $Version2 -replace '^v', ''

    try {
        $ver1 = [Version]$v1
        $ver2 = [Version]$v2
        return $ver1.CompareTo($ver2)
    }
    catch {
        # Fallback to string comparison
        return $v1.CompareTo($v2)
    }
}

# =============================================================================
# Fetch latest release info from GitHub
# =============================================================================
function Get-LatestRelease {
    try {
        $headers = @{
            "Accept" = "application/vnd.github.v3+json"
            "User-Agent" = "hq-updater"
        }

        $response = Invoke-RestMethod -Uri $RELEASES_API -Headers $headers -Method Get -TimeoutSec 10

        return @{
            Version = $response.tag_name -replace '^v', ''
            TagName = $response.tag_name
            Name = $response.name
            Body = $response.body
            PublishedAt = $response.published_at
            Assets = $response.assets
            HtmlUrl = $response.html_url
        }
    }
    catch {
        if (-not $Silent) {
            Write-Warning "Could not check for updates: $($_.Exception.Message)"
        }
        return $null
    }
}

# =============================================================================
# Find the Windows installer asset
# =============================================================================
function Get-WindowsInstallerUrl {
    param($Assets)

    foreach ($asset in $Assets) {
        $name = $asset.name.ToLower()
        if ($name -match '\.exe$' -and ($name -match 'windows' -or $name -match 'setup' -or $name -match 'installer')) {
            return @{
                Url = $asset.browser_download_url
                Name = $asset.name
                Size = $asset.size
            }
        }
    }

    # Fallback: look for any .exe
    foreach ($asset in $Assets) {
        if ($asset.name -match '\.exe$') {
            return @{
                Url = $asset.browser_download_url
                Name = $asset.name
                Size = $asset.size
            }
        }
    }

    return $null
}

# =============================================================================
# Download update installer
# =============================================================================
function Download-Update {
    param(
        [string]$Url,
        [string]$FileName
    )

    $downloadPath = Join-Path $env:TEMP $FileName

    Write-Info "Downloading update..."
    Write-Host "  From: $Url"
    Write-Host "  To: $downloadPath"
    Write-Host ""

    try {
        $ProgressPreference = 'SilentlyContinue'  # Speed up download
        Invoke-WebRequest -Uri $Url -OutFile $downloadPath -UseBasicParsing
        $ProgressPreference = 'Continue'

        if (Test-Path $downloadPath) {
            Write-Success "Download complete!"
            return $downloadPath
        }
    }
    catch {
        Write-Error "Download failed: $($_.Exception.Message)"
    }

    return $null
}

# =============================================================================
# Run the installer
# =============================================================================
function Install-Update {
    param([string]$InstallerPath)

    Write-Info "Starting update installer..."
    Write-Warning "The installer will close this window. Your data will be preserved."
    Write-Host ""

    Start-Sleep -Seconds 2

    # Run the installer
    Start-Process -FilePath $InstallerPath -Wait:$false

    # Exit this script
    exit 0
}

# =============================================================================
# Main update check flow
# =============================================================================
function Check-ForUpdates {
    if (-not $Silent) {
        Write-Host ""
        Write-Host "========================================"
        Write-Host "  HQ Update Checker"
        Write-Host "========================================"
        Write-Host ""
    }

    # Get current version
    $currentVersion = Get-CurrentVersion
    if (-not $Silent) {
        Write-Host "Current version: $currentVersion"
    }

    # Check if we should skip (already checked today)
    if ((Should-SkipCheck) -and -not $AutoInstall) {
        if (-not $Silent) {
            Write-Host "Already checked for updates today."
        }
        return $false
    }

    # Record check time
    Record-CheckTime

    # Fetch latest release
    if (-not $Silent) {
        Write-Host "Checking for updates..."
    }

    $latest = Get-LatestRelease
    if (-not $latest) {
        return $false
    }

    $latestVersion = $latest.Version
    if (-not $Silent) {
        Write-Host "Latest version: $latestVersion"
        Write-Host ""
    }

    # Compare versions
    $comparison = Compare-Versions -Version1 $currentVersion -Version2 $latestVersion

    if ($comparison -ge 0) {
        if (-not $Silent) {
            Write-Success "You're up to date!"
        }
        return $false
    }

    # Update available!
    Write-Host ""
    Write-Success "Update available: $currentVersion -> $latestVersion"
    Write-Host ""

    if ($latest.Name) {
        Write-Host "Release: $($latest.Name)"
    }

    if ($latest.Body) {
        Write-Host ""
        Write-Host "What's new:"
        Write-Host "----------------------------------------"
        # Show first 10 lines of release notes
        $lines = $latest.Body -split "`n" | Select-Object -First 10
        foreach ($line in $lines) {
            Write-Host "  $line"
        }
        if (($latest.Body -split "`n").Count -gt 10) {
            Write-Host "  ..."
        }
        Write-Host "----------------------------------------"
    }
    Write-Host ""

    # Find Windows installer
    $installer = Get-WindowsInstallerUrl -Assets $latest.Assets

    if (-not $installer) {
        Write-Warning "No Windows installer found in release."
        Write-Host "Please visit: $($latest.HtmlUrl)"
        return $true
    }

    $sizeKB = [math]::Round($installer.Size / 1024)
    Write-Host "Installer: $($installer.Name) ($sizeKB KB)"
    Write-Host ""

    # Ask user if they want to update
    if ($AutoInstall) {
        $response = "Y"
    }
    else {
        $response = Read-Host "Would you like to download and install the update? (Y/N)"
    }

    if ($response -match '^[Yy]') {
        $downloadPath = Download-Update -Url $installer.Url -FileName $installer.Name

        if ($downloadPath) {
            $installNow = Read-Host "Install now? (Y/N)"
            if ($installNow -match '^[Yy]') {
                Install-Update -InstallerPath $downloadPath
            }
            else {
                Write-Host ""
                Write-Info "Installer saved to: $downloadPath"
                Write-Host "Run it manually when you're ready to update."
            }
        }
    }
    else {
        Write-Host ""
        Write-Info "Update skipped. You can run this script anytime to check again."
        Write-Host "Or download manually from: $($latest.HtmlUrl)"
    }

    return $true
}

# =============================================================================
# Entry point
# =============================================================================

# Ensure HQ directory exists
if (-not (Test-Path $HQDir)) {
    Write-Error "HQ directory not found: $HQDir"
    exit 1
}

# Run update check
$updateAvailable = Check-ForUpdates

if (-not $Silent) {
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

exit 0
