#!/bin/bash
# =============================================================================
# Claude CLI OAuth Helper - macOS/Linux
# Opens browser for Claude CLI authentication
# =============================================================================

set -e

# Default values
SILENT=false
CHECK_ONLY=false
TIMEOUT=300  # 5 minutes

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --silent)
            SILENT=true
            shift
            ;;
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

log() {
    if [ "$SILENT" != "true" ]; then
        echo "$1"
    fi
}

test_claude_auth() {
    # Check if Claude CLI is authenticated
    if ! command -v claude &> /dev/null; then
        return 1
    fi

    # Try to run a simple command
    if claude --version &> /dev/null; then
        # Version works, check if actually authenticated
        local auth_check
        auth_check=$(claude -p "echo test" 2>&1) || true

        # Check for auth error messages
        if echo "$auth_check" | grep -qi "login\|authenticate\|401\|unauthorized"; then
            if ! echo "$auth_check" | grep -q "test"; then
                return 1
            fi
        fi

        # If we got "test" output, we're authenticated
        if echo "$auth_check" | grep -q "test"; then
            return 0
        fi
    fi

    return 1
}

get_claude_path() {
    # Find Claude CLI
    local claude_path
    claude_path=$(command -v claude 2>/dev/null) || true

    if [ -n "$claude_path" ]; then
        echo "$claude_path"
        return 0
    fi

    # Check common locations
    local paths=(
        "/usr/local/bin/claude"
        "/opt/homebrew/bin/claude"
        "$HOME/.npm-global/bin/claude"
    )

    for path in "${paths[@]}"; do
        if [ -x "$path" ]; then
            echo "$path"
            return 0
        fi
    done

    return 1
}

# -----------------------------------------------------------------------------
# Main logic
# -----------------------------------------------------------------------------

log "Claude CLI OAuth Helper"
log "======================"
log ""

# Find Claude CLI
CLAUDE_PATH=$(get_claude_path) || true
if [ -z "$CLAUDE_PATH" ]; then
    log "ERROR: Claude CLI not found. Please install it first."
    log "Run: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

log "Found Claude CLI at: $CLAUDE_PATH"

# Check if already authenticated
if [ "$CHECK_ONLY" = "true" ]; then
    log "Checking authentication status..."
    if test_claude_auth; then
        log "Claude CLI is authenticated."
        exit 0
    else
        log "Claude CLI is NOT authenticated."
        exit 1
    fi
fi

# Check if already authenticated before attempting login
log "Checking if already authenticated..."
if test_claude_auth; then
    log "Claude CLI is already authenticated!"
    exit 0
fi

log ""
log "Claude CLI needs to be authenticated."
log "This will open a browser window for you to log in to claude.ai"
log ""

# Prompt user (unless silent mode)
if [ "$SILENT" != "true" ]; then
    read -r -p "Press Enter to open browser for authentication (or type 'skip' to skip): " response
    if [ "$response" = "skip" ]; then
        log ""
        log "Authentication skipped."
        log "You can authenticate later by running: claude"
        log "Then type /login to sign in."
        exit 0
    fi
fi

# Open browser for OAuth
log ""
log "Opening browser for Claude authentication..."
log "Please log in to claude.ai in the browser window."
log ""

# Use setup-token command which handles OAuth
if claude setup-token; then
    log ""
    log "Authentication successful!"
    exit 0
else
    log ""
    log "Authentication may have failed or was cancelled."
    log "You can try again later by running: claude"
    log "Then type /login to sign in."
    exit 1
fi
