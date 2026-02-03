# =============================================================================
# Claude CLI OAuth Helper - Windows
# Opens browser for Claude CLI authentication
# =============================================================================

param(
    [switch]$Silent,
    [switch]$CheckOnly,
    [int]$Timeout = 300  # 5 minutes default timeout
)

$ErrorActionPreference = "Continue"

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

function Write-Log {
    param([string]$Message)
    if (-not $Silent) {
        Write-Host $Message
    }
}

function Test-ClaudeAuth {
    # Check if Claude CLI is authenticated by running a simple command
    # The CLI will fail with auth error if not logged in
    try {
        $result = & claude --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            # Version works, now check if we can actually use it
            # Try to run a simple non-interactive command
            $authCheck = & claude -p "echo test" 2>&1
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
            # Check for specific auth error messages
            $authCheckStr = $authCheck -join " "
            if ($authCheckStr -match "login|authenticate|401|unauthorized" -and $authCheckStr -notmatch "test") {
                return $false
            }
        }
    } catch {
        return $false
    }
    return $false
}

function Get-ClaudePath {
    # Find Claude CLI in PATH or common locations
    $claudePath = Get-Command claude -ErrorAction SilentlyContinue
    if ($claudePath) {
        return $claudePath.Source
    }

    # Check common npm global locations
    $npmPaths = @(
        "$env:APPDATA\npm\claude.cmd",
        "$env:PROGRAMFILES\nodejs\claude.cmd",
        "$env:LOCALAPPDATA\npm\claude.cmd"
    )

    foreach ($path in $npmPaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    return $null
}

# -----------------------------------------------------------------------------
# Main logic
# -----------------------------------------------------------------------------

Write-Log "Claude CLI OAuth Helper"
Write-Log "======================"
Write-Log ""

# Find Claude CLI
$claudePath = Get-ClaudePath
if (-not $claudePath) {
    Write-Log "ERROR: Claude CLI not found. Please install it first."
    Write-Log "Run: npm install -g @anthropic-ai/claude-code"
    exit 1
}

Write-Log "Found Claude CLI at: $claudePath"

# Check if already authenticated
if ($CheckOnly) {
    Write-Log "Checking authentication status..."
    if (Test-ClaudeAuth) {
        Write-Log "Claude CLI is authenticated."
        exit 0
    } else {
        Write-Log "Claude CLI is NOT authenticated."
        exit 1
    }
}

# Check if already authenticated before attempting login
Write-Log "Checking if already authenticated..."
if (Test-ClaudeAuth) {
    Write-Log "Claude CLI is already authenticated!"
    exit 0
}

Write-Log ""
Write-Log "Claude CLI needs to be authenticated."
Write-Log "This will open a browser window for you to log in to claude.ai"
Write-Log ""

# Prompt user (unless silent mode)
if (-not $Silent) {
    $response = Read-Host "Press Enter to open browser for authentication (or type 'skip' to skip)"
    if ($response -eq "skip") {
        Write-Log ""
        Write-Log "Authentication skipped."
        Write-Log "You can authenticate later by running: claude"
        Write-Log "Then type /login to sign in."
        exit 0
    }
}

# Open browser for OAuth
Write-Log ""
Write-Log "Opening browser for Claude authentication..."
Write-Log "Please log in to claude.ai in the browser window."
Write-Log ""

# The simplest approach: run `claude setup-token` which handles OAuth
# and outputs a token, or run claude with /login
try {
    # Use setup-token command which opens browser and waits for auth
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "claude setup-token" -NoNewWindow -PassThru -Wait

    if ($process.ExitCode -eq 0) {
        Write-Log ""
        Write-Log "Authentication successful!"
        exit 0
    } else {
        Write-Log ""
        Write-Log "Authentication may have failed or was cancelled."
        Write-Log "You can try again later by running: claude"
        Write-Log "Then type /login to sign in."
        exit 1
    }
} catch {
    Write-Log "ERROR: Failed to start authentication: $_"
    exit 1
}
